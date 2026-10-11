import { validateFootagePlan, stagedFootagePath } from './plan.mjs'
import { brandFrame, BRAND_CONTENT, BRAND_FONT_STYLES } from '../shared/brand.mjs'

function escapeText(text) {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;',
    '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character])
}

function time(value) {
  return Number(value.toPrecision(15)).toString()
}

function validateTimeline(plan, timeline) {
  if (!timeline || timeline.inputFingerprint !== plan.input_fingerprint ||
    timeline.fps !== 30 || timeline.size?.width !== 1920 || timeline.size?.height !== 1080 ||
    !Number.isSafeInteger(timeline.frameCount) || timeline.frameCount <= 0 ||
    !Number.isFinite(timeline.duration) ||
    Math.abs(timeline.duration - timeline.frameCount / 30) > 1e-9 ||
    !Array.isArray(timeline.scenes) || timeline.scenes.length !== plan.scenes.length) {
    throw new Error('INVALID_FOOTAGE_TIMELINE')
  }
  let cursor = 0
  for (const [index, scene] of plan.scenes.entries()) {
    const timing = timeline.scenes[index]
    if (!timing || timing.id !== scene.id || !Number.isSafeInteger(timing.startFrame) ||
      !Number.isSafeInteger(timing.endFrame) || timing.startFrame !== cursor ||
      timing.endFrame <= cursor || timing.endFrame > timeline.frameCount) {
      throw new Error('INVALID_FOOTAGE_TIMELINE')
    }
    const duration = (timing.endFrame - timing.startFrame) / 30
    if (duration > scene.clip.end - scene.clip.start + 1e-9) {
      throw new Error(`FOOTAGE_EXCERPT_TOO_SHORT: ${scene.id}; select a longer excerpt`)
    }
    if ((scene.annotations ?? []).some(annotation => annotation.end > duration)) {
      throw new Error(`FOOTAGE_ANNOTATION_OUT_OF_SCENE: ${scene.id}`)
    }
    cursor = timing.endFrame
  }
  if (cursor !== timeline.frameCount) throw new Error('INVALID_FOOTAGE_TIMELINE')
}

export function buildFootageComposition(plan, timeline) {
  validateFootagePlan(plan)
  validateTimeline(plan, timeline)
  const clips = plan.scenes.map((scene, index) => {
    const timing = timeline.scenes[index]
    const start = timing.startFrame / 30
    const duration = (timing.endFrame - timing.startFrame) / 30
    const asset = plan.assets.find(item => item.id === scene.clip.asset_id)
    const crop = scene.clip.crop
    const scale = Math.min(1168 / crop.width, 710 / crop.height)
    const left = 64 + (1168 - crop.width * scale) / 2
    const top = 165 + (710 - crop.height * scale) / 2
    const annotations = (scene.annotations ?? []).map(annotation => {
      const rectangle = annotation.rect
      if (rectangle.width > BRAND_CONTENT.width || rectangle.height > BRAND_CONTENT.height) {
        throw new Error('FOOTAGE_FRAME_FIT_FAILED')
      }
      const annotationLeft = Math.max(BRAND_CONTENT.x,
        Math.min(rectangle.x, BRAND_CONTENT.x + BRAND_CONTENT.width - rectangle.width))
      const annotationTop = Math.max(BRAND_CONTENT.y,
        Math.min(rectangle.y, BRAND_CONTENT.y + BRAND_CONTENT.height - rectangle.height))
      return `<div class="annotation" data-start="${time(start + annotation.start)}" ` +
        `data-duration="${time(annotation.end - annotation.start)}" ` +
        `style="left:${annotationLeft}px;top:${annotationTop}px;width:${rectangle.width}px;` +
        `height:${rectangle.height}px">${escapeText(annotation.text)}</div>`
    }).join('')
    return `<section class="scene" data-start="${time(start)}" data-duration="${time(duration)}">` +
      `<div class="viewport" style="left:${time(left)}px;top:${time(top)}px;` +
      `width:${crop.width}px;height:${crop.height}px;transform:scale(${time(scale)})">` +
      `<video data-start="${time(start)}" data-duration="${time(duration)}" ` +
      `data-media-start="${time(scene.clip.start)}" src="${stagedFootagePath(asset)}" muted playsinline ` +
      `style="width:${asset.width}px;height:${asset.height}px;left:-${crop.x}px;top:-${crop.y}px"></video>` +
      `</div><h1>${escapeText(scene.title)}</h1>${annotations}` +
      `${brandFrame(plan.title, scene, index, plan.scenes.length)}</section>`
  }).join('')
  const html = '<!doctype html><html><head><meta charset="utf-8">' +
    `<title>${escapeText(plan.title)}</title><style>${BRAND_FONT_STYLES}` +
    'html,body{margin:0;width:1920px;height:1080px;overflow:hidden}' +
    'body{background:#061c19;color:#fff;font-family:HPEGraphik,sans-serif}' +
    'main,.scene{position:absolute;inset:0}.viewport{position:absolute;overflow:hidden;transform-origin:0 0}' +
    'video{position:absolute;max-width:none}h1{position:absolute;left:1280px;top:174px;' +
    'width:552px;font-size:40px;line-height:1.2;margin:0;overflow-wrap:anywhere}' +
    '.film-frame{position:absolute;inset:0;pointer-events:none}' +
    '.annotation{position:absolute;box-sizing:border-box;overflow:hidden;overflow-wrap:anywhere;' +
    'font-size:32px;line-height:42px;color:#061c19;background:#d7f7e9;padding:0 8px}' +
    '</style></head><body><main data-composition-id="root" data-width="1920" ' +
    `data-height="1080" data-fps="30" data-start="0" data-duration="${time(timeline.duration)}">` +
    `${clips}</main></body></html>`
  return { html, duration: timeline.duration, frameCount: timeline.frameCount }
}