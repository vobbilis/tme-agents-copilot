import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { renderDiagramSvg } from './diagram.mjs'

const INPUT_FIELDS = ['project_id', 'film_id', 'title', 'source_ids', 'scenes']
const FINGERPRINT_FIELDS = ['input_fingerprint', 'narration_fingerprint', 'visual_fingerprint']
const METADATA = {
  schema_version: 'cmo-diagram-plan-1',
  status: 'planned_not_executable',
  form: 'diagram',
  timing_status: 'editorial_estimate_only',
  production_qualified: false
}
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/
const CONTENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/

function record(value, fields) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...fields].sort())
}

function text(value) {
  assert.ok(typeof value === 'string' && value.trim().length > 0)
}

function identifier(value, pattern) {
  text(value)
  assert.match(value, pattern)
  assert.equal(value.trim(), value)
}

function ids(value) {
  assert.ok(Array.isArray(value) && value.length > 0)
  for (const item of value) identifier(item, CONTENT_ID)
  assert.equal(new Set(value).size, value.length)
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .map(key => [key, canonical(value[key])]))
  }
  return value
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

function validateInput(input) {
  record(input, INPUT_FIELDS)
  for (const field of ['project_id', 'film_id']) identifier(input[field], SAFE_ID)
  text(input.title)
  ids(input.source_ids)
  assert.ok(Array.isArray(input.scenes) && input.scenes.length > 0)
  const sceneIds = new Set()
  const sentenceIds = new Set()
  for (const scene of input.scenes) {
    record(scene, ['id', 'title', 'cues', 'sentences', 'diagram'])
    identifier(scene.id, /^S[0-9]+$/)
    assert.ok(!sceneIds.has(scene.id))
    sceneIds.add(scene.id)
    text(scene.title)
    assert.ok(Array.isArray(scene.cues))
    assert.ok(Array.isArray(scene.sentences) && scene.sentences.length > 0)
    for (const sentence of scene.sentences) {
      record(sentence, ['id', 'text', 'source_ids', 'status'])
      identifier(sentence.id, CONTENT_ID)
      assert.ok(!sentenceIds.has(sentence.id))
      sentenceIds.add(sentence.id)
      text(sentence.text)
      ids(sentence.source_ids)
      assert.ok(sentence.source_ids.every(source => input.source_ids.includes(source)))
      assert.equal(sentence.status, 'supported')
    }
    const narration = scene.sentences.map(sentence => sentence.text).join(' ')
    let previousCue = -1
    for (const cue of scene.cues) {
      text(cue)
      const words = cue.split(/\s+/).length
      assert.ok(words >= 3 && words <= 6)
      const position = narration.indexOf(cue)
      assert.ok(position > previousCue && narration.lastIndexOf(cue) === position)
      previousCue = position
    }
    renderDiagramSvg(scene.diagram, 0)
  }
  return input
}

function fingerprints(input) {
  const narration = {
    project_id: input.project_id, film_id: input.film_id, source_ids: input.source_ids,
    scenes: input.scenes.map(scene => ({ id: scene.id, cues: scene.cues,
      sentences: scene.sentences }))
  }
  const visual = {
    project_id: input.project_id, film_id: input.film_id, title: input.title,
    scenes: input.scenes.map(scene => ({ id: scene.id, title: scene.title,
      cues: scene.cues, diagram: scene.diagram }))
  }
  return {
    input_fingerprint: fingerprint(input),
    narration_fingerprint: fingerprint(narration),
    visual_fingerprint: fingerprint(visual)
  }
}

export function buildDiagramPlan(input) {
  validateInput(input)
  const detached = structuredClone(canonical(input))
  return { ...METADATA, ...detached, ...fingerprints(detached) }
}

export function validateDiagramPlan(plan) {
  record(plan, [...INPUT_FIELDS, ...Object.keys(METADATA), ...FINGERPRINT_FIELDS])
  for (const [field, value] of Object.entries(METADATA)) {
    assert.deepEqual(plan[field], value)
  }
  const input = Object.fromEntries(INPUT_FIELDS.map(field => [field, plan[field]]))
  validateInput(input)
  const expected = fingerprints(input)
  for (const field of FINGERPRINT_FIELDS) {
    assert.equal(plan[field], expected[field], `Stale diagram plan ${field}`)
  }
  return plan
}