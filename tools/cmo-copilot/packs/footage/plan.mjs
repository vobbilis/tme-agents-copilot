import { createHash } from 'node:crypto'
import { extname, isAbsolute } from 'node:path'

const INPUT_FIELDS = ['project_id', 'film_id', 'title', 'source_ids', 'assets', 'scenes']
const HASH_FIELDS = ['input_fingerprint', 'narration_fingerprint', 'visual_fingerprint']
const METADATA = { schema_version: 'cmo-footage-plan-1',
  status: 'planned_not_executable', form: 'footage',
  timing_status: 'editorial_estimate_only', production_qualified: false }
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/
const CONTENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/

function requireValid(condition) {
  if (!condition) throw new Error('INVALID_FOOTAGE_PLAN')
}

function record(value, fields, optional = []) {
  requireValid(value && typeof value === 'object' && !Array.isArray(value))
  requireValid(fields.every(field => Object.hasOwn(value, field)))
  requireValid(Reflect.ownKeys(value).every(field => [...fields, ...optional].includes(field)))
}

function text(value, limit = 4096) {
  requireValid(typeof value === 'string' && value.trim().length > 0 &&
    value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
}

function identifier(value, pattern = SAFE_ID) {
  text(value, 160)
  requireValid(pattern.test(value))
}

function ids(value) {
  requireValid(Array.isArray(value) && value.length > 0)
  value.forEach(item => identifier(item, CONTENT_ID))
  requireValid(new Set(value).size === value.length)
}

function rect(value, width, height) {
  record(value, ['x', 'y', 'width', 'height'])
  requireValid(Object.values(value).every(Number.isFinite))
  requireValid(value.x >= 0 && value.y >= 0 && value.width > 0 && value.height > 0 &&
    value.x + value.width <= width && value.y + value.height <= height)
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

function annotationLines(value, charactersPerLine) {
  let lines = 1
  let occupied = 0
  for (const word of value.trim().split(/\s+/)) {
    const length = Array.from(word).length
    if (occupied && occupied + 1 + length > charactersPerLine) {
      lines++
      occupied = 0
    } else if (occupied) occupied++
    lines += Math.floor((length - 1) / charactersPerLine)
    occupied += (length - 1) % charactersPerLine + 1
  }
  return lines
}

function validateInput(input) {
  record(input, INPUT_FIELDS)
  identifier(input.project_id)
  identifier(input.film_id)
  text(input.title, 200)
  ids(input.source_ids)
  requireValid(Array.isArray(input.assets) && input.assets.length > 0 && input.assets.length <= 100)
  const assets = new Map()
  for (const asset of input.assets) {
    record(asset, ['id', 'path', 'sha256', 'bytes', 'duration', 'width', 'height'])
    identifier(asset.id)
    text(asset.path)
    requireValid(isAbsolute(asset.path) && !asset.path.includes('\u0000') &&
      /^\.(mp4|mov|webm|m4v)$/.test(extname(asset.path).toLowerCase()))
    requireValid(typeof asset.sha256 === 'string' && /^[a-f0-9]{64}$/.test(asset.sha256))
    requireValid(Number.isSafeInteger(asset.bytes) && asset.bytes > 0)
    requireValid(Number.isFinite(asset.duration) && asset.duration > 0)
    requireValid(Number.isSafeInteger(asset.width) && asset.width > 0 && asset.width <= 16384 &&
      Number.isSafeInteger(asset.height) && asset.height > 0 && asset.height <= 16384)
    requireValid(!assets.has(asset.id))
    assets.set(asset.id, asset)
  }
  requireValid(Array.isArray(input.scenes) && input.scenes.length > 0 && input.scenes.length <= 100)
  const sceneIds = new Set()
  const sentenceIds = new Set()
  for (const scene of input.scenes) {
    record(scene, ['id', 'title', 'cues', 'sentences', 'clip'], ['annotations'])
    identifier(scene.id, /^S[0-9]+$/)
    requireValid(!sceneIds.has(scene.id))
    sceneIds.add(scene.id)
    text(scene.title, 120)
    requireValid(Array.isArray(scene.sentences) && scene.sentences.length > 0)
    for (const sentence of scene.sentences) {
      record(sentence, ['id', 'text', 'source_ids', 'status'])
      identifier(sentence.id, CONTENT_ID)
      requireValid(!sentenceIds.has(sentence.id))
      sentenceIds.add(sentence.id)
      text(sentence.text)
      ids(sentence.source_ids)
      requireValid(sentence.source_ids.every(source => input.source_ids.includes(source)))
      requireValid(sentence.status === 'supported')
    }
    requireValid(Array.isArray(scene.cues))
    const narration = scene.sentences.map(sentence => sentence.text).join(' ')
    let previousCue = -1
    for (const cue of scene.cues) {
      text(cue)
      const words = cue.split(/\s+/).length
      const position = narration.indexOf(cue)
      requireValid(words >= 3 && words <= 6 && position > previousCue &&
        narration.lastIndexOf(cue) === position)
      previousCue = position
    }
    record(scene.clip, ['asset_id', 'start', 'end', 'crop'])
    const asset = assets.get(scene.clip.asset_id)
    requireValid(asset && Number.isFinite(scene.clip.start) && Number.isFinite(scene.clip.end) &&
      scene.clip.start >= 0 && scene.clip.end > scene.clip.start && scene.clip.end <= asset.duration)
    rect(scene.clip.crop, asset.width, asset.height)
    if (Object.hasOwn(scene, 'annotations')) {
      requireValid(Array.isArray(scene.annotations) && scene.annotations.length <= 50)
      const annotationIds = new Set()
      for (const annotation of scene.annotations) {
        record(annotation, ['id', 'text', 'start', 'end', 'rect'])
        identifier(annotation.id)
        requireValid(!annotationIds.has(annotation.id))
        annotationIds.add(annotation.id)
        text(annotation.text, 120)
        requireValid(Number.isFinite(annotation.start) && Number.isFinite(annotation.end) &&
          annotation.start >= 0 && annotation.end > annotation.start &&
          annotation.end <= scene.clip.end - scene.clip.start)
        rect(annotation.rect, 1920, 980)
        const charactersPerLine = Math.floor((annotation.rect.width - 16) / 32)
        requireValid(annotation.rect.width >= 100 && annotation.rect.height >= 48 &&
          annotationLines(annotation.text, charactersPerLine) * 42 <=
          annotation.rect.height)
      }
    }
  }
  return input
}

function fingerprints(input) {
  const narration = { project_id: input.project_id, film_id: input.film_id,
    source_ids: input.source_ids, scenes: input.scenes.map(scene =>
      ({ id: scene.id, cues: scene.cues, sentences: scene.sentences })) }
  const visual = { project_id: input.project_id, film_id: input.film_id,
    title: input.title, assets: input.assets, scenes: input.scenes.map(scene =>
      ({ id: scene.id, title: scene.title, cues: scene.cues, clip: scene.clip,
        annotations: scene.annotations ?? [] })) }
  return { input_fingerprint: fingerprint(input),
    narration_fingerprint: fingerprint(narration), visual_fingerprint: fingerprint(visual) }
}

export function buildFootagePlan(input) {
  validateInput(input)
  const detached = structuredClone(canonical(input))
  return { ...METADATA, ...detached, ...fingerprints(detached) }
}

export function validateFootagePlan(plan) {
  record(plan, [...INPUT_FIELDS, ...HASH_FIELDS, ...Object.keys(METADATA)])
  requireValid(Object.entries(METADATA).every(([field, value]) => plan[field] === value))
  const input = Object.fromEntries(INPUT_FIELDS.map(field => [field, plan[field]]))
  validateInput(input)
  const expected = fingerprints(input)
  for (const field of HASH_FIELDS) {
    if (plan[field] !== expected[field]) throw new Error(`STALE_FOOTAGE_PLAN: ${field}`)
  }
  return plan
}

export function stagedFootagePath(asset) {
  return `assets/footage-${asset.id}-${asset.sha256}${extname(asset.path).toLowerCase()}`
}