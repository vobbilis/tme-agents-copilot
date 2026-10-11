import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, chmod, copyFile, link, mkdir, open, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { narrationRequests, buildNarrationTimeline, narrationConsentFingerprint } from './narration.mjs'
import { loadReusableNarrations } from './incremental.mjs'
import { parseWordBoundaries } from './speech.mjs'
import { pictureArguments, SIZE } from './picture.mjs'
import { pictureSegments, voiceArguments, loudnessFrom, normalizationArguments,
  chapterMetadata, muxArguments, verifyFilmMetadata } from './finish.mjs'
import { illustratePlan } from './artwork.mjs'
import { buildDiagramComposition } from '../diagram/composition.mjs'
import { buildFootageComposition } from '../footage/composition.mjs'
import { stageFootageAssets } from '../footage/assets.mjs'
import { loadBrandFonts } from '../shared/brand.mjs'
import { buildOwnerReview, validateAcceptedReview } from '../review/records.mjs'

const helper = fileURLToPath(new URL('./synthesize.py', import.meta.url))

export function runProcess(program, args, { input = '', env } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(program, args, {
      stdio: ['pipe', 'pipe', 'pipe'], shell: false, timeout: 190000, killSignal: 'SIGKILL',
      env: { ...process.env, ...env }
    })
    const chunks = []
    const diagnostics = []
    let size = 0
    child.stdout.on('data', chunk => {
      size += chunk.length
      if (size > 1048576) child.kill('SIGKILL')
      else chunks.push(chunk)
    })
    child.stderr.on('data', chunk => {
      size += chunk.length
      if (size > 1048576) child.kill('SIGKILL')
      else diagnostics.push(chunk)
    })
    child.on('error', () => reject(new Error('TOOL_START_FAILED')))
    child.stdin.on('error', () => reject(new Error('TOOL_INPUT_FAILED')))
    child.on('close', code => {
      if (code !== 0 || size > 1048576) {
        let failure = 'TOOL_FAILED'
        try {
          const report = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (report?.status === 'failed' && ['SPEECH_ENGINE_MISSING', 'SPEECH_ENGINE_MISMATCH',
            'SPEECH_CONSENT_REQUIRED', 'SPEECH_REQUEST_INVALID', 'SPEECH_PROVIDER_FAILED',
            'SPEECH_OUTPUT_EMPTY', 'SPEECH_OUTPUT_UNAVAILABLE', 'SPEECH_OUTPUT_EXISTS',
            'SPEECH_FAILED'].includes(report.code)) failure = report.code
        } catch { failure = 'TOOL_FAILED' }
        reject(new Error(failure))
      }
      else resolveResult({ stdout: Buffer.concat(chunks).toString('utf8'),
        stderr: Buffer.concat(diagnostics).toString('utf8') })
    })
    child.stdin.end(input)
  })
}

function safeCode(error, fallback = 'NARRATION_FAILED') {
  const match = error instanceof Error ? /^([A-Z][A-Z_]{2,80})(?::|$)/.exec(error.message) : null
  return match ? match[1] : fallback
}

async function readLocal(path, limit) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size < 1 || info.size > limit) throw new Error('AUDIO_FILE_INVALID')
    const data = await file.readFile()
    if (data.length > limit) throw new Error('AUDIO_FILE_INVALID')
    return data
  } finally {
    await file.close()
  }
}

function parseAudioProbe(stdout) {
  let probe
  try { probe = JSON.parse(stdout) } catch { throw new Error('AUDIO_METADATA_INVALID') }
  const duration = Number(probe?.format?.duration)
  const stream = probe?.streams?.[0]
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600 ||
      probe.streams.length !== 1 || stream?.codec_type !== 'audio' || stream.codec_name !== 'mp3' ||
      !Number.isInteger(Number(stream.sample_rate)) || Number(stream.sample_rate) <= 0 ||
      !Number.isInteger(stream.channels) || stream.channels < 1 || stream.channels > 2) {
    throw new Error('AUDIO_METADATA_INVALID')
  }
  return duration
}

async function writePrivate(path, contents) {
  await writeFile(path, contents, { flag: 'wx', mode: 0o600 })
}

export async function narratePlan(plan, options, run = runProcess) {
  const speechConfig = options?.speechConfig === undefined ? {} : options.speechConfig
  const requests = narrationRequests(plan, speechConfig)
  if (options?.consentFor !== narrationConsentFingerprint(plan, speechConfig)) {
    throw new Error('SPEECH_CONSENT_REQUIRED')
  }
  if (['output', 'python', 'ffmpeg', 'ffprobe'].some(key =>
    typeof options[key] !== 'string' || !isAbsolute(options[key]))) {
    throw new Error('NARRATION_OPTIONS_INVALID')
  }
  const output = resolve(options.output)
  if (await realpath(dirname(output)) !== dirname(output)) throw new Error('OUTPUT_INVALID')
  try { await mkdir(output, { mode: 0o700 }) } catch (error) {
    throw new Error(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_UNAVAILABLE')
  }
  try {
    await writePrivate(join(output, 'plan.json'), JSON.stringify(plan, null, 2) + '\n')
    const reusable = options.previousNarration === undefined ? requests.map(() => null) :
      await loadReusableNarrations(requests, options.previousNarration)
    const narrations = []
    const reusedSceneIds = []
    const synthesizedSceneIds = []
    for (const [index, request] of requests.entries()) {
      const directory = join(output, request.id)
      if (reusable[index]) {
        await mkdir(directory, { mode: 0o700 })
        await writePrivate(join(directory, 'audio.mp3'), reusable[index].audioBytes)
        await writePrivate(join(directory, 'words.jsonl'), reusable[index].wordsBytes)
        reusedSceneIds.push(request.id)
      } else {
        const result = await run(options.python, ['-I', helper, '--output', directory,
          '--consent-for', request.fingerprint], { input: JSON.stringify(request) })
        let report
        try { report = JSON.parse(result.stdout) } catch { throw new Error('SPEECH_RESULT_INVALID') }
        if (report.id !== request.id || report.fingerprint !== request.fingerprint ||
            report.status !== 'unverified_audio') throw new Error('SPEECH_RESULT_INVALID')
        synthesizedSceneIds.push(request.id)
      }
      const audioPath = join(directory, 'audio.mp3')
      const bytes = await readLocal(audioPath, 67108864)
      const probe = await run(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe',
        '-show_entries', 'format=duration:stream=codec_type,codec_name,sample_rate,channels',
        '-of', 'json', audioPath])
      const duration = parseAudioProbe(probe.stdout)
      if (reusable[index] && Math.abs(duration - reusable[index].narration.duration) > 0.000001) {
        throw new Error('AUDIO_DURATION_CHANGED')
      }
      try {
        await run(options.ffmpeg, ['-v', 'error', '-xerror', '-nostdin', '-protocol_whitelist',
          'file,pipe', '-i', audioPath, '-map', '0:a:0', '-f', 'null', '-'])
      } catch { throw new Error('AUDIO_DECODE_FAILED') }
      const metadata = await readLocal(join(directory, 'words.jsonl'), 8388608)
      const words = parseWordBoundaries(metadata.toString('utf8'), duration)
      narrations.push({ ...request, duration, words, audio: `${request.id}/audio.mp3`,
        audioSha256: createHash('sha256').update(bytes).digest('hex'),
        wordsSha256: createHash('sha256').update(metadata).digest('hex') })
    }
    const timeline = buildNarrationTimeline(plan, narrations, speechConfig)
    const result = { status: 'measured_not_listened', inputFingerprint: plan.input_fingerprint,
      speechConfig, narrations, timeline, reusedSceneIds, synthesizedSceneIds }
    await writePrivate(join(output, 'captions.srt'), timeline.srt)
    await writePrivate(join(output, 'captions.vtt'), timeline.vtt)
    await writePrivate(join(output, 'narration.json'), JSON.stringify(result, null, 2) + '\n')
    return result
  } catch (error) {
    const code = safeCode(error)
    await writePrivate(join(output, 'failure.json'), JSON.stringify({ status: 'failed', code }) + '\n')
    throw new Error(code)
  }
}

export async function finishPlan(plan, options, run = runProcess) {
  const isDiagram = plan.form === 'diagram'
  const isFootage = plan.form === 'footage'
  const usesHyperframes = isDiagram || isFootage
  if (options?.renderConsentFor !== plan.input_fingerprint) throw new Error('RENDER_CONSENT_REQUIRED')
  if (isFootage && options.assetConsentFor !== plan.input_fingerprint) {
    throw new Error('FOOTAGE_ASSET_CONSENT_REQUIRED')
  }
  const required = ['output', 'narration', 'ffmpeg', 'ffprobe',
    ...(usesHyperframes ? ['node', 'hyperframes', 'browser'] : ['plates'])]
  if (required.some(key =>
    typeof options[key] !== 'string' || !isAbsolute(options[key]))) throw new Error('RENDER_OPTIONS_INVALID')
  if (usesHyperframes) {
    try {
      if (!(await stat(options.browser)).isFile()) throw new Error('BROWSER_UNAVAILABLE')
      await access(options.browser, constants.X_OK)
    } catch { throw new Error('BROWSER_UNAVAILABLE') }
  }
  for (const directory of [options.narration, ...(usesHyperframes ? [] : [options.plates]),
    dirname(resolve(options.output))]) {
    if (await realpath(directory) !== resolve(directory)) throw new Error('OUTPUT_INVALID')
  }
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  const narration = JSON.parse(await readLocal(join(options.narration, 'narration.json'), 16777216))
  const speechConfig = options.speechConfig === undefined ? narration.speechConfig ?? {} : options.speechConfig
  const requests = narrationRequests(plan, speechConfig)
  if (narration.status !== 'measured_not_listened' ||
      narration.narrations?.length !== requests.length) throw new Error('NARRATION_STALE')
  const audio = []
  const audioBytes = []
  for (const [index, request] of requests.entries()) {
    const previous = narration.narrations[index]
    const bytes = await readLocal(join(options.narration, request.id, 'audio.mp3'), 67108864)
    const metadata = await readLocal(join(options.narration, request.id, 'words.jsonl'), 8388608)
    if (hash(bytes) !== previous.audioSha256 || hash(metadata) !== previous.wordsSha256 ||
        ['id', 'text', 'voice', 'rate', 'engine', 'fingerprint'].some(key =>
          previous[key] !== request[key])) throw new Error('NARRATION_STALE')
    audio.push({ ...previous, words: parseWordBoundaries(metadata.toString('utf8'), previous.duration) })
    audioBytes.push(bytes)
  }
  const timeline = buildNarrationTimeline(plan, audio, speechConfig)
  const composition = isDiagram ? buildDiagramComposition(plan, timeline) :
    isFootage ? buildFootageComposition(plan, timeline) : null
  const fonts = usesHyperframes ? await loadBrandFonts(options.assets) : []
  const plates = []
  if (!usesHyperframes) {
    const artwork = JSON.parse(await readLocal(join(options.plates, 'illustration-report.json'), 1048576))
    if (artwork.visualFingerprint !== plan.visual_fingerprint ||
        artwork.plates?.length !== timeline.phases.length) throw new Error('ARTWORK_STALE')
    for (const [index, phase] of timeline.phases.entries()) {
      const bytes = await readLocal(join(options.plates, `${phase.id}.png`), 33554432)
      if (artwork.plates[index].id !== phase.id || artwork.plates[index].sha256 !== hash(bytes)) {
        throw new Error('ARTWORK_STALE')
      }
      plates.push(bytes)
    }
  }
  const output = resolve(options.output)
  try { await mkdir(output, { mode: 0o700 }) } catch (error) {
    throw new Error(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_UNAVAILABLE')
  }
  try {
    for (const directory of ['audio', ...(usesHyperframes ? ['composition'] : ['plates', 'segments'])]) {
      await mkdir(join(output, directory), { mode: 0o700 })
    }
    await writePrivate(join(output, 'plan.json'), JSON.stringify(plan, null, 2) + '\n')
    await writePrivate(join(output, 'timing.json'), JSON.stringify(timeline, null, 2) + '\n')
    if (isFootage) {
      const compositionDir = join(output, 'composition')
      const staged = await stageFootageAssets(plan, { compositionDir,
        assetConsentFor: options.assetConsentFor })
      for (const [index, asset] of plan.assets.entries()) {
        const probe = await run(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe',
          '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json',
          join(compositionDir, staged.assets[index].path)])
        let metadata
        try { metadata = JSON.parse(probe.stdout) } catch { throw new Error('FOOTAGE_ASSET_METADATA_MISMATCH') }
        const video = metadata.streams?.filter(stream => stream.codec_type === 'video')
        if (video?.length !== 1 || video[0].width !== asset.width || video[0].height !== asset.height ||
            !Number.isFinite(Number(metadata.format?.duration)) ||
            Math.abs(Number(metadata.format.duration) - asset.duration) > 0.000001) {
          throw new Error('FOOTAGE_ASSET_METADATA_MISMATCH')
        }
      }
    }
    const audioPaths = []
    for (const [index, scene] of timeline.scenes.entries()) {
      const path = join(output, 'audio', `${scene.id}.mp3`)
      await writePrivate(path, audioBytes[index])
      audioPaths.push(path)
      const probe = await run(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe',
        '-show_entries', 'format=duration:stream=codec_type,codec_name,sample_rate,channels', '-of', 'json', path])
      if (Math.abs(parseAudioProbe(probe.stdout) - scene.voiceDuration) > 0.000001) {
        throw new Error('AUDIO_DURATION_CHANGED')
      }
    }
    const picture = join(output, 'picture.mp4')
    if (usesHyperframes) {
      const compositionDir = join(output, 'composition')
      const renderPath = join(output, 'hyperframes.mp4')
      await writePrivate(join(compositionDir, 'index.html'), composition.html)
      const fontDirectory = join(compositionDir, 'brand-fonts')
      await mkdir(fontDirectory, { mode: 0o700 })
      try {
        for (const font of fonts) {
          await writePrivate(join(fontDirectory, `HPEGraphik-${font.name}.otf`), Buffer.from(font.data, 'base64'))
        }
        await run(options.node, [options.hyperframes, 'render', compositionDir,
          '--composition', 'index.html', '--output', renderPath, '--fps', '30',
          '--format', 'mp4', '--workers', '1'], {
          env: { DO_NOT_TRACK: '1', HYPERFRAMES_NO_TELEMETRY: '1',
            HYPERFRAMES_BROWSER_PATH: options.browser }
        })
      } finally {
        await rm(fontDirectory, { recursive: true, force: true })
      }
      await run(options.ffmpeg, ['-n', '-v', 'error', '-nostdin', '-protocol_whitelist',
        'file,pipe', '-i', renderPath, '-map', '0:v:0',
        '-vf', `scale=${SIZE.width}:${SIZE.height}:flags=lanczos,setsar=1`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-r', '30', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', picture])
    } else {
      for (const [index, phase] of timeline.phases.entries()) {
        const path = join(output, 'plates', `${phase.id}.png`)
        await writePrivate(path, plates[index])
        const probe = await run(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe',
          '-show_streams', '-of', 'json', path])
        const streams = JSON.parse(probe.stdout).streams
        if (streams?.length !== 1 || streams[0].codec_name !== 'png' ||
            streams[0].width !== SIZE.width || streams[0].height !== SIZE.height) {
          throw new Error('PLATE_SIZE_INVALID')
        }
      }
      const segments = pictureSegments(timeline)
      const segmentNames = []
      for (const segment of segments) {
        const name = `segments/${String(segment.index).padStart(3, '0')}.mp4`
        const ids = segment.kind === 'hold' ? [segment.plate] : [segment.from, segment.to]
        await run(options.ffmpeg, pictureArguments({ kind: segment.kind, frames: segment.frames,
          plates: ids.map(id => join(output, 'plates', `${id}.png`)), output: join(output, name) }))
        segmentNames.push(name)
      }
      const concat = join(output, 'picture.concat.txt')
      await writePrivate(concat, segmentNames.map(name => `file '${name}'`).join('\n') + '\n')
      await run(options.ffmpeg, ['-n', '-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe',
        '-f', 'concat', '-safe', '1', '-i', concat, '-map', '0:v:0', '-c:v', 'copy', picture])
    }
    const rawVoice = join(output, 'voice-unmixed.wav')
    await run(options.ffmpeg, voiceArguments(timeline, audioPaths, rawVoice))
    const measureArgs = file => ['-hide_banner', '-nostats', '-nostdin', '-protocol_whitelist',
      'file,pipe', '-i', file, '-map', '0:a:0', '-af',
      'loudnorm=I=-16:TP=-1.8:LRA=7:print_format=json', '-f', 'null', '-']
    const measured = loudnessFrom((await run(options.ffmpeg, measureArgs(rawVoice))).stderr)
    const voice = join(output, 'voice-normalized.wav')
    await run(options.ffmpeg, normalizationArguments(rawVoice, voice, measured))
    const captions = join(output, 'captions.srt')
    const metadata = join(output, 'chapters.ffmetadata')
    await writePrivate(captions, timeline.srt)
    await writePrivate(join(output, 'captions.vtt'), timeline.vtt)
    await writePrivate(metadata, chapterMetadata(plan.title, timeline))
    const partial = join(output, 'film.partial.mp4')
    await run(options.ffmpeg, muxArguments(timeline, { picture, voice, captions, metadata, output: partial }))
    const probe = await run(options.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe',
      '-count_frames', '-show_streams', '-show_format', '-show_chapters', '-of', 'json', partial])
    verifyFilmMetadata(JSON.parse(probe.stdout), timeline)
    await run(options.ffmpeg, ['-v', 'error', '-xerror', '-nostdin', '-protocol_whitelist',
      'file,pipe', '-i', partial, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'])
    const levels = loudnessFrom((await run(options.ffmpeg, measureArgs(partial))).stderr)
    if (Math.abs(levels.input_i + 16) > 1 || levels.input_tp > -1.5) throw new Error('FILM_LOUDNESS_FAILED')
    const outputSha256 = hash(await readLocal(partial, 536870912))
    await link(partial, join(output, 'film.mp4'))
    await unlink(partial)
    const report = { status: 'awaiting_review', inputFingerprint: plan.input_fingerprint,
      outputSha256, frameCount: timeline.frameCount, duration: timeline.duration,
      fullDecode: 'passed', audioAnalysis: levels, watched: false, listened: false,
      production_qualified: false,
      ...(fonts.length ? { fonts: fonts.map(({ name, weight, sha256 }) => ({ name, weight, sha256 })) } : {}) }
    await writePrivate(join(output, 'render-report.json'), JSON.stringify(report, null, 2) + '\n')
    return report
  } catch (error) {
    const code = safeCode(error, 'RENDER_FAILED')
    await writePrivate(join(output, 'failure.json'), JSON.stringify({ status: 'failed', code }) + '\n')
    throw new Error(code)
  }
}

const cutFiles = ['film.mp4', 'captions.srt', 'captions.vtt', 'render-report.json']

async function hashCutFile(path, limit) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size < 1 || before.size > limit) throw new Error('CUT_FILE_INVALID')
    const digest = createHash('sha256')
    let bytes = 0
    for await (const chunk of file.createReadStream({autoClose:false})) {
      bytes += chunk.length
      if (bytes > limit) throw new Error('CUT_FILE_INVALID')
      digest.update(chunk)
    }
    const after = await file.stat()
    if (bytes !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs) throw new Error('CUT_CHANGED')
    return {sha256:digest.digest('hex'), bytes}
  } finally { await file.close() }
}

export async function inspectCut(options) {
  if (typeof options?.cut !== 'string' || !isAbsolute(options.cut) ||
      await realpath(options.cut) !== resolve(options.cut)) throw new Error('CUT_PATH_INVALID')
  const cut = resolve(options.cut)
  const files = {}
  for (const name of cutFiles) {
    files[name] = await hashCutFile(join(cut,name), name === 'film.mp4' ? 2147483648 : 2097152)
  }
  const reportBytes = await readLocal(join(cut,'render-report.json'),2097152)
  if (createHash('sha256').update(reportBytes).digest('hex') !== files['render-report.json'].sha256) {
    throw new Error('CUT_CHANGED')
  }
  const report = JSON.parse(reportBytes)
  if (report.outputSha256 !== files['film.mp4'].sha256) throw new Error('CUT_CHANGED')
  if (report.status !== 'awaiting_review' || report.fullDecode !== 'passed' ||
      !Number.isSafeInteger(report.frameCount) || report.frameCount < 1 ||
      !Number.isFinite(report.duration) || report.duration <= 0 ||
      Math.abs(report.duration - report.frameCount/30) > 1/30 ||
      !Number.isFinite(report.audioAnalysis?.input_i) ||
      Math.abs(report.audioAnalysis.input_i + 16) > 1 ||
      !Number.isFinite(report.audioAnalysis?.input_tp) || report.audioAnalysis.input_tp > -1.5) {
    throw new Error('CUT_CHECKS_REQUIRED')
  }
  return {schema_version:'cmo-cut-review-1', status:'awaiting_owner_review', cut,
    cutFingerprint:createHash('sha256').update(JSON.stringify(files)).digest('hex'), files,
    film:join(cut,'film.mp4'),
    technicalReview:{basis:'matching_render_report',decodeRepeated:false,
      frameCount:report.frameCount,duration:report.duration,fullDecode:report.fullDecode,
      loudnessLUFS:report.audioAnalysis.input_i,truePeakDBTP:report.audioAnalysis.input_tp},
    humanReview:null, production_qualified:false}
}

async function createCutOutput(output, cut) {
  if (typeof output !== 'string' || !isAbsolute(output) || resolve(output) === cut ||
      resolve(output).startsWith(cut + '/') ||
      await realpath(dirname(resolve(output))) !== dirname(resolve(output))) {
    throw new Error('OUTPUT_INVALID')
  }
  try { await mkdir(output, {mode:0o700}) } catch (error) {
    throw new Error(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_UNAVAILABLE')
  }
}

export async function recordReview(decision, options) {
  const inspected = await inspectCut(options)
  const result = buildOwnerReview(inspected, decision)
  await createCutOutput(options.output, inspected.cut)
  await writePrivate(join(options.output,'review.json'), JSON.stringify(result,null,2)+'\n')
  return result
}

export async function deliverCut(options) {
  const inspected = await inspectCut(options)
  if (typeof options.review !== 'string' || !isAbsolute(options.review) ||
      await realpath(options.review) !== resolve(options.review)) throw new Error('REVIEW_REQUIRED')
  const reviewBytes = await readLocal(options.review,2097152)
  const review = JSON.parse(reviewBytes)
    const humanReview = validateAcceptedReview(inspected, review)
  await createCutOutput(options.output, inspected.cut)
  for (const name of cutFiles) {
    const destination = join(options.output,name)
    await copyFile(join(inspected.cut,name),destination,constants.COPYFILE_EXCL)
    await chmod(destination,0o600)
    const copied = await hashCutFile(destination,name === 'film.mp4' ? 2147483648 : 2097152)
    if (copied.sha256 !== inspected.files[name].sha256) throw new Error('CUT_CHANGED')
  }
  if ((await inspectCut(options)).cutFingerprint !== inspected.cutFingerprint) throw new Error('CUT_CHANGED')
  await writePrivate(join(options.output,'review.json'),reviewBytes)
  const result = {schema_version:'cmo-local-delivery-1',status:'delivered_local',
    deliveredAt:new Date().toISOString(),output:resolve(options.output),
    sourceCut:inspected.cut,cutFingerprint:inspected.cutFingerprint,files:inspected.files,
    technicalReview:inspected.technicalReview,
    humanReview,
    production_qualified:false}
  await writePrivate(join(options.output,'delivery.json'),JSON.stringify(result,null,2)+'\n')
  return result
}

async function main() {
  try {
    const { values } = parseArgs({ options: {
      output: { type: 'string' }, python: { type: 'string' }, ffmpeg: { type: 'string' },
      ffprobe: { type: 'string' }, 'consent-for': { type: 'string' },
      operation: { type: 'string', default: 'narrate' }, narration: { type: 'string' },
      plates: { type: 'string' }, 'render-consent-for': { type: 'string' },
      node: { type: 'string' }, hyperframes: { type: 'string' },
      browser: { type: 'string' },
      playwright: { type: 'string' }, chromium: { type: 'string' },
      assets: { type: 'string' },
      'artwork-consent-for': { type: 'string' }, cut: { type: 'string' }, review: { type: 'string' },
      'speech-config': { type: 'string' }, 'previous-narration': { type: 'string' },
      'asset-consent-for': { type: 'string' }, 'save-consent-for': { type: 'string' }
    } })
    if (values.operation === 'inspect' || values.operation === 'deliver') {
      const result = await (values.operation === 'inspect' ? inspectCut(values) : deliverCut(values))
      console.log(JSON.stringify(result))
      return
    }
    let input = ''
    process.stdin.setEncoding('utf8')
    if (values.operation !== 'review-page' || !process.stdin.isTTY) {
      for await (const chunk of process.stdin) {
        input += chunk
        if (Buffer.byteLength(input) > 1048576) throw new Error('PLAN_TOO_LARGE')
      }
    }
    const options = { ...values,
      consentFor: values['consent-for'], renderConsentFor: values['render-consent-for'],
      artworkConsentFor: values['artwork-consent-for'], assetConsentFor: values['asset-consent-for'],
      saveConsentFor: values['save-consent-for'], previousNarration: values['previous-narration'],
      speechConfig: values['speech-config'] === undefined ? undefined : JSON.parse(values['speech-config']) }
    if (values.operation === 'review-page' || values.operation === 'review-notes') {
      const { createReviewPage, recordReviewNotes } = await import('../review/experience.mjs')
      const pageInput = values.operation === 'review-page' && input.trim() ? JSON.parse(input) : {}
      const result = values.operation === 'review-page' ?
        await createReviewPage({ ...options, chapters: pageInput.chapters, notes: pageInput.notes }) :
        await recordReviewNotes(JSON.parse(input), options)
      console.log(JSON.stringify(result))
      return
    }
    const operations = {narrate:narratePlan,render:finishPlan,artwork:illustratePlan,review:recordReview}
    if (!Object.hasOwn(operations,values.operation)) throw new Error('OPERATION_INVALID')
    const operation = operations[values.operation]
    const result = await operation(JSON.parse(input), options)
    console.log(JSON.stringify(values.operation === 'review' ? result : {
      status: result.status, frameCount: result.timeline?.frameCount ?? result.frameCount,
      production_qualified: false }))
  } catch (error) {
    console.log(JSON.stringify({ status: 'failed', code: safeCode(error) }))
    process.exitCode = 2
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) void main()