import { createHash } from 'node:crypto'
import { isAbsolute } from 'node:path'

const schemaVersion = 'cmo-cut-review-1'
const cutFiles = ['film.mp4', 'captions.srt', 'captions.vtt', 'render-report.json']
const privacyStates = ['not_recorded', 'passed', 'not_applicable', 'failed']
const decisionFields = [
  'cutFingerprint', 'decision', 'reviewer', 'statement', 'watched', 'listened', 'privacy'
]
const humanFields = [
  'decision', 'reviewer', 'statement', 'source', 'authenticated',
  'watched', 'listened', 'privacy', 'fullWatchAndListen', 'redaction'
]

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validText(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit
}

function validFingerprint(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function validFiles(files) {
  return isRecord(files) && Object.keys(files).length === cutFiles.length &&
    cutFiles.every(name => {
      const entry = files[name]
      return isRecord(entry) && Object.keys(entry).sort().join(',') === 'bytes,sha256' &&
        validFingerprint(entry.sha256) && Number.isSafeInteger(entry.bytes) && entry.bytes > 0
    })
}

function requireInspection(inspected) {
  if (!isRecord(inspected) || inspected.schema_version !== schemaVersion ||
      inspected.status !== 'awaiting_owner_review' || inspected.production_qualified !== false ||
      !validText(inspected.cut, Infinity) || !isAbsolute(inspected.cut) ||
      !validFiles(inspected.files) || !validFingerprint(inspected.cutFingerprint) ||
      createHash('sha256').update(JSON.stringify(inspected.files)).digest('hex') !== inspected.cutFingerprint) {
    throw new Error('CUT_INSPECTION_REQUIRED')
  }
}

export function buildOwnerReview(inspected, decision, recordedAt = new Date().toISOString()) {
  requireInspection(inspected)
  if (!isRecord(decision) || Object.keys(decision).sort().join(',') !== decisionFields.slice().sort().join(',') ||
      !validFingerprint(decision.cutFingerprint) || !['accepted', 'rejected'].includes(decision.decision) ||
      !validText(decision.reviewer, 160) || !validText(decision.statement, 8192) ||
      typeof decision.watched !== 'boolean' || typeof decision.listened !== 'boolean' ||
      !privacyStates.includes(decision.privacy)) {
    throw new Error('OWNER_STATEMENT_REQUIRED')
  }
  if (decision.cutFingerprint !== inspected.cutFingerprint) throw new Error('CUT_CHANGED')
  if (typeof recordedAt !== 'string' || !Number.isFinite(Date.parse(recordedAt)) ||
      new Date(recordedAt).toISOString() !== recordedAt) throw new Error('REVIEW_TIMESTAMP_INVALID')
  return {
    ...structuredClone(inspected),
    status: decision.decision === 'accepted' ? 'owner_acceptance_recorded' : 'owner_rejection_recorded',
    recordedAt,
    humanReview: {
      decision: decision.decision, reviewer: decision.reviewer, statement: decision.statement,
      source: 'operator_recorded_owner_statement', authenticated: false,
      watched: decision.watched, listened: decision.listened, privacy: decision.privacy,
      fullWatchAndListen: decision.watched && decision.listened, redaction: 'not_recorded'
    },
    production_qualified: false
  }
}

export function validateAcceptedReview(inspected, review) {
  requireInspection(inspected)
  if (!isRecord(review) || review.schema_version !== schemaVersion ||
      review.production_qualified !== false ||
      !['owner_acceptance_recorded', 'owner_rejection_recorded'].includes(review.status) ||
      !validText(review.cut, Infinity) || !validFingerprint(review.cutFingerprint) ||
      !isRecord(review.files) || !isRecord(review.humanReview)) {
    throw new Error('REVIEW_REQUIRED')
  }
  if (review.cut !== inspected.cut || review.cutFingerprint !== inspected.cutFingerprint ||
      JSON.stringify(review.files) !== JSON.stringify(inspected.files)) throw new Error('CUT_CHANGED')
  const humanReview = review.humanReview
  if (!['accepted', 'rejected'].includes(humanReview.decision) ||
      review.status !== (humanReview.decision === 'accepted' ? 'owner_acceptance_recorded' : 'owner_rejection_recorded') ||
      humanReview.source !== 'operator_recorded_owner_statement' || humanReview.authenticated !== false ||
      !validText(humanReview.reviewer, 160) || !validText(humanReview.statement, 8192) ||
      humanReview.redaction !== 'not_recorded' ||
      Object.keys(humanReview).some(field => !humanFields.includes(field))) {
    throw new Error('REVIEW_REQUIRED')
  }
  if (humanReview.decision === 'rejected') throw new Error('REVIEW_REJECTED')
  if ((Object.hasOwn(humanReview, 'watched') && typeof humanReview.watched !== 'boolean') ||
      (Object.hasOwn(humanReview, 'listened') && typeof humanReview.listened !== 'boolean') ||
      (Object.hasOwn(humanReview, 'privacy') && !privacyStates.includes(humanReview.privacy))) {
    throw new Error('REVIEW_REQUIRED')
  }
  if (!Object.hasOwn(humanReview, 'watched') || !Object.hasOwn(humanReview, 'listened') ||
      !Object.hasOwn(humanReview, 'privacy')) throw new Error('REVIEW_INCOMPLETE')
  if (humanReview.fullWatchAndListen !== (humanReview.watched && humanReview.listened)) {
    throw new Error('REVIEW_REQUIRED')
  }
  if (!humanReview.watched || !humanReview.listened ||
      !['passed', 'not_applicable'].includes(humanReview.privacy)) throw new Error('REVIEW_INCOMPLETE')
  return { ...humanReview }
}