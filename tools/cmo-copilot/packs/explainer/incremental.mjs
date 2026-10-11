import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { parseWordBoundaries, tokens } from './speech.mjs'

const identityFields = ['id', 'text', 'voice', 'rate', 'engine', 'fingerprint']
const safeId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/
const digest = /^[0-9a-f]{64}$/

function failure(code, scene = 'previous output') {
  return new Error(`${code}: ${scene}; regenerate narration into a new output directory, preserving the previous output`)
}

function validIdentity(request) {
  return request && typeof request === 'object' && !Array.isArray(request) &&
    typeof request.id === 'string' && safeId.test(request.id) &&
    ['text', 'voice', 'rate', 'engine'].every(field =>
      typeof request[field] === 'string' && request[field].trim().length > 0) &&
    typeof request.fingerprint === 'string' && digest.test(request.fingerprint)
}

async function checkedDirectory(path, scene) {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path) {
    throw failure('REUSE_DIRECTORY_INVALID', scene)
  }
  return info
}

function unchanged(before, after) {
  return before.dev === after.dev && before.ino === after.ino &&
    before.size === after.size && before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs
}

async function readBounded(path, limit, scene) {
  const parent = await checkedDirectory(dirname(path), scene)
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size < 1 || before.size > limit) {
      throw failure('REUSE_FILE_INVALID', scene)
    }
    const chunks = []
    let total = 0
    while (total <= before.size) {
      const chunk = Buffer.alloc(Math.min(65536, before.size + 1 - total))
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null)
      if (!bytesRead) break
      total += bytesRead
      if (total > before.size) throw failure('REUSE_FILE_CHANGED', scene)
      chunks.push(chunk.subarray(0, bytesRead))
    }
    const after = await file.stat()
    const named = await lstat(path)
    const parentAfter = await checkedDirectory(dirname(path), scene)
    if (total !== before.size || !unchanged(before, after) || !unchanged(after, named) ||
        named.isSymbolicLink() || parent.dev !== parentAfter.dev || parent.ino !== parentAfter.ino) {
      throw failure('REUSE_FILE_CHANGED', scene)
    }
    return Buffer.concat(chunks, total)
  } finally {
    await file.close()
  }
}

export async function loadReusableNarrations(requests, previousDirectory) {
  if (!Array.isArray(requests) || requests.some(request => !validIdentity(request)) ||
      new Set(requests.map(request => request.id)).size !== requests.length) {
    throw failure('REUSE_REQUEST_INVALID')
  }
  if (typeof previousDirectory !== 'string' || !isAbsolute(previousDirectory)) {
    throw failure('REUSE_DIRECTORY_INVALID')
  }
  const directory = resolve(previousDirectory)
  await checkedDirectory(directory).catch(() => { throw failure('REUSE_DIRECTORY_INVALID') })
  const report = await readBounded(join(directory, 'narration.json'), 16777216)
    .then(bytes => JSON.parse(bytes.toString('utf8')))
    .catch(() => { throw failure('REUSE_REPORT_INVALID') })
  if (report?.status !== 'measured_not_listened' || !Array.isArray(report.narrations)) {
    throw failure('REUSE_REPORT_INVALID')
  }
  const previousById = new Map()
  for (const narration of report.narrations) {
    if (!validIdentity(narration) || previousById.has(narration.id)) {
      throw failure('REUSE_REPORT_INVALID')
    }
    previousById.set(narration.id, narration)
  }
  const reusable = []
  for (const request of requests) {
    const previous = previousById.get(request.id)
    if (!previous || identityFields.some(field => previous[field] !== request[field])) {
      reusable.push(null)
      continue
    }
    if (previous.audio !== `${request.id}/audio.mp3`) throw failure('REUSE_PATH_INVALID', request.id)
    if (!Number.isFinite(previous.duration) || previous.duration <= 0 || previous.duration > 600) {
      throw failure('REUSE_TIMING_INVALID', request.id)
    }
    if (!digest.test(previous.audioSha256) || !digest.test(previous.wordsSha256)) {
      throw failure('REUSE_HASH_INVALID', request.id)
    }
    await checkedDirectory(directory, request.id)
      .catch(() => { throw failure('REUSE_DIRECTORY_INVALID', request.id) })
    await checkedDirectory(join(directory, request.id), request.id)
      .catch(() => { throw failure('REUSE_DIRECTORY_INVALID', request.id) })
    const audioBytes = await readBounded(join(directory, request.id, 'audio.mp3'), 67108864, request.id)
      .catch(() => { throw failure('REUSE_FILE_INVALID', request.id) })
    const wordsBytes = await readBounded(join(directory, request.id, 'words.jsonl'), 8388608, request.id)
      .catch(() => { throw failure('REUSE_FILE_INVALID', request.id) })
    if (createHash('sha256').update(audioBytes).digest('hex') !== previous.audioSha256 ||
        createHash('sha256').update(wordsBytes).digest('hex') !== previous.wordsSha256) {
      throw failure('REUSE_HASH_MISMATCH', request.id)
    }
    const words = await Promise.resolve().then(() =>
      parseWordBoundaries(wordsBytes.toString('utf8'), previous.duration))
      .catch(error => {
        throw failure(error.message === 'SPEECH_TIMING_INVALID'
          ? 'REUSE_WORDS_TIMING_INVALID' : 'REUSE_WORDS_INVALID', request.id)
      })
    if (!isDeepStrictEqual(words.flatMap(word => tokens(word.text)), tokens(request.text))) {
      throw failure('REUSE_WORDS_TEXT_MISMATCH', request.id)
    }
    reusable.push({ narration: { ...previous, ...request, words }, audioBytes, wordsBytes })
  }
  return reusable
}