import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, openSync, closeSync, fstatSync, readFileSync } from 'node:fs'
import { extname, isAbsolute } from 'node:path'

import { checkedPath } from './assets.mjs'
import { validateFootagePlan } from './plan.mjs'

function requireValid(condition, code) {
  if (!condition) throw new Error(code)
}

export function buildFootagePrivacyReport(plan) {
  validateFootagePlan(plan)
  return { schema_version: 'cmo-footage-privacy-1', input_fingerprint: plan.input_fingerprint,
    ocr_status: 'not_run', human_clearance: 'not_recorded', production_qualified: false,
    frame_provenance: 'operator_supplied_not_verified',
    rect_coordinate_system: 'normalized_image_bottom_left',
    coverage: 'approved_frames_only_not_full_recording', scope: [], frames: [],
    excerpts: plan.scenes.map(scene => ({ scene_id: scene.id,
      asset_id: scene.clip.asset_id, start: scene.clip.start, end: scene.clip.end })) }
}

function validateScope(plan, options) {
  const code = 'FOOTAGE_OCR_SCOPE_INVALID'
  requireValid(Array.isArray(options.scope) && options.scope.length > 0 &&
    options.scope.length <= 100 && Array.isArray(options.frames) && options.frames.length <= 32, code)
  for (const range of options.scope) {
    requireValid(range && Number.isFinite(range.start) && Number.isFinite(range.end) &&
      range.start >= 0 && range.end > range.start &&
      plan.scenes.some(scene => scene.clip.asset_id === range.asset_id &&
        range.start >= scene.clip.start && range.end <= scene.clip.end), code)
  }
  const seen = new Set()
  for (const frame of options.frames) {
    requireValid(frame && Number.isFinite(frame.timestamp) && options.scope.some(range =>
      range.asset_id === frame.asset_id && frame.timestamp >= range.start && frame.timestamp < range.end), code)
    const identity = `${frame.asset_id}:${frame.timestamp}`
    requireValid(!seen.has(identity), code)
    seen.add(identity)
    requireValid(typeof frame.path === 'string' && isAbsolute(frame.path) &&
      /^\.(png|jpg|jpeg)$/.test(extname(frame.path).toLowerCase()) &&
      typeof frame.sha256 === 'string' && /^[a-f0-9]{64}$/.test(frame.sha256) &&
      Number.isSafeInteger(frame.bytes) && frame.bytes > 0 && frame.bytes <= 32 * 1024 * 1024,
    'FOOTAGE_OCR_FRAME_UNSAFE')
  }
}

function verifyFrame(frame) {
  const info = checkedPath(frame.path, 'FOOTAGE_OCR_FRAME_UNSAFE')
  requireValid(info.isFile(), 'FOOTAGE_OCR_FRAME_UNSAFE')
  let descriptor
  try { descriptor = openSync(frame.path, constants.O_RDONLY | constants.O_NOFOLLOW) }
  catch { throw new Error('FOOTAGE_OCR_FRAME_UNSAFE') }
  try {
    const opened = fstatSync(descriptor)
    requireValid(opened.isFile() && opened.ino === info.ino && opened.dev === info.dev,
      'FOOTAGE_OCR_FRAME_UNSAFE')
    requireValid(opened.size === frame.bytes, 'FOOTAGE_OCR_FRAME_MISMATCH')
    const digest = createHash('sha256').update(readFileSync(descriptor)).digest('hex')
    requireValid(digest === frame.sha256, 'FOOTAGE_OCR_FRAME_MISMATCH')
  } finally { closeSync(descriptor) }
}

function observations(stdout) {
  const code = 'FOOTAGE_OCR_OUTPUT_INVALID'
  requireValid(typeof stdout === 'string' && stdout.length <= 256 * 1024, code)
  let output
  try { output = JSON.parse(stdout) } catch { throw new Error(code) }
  requireValid(output && Array.isArray(output.observations) && output.observations.length <= 1000, code)
  return output.observations.map(item => {
    requireValid(item && typeof item.text === 'string' && item.text.length > 0 &&
      item.text.length <= 4096 && Number.isFinite(item.confidence) &&
      item.confidence >= 0 && item.confidence <= 1, code)
    const rectangle = item.rect
    const precision = 1e-7
    requireValid(rectangle && ['x', 'y', 'width', 'height'].every(field =>
      Number.isFinite(rectangle[field])) && rectangle.x >= -precision && rectangle.y >= -precision &&
      rectangle.width > 0 && rectangle.height > 0 && rectangle.x + rectangle.width <= 1 + precision &&
      rectangle.y + rectangle.height <= 1 + precision, code)
    const left = Math.max(0, rectangle.x)
    const bottom = Math.max(0, rectangle.y)
    const width = Math.min(1, rectangle.x + rectangle.width) - left
    const height = Math.min(1, rectangle.y + rectangle.height) - bottom
    requireValid(width > 0 && height > 0, code)
    return { text: item.text, confidence: item.confidence, rect: {
      x: left, y: bottom, width, height } }
  })
}

export async function runFootageOcr(plan, options = {}) {
  const report = buildFootagePrivacyReport(plan)
  requireValid(options.ocrConsentFor === plan.input_fingerprint, 'FOOTAGE_OCR_CONSENT_REQUIRED')
  validateScope(plan, options)
  report.scope = options.scope.map(range => ({ asset_id: range.asset_id,
    start: range.start, end: range.end }))
  if (options.frames.length === 0) return report
  requireValid(typeof options.executable === 'string' && isAbsolute(options.executable),
    'FOOTAGE_OCR_EXECUTABLE_REQUIRED')
  const runProcess = options.runProcess ?? spawnSync
  requireValid(typeof runProcess === 'function', 'FOOTAGE_OCR_EXECUTABLE_REQUIRED')
  for (const frame of options.frames) verifyFrame(frame)
  for (const frame of options.frames) {
    verifyFrame(frame)
    let response
    try {
      response = await runProcess(options.executable, [frame.path], { shell: false,
        encoding: 'utf8', timeout: 30000, maxBuffer: 256 * 1024,
        env: { PATH: '/usr/bin:/bin' } })
    } catch { throw new Error('FOOTAGE_OCR_PROCESS_FAILED') }
    requireValid(response && response.status === 0 && !response.error && !response.signal,
      'FOOTAGE_OCR_PROCESS_FAILED')
    verifyFrame(frame)
    report.frames.push({ asset_id: frame.asset_id, timestamp: frame.timestamp,
      sha256: frame.sha256, bytes: frame.bytes, observations: observations(response.stdout) })
  }
  report.ocr_status = 'observed_text'
  return report
}