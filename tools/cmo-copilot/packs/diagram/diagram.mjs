import { SIZE } from '../explainer/picture.mjs'

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/
const XML_TEXT = /^[\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]*$/u

function labelLayout(node) {
  const characters = Array.from(node.label).length
  const fontSize = Math.min(32, node.rect.height - 24,
    (node.rect.width - 24) / (characters * 0.65))
  if (fontSize < 18) throw new Error('INVALID_DIAGRAM_LABEL')
  return { fontSize, textWidth: characters * fontSize * 0.65 }
}

function hasKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',')
}

function validTime(value) {
  return Number.isFinite(value) && value >= 0
}

function validateDiagram(diagram) {
  if (!hasKeys(diagram, ['nodes', 'connections']) ||
      !Array.isArray(diagram.nodes) || diagram.nodes.length === 0 ||
      !Array.isArray(diagram.connections)) throw new Error('INVALID_DIAGRAM')

  const ids = new Set()
  const nodes = new Map()
  for (const node of diagram.nodes) {
    if (!hasKeys(node, ['id', 'label', 'rect', 'revealAt']) ||
        typeof node.id !== 'string' || !ID_PATTERN.test(node.id) ||
        ids.has(node.id) || typeof node.label !== 'string' ||
        node.label.trim().length === 0 || !XML_TEXT.test(node.label) || !validTime(node.revealAt) ||
        !hasKeys(node.rect, ['x', 'y', 'width', 'height'])) {
      throw new Error('INVALID_DIAGRAM')
    }
    const { x, y, width, height } = node.rect
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 ||
        width <= 0 || height <= 0 || x + width > SIZE.width ||
        y + height > SIZE.height) throw new Error('INVALID_DIAGRAM')
    labelLayout(node)
    ids.add(node.id)
    nodes.set(node.id, node)
  }

  for (const connection of diagram.connections) {
    if (!hasKeys(connection, ['id', 'from', 'to', 'revealAt']) ||
        typeof connection.id !== 'string' || !ID_PATTERN.test(connection.id) ||
        ids.has(connection.id) || !nodes.has(connection.from) ||
        !nodes.has(connection.to) || connection.from === connection.to || !validTime(connection.revealAt)) {
      throw new Error('INVALID_DIAGRAM')
    }
    ids.add(connection.id)
  }
  return nodes
}

function escapeXml(text) {
  return text.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character])
}

export function renderDiagramSvg(diagram, timeSeconds, viewport) {
  if (!validTime(timeSeconds)) throw new Error('INVALID_DIAGRAM_TIME')
  const nodes = validateDiagram(diagram)
  let transform
  if (viewport) {
    if (![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite) ||
        viewport.x < 0 || viewport.y < 0 || viewport.width <= 0 || viewport.height <= 0 ||
        viewport.x + viewport.width > SIZE.width || viewport.y + viewport.height > SIZE.height) {
      throw new Error('DIAGRAM_FRAME_FIT_FAILED')
    }
    const left = Math.min(...diagram.nodes.map(node => node.rect.x)) - 2
    const top = Math.min(...diagram.nodes.map(node => node.rect.y)) - 2
    const right = Math.max(...diagram.nodes.map(node => node.rect.x + node.rect.width)) + 2
    const bottom = Math.max(...diagram.nodes.map(node => node.rect.y + node.rect.height)) + 2
    const scale = Math.min(1, viewport.width / (right - left), viewport.height / (bottom - top))
    if (diagram.nodes.some(node => labelLayout(node).fontSize * scale < 18)) {
      throw new Error('DIAGRAM_FRAME_FIT_FAILED')
    }
    const horizontal = Math.max(viewport.x - left * scale,
      Math.min(0, viewport.x + viewport.width - right * scale))
    const vertical = Math.max(viewport.y - top * scale,
      Math.min(0, viewport.y + viewport.height - bottom * scale))
    transform = `translate(${horizontal} ${vertical}) scale(${scale})`
  }
  const visible = new Set([...nodes.values()]
    .filter(node => node.revealAt <= timeSeconds).map(node => node.id))
  const connections = diagram.connections.filter(connection =>
    connection.revealAt <= timeSeconds && visible.has(connection.from) &&
    visible.has(connection.to))
  const lines = connections.map(connection => {
    const from = nodes.get(connection.from).rect
    const to = nodes.get(connection.to).rect
    const x1 = from.x + from.width / 2
    const y1 = from.y + from.height / 2
    const x2 = to.x + to.width / 2
    const y2 = to.y + to.height / 2
    return `<line data-connection-id="${connection.id}" x1="${x1}" y1="${y1}" ` +
      `x2="${x2}" y2="${y2}" stroke="#527c78" stroke-width="4"/>`
  })
  const boxes = [...nodes.values()].filter(node => visible.has(node.id)).map(node => {
    const { x, y, width, height } = node.rect
    const { fontSize, textWidth } = labelLayout(node)
    return `<g data-node-id="${node.id}"><rect x="${x}" y="${y}" ` +
      `width="${width}" height="${height}" rx="8" fill="#f5f8f7" ` +
      `stroke="#255f57" stroke-width="4"/><text x="${x + width / 2}" ` +
      `y="${y + height / 2}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="sans-serif" font-size="${fontSize}" textLength="${textWidth}" ` +
      `lengthAdjust="spacingAndGlyphs" fill="#172c29">` +
      `${escapeXml(node.label)}</text></g>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE.width}" ` +
    `height="${SIZE.height}" viewBox="0 0 ${SIZE.width} ${SIZE.height}">` +
    (transform ? `<g data-diagram-content="true" transform="${transform}">` : '') +
    `${lines.join('')}${boxes.join('')}${transform ? '</g>' : ''}</svg>`
}