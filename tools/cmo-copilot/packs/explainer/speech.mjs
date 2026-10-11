import { createHash } from 'node:crypto'

export const SPEECH_ENGINE = 'edge-tts==7.2.8'

export function speechFingerprint(text, voice, rate) {
  return createHash('sha256')
    .update(JSON.stringify({ text, voice, rate, engine: SPEECH_ENGINE, boundary: 'WordBoundary' }))
    .digest('hex')
}

export function tokens(text) {
  if (typeof text !== 'string') throw new Error('SPEECH_TEXT_INVALID')
  return text.normalize('NFKC').toLowerCase()
    .replaceAll('\u2019', "'").replaceAll('&amp;', ' and ').replaceAll('&', ' and ')
    .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []
}

function tokenTimeline(words) {
  return words.flatMap((word, index) => tokens(word.text).map(text => ({ ...word, text, index })))
}

export function validateWords(words, duration) {
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(words) || !words.length) {
    throw new Error('SPEECH_TIMING_INVALID')
  }
  let previousEnd = 0
  for (const word of words) {
    if (!word || !tokens(word.text).length || !Number.isFinite(word.start) ||
        !Number.isFinite(word.end) || word.start < 0 || word.end <= word.start ||
        word.end > duration + 0.01 || word.start < previousEnd - 0.001) {
      throw new Error('SPEECH_TIMING_INVALID')
    }
    previousEnd = word.end
  }
  return words
}

export function parseWordBoundaries(jsonl, duration) {
  let events
  try {
    events = jsonl.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  } catch {
    throw new Error('SPEECH_METADATA_INVALID')
  }
  if (events.some(event => !event || event.type !== 'WordBoundary' ||
      !Number.isFinite(event.offset) || !Number.isFinite(event.duration))) {
    throw new Error('SPEECH_METADATA_INVALID')
  }
  return validateWords(events.map(event => ({
    text: event.text, start: event.offset / 10000000,
    end: (event.offset + event.duration) / 10000000
  })), duration)
}

export function findCue(words, phrase) {
  const wanted = tokens(phrase)
  if (!wanted.length) throw new Error('CUE_EMPTY')
  const timeline = tokenTimeline(words)
  const matches = []
  for (let start = 0; start <= timeline.length - wanted.length; start += 1) {
    if (wanted.every((token, index) => timeline[start + index].text === token)) matches.push(start)
  }
  if (matches.length !== 1) throw new Error(matches.length ? 'CUE_AMBIGUOUS' : 'CUE_MISSING')
  const start = matches[0]
  return { phrase, start: timeline[start].start,
    end: timeline[start + wanted.length - 1].end, wordIndex: timeline[start].index }
}

function wrapCaption(text, width = 42) {
  if (text.length <= width) return text
  const words = text.split(' ')
  const options = []
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(' ')
    const right = words.slice(index).join(' ')
    if (left.length <= width && right.length <= width) {
      options.push({ text: `${left}\n${right}`, balance: Math.abs(left.length - right.length) })
    }
  }
  return options.sort((left, right) => left.balance - right.balance)[0]?.text ?? null
}

export function validateCaptions(captions, duration) {
  if (!Number.isFinite(duration) || duration <= 0 || !Array.isArray(captions) || !captions.length) {
    throw new Error('CAPTIONS_INVALID')
  }
  let previousEnd = 0
  for (const caption of captions) {
    if (!caption || typeof caption.text !== 'string' || !caption.text.trim() ||
        caption.text.split('\n').length > 2 || caption.text.split('\n').some(line => line.length > 42) ||
        !Number.isFinite(caption.start) || !Number.isFinite(caption.end) ||
        caption.start < 0 || caption.start < previousEnd - 0.001 ||
        caption.end <= caption.start || caption.end - caption.start > 6 ||
        caption.end > duration + 0.01) throw new Error('CAPTIONS_INVALID')
    previousEnd = caption.end
  }
  return captions
}

export function buildCaptions(text, words, duration) {
  validateWords(words, duration)
  const spoken = tokenTimeline(words)
  const expected = tokens(text)
  if (expected.length !== spoken.length || expected.some((token, index) => token !== spoken[index].text)) {
    throw new Error('SPEECH_TEXT_MISMATCH')
  }
  let cursor = 0
  const units = text.trim().split(/\s+/).map(text => {
    const count = tokens(text).length
    if (!count) throw new Error('CAPTION_PUNCTUATION_ONLY')
    const unit = { text, start: spoken[cursor].start, end: spoken[cursor + count - 1].end }
    cursor += count
    return unit
  })
  const captions = []
  let group = []
  const flush = () => {
    if (!group.length) return
    const text = wrapCaption(group.map(unit => unit.text).join(' '))
    if (!text) throw new Error('CAPTION_TOO_WIDE')
    captions.push({ text, start: group[0].start, end: group.at(-1).end })
    group = []
  }
  for (const unit of units) {
    const candidate = [...group, unit]
    if (group.length && (!wrapCaption(candidate.map(part => part.text).join(' ')) ||
        unit.end - group[0].start > 6)) flush()
    group.push(unit)
    const length = group.map(part => part.text).join(' ').length
    if (/[.!?][\u201d"']?$/.test(unit.text) || (/[;:]$/.test(unit.text) && length >= 35)) flush()
  }
  flush()
  for (const [index, caption] of captions.entries()) {
    if (caption.end - caption.start > 6) throw new Error('CAPTION_TOO_LONG')
    caption.end = Math.min(caption.end + 0.15, caption.start + 6, units.at(-1).end + 0.25,
      duration, (captions[index + 1]?.start ?? duration) - 0.001)
  }
  return validateCaptions(captions, duration)
}

export function formatTime(seconds, decimal = ',') {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('CAPTION_TIME_INVALID')
  const milliseconds = Math.round(seconds * 1000)
  return [Math.floor(milliseconds / 3600000), Math.floor(milliseconds / 60000) % 60,
    Math.floor(milliseconds / 1000) % 60].map(value => String(value).padStart(2, '0')).join(':') +
    decimal + String(milliseconds % 1000).padStart(3, '0')
}

export function serializeCaptions(captions, format = 'vtt') {
  if (!['srt', 'vtt'].includes(format)) throw new Error('CAPTION_FORMAT_INVALID')
  validateCaptions(captions, captions.at(-1)?.end)
  const separator = format === 'vtt' ? '.' : ','
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + captions.map((caption, index) =>
    `${index + 1}\n${formatTime(caption.start, separator)} --> ${formatTime(caption.end, separator)}\n${caption.text}\n`
  ).join('\n')
}