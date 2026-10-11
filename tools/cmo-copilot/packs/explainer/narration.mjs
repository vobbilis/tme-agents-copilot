import { createHash } from 'node:crypto'
import { FPS, SIZE } from './picture.mjs'
import { validateStagePlan } from './plan.mjs'
import { validateDiagramPlan } from '../diagram/plan.mjs'
import { validateFootagePlan } from '../footage/plan.mjs'
import { SPEECH_ENGINE, speechFingerprint, validateWords, findCue,
  buildCaptions, validateCaptions, serializeCaptions } from './speech.mjs'
import { VOICE, RATE, normalizeSpeechControls, prepareSpeech,
  mapDisplayWords } from './speech-controls.mjs'

export { VOICE, RATE }
export const VOICE_OFFSET = 0.4
export const DISSOLVE_FRAMES = 10

export function narrationRequests(plan, speechConfig = {}) {
  if (plan?.form === 'diagram') validateDiagramPlan(plan)
  else if (plan?.form === 'footage') validateFootagePlan(plan)
  else validateStagePlan(plan)
  const controls = normalizeSpeechControls(speechConfig)
  return plan.scenes.map(scene => {
    const displayText = scene.sentences.map(sentence => sentence.text).join(' ')
    const text = controls.substitutions.length ? prepareSpeech(displayText, controls).text : displayText
    const { voice, rate } = controls
    return { id: scene.id, text, voice, rate, engine: SPEECH_ENGINE,
      fingerprint: speechFingerprint(text, voice, rate) }
  })
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

export function narrationConsentFingerprint(plan, speechConfig = {}) {
  narrationRequests(plan, speechConfig)
  const controls = normalizeSpeechControls(speechConfig)
  if (controls.voice === VOICE && controls.rate === RATE && !controls.substitutions.length) {
    return plan.input_fingerprint
  }
  return createHash('sha256').update(JSON.stringify(canonical({
    domain: 'cmo-narration-consent-1', plan, controls
  }))).digest('hex')
}

export function buildNarrationTimeline(plan, narrations, speechConfig = {}) {
  const requests = narrationRequests(plan, speechConfig)
  const controls = normalizeSpeechControls(speechConfig)
  if (!Array.isArray(narrations) || narrations.length !== requests.length) {
    throw new Error('NARRATION_INCOMPLETE')
  }
  let cursor = 0
  const captions = []
  const scenes = plan.scenes.map((scene, index) => {
    const audio = narrations[index]
    const request = requests[index]
    if (!audio || ['id', 'text', 'voice', 'rate', 'engine', 'fingerprint']
      .some(field => audio[field] !== request[field])) throw new Error('NARRATION_STALE')
    validateWords(audio.words, audio.duration)
    const displayText = scene.sentences.map(sentence => sentence.text).join(' ')
    const displayWords = controls.substitutions.length ? mapDisplayWords(
      prepareSpeech(displayText, controls), audio.words, audio.duration) : audio.words
    const sceneCaptions = buildCaptions(displayText, displayWords, audio.duration)
    const tail = index === plan.scenes.length - 1 ? 1.2 : 0.65
    const rawFrames = (VOICE_OFFSET + audio.duration + tail) * FPS
    const frameCount = Math.ceil(rawFrames - Number.EPSILON * Math.max(1, rawFrames) * 4)
    if (!Number.isSafeInteger(frameCount)) throw new Error('NARRATION_TIMING_INVALID')
    const startFrame = cursor
    const endFrame = startFrame + frameCount
    const offset = startFrame / FPS + VOICE_OFFSET
    const cues = scene.cues.map(phrase => {
      const found = findCue(displayWords, phrase)
      const voiceTime = offset + found.start
      const frame = plan.form === 'explainer'
        ? Math.ceil(voiceTime * FPS) : Math.round(voiceTime * FPS)
      return { phrase, voiceTime, frame, time: frame / FPS, wordIndex: found.wordIndex,
        error: frame / FPS - voiceTime }
    })
    const frames = plan.form === 'explainer' ? [startFrame, ...cues.map(cue => cue.frame)] : []
    const phases = frames.map((frame, phase) => {
      const end = frames[phase + 1] ?? endFrame
      if (end - frame < DISSOLVE_FRAMES + FPS) throw new Error('PICTURE_STATE_TOO_SHORT')
      return { id: `${scene.id}-${phase}`, scene_id: scene.id, phase, startFrame: frame,
        endFrame: end, start: frame / FPS, end: end / FPS, duration: (end - frame) / FPS,
        plate: `plates/${scene.id}-${phase}.png` }
    })
    captions.push(...sceneCaptions.map(caption => ({
      ...caption, start: caption.start + offset, end: caption.end + offset
    })))
    cursor = endFrame
    return { id: scene.id, title: scene.title, startFrame, endFrame,
      start: startFrame / FPS, end: endFrame / FPS, duration: frameCount / FPS,
      frameCount, voiceStart: offset, voiceDuration: audio.duration, tail,
      narrationFingerprint: request.fingerprint, cues, phases }
  })
  const duration = cursor / FPS
  validateCaptions(captions, duration)
  const phases = scenes.flatMap(scene => scene.phases)
  const transitions = phases.slice(1).map((phase, index) => {
    const startFrame = phase.startFrame - (phase.phase === 0 ? DISSOLVE_FRAMES / 2 : 0)
    return { from: phases[index].id, to: phase.id,
      midpointFrame: startFrame + DISSOLVE_FRAMES / 2,
      startFrame, endFrame: startFrame + DISSOLVE_FRAMES, frames: DISSOLVE_FRAMES,
      midpoint: (startFrame + DISSOLVE_FRAMES / 2) / FPS,
      kind: phase.phase === 0 ? 'chapter' : 'reveal' }
  })
  return { inputFingerprint: plan.input_fingerprint, fps: FPS, size: SIZE,
    frameCount: cursor, duration, voiceOffset: VOICE_OFFSET,
    dissolveFrames: plan.form === 'explainer' ? DISSOLVE_FRAMES : 0,
    scenes, phases, transitions, captions, srt: serializeCaptions(captions, 'srt'),
    vtt: serializeCaptions(captions, 'vtt'), production_qualified: false,
    pronunciationListeningVerified: false }
}