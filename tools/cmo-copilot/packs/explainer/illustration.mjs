const fail = () => { throw new Error('ILLUSTRATION_INVALID') }
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function record(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      required.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => ![...required, ...optional].includes(key))) fail()
}

function number(value, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) fail()
}

function bounds(left, top, right, bottom, padding = 0) {
  if (![left, top, right, bottom, padding].every(Number.isFinite) ||
      left - padding < 104 || right + padding > 1816 ||
      top - padding < 390 || bottom + padding > 900) fail()
}

function element(value) {
  const fields = {
    rect: ['type', 'x', 'y', 'width', 'height', 'fill'],
    circle: ['type', 'cx', 'cy', 'r', 'fill'],
    polyline: ['type', 'points', 'stroke', 'stroke_width'],
    text: ['type', 'x', 'y', 'width', 'height', 'text', 'font_size', 'fill']
  }
  if (!value || !Object.hasOwn(fields, value.type)) fail()
  record(value, fields[value.type], ['circle', 'rect'].includes(value.type) ? ['stroke', 'stroke_width'] : [])
  for (const key of ['fill', 'stroke']) {
    if (Object.hasOwn(value, key) &&
        (typeof value[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value[key]))) fail()
  }
  if (Object.hasOwn(value, 'stroke_width')) {
    number(value.stroke_width, 1, 12)
    if (!Object.hasOwn(value, 'stroke')) fail()
  }
  const padding = Object.hasOwn(value, 'stroke') ? (value.stroke_width ?? 2) / 2 : 0
  if (value.type === 'circle') {
    number(value.cx, 104, 1816)
    number(value.cy, 390, 900)
    number(value.r, 1, 850)
    bounds(value.cx - value.r, value.cy - value.r,
      value.cx + value.r, value.cy + value.r, padding)
  } else if (value.type === 'polyline') {
    if (!Array.isArray(value.points) || value.points.length < 2 || value.points.length > 128) fail()
    for (const point of value.points) {
      if (!Array.isArray(point) || point.length !== 2) fail()
      bounds(point[0], point[1], point[0], point[1], padding)
    }
  } else {
    number(value.x, 104, 1816)
    number(value.y, 390, 900)
    number(value.width, 1, 1712)
    number(value.height, 1, 510)
    bounds(value.x, value.y, value.x + value.width, value.y + value.height, padding)
    if (value.type === 'text') {
      number(value.font_size, 18, 72)
      if (typeof value.text !== 'string' || !value.text.trim() ||
          value.text.length > 320 || /[\u0000-\u001f\u007f-\u009f]/u.test(value.text) ||
          /[\ud800-\udfff]/u.test(value.text) ||
          [...value.text].length * 18 > value.width || value.font_size * 1.4 > value.height) fail()
    }
  }
}

export function validateIllustrations(illustrations, scenes, bound = false) {
  record(illustrations, ['schema_version', 'scenes', ...(bound ? ['base_fingerprints'] : [])],
    ['presentation'])
  if (Object.hasOwn(illustrations, 'presentation') && illustrations.presentation !== 'hpe') fail()
  if (illustrations.schema_version !== 'cmo-vector-1' || !Array.isArray(illustrations.scenes) ||
      illustrations.scenes.length !== scenes.length || scenes.length > 64) fail()
  if (bound) {
    record(illustrations.base_fingerprints, ['input', 'visual'])
    for (const hash of Object.values(illustrations.base_fingerprints)) {
      if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) fail()
    }
  }
  for (const [index, scene] of scenes.entries()) {
    const drawing = illustrations.scenes[index]
    record(drawing, ['scene_id', 'states'])
    if (drawing.scene_id !== scene.id || !Array.isArray(drawing.states) ||
        drawing.states.length !== scene.cues.length + 1 || drawing.states.length > 32) fail()
    for (const [phase, state] of drawing.states.entries()) {
      record(state, ['phase', 'elements'])
      if (state.phase !== phase || !Array.isArray(state.elements) ||
          !state.elements.length || state.elements.length > 64) fail()
      for (const value of state.elements) element(value)
      const labels = state.elements.filter(value => value.type === 'text')
      if (labels.some((first, labelIndex) => labels.slice(labelIndex + 1).some(second =>
        Math.min(first.x + first.width, second.x + second.width) > Math.max(first.x, second.x) &&
        Math.min(first.y + first.height, second.y + second.height) > Math.max(first.y, second.y)))) fail()
    }
  }
  return illustrations
}

export function vectorState(illustrations, scene, phase) {
  record(illustrations, ['schema_version', 'scenes'], ['base_fingerprints', 'presentation'])
  if (Object.hasOwn(illustrations, 'presentation') && illustrations.presentation !== 'hpe') fail()
  if (!Array.isArray(illustrations.scenes) || !illustrations.scenes.length ||
      illustrations.scenes.length > 64) fail()
  const drawing = illustrations.scenes.find(value => value?.scene_id === scene.id)
  if (!drawing) fail()
  validateIllustrations({ schema_version: illustrations.schema_version, scenes: [drawing] }, [scene])
  if (!Number.isInteger(phase) || phase < 0 || phase >= drawing.states.length) fail()
  return drawing.states[phase].elements.map(value => {
    const stroke = value.stroke ? ` stroke="${value.stroke}" stroke-width="${value.stroke_width ?? 2}"` : ''
    if (value.type === 'circle') return `<circle cx="${value.cx}" cy="${value.cy}" r="${value.r}" fill="${value.fill}"${stroke}/>`
    if (value.type === 'rect') return `<rect x="${value.x}" y="${value.y}" width="${value.width}" height="${value.height}" fill="${value.fill}"${stroke}/>`
    if (value.type === 'polyline') return `<polyline points="${value.points.map(point => point.join(',')).join(' ')}" fill="none"${stroke} stroke-linejoin="round" stroke-linecap="round"/>`
    return `<text data-fit="true" data-width="${value.width}" data-height="${value.height}" x="${value.x}" y="${value.y + value.font_size}" fill="${value.fill}" font-size="${value.font_size}">${escape(value.text)}</text>`
  }).join('')
}