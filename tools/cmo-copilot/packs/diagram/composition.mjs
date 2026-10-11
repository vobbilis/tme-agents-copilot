import { FPS, SIZE } from '../explainer/picture.mjs'
import { brandFrame, BRAND_CONTENT, BRAND_FONT_STYLES } from '../shared/brand.mjs'
import { renderDiagramSvg } from './diagram.mjs'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function escapeHtmlText(text) {
  return text.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character])
}

function formatTime(value) {
  return Number(value.toPrecision(15)).toString()
}

function validateCompositionInput(input, timeline) {
  if (!isObject(input) || typeof input.title !== 'string' || !input.title.trim() ||
      !Array.isArray(input.scenes) || input.scenes.length === 0 ||
      !isObject(timeline) || timeline.fps !== FPS || !isObject(timeline.size) ||
      timeline.size.width !== SIZE.width || timeline.size.height !== SIZE.height ||
      !Number.isSafeInteger(timeline.frameCount) || timeline.frameCount <= 0 ||
      !Number.isFinite(timeline.duration) || timeline.duration <= 0 ||
      Math.abs(timeline.duration - timeline.frameCount / FPS) > 1e-9 ||
      !Array.isArray(timeline.scenes) || timeline.scenes.length !== input.scenes.length) {
    throw new Error('INVALID_DIAGRAM_COMPOSITION')
  }

  let cursor = 0
  for (let index = 0; index < input.scenes.length; index++) {
    const scene = input.scenes[index]
    const timing = timeline.scenes[index]
    if (!isObject(scene) || typeof scene.id !== 'string' || !scene.id ||
        !isObject(timing) || timing.id !== scene.id ||
        !Number.isSafeInteger(timing.startFrame) ||
        !Number.isSafeInteger(timing.endFrame) || timing.startFrame !== cursor ||
        timing.endFrame <= timing.startFrame || timing.endFrame > timeline.frameCount) {
      throw new Error('INVALID_DIAGRAM_COMPOSITION')
    }
    cursor = timing.endFrame
  }
  if (cursor !== timeline.frameCount) throw new Error('INVALID_DIAGRAM_COMPOSITION')
}

export function buildDiagramComposition(input, timeline) {
  validateCompositionInput(input, timeline)

  const clips = []
  for (let index = 0; index < input.scenes.length; index++) {
    const scene = input.scenes[index]
    const timing = timeline.scenes[index]
    const sceneDuration = (timing.endFrame - timing.startFrame) / FPS
    const diagram = scene.diagram
    if (!isObject(diagram) || !Array.isArray(diagram.nodes) ||
        !Array.isArray(diagram.connections)) {
      throw new Error('INVALID_DIAGRAM_COMPOSITION')
    }

    const revealTimes = []
    for (const item of [...diagram.nodes, ...diagram.connections]) {
      const revealAt = item?.revealAt
      if (!Number.isFinite(revealAt) || revealAt < 0 || revealAt >= sceneDuration) {
        throw new Error('INVALID_DIAGRAM_COMPOSITION')
      }
      revealTimes.push(revealAt)
    }

    const boundaries = [0, ...new Set(revealTimes.filter(time => time > 0))
      .values()].sort((left, right) => left - right)
    boundaries.push(sceneDuration)
    for (let boundary = 0; boundary < boundaries.length - 1; boundary++) {
      const localStart = boundaries[boundary]
      const localEnd = boundaries[boundary + 1]
      const globalStart = timing.startFrame / FPS + localStart
      clips.push(`<section class="clip" data-start="${formatTime(globalStart)}" ` +
        `data-duration="${formatTime(localEnd - localStart)}">` +
        `${renderDiagramSvg(diagram, localStart, BRAND_CONTENT)}` +
        `${brandFrame(input.title, scene, index, input.scenes.length)}</section>`)
    }
  }

  const duration = timeline.duration
  const html = '<!doctype html><html><head><meta charset="utf-8">' +
    `<title>${escapeHtmlText(input.title)}</title>` +
    `<style>${BRAND_FONT_STYLES}html,body{margin:0;width:1920px;height:1080px;overflow:hidden}` +
    'body,main{background:#f5f8f7}main{position:relative;width:1920px;height:1080px}' +
    '.clip{position:absolute;inset:0;width:100%;height:100%}' +
    '.clip svg{display:block;width:100%;height:100%}' +
    '.film-frame{position:absolute;inset:0;pointer-events:none}' +
    '.clip text{font-family:HPEGraphik,sans-serif}</style></head><body>' +
    `<main data-composition-id="root" data-width="${SIZE.width}" ` +
    `data-height="${SIZE.height}" data-fps="${FPS}" data-start="0" ` +
    `data-duration="${formatTime(duration)}">${clips.join('')}</main>` +
    '</body></html>'
  return { html, duration, frameCount: timeline.frameCount }
}