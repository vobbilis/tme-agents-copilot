import { createHash } from 'node:crypto'
import { constants, lstatSync, openSync, closeSync, fstatSync, readSync,
  writeSync, mkdirSync, unlinkSync } from 'node:fs'
import { isAbsolute, join, parse, resolve, sep } from 'node:path'

import { validateFootagePlan, stagedFootagePath } from './plan.mjs'

export function checkedPath(path, code) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) throw new Error(code)
  let cursor = parse(path).root
  for (const component of path.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, component)
    let info
    try { info = lstatSync(cursor) } catch { throw new Error(code) }
    if (info.isSymbolicLink()) throw new Error(code)
  }
  return lstatSync(path)
}

function transfer(source, bytes, destination) {
  const digest = createHash('sha256')
  const buffer = Buffer.alloc(1024 * 1024)
  let position = 0
  while (position < bytes) {
    const length = readSync(source, buffer, 0, Math.min(buffer.length, bytes - position), position)
    if (length === 0) throw new Error('FOOTAGE_ASSET_MISMATCH')
    digest.update(buffer.subarray(0, length))
    if (destination !== undefined) {
      let written = 0
      while (written < length) {
        const count = writeSync(destination, buffer, written, length - written)
        if (count === 0) throw new Error('FOOTAGE_ASSET_WRITE_FAILED')
        written += count
      }
    }
    position += length
  }
  if (fstatSync(source).size !== bytes) throw new Error('FOOTAGE_ASSET_MISMATCH')
  return digest.digest('hex')
}

export async function stageFootageAssets(plan, options = {}) {
  validateFootagePlan(plan)
  if (options.assetConsentFor !== plan.input_fingerprint) {
    throw new Error('FOOTAGE_ASSET_CONSENT_REQUIRED')
  }
  if (!checkedPath(options.compositionDir, 'FOOTAGE_COMPOSITION_DIR_INVALID').isDirectory()) {
    throw new Error('FOOTAGE_COMPOSITION_DIR_INVALID')
  }
  const sources = []
  const created = []
  try {
    for (const asset of plan.assets) {
      const info = checkedPath(asset.path, 'FOOTAGE_ASSET_UNSAFE')
      if (!info.isFile()) throw new Error('FOOTAGE_ASSET_UNSAFE')
      let descriptor
      try { descriptor = openSync(asset.path, constants.O_RDONLY | constants.O_NOFOLLOW) }
      catch { throw new Error('FOOTAGE_ASSET_UNSAFE') }
      sources.push({ asset, descriptor })
      const opened = fstatSync(descriptor)
      if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) {
        throw new Error('FOOTAGE_ASSET_UNSAFE')
      }
      if (opened.size !== asset.bytes || transfer(descriptor, asset.bytes) !== asset.sha256) {
        throw new Error('FOOTAGE_ASSET_MISMATCH')
      }
    }
    const assetsDir = join(options.compositionDir, 'assets')
    try { mkdirSync(assetsDir) }
    catch (error) {
      if (error.code !== 'EEXIST') throw new Error('FOOTAGE_ASSET_WRITE_FAILED')
    }
    if (!checkedPath(assetsDir, 'FOOTAGE_ASSET_UNSAFE').isDirectory()) {
      throw new Error('FOOTAGE_ASSET_UNSAFE')
    }
    for (const { asset, descriptor } of sources) {
      checkedPath(assetsDir, 'FOOTAGE_ASSET_UNSAFE')
      const path = join(options.compositionDir, stagedFootagePath(asset))
      let output
      try { output = openSync(path, constants.O_WRONLY | constants.O_CREAT |
        constants.O_EXCL | constants.O_NOFOLLOW, 0o600) }
      catch (error) {
        throw new Error(error.code === 'EEXIST' ? 'FOOTAGE_ASSET_OUTPUT_EXISTS' :
          'FOOTAGE_ASSET_WRITE_FAILED')
      }
      created.push(path)
      try {
        if (transfer(descriptor, asset.bytes, output) !== asset.sha256) {
          throw new Error('FOOTAGE_ASSET_MISMATCH')
        }
      } finally { closeSync(output) }
    }
    return { input_fingerprint: plan.input_fingerprint, production_qualified: false,
      assets: plan.assets.map(asset => ({ id: asset.id, path: stagedFootagePath(asset),
        sha256: asset.sha256, bytes: asset.bytes })) }
  } catch (error) {
    for (const path of created) unlinkSync(path)
    throw error
  } finally {
    for (const { descriptor } of sources) closeSync(descriptor)
  }
}