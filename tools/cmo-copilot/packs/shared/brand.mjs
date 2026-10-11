import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

export const BRAND_CONTENT = Object.freeze({ x: 88, y: 164, width: 1744, height: 730 })
const FONT_WEIGHTS = [['Regular', 400], ['Medium', 500], ['Bold', 700]]
export const BRAND_FONT_STYLES = FONT_WEIGHTS.map(([name, weight]) =>
  `@font-face{font-family:HPEGraphik;src:url('brand-fonts/HPEGraphik-${name}.otf') ` +
  `format('opentype');font-weight:${weight};font-style:normal;font-display:block}`).join('')

export async function loadBrandFonts(assets) {
  if (typeof assets !== 'string' || !isAbsolute(assets)) throw new Error('HPE_GRAPHIK_ASSETS_REQUIRED')
  const fonts = []
  for (const [name, weight] of FONT_WEIGHTS) {
    const bytes = await readFile(join(assets, 'fonts', `HPEGraphik-${name}.otf`))
      .catch(() => { throw new Error('HPE_GRAPHIK_FONT_UNAVAILABLE') })
    if (bytes.length < 12 || bytes.length > 4 * 1024 ** 2 || bytes.toString('ascii', 0, 4) !== 'OTTO') {
      throw new Error('HPE_GRAPHIK_FONT_INVALID')
    }
    fonts.push({ name, weight, data: bytes.toString('base64'),
      sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  return fonts
}

const escape = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[character])

function label(left, baseline, value, size, width, weight = 400) {
  return `<text data-fit="true" data-width="${width}" data-height="48" ` +
    `x="${left}" y="${baseline}" font-size="${size}" font-weight="${weight}">` +
    `<tspan x="${left}" dy="0">${escape(value)}</tspan></text>`
}

export function brandElements(title, scene, index, count) {
  return '<g font-family="HPEGraphik" letter-spacing="0">' +
    '<g data-brand="hpe" fill="#ffffff">' +
    '<path d="M0 0H1920V148H0Z" fill="#061c19"/>' +
    '<rect x="106" y="70" width="82" height="24" fill="none" ' +
    'stroke="#01a982" stroke-width="6"/>' +
    label(212, 95, 'HPE', 36, 150, 500) +
    label(1060, 91, title, 21, 756) +
    '<path d="M104 132H1816" stroke="#315c4c" stroke-width="2"/></g>' +
    '<g data-brand-footer="hpe" fill="#b4cec5">' +
    '<path d="M0 910H1920V1080H0Z" fill="#061c19"/>' +
    '<path d="M104 911H1816" stroke="#315c4c" stroke-width="2"/>' +
    '<path d="M106 925V947" stroke="#01a982" stroke-width="4"/>' +
    label(124, 943, scene.title || scene.id, 20, 1360, 500) +
    label(1680, 943, `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`,
      20, 136, 500) + '</g></g>'
}

export function brandFrame(title, scene, index, count) {
  return '<svg class="film-frame" width="1920" height="1080" ' +
    'viewBox="0 0 1920 1080">' + brandElements(title, scene, index, count) + '</svg>'
}