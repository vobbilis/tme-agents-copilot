import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import schema from '../../schemas/explainer-plan.schema.json' with { type: 'json' }
import { validateIllustrations } from './illustration.mjs'

function record(value, definition) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value))
  assert.ok(definition.required.every(key => Object.hasOwn(value, key)))
  assert.ok(Object.keys(value).every(key => Object.hasOwn(definition.properties, key)))
}

function text(value) {
  assert.ok(typeof value === 'string' && value.trim().length > 0)
}

function identifier(value) {
  text(value)
  assert.match(value, new RegExp(schema.$defs.id.pattern))
}

function texts(value) {
  assert.ok(Array.isArray(value))
  for (const item of value) text(item)
}

function ids(value) {
  assert.ok(Array.isArray(value) && value.length > 0)
  for (const item of value) identifier(item)
  assert.equal(new Set(value).size, value.length)
}

export function validateStagePlan(plan) {
  record(plan, schema)
  for (const [name, definition] of Object.entries(schema.properties)) {
    if (Object.hasOwn(definition, 'const') && Object.hasOwn(plan, name)) {
      assert.deepEqual(plan[name], definition.const)
    }
  }
  for (const name of ['project_id', 'film_id']) {
    text(plan[name])
    assert.match(plan[name], new RegExp(schema.properties[name].pattern))
  }
  if (plan.title !== null) text(plan.title)
  for (const name of ['input_fingerprint', 'narration_fingerprint', 'visual_fingerprint']) {
    text(plan[name])
    assert.match(plan[name], new RegExp(schema.$defs.digest.pattern))
  }
  ids(plan.source_ids)
  assert.ok(Array.isArray(plan.scenes) && plan.scenes.length > 0)
  const sceneIds = new Set()
  const sentenceIds = new Set()
  let previousEnd = 0
  for (const scene of plan.scenes) {
    record(scene, schema.$defs.scene)
    text(scene.id)
    assert.match(scene.id, new RegExp(schema.$defs.scene.properties.id.pattern))
    assert.ok(!sceneIds.has(scene.id))
    sceneIds.add(scene.id)
    text(scene.title)
    text(scene.slot)
    assert.match(scene.slot, new RegExp(schema.$defs.scene.properties.slot.pattern))
    const start = Number(scene.slot.slice(0, 2)) * 60 + Number(scene.slot.slice(3, 5))
    const end = Number(scene.slot.slice(6, 8)) * 60 + Number(scene.slot.slice(9, 11))
    assert.equal(start, previousEnd)
    assert.ok(end > start)
    previousEnd = end
    assert.ok(schema.$defs.scene.properties.theme.enum.includes(scene.theme))
    if (scene.status !== null) text(scene.status)
    for (const name of ['labels', 'points', 'cues']) texts(scene[name])
    assert.ok(Array.isArray(scene.sentences) && scene.sentences.length > 0)
    for (const sentence of scene.sentences) {
      record(sentence, schema.$defs.sentence)
      identifier(sentence.id)
      assert.ok(!sentenceIds.has(sentence.id))
      sentenceIds.add(sentence.id)
      text(sentence.text)
      ids(sentence.source_ids)
      assert.ok(sentence.source_ids.every(source => plan.source_ids.includes(source)))
      assert.equal(sentence.status, schema.$defs.sentence.properties.status.const)
    }
    const narration = scene.sentences.map(sentence => sentence.text).join(' ')
    let previousCue = -1
    for (const cue of scene.cues) {
      assert.ok(cue.split(/\s+/).length >= 3 && cue.split(/\s+/).length <= 6)
      const position = narration.indexOf(cue)
      assert.ok(position > previousCue && narration.lastIndexOf(cue) === position)
      previousCue = position
    }
  }
  const names = schema.$defs.stage.properties.id.enum
  assert.ok(Array.isArray(plan.stages))
  assert.equal(plan.stages.length, names.length)
  for (const [index, stage] of plan.stages.entries()) {
    record(stage, schema.$defs.stage)
    assert.equal(stage.id, names[index])
    assert.deepEqual(stage.depends_on, index ? [names[index - 1]] : [])
    assert.equal(stage.executable, false)
    assert.deepEqual(stage.blocked_by, schema.$defs.stage.properties.blocked_by.const)
  }
  if (Object.hasOwn(plan, 'illustrations') || Object.hasOwn(plan, 'illustration_binding')) {
    if (plan.illustration_binding !== schema.properties.illustration_binding.const ||
        !Object.hasOwn(plan, 'illustrations')) {
      throw new Error('ILLUSTRATION_BINDING_STALE')
    }
    validateIllustrations(plan.illustrations, plan.scenes, true)
    const expected = illustrationFingerprints(plan)
    if (plan.input_fingerprint !== expected.input_fingerprint ||
        plan.visual_fingerprint !== expected.visual_fingerprint) {
      throw new Error('ILLUSTRATION_BINDING_STALE')
    }
  }
  return plan
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

function illustrationFingerprints(plan) {
  const { input_fingerprint, visual_fingerprint, ...content } = plan
  const visual = { title: plan.title, illustrations: plan.illustrations,
    scenes: plan.scenes.map(({ sentences, ...presentation }) => presentation) }
  return {
    input_fingerprint: fingerprint({ domain: 'cmo-illustrated-plan-1', content }),
    visual_fingerprint: fingerprint({ domain: 'cmo-illustrated-visual-1', content: visual })
  }
}

export function attachIllustrations(existingPlan, illustrations) {
  validateStagePlan(existingPlan)
  validateIllustrations(illustrations, existingPlan.scenes)
  const plan = structuredClone(existingPlan)
  const base_fingerprints = existingPlan.illustrations?.base_fingerprints ?? {
    input: existingPlan.input_fingerprint, visual: existingPlan.visual_fingerprint
  }
  plan.illustration_binding = schema.properties.illustration_binding.const
  plan.illustrations = structuredClone({ ...illustrations, base_fingerprints })
  Object.assign(plan, illustrationFingerprints(plan))
  return validateStagePlan(plan)
}