import { isAbsolute, resolve } from 'node:path'
import { FPS, SIZE } from './picture.mjs'

const base = ['-n', '-hide_banner', '-loglevel', 'error', '-nostdin',
  '-filter_complex_threads', '1', '-filter_threads', '1']

function checkTimeline(timeline) {
  if (timeline?.fps !== FPS || !Number.isSafeInteger(timeline.frameCount) ||
      timeline.frameCount <= 0 || !Number.isFinite(timeline.duration) ||
      Math.abs(timeline.duration - timeline.frameCount / FPS) > 1e-9 ||
      !Array.isArray(timeline.scenes) || !timeline.scenes.length) {
    throw new Error('FINISH_TIMELINE_INVALID')
  }
}

function checkPaths(paths) {
  if (paths.some(path => typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) ||
      new Set(paths.map(path => resolve(path))).size !== paths.length) {
    throw new Error('FINISH_PATH_INVALID')
  }
}

export function pictureSegments(timeline) {
  checkTimeline(timeline)
  if (!Array.isArray(timeline.phases) || !timeline.phases.length ||
      !Array.isArray(timeline.transitions) ||
      timeline.transitions.length !== timeline.phases.length - 1) throw new Error('PICTURE_GAP')
  const pieces = []
  let cursor = 0
  let current = timeline.phases[0].id
  for (const [index, transition] of timeline.transitions.entries()) {
    if (transition.from !== current || transition.to !== timeline.phases[index + 1].id ||
        ![transition.startFrame, transition.endFrame, transition.frames].every(Number.isSafeInteger) ||
        transition.startFrame < cursor || transition.endFrame > timeline.frameCount ||
        transition.frames <= 0 || transition.endFrame - transition.startFrame !== transition.frames) {
      throw new Error('PICTURE_GAP')
    }
    if (transition.startFrame > cursor) pieces.push({ kind: 'hold', plate: current,
      startFrame: cursor, frames: transition.startFrame - cursor })
    pieces.push({ kind: 'dissolve', from: current, to: transition.to,
      startFrame: transition.startFrame, frames: transition.frames })
    cursor = transition.endFrame
    current = transition.to
  }
  if (cursor < timeline.frameCount) pieces.push({ kind: 'hold', plate: current,
    startFrame: cursor, frames: timeline.frameCount - cursor })
  if (pieces.reduce((total, piece) => total + piece.frames, 0) !== timeline.frameCount) {
    throw new Error('PICTURE_GAP')
  }
  return pieces.map((piece, index) => ({ ...piece, index, duration: piece.frames / FPS }))
}

export function voiceArguments(timeline, audio, output) {
  checkTimeline(timeline)
  if (!Array.isArray(audio) || audio.length !== timeline.scenes.length) throw new Error('AUDIO_MISSING')
  checkPaths([...audio, output])
  const filters = timeline.scenes.map((scene, index) => {
    if (!Number.isFinite(scene.voiceStart) || scene.voiceStart < 0 ||
        scene.voiceStart >= timeline.duration) throw new Error('AUDIO_OFFSET_INVALID')
    return `[${index}:a]aresample=48000,asetpts=PTS-STARTPTS,` +
      `adelay=${Math.round(scene.voiceStart * 48000)}S:all=1[a${index}]`
  })
  filters.push(timeline.scenes.map((_, index) => `[a${index}]`).join('') +
    `amix=inputs=${audio.length}:normalize=0:duration=longest,apad=whole_dur=${timeline.duration},` +
    `atrim=duration=${timeline.duration},aformat=sample_rates=48000:channel_layouts=stereo[voice]`)
  return [...base, ...audio.flatMap(path => ['-protocol_whitelist', 'file,pipe', '-i', path]),
    '-filter_complex', filters.join(';'), '-map', '[voice]', '-c:a', 'pcm_s24le', output]
}

function validateLevels(data) {
  const fields = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']
  if (!data || fields.some(key => !['string', 'number'].includes(typeof data[key]) ||
      String(data[key]).trim() === '' || !Number.isFinite(Number(data[key])))) {
    throw new Error('LOUDNESS_INVALID')
  }
  return Object.fromEntries(fields.map(key => [key, Number(data[key])]))
}

export function loudnessFrom(stderr) {
  let data
  try { data = JSON.parse(stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0] ?? '') }
  catch { throw new Error('LOUDNESS_INVALID') }
  return validateLevels(data)
}

export function normalizationArguments(input, output, measured) {
  checkPaths([input, output])
  const levels = validateLevels(measured)
  const filter = `loudnorm=I=-16:TP=-1.8:LRA=7:measured_I=${levels.input_i}:` +
    `measured_TP=${levels.input_tp}:measured_LRA=${levels.input_lra}:` +
    `measured_thresh=${levels.input_thresh}:offset=${levels.target_offset}:` +
    'linear=true:print_format=json,aresample=48000'
  return [...base, '-protocol_whitelist', 'file,pipe', '-i', input, '-af', filter,
    '-c:a', 'pcm_s24le', output]
}

export function chapterMetadata(title, timeline) {
  checkTimeline(timeline)
  const escape = value => {
    if (typeof value !== 'string' || !value.trim()) throw new Error('CHAPTER_INVALID')
    return value.replace(/[=;#\\\n\r]/g, character => `\\${character}`)
  }
  return [';FFMETADATA1', `title=${escape(title)}`, ...timeline.scenes.flatMap(scene => {
    if (!Number.isFinite(scene.start) || !Number.isFinite(scene.end) || scene.start < 0 ||
        scene.end <= scene.start || scene.end > timeline.duration) throw new Error('CHAPTER_INVALID')
    return ['[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(scene.start * 1000)}`,
      `END=${Math.round(scene.end * 1000)}`, `title=${escape(scene.title)}`]
  })].join('\n') + '\n'
}

export function muxArguments(timeline, files) {
  checkTimeline(timeline)
  const inputs = [files.picture, files.voice, files.captions, files.metadata]
  checkPaths([...inputs, files.output])
  return [...base, ...inputs.flatMap(path => ['-protocol_whitelist', 'file,pipe', '-i', path]),
    '-map', '0:v:0', '-map', '1:a:0', '-map', '2:0', '-map_metadata', '3', '-map_chapters', '3',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-c:s', 'mov_text',
    '-metadata:s:a:0', 'language=eng', '-metadata:s:s:0', 'language=eng',
    '-metadata:s:s:0', 'title=English', '-disposition:s:0', '0', '-movflags', '+faststart',
    '-t', timeline.duration.toFixed(6), files.output]
}

export function verifyFilmMetadata(probe, timeline) {
  checkTimeline(timeline)
  if (!Array.isArray(probe?.streams) || !Array.isArray(probe.chapters)) {
    throw new Error('FILM_METADATA_INVALID')
  }
  const videos = probe.streams.filter(stream => stream?.codec_type === 'video')
  const audios = probe.streams.filter(stream => stream?.codec_type === 'audio')
  const subtitles = probe.streams.filter(stream => stream?.codec_type === 'subtitle')
  const video = videos[0]
  const audio = audios[0]
  const near = (actual, expected, tolerance = 2 / FPS) =>
    Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) <= tolerance
  if (videos.length !== 1 || audios.length !== 1 || subtitles.length !== 1 ||
      video.codec_name !== 'h264' || video.width !== SIZE.width || video.height !== SIZE.height ||
      video.pix_fmt !== 'yuv420p' || video.r_frame_rate !== `${FPS}/1` ||
      Number(video.nb_read_frames) !== timeline.frameCount ||
      ['color_space', 'color_transfer', 'color_primaries'].some(field => video[field] !== 'bt709') ||
      audio.codec_name !== 'aac' || Number(audio.sample_rate) !== 48000 || audio.channels !== 2 ||
      subtitles[0].codec_name !== 'mov_text' || !near(video.duration, timeline.duration) ||
      !near(audio.duration, timeline.duration) || !near(probe.format?.duration, timeline.duration) ||
      probe.chapters.length !== timeline.scenes.length || probe.chapters.some((chapter, index) =>
        !near(chapter.start_time, timeline.scenes[index].start, 0.002) ||
        !near(chapter.end_time, timeline.scenes[index].end, 0.002))) {
    throw new Error('FILM_METADATA_INVALID')
  }
  return true
}