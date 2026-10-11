import { createHash } from 'node:crypto'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateStagePlan } from './plan.mjs'
import { SIZE } from './picture.mjs'
import { vectorState } from './illustration.mjs'
import { brandElements, loadBrandFonts } from '../shared/brand.mjs'

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const palettes = {
  light: { bg:'#f3f2eb',panel:'#ffffff',ink:'#14312e',muted:'#496964',line:'#baccc4',
    connector:'#617e76',green:'#00785d',soft:'#dcebe2' },
  dark: { bg:'#071f23',panel:'#102e32',ink:'#f2f7f3',muted:'#a9c6c4',line:'#33595a',
    connector:'#789d9d',green:'#58e7ba',soft:'#164541' },
  hpe: { bg:'#061c19',panel:'#102f28',ink:'#ffffff',muted:'#b4cec5',line:'#315c4c',
    connector:'#70ac95',green:'#01d9a1',soft:'#164b37' }
}

function text(left, top, value, size, color, width, height) {
  const lines = Array.isArray(value) ? value : [value]
  return `<text data-fit="true" data-width="${width}" data-height="${height}" ` +
    `x="${left}" y="${top}" fill="${color}" font-size="${size}">` +
    lines.map((line, index) => `<tspan x="${left}" dy="${index ? '1.36em' : 0}">` +
      `${escape(line)}</tspan>`).join('') + '</text>'
}

function wrap(value) {
  const lines = []
  let current = ''
  for (const word of value.split(/\s+/)) {
    if (current && current.length + word.length + 1 > 32) {
      lines.push(current)
      current = ''
    }
    current += (current ? ' ' : '') + word
  }
  if (current) lines.push(current)
  return lines
}

export function illustration(filmTitle, scene, phase, illustrations) {
  if (!scene || !palettes[scene.theme] || !Array.isArray(scene.points) ||
  (!illustrations && (!scene.points.length || scene.points.length > 6)) ||
      scene.points.some(point => typeof point !== 'string' || !point.trim() || point.length > 160) ||
      !Array.isArray(scene.cues) || !Number.isInteger(phase) || phase < 0 || phase > scene.cues.length) {
    throw new Error('ARTWORK_PRESENTATION_INVALID')
  }
  const branded = illustrations?.presentation === 'hpe'
  const palette = palettes[branded ? 'hpe' : scene.theme]
  const visible = scene.cues.length ? Math.ceil(phase * scene.points.length / scene.cues.length)
    : scene.points.length
  const box = (left, top, width, height, fill, stroke) =>
    `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="8" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
  const line = (path, color, width = 3) => `<path d="${path}" fill="none" stroke="${color}" ` +
    `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
  let art = text(104, 110, filmTitle, 24, palette.muted, 1712, 40) +
    text(104, 245, scene.title, 64, palette.ink, 1712, 100) +
    text(104, 332, [scene.status, ...(scene.labels ?? [])].join(' / '), 21, palette.muted, 1712, 40)
  if (branded) {
    art = brandElements(filmTitle, scene,
      illustrations.scenes.findIndex(item => item.scene_id === scene.id), illustrations.scenes.length) +
      text(104, 200, scene.status ?? '', 20, palette.green, 1712, 36) +
      text(104, 288, scene.title, 68, palette.ink, 1712, 98) +
      text(104, 346, (scene.labels ?? []).join(' / '), 20, palette.muted, 1712, 36)
  }
  if (illustrations !== undefined) art += vectorState(illustrations, scene, phase)
  else scene.points.forEach((point, index) => {
    const left = 104 + index % 3 * 584
    const top = 416 + Math.floor(index / 3) * 236
    const revealed = index < visible
    art += box(left, top, 544, 196, revealed ? palette.soft : palette.panel,
      revealed ? palette.green : palette.line)
    art += text(left + 24, top + 33, String(index + 1).padStart(2, '0'), 18,
      palette.muted, 496, 28)
    art += `<g opacity="${revealed ? 1 : 0}">` +
      text(left + 24, top + 82, wrap(point), 27, palette.ink, 496, 130) + '</g>'
    if (index % 3 < 2 && index + 1 < scene.points.length) {
      art += line(`M${left + 551} ${top + 98}H${left + 574}`, palette.connector) +
        line(`M${left + 566} ${top + 90}L${left + 576} ${top + 98}L${left + 566} ${top + 106}`,
          palette.connector)
    }
  })
  if (!branded) art += line('M104 925H1816', palette.line, 2) +
    line(`M104 925H${104 + 1712 * (phase + 1) / (scene.cues.length + 1)}`, palette.green, 4)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" ` +
    `viewBox="0 0 1920 1080" font-family="${branded ? 'HPEGraphik' : 'Georgia'}" letter-spacing="0">` +
    `<rect width="1920" height="1080" fill="${palette.bg}"/>${art}</svg>`
}

export async function illustratePlan(plan, options) {
  if (options?.artworkConsentFor !== plan?.input_fingerprint) throw new Error('ARTWORK_CONSENT_REQUIRED')
  validateStagePlan(plan)
  if (['output', 'playwright', 'chromium'].some(key =>
    typeof options[key] !== 'string' || !isAbsolute(options[key]))) throw new Error('ARTWORK_OPTIONS_INVALID')
  const fonts = plan.illustrations?.presentation === 'hpe' ? await loadBrandFonts(options.assets) : []
  const images = plan.scenes.flatMap(scene => Array.from({length:scene.cues.length + 1}, (_, phase) =>
    ({id:`${scene.id}-${phase}`,svg:illustration(plan.title,scene,phase,plan.illustrations)})))
  const output = resolve(options.output)
  if (await realpath(dirname(output)) !== dirname(output)) throw new Error('OUTPUT_INVALID')
  try { await mkdir(output, {mode:0o700}) } catch (error) {
    throw new Error(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_UNAVAILABLE')
  }
  let browser
  try {
    const { chromium } = await import(pathToFileURL(options.playwright).href)
    browser = await chromium.launch({executablePath:options.chromium,headless:true,
      args:['--disable-background-networking','--disable-component-update','--no-first-run']})
    const context = await browser.newContext({viewport:SIZE,deviceScaleFactor:1,
      serviceWorkers:'block',offline:true})
    let externalRequests = 0
    await context.route('**/*', route => { externalRequests++; return route.abort() })
    const page = await context.newPage()
    const fontInspector = fonts.length ? await context.newCDPSession(page) : null
    if (fontInspector) {
      await fontInspector.send('DOM.enable')
      await fontInspector.send('CSS.enable')
    }
    const plates = []
    for (const image of images) {
      await page.setContent('<!doctype html><html><head><meta charset="utf-8">' +
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
        '<style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden}svg{display:block}</style>' +
        `</head><body>${image.svg}</body></html>`)
      if (fonts.length) {
        const loaded = await page.evaluate(async fontData => {
          const faces = fontData.map(font => new FontFace('HPEGraphik',
            Uint8Array.from(atob(font.data), character => character.charCodeAt(0)),
            {weight:String(font.weight)}))
          const results = await Promise.allSettled(faces.map(face => face.load()))
          if (results.some(result => result.status !== 'fulfilled')) return false
          for (const face of faces) document.fonts.add(face)
          await document.fonts.ready
          return faces.every(face => face.status === 'loaded')
        }, fonts)
        if (!loaded) throw new Error('HPE_GRAPHIK_FONT_INVALID')
      }
      const layout = await page.evaluate(async () => {
        await document.fonts.ready
        const boxes = []
        for (const element of document.querySelectorAll('[data-fit]')) {
          let size = Number(element.getAttribute('font-size'))
          let bounds = element.getBBox()
          while (size > 18 && (bounds.width > Number(element.dataset.width) ||
              bounds.height > Number(element.dataset.height))) {
            element.setAttribute('font-size', String(--size))
            bounds = element.getBBox()
          }
          if (bounds.width > Number(element.dataset.width) || bounds.height > Number(element.dataset.height)) {
            return {passed:false}
          }
          let visible = true
          for (let parent = element; parent; parent = parent.parentElement) {
            if (getComputedStyle(parent).opacity === '0') visible = false
          }
          if (visible) boxes.push(element.getBoundingClientRect())
        }
        const outside = boxes.some(box => box.x < 86 || box.right > 1838 || box.y < 42 || box.bottom > 951)
        const overlap = boxes.some((first, index) => boxes.slice(index + 1).some(second =>
          Math.min(first.right,second.right) - Math.max(first.x,second.x) > 4 &&
          Math.min(first.bottom,second.bottom) - Math.max(first.y,second.y) > 4))
        return {passed:!outside && !overlap,captionClearance:965 - Math.max(...boxes.map(box=>box.bottom))}
      })
      if (!layout.passed || layout.captionClearance < 12 || externalRequests) {
        throw new Error('ARTWORK_LAYOUT_FAILED')
      }
      let renderedFonts
      if (fontInspector) {
        const { root } = await fontInspector.send('DOM.getDocument')
        const { nodeIds } = await fontInspector.send('DOM.querySelectorAll', {nodeId:root.nodeId,selector:'text'})
        const inspected = await Promise.all(nodeIds.map(nodeId =>
          fontInspector.send('CSS.getPlatformFontsForNode', {nodeId})))
        const used = inspected.flatMap(result => result.fonts).filter(font => font.glyphCount > 0)
        if (!used.length || used.some(font => !font.isCustomFont || !/Graphik/i.test(font.familyName))) {
          throw new Error('HPE_GRAPHIK_FONT_FALLBACK')
        }
        renderedFonts = [...new Set(used.map(font => font.familyName))]
      }
      const png = await page.screenshot({animations:'disabled'})
      await writeFile(join(output, `${image.id}.png`), png, {flag:'wx',mode:0o600})
      const svg = await page.locator('svg').evaluate(element => element.outerHTML)
      await writeFile(join(output, `${image.id}.svg`), svg, {flag:'wx',mode:0o600})
      plates.push({id:image.id,sha256:createHash('sha256').update(png).digest('hex'),layout,
        ...(renderedFonts ? {renderedFonts} : {})})
    }
    const report = {status:'awaiting_visual_review',visualFingerprint:plan.visual_fingerprint,plates,
      browserVersion:browser.version(),production_qualified:false,
      ...(fonts.length ? {fonts:fonts.map(({name,weight,sha256}) => ({name,weight,sha256}))} : {})}
    await writeFile(join(output,'illustration-report.json'), JSON.stringify(report,null,2)+'\n',
      {flag:'wx',mode:0o600})
    return report
  } catch (error) {
    const code = error instanceof Error && /^[A-Z][A-Z_]{2,80}$/.test(error.message)
      ? error.message : 'ARTWORK_FAILED'
    await writeFile(join(output,'failure.json'), JSON.stringify({status:'failed',code})+'\n',
      {flag:'wx',mode:0o600})
    throw new Error(code)
  } finally {
    if (browser) await browser.close()
  }
}