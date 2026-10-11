import { tokens, validateWords } from './speech.mjs'

export const VOICE = 'en-US-AndrewMultilingualNeural'
export const RATE = '+2%'

export function normalizeSpeechControls(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
      Object.keys(config).some(key => !['voice', 'rate', 'substitutions'].includes(key))) {
    throw new Error('SPEECH_CONTROLS_INVALID')
  }
  const voice = Object.hasOwn(config, 'voice') ? config.voice : VOICE
  const rawRate = Object.hasOwn(config, 'rate') ? config.rate : RATE
    if (typeof voice !== 'string' || voice.length > 128 ||
      !/^[a-z]{2,3}-[A-Z]{2}-(?:[A-Za-z0-9]+-)*[A-Za-z][A-Za-z0-9]*Neural$/.test(voice)) {
    throw new Error('SPEECH_VOICE_INVALID')
  }
  if (typeof rawRate !== 'string' || !/^[+-][0-9]{1,3}%$/.test(rawRate) ||
      Math.abs(Number(rawRate.slice(0, -1))) > 100) {
    throw new Error('SPEECH_RATE_INVALID')
  }
  const pace = Number(rawRate.slice(0, -1))
  const rate = `${pace < 0 ? '' : '+'}${pace}%`
  const aliases = Object.hasOwn(config, 'substitutions') ? config.substitutions : []
  if (!Array.isArray(aliases) || aliases.length > 128) {
    throw new Error('SPEECH_SUBSTITUTION_INVALID')
  }
  const seen = new Set()
  const substitutions = aliases.map(alias => {
    if (!alias || typeof alias !== 'object' || Array.isArray(alias) ||
        Object.keys(alias).length !== 2 ||
        !['display', 'spoken'].every(key => Object.hasOwn(alias, key)) ||
        [alias.display, alias.spoken].some(value => typeof value !== 'string' ||
          !value.trim() || value.length > 2048 || /[<>\u0000-\u001f\u007f]/.test(value) ||
          !tokens(value).length)) throw new Error('SPEECH_SUBSTITUTION_INVALID')
    const display = tokens(alias.display).join(' ')
    const spoken = alias.spoken.trim().replace(/\s+/g, ' ')
    if (seen.has(display)) throw new Error('SPEECH_SUBSTITUTION_AMBIGUOUS')
    seen.add(display)
    return { display, spoken }
  }).sort((left, right) => left.display < right.display ? -1 : left.display > right.display ? 1 : 0)
  return { voice, rate, substitutions }
}

function displayTokens(text) {
  let normalized = ''
  const offsets = []
  const segments = new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)
  for (const { segment, index } of segments) {
    const value = segment.normalize('NFKC')
    normalized += value
    for (let offset = 0; offset < value.length; offset += 1) {
      offsets.push({ start: index, end: index + segment.length })
    }
  }
  return [...normalized.matchAll(/[\p{L}\p{N}\p{M}]+(?:['\u2019\uFF07][\p{L}\p{N}\p{M}]+)*|&amp;|&/gu)]
    .flatMap(match => tokens(match[0]).map(token => ({ text: token,
      start: offsets[match.index].start,
      end: offsets[match.index + match[0].length - 1].end })))
}

export function prepareSpeech(text, controls) {
  const display = displayTokens(text)
  const expected = tokens(text)
  if (display.length !== expected.length ||
      display.some((token, index) => token.text !== expected[index])) {
    throw new Error('SPEECH_SUBSTITUTION_TEXT_INVALID')
  }
  const matches = []
  for (const alias of controls.substitutions) {
    const wanted = tokens(alias.display)
    for (let start = 0; start <= display.length - wanted.length; start += 1) {
      if (wanted.every((token, index) => token === display[start + index].text)) {
        matches.push({ start, end: start + wanted.length, spoken: alias.spoken })
      }
    }
  }
  matches.sort((left, right) => left.start - right.start)
  for (let index = 1; index < matches.length; index += 1) {
    if (matches[index].start < matches[index - 1].end) {
      throw new Error('SPEECH_SUBSTITUTION_OVERLAP')
    }
  }
  let textCursor = 0
  let tokenCursor = 0
  let spokenCursor = 0
  let spokenText = ''
  const spans = []
  const unchanged = end => {
    while (tokenCursor < end) {
      spans.push({ displayStart: tokenCursor, displayEnd: tokenCursor + 1,
        spokenStart: spokenCursor, spokenEnd: spokenCursor + 1 })
      tokenCursor += 1
      spokenCursor += 1
    }
  }
  for (const match of matches) {
    unchanged(match.start)
    const start = display[match.start].start
    const end = display[match.end - 1].end
    spokenText += text.slice(textCursor, start) + match.spoken
    const count = tokens(match.spoken).length
    spans.push({ displayStart: match.start, displayEnd: match.end,
      spokenStart: spokenCursor, spokenEnd: spokenCursor + count })
    tokenCursor = match.end
    spokenCursor += count
    textCursor = end
  }
  unchanged(display.length)
  spokenText += text.slice(textCursor)
  return { text: spokenText, display: expected, spans }
}

export function mapDisplayWords(prepared, words, duration) {
  validateWords(words, duration)
  const measured = words.flatMap(word => {
    const parts = tokens(word.text)
    return parts.map((text, index) => ({ text,
      start: word.start + index * (word.end - word.start) / parts.length,
      end: word.start + (index + 1) * (word.end - word.start) / parts.length
    }))
  })
  const expected = tokens(prepared.text)
  if (expected.length !== measured.length ||
      expected.some((token, index) => token !== measured[index].text)) {
    throw new Error('SPEECH_TEXT_MISMATCH')
  }
  return prepared.spans.flatMap(span => {
    const displayCount = span.displayEnd - span.displayStart
    const spokenCount = span.spokenEnd - span.spokenStart
    const boundary = (position, isEnd) => {
      const relative = position * spokenCount / displayCount
      const index = isEnd ? Math.ceil(relative) - 1 : Math.floor(relative)
      const word = measured[span.spokenStart + index]
      return word.start + (relative - index) * (word.end - word.start)
    }
    return Array.from({ length: displayCount }, (_, index) => ({
      text: prepared.display[span.displayStart + index],
      start: boundary(index, false), end: boundary(index + 1, true)
    }))
  })
}