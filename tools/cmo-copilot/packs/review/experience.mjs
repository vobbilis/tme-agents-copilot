import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { inspectCut } from '../explainer/produce.mjs'

const MAX_BYTES = 1048576
const MAX_ITEMS = 500
const cutNames = ['film.mp4', 'captions.srt', 'captions.vtt', 'render-report.json']
const digest = text => createHash('sha256').update(text).digest('hex')
const fingerprintPattern = /^[a-f0-9]{64}$/

function fail(code) {
  throw new Error(code)
}

function objectWithKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(code)
}

function text(value, limit, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(code)
  return value
}

function timestamp(value, duration, code) {
  if (!Number.isFinite(value) || value < 0 || value > duration) fail(code)
  return value
}

function createdAt(value, code) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail(code)
  return value
}

function stableId(value, code) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value)) fail(code)
  return value
}

function validateInspected(inspected) {
  const code = 'INVALID_REVIEW_CUT'
  if (inspected?.schema_version !== 'cmo-cut-review-1' ||
      inspected.status !== 'awaiting_owner_review' || inspected.production_qualified !== false ||
      typeof inspected.cut !== 'string' || !isAbsolute(inspected.cut) ||
      resolve(inspected.cut) !== inspected.cut || inspected.film !== join(inspected.cut, 'film.mp4') ||
      !fingerprintPattern.test(inspected.cutFingerprint)) fail(code)
  objectWithKeys(inspected.files, cutNames, code)
  for (const name of cutNames) {
    const entry = inspected.files[name]
    objectWithKeys(entry, ['sha256', 'bytes'], code)
    if (!fingerprintPattern.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) ||
        entry.bytes < 1 || entry.bytes > (name === 'film.mp4' ? 2147483648 : 2097152)) fail(code)
  }
  if (digest(JSON.stringify(inspected.files)) !== inspected.cutFingerprint) fail(code)
  const technical = inspected.technicalReview
  if (technical?.basis !== 'matching_render_report' || technical.decodeRepeated !== false ||
      technical.fullDecode !== 'passed' || !Number.isSafeInteger(technical.frameCount) ||
      technical.frameCount < 1 || !Number.isFinite(technical.duration) || technical.duration <= 0 ||
      Math.abs(technical.duration - technical.frameCount / 30) > 1 / 30 ||
      !Number.isFinite(technical.loudnessLUFS) || Math.abs(technical.loudnessLUFS + 16) > 1 ||
      !Number.isFinite(technical.truePeakDBTP) || technical.truePeakDBTP > -1.5) fail(code)
  return technical.duration
}

function validateChapters(chapters, duration) {
  const code = 'INVALID_REVIEW_CHAPTERS'
  if (!Array.isArray(chapters) || chapters.length > MAX_ITEMS) fail(code)
  let previousEnd = 0
  return chapters.map(chapter => {
    objectWithKeys(chapter, ['title', 'start', 'end'], code)
    const title = text(chapter.title, 160, code)
    const start = timestamp(chapter.start, duration, code)
    const end = timestamp(chapter.end, duration, code)
    if (start < previousEnd || end <= start) fail(code)
    previousEnd = end
    return { title, start, end }
  })
}

function emptyNotes(exactCutFingerprint) {
  return { schema_version: 'cmo-review-notes-1', exactCutFingerprint,
    notes: [], findings: [], dispositions: [] }
}

function validateNotes(input, inspected) {
  const code = 'INVALID_REVIEW_NOTES'
  objectWithKeys(input, ['schema_version', 'exactCutFingerprint', 'notes', 'findings', 'dispositions'], code)
  if (input.schema_version !== 'cmo-review-notes-1' ||
      typeof input.exactCutFingerprint !== 'string' ||
      !fingerprintPattern.test(input.exactCutFingerprint)) fail(code)
  if (input.exactCutFingerprint !== inspected.cutFingerprint) fail('CUT_CHANGED')
  for (const collection of [input.notes, input.findings, input.dispositions]) {
    if (!Array.isArray(collection) || collection.length > MAX_ITEMS) fail(code)
  }
  const ids = new Set()
  const findings = new Set()
  const entries = (collection, isFinding) => collection.map(entry => {
    objectWithKeys(entry, isFinding ? ['id', 'timestamp', 'text', 'createdAt', 'reviewer'] :
      ['id', 'timestamp', 'text', 'createdAt'], code)
    const id = stableId(entry.id, code)
    if (ids.has(id)) fail(code)
    ids.add(id)
    const result = { id, timestamp: timestamp(entry.timestamp, inspected.technicalReview.duration, code),
      text: text(entry.text, 8192, code), createdAt: createdAt(entry.createdAt, code) }
    if (isFinding) {
      result.reviewer = text(entry.reviewer, 160, code)
      findings.add(id)
    }
    return result
  })
  const notes = entries(input.notes, false)
  const findingEntries = entries(input.findings, true)
  const disposed = new Set()
  const dispositions = input.dispositions.map(entry => {
    objectWithKeys(entry, ['findingId', 'decision', 'owner', 'statement', 'createdAt'], code)
    const findingId = stableId(entry.findingId, code)
    if (!findings.has(findingId) || disposed.has(findingId) ||
        !['revise', 'retain', 'dismiss'].includes(entry.decision)) fail(code)
    disposed.add(findingId)
    return { findingId, decision: entry.decision, owner: text(entry.owner, 160, code),
      statement: text(entry.statement, 8192, code), createdAt: createdAt(entry.createdAt, code) }
  })
  const result = { ...emptyNotes(inspected.cutFingerprint), notes,
    findings: findingEntries, dispositions }
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES) fail(code)
  return result
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[character])
}

function embeddedJson(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

function clock(seconds) {
  const milliseconds = Math.round(seconds * 1000)
  return `${String(Math.floor(milliseconds / 3600000)).padStart(2, '0')}:` +
    `${String(Math.floor(milliseconds / 60000) % 60).padStart(2, '0')}:` +
    `${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.` +
    String(milliseconds % 1000).padStart(3, '0')
}

const stylesheet = `:root{color-scheme:light;--ink:#202724;--muted:#53615b;--rule:#c9d3ce;--accent:#006b54}
*{box-sizing:border-box}body{margin:0;color:var(--ink);background:#f3f6f4;font:16px Georgia,serif;letter-spacing:0}
header,main{max-width:1440px;margin:auto;padding:20px 24px}header{border-bottom:1px solid var(--rule)}
h1{font-size:24px;margin:0 0 8px}h2{font-size:18px;margin:20px 0 12px}p{margin:6px 0}
.binding{font:12px monospace;overflow-wrap:anywhere;color:var(--muted)}main{display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:24px}
video{display:block;width:100%;aspect-ratio:16/9;background:#101713}nav{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
button,input,select,textarea{font:inherit;border:1px solid var(--rule);border-radius:3px;padding:8px;max-width:100%}
button{background:#fff;color:var(--accent);cursor:pointer;min-height:40px}button:hover{background:#e2eee7}button:disabled{opacity:.6;cursor:default}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
label{display:block;margin:12px 0 5px}textarea,input,select{width:100%;background:#fff;color:var(--ink)}textarea{resize:vertical;min-height:90px}
form{margin-bottom:20px}form button{margin-top:10px}output{font:14px monospace}ol{padding-left:24px}li{margin:12px 0;border-bottom:1px solid var(--rule);padding-bottom:10px;overflow-wrap:anywhere}
.entry-text{white-space:pre-wrap}.entry-meta{color:var(--muted);font-size:14px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0}
[hidden]{display:none!important}#status{min-height:24px;color:var(--accent)}@media(max-width:800px){main{grid-template-columns:minmax(0,1fr)}header,main{padding:16px}video{max-height:70vh}}`

function playerScript(data) {
  return `"use strict";
const reviewData = ${embeddedJson(data)};
const packet = reviewData.packet;
const video = document.getElementById('film');
if (reviewData.captions !== undefined) {
  document.getElementById('captions').src = URL.createObjectURL(
    new Blob([reviewData.captions], { type: 'text/vtt' }));
}
const noteForm = document.getElementById('note-form');
const dispositionForm = document.getElementById('disposition-form');
const kind = document.getElementById('entry-kind');
const status = document.getElementById('status');
const findingSelect = document.getElementById('finding-id');
const stamp = document.getElementById('timestamp');
const list = document.getElementById('entries');
const formatTime = ${clock.toString()};
function currentTime() { return Math.min(reviewData.duration, Math.max(0, Number.isFinite(video.currentTime) ? video.currentTime : 0)); }
function displayTime() { stamp.textContent = formatTime(currentTime()); }
function validText(value, limit) { return typeof value === 'string' && value.trim().length > 0 && value.length <= limit && !/[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]/.test(value); }
function newId(prefix) { let id; do { id = prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); } while ([...packet.notes, ...packet.findings].some(entry => entry.id === id)); return id; }
function withinBounds(next) { return [next.notes, next.findings, next.dispositions].every(entries => entries.length <= 500) && new TextEncoder().encode(JSON.stringify(next)).length <= 1048576; }
function renderEntries() {
  list.replaceChildren(); findingSelect.replaceChildren();
  for (const entry of [...packet.notes, ...packet.findings].sort((left, right) => left.timestamp - right.timestamp)) {
    const item = document.createElement('li');
    const seek = document.createElement('button'); seek.type = 'button'; seek.textContent = formatTime(entry.timestamp);
    seek.setAttribute('aria-label', 'Seek to ' + formatTime(entry.timestamp));
    seek.addEventListener('click', () => { video.currentTime = entry.timestamp; displayTime(); });
    const body = document.createElement('p'); body.className = 'entry-text'; body.textContent = entry.text;
    const meta = document.createElement('p'); meta.className = 'entry-meta';
    meta.textContent = (entry.reviewer ? 'Finding: ' + entry.reviewer : 'Note') + ' | ' + entry.createdAt;
    item.append(seek, body, meta);
    const disposition = packet.dispositions.find(value => value.findingId === entry.id);
    if (disposition) { const owner = document.createElement('p'); owner.className = 'entry-text'; owner.textContent = disposition.owner + ': ' + disposition.decision + ' | ' + disposition.statement; item.append(owner); }
    list.append(item);
  }
  for (const finding of packet.findings) { const option = document.createElement('option'); option.value = finding.id; option.textContent = formatTime(finding.timestamp) + ' ' + finding.text.slice(0, 100); findingSelect.append(option); }
  document.getElementById('save-disposition').disabled = packet.findings.length === 0;
}
kind.addEventListener('change', () => { document.getElementById('reviewer-field').hidden = kind.value !== 'finding'; });
video.addEventListener('timeupdate', displayTime);
for (const chapter of document.querySelectorAll('[data-start]')) { chapter.addEventListener('click', () => { video.currentTime = Number(chapter.dataset.start); displayTime(); }); }
noteForm.addEventListener('submit', event => {
  event.preventDefault();
  const entryText = document.getElementById('entry-text').value;
  const reviewer = document.getElementById('reviewer').value;
  const isFinding = kind.value === 'finding';
  if (!validText(entryText, 8192) || (isFinding && !validText(reviewer, 160))) { status.textContent = 'Enter valid note text and a reviewer for findings.'; return; }
  const entry = { id: newId(isFinding ? 'finding' : 'note'), timestamp: currentTime(), text: entryText, createdAt: new Date().toISOString() };
  if (isFinding) entry.reviewer = reviewer;
  const collection = isFinding ? 'findings' : 'notes';
  const next = { ...packet, [collection]: [...packet[collection], entry] };
  if (!withinBounds(next)) { status.textContent = 'Note limit reached. Export the current notes.'; return; }
  packet[collection].push(entry); document.getElementById('entry-text').value = ''; renderEntries(); status.textContent = 'Entry added.';
});
dispositionForm.addEventListener('submit', event => {
  event.preventDefault();
  const findingId = findingSelect.value; const owner = document.getElementById('owner').value;
  const statement = document.getElementById('disposition-text').value; const decision = document.getElementById('disposition').value;
  if (!packet.findings.some(entry => entry.id === findingId) || !validText(owner, 160) || !validText(statement, 8192) || !['revise', 'retain', 'dismiss'].includes(decision)) { status.textContent = 'Select a finding and enter an owner and statement.'; return; }
  const next = packet.dispositions.filter(entry => entry.findingId !== findingId);
  next.push({ findingId, decision, owner, statement, createdAt: new Date().toISOString() });
  if (!withinBounds({ ...packet, dispositions: next })) { status.textContent = 'Note limit reached. Export the current notes.'; return; }
  packet.dispositions = next; renderEntries(); status.textContent = 'Disposition added.';
});
document.getElementById('export-notes').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(packet, null, 2) + '\\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const download = document.createElement('a');
  download.href = url; download.download = 'review-notes-' + packet.exactCutFingerprint.slice(0, 12) + '.json';
  document.body.append(download); download.click(); download.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = 'Notes exported. Approval and watch/listen status remain unrecorded.';
});
renderEntries(); displayTime();`
}

function renderPage(inspected, chapters, packet, links, captions) {
  const script = playerScript({ duration: inspected.technicalReview.duration, packet, captions })
  const hashSource = content => `'sha256-${createHash('sha256').update(content).digest('base64')}'`
  const csp = `default-src 'none'; script-src ${hashSource(script)}; style-src ${hashSource(stylesheet)}; ` +
    `media-src file: blob:; connect-src 'none'; img-src 'none'; font-src 'none'; ` +
    `object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Cut review</title><style>${stylesheet}</style></head>
<body><header><h1>Cut review</h1><p class="binding">Exact cut: ${escapeHtml(inspected.cutFingerprint)}</p>
<p>Approval: unrecorded | Watch/listen: unrecorded</p></header>
<main><section aria-label="Video review"><video id="film" controls preload="metadata" aria-label="Exact cut video" src="${escapeHtml(links.film)}">
<track id="captions" kind="captions"${captions === undefined ? ` src="${escapeHtml(links.captions)}"` : ''} srclang="en" label="Existing captions" default></video>
<nav aria-label="Chapters">${chapters.map(chapter => `<button type="button" data-start="${chapter.start}" aria-label="Seek to ${escapeHtml(chapter.title)}">${escapeHtml(chapter.title)} (${clock(chapter.start)})</button>`).join('')}</nav>
<div class="toolbar"><output id="timestamp" aria-label="Current video timestamp">00:00:00.000</output><button id="export-notes" type="button">Export notes</button></div>
<h2>Notes and findings</h2><ol id="entries" aria-label="Timestamped notes and findings"></ol></section>
<aside aria-label="Review entries"><form id="note-form"><h2>Timestamped entry</h2>
<label for="entry-kind">Entry type</label><select id="entry-kind"><option value="note">Note</option><option value="finding">Finding</option></select>
<div id="reviewer-field" hidden><label for="reviewer">Reviewer</label><input id="reviewer" maxlength="160" autocomplete="off"></div>
<label for="entry-text">Note or finding</label><textarea id="entry-text" maxlength="8192" required></textarea><button type="submit">Add at current time</button></form>
<form id="disposition-form"><h2>Owner disposition</h2><label for="finding-id">Finding</label><select id="finding-id" required></select>
<label for="disposition">Decision</label><select id="disposition"><option value="revise">Revise</option><option value="retain">Retain</option><option value="dismiss">Dismiss</option></select>
<label for="owner">Owner</label><input id="owner" maxlength="160" required autocomplete="off">
<label for="disposition-text">Statement</label><textarea id="disposition-text" maxlength="8192" required></textarea><button id="save-disposition" type="submit">Add disposition</button></form>
<p id="status" role="status" aria-live="polite"></p></aside></main><script>${script}</script></body></html>\n`
}

export function buildReviewPage(inspected, { chapters = [], notes } = {}) {
  const duration = validateInspected(inspected)
  const validatedChapters = validateChapters(chapters, duration)
  const packet = validateNotes(notes === undefined ? emptyNotes(inspected.cutFingerprint) : notes, inspected)
  return renderPage(inspected, validatedChapters, packet, {
    film: pathToFileURL(inspected.film).href,
    captions: pathToFileURL(join(inspected.cut, 'captions.vtt')).href
  })
}

async function readReviewFile(path, expectedHash, { optional = false, captions = false } = {}) {
  const code = captions ? 'INVALID_REVIEW_CAPTIONS' : 'INVALID_REVIEW_CHAPTERS'
  let file
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if (optional && error.code === 'ENOENT') return undefined
    fail(code)
  }
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size < 1 || before.size > 2097152) fail(code)
    const bytes = await file.readFile()
    const after = await file.stat()
    if (bytes.length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs) fail(code)
    if (expectedHash && digest(bytes) !== expectedHash) fail(code)
    if (captions) return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    fail(code)
  } finally {
    await file.close()
  }
}

async function readTiming(inspected) {
  const timing = await readReviewFile(join(inspected.cut, 'timing.json'), undefined, { optional: true })
  if (timing === undefined) return []
  const report = await readReviewFile(join(inspected.cut, 'render-report.json'),
    inspected.files['render-report.json'].sha256)
  const technical = inspected.technicalReview
  if (typeof report?.inputFingerprint !== 'string' || !fingerprintPattern.test(report.inputFingerprint) ||
      timing?.inputFingerprint !== report.inputFingerprint ||
      timing.fps !== 30 || timing.frameCount !== technical.frameCount ||
      !Number.isFinite(timing.duration) || Math.abs(timing.duration - technical.duration) > 0.000001 ||
      !Array.isArray(timing.scenes) || !timing.scenes.length || timing.scenes.length > MAX_ITEMS) {
    fail('INVALID_REVIEW_CHAPTERS')
  }
  let cursor = 0
  const ids = new Set()
  const chapters = timing.scenes.map(scene => {
    if (!scene || typeof scene !== 'object' || ids.has(scene.id) ||
        typeof scene.id !== 'string' || !scene.id.trim() || !Number.isSafeInteger(scene.startFrame) ||
        !Number.isSafeInteger(scene.endFrame) || scene.startFrame !== cursor || scene.endFrame <= cursor ||
        scene.endFrame > technical.frameCount || !Number.isFinite(scene.start) || !Number.isFinite(scene.end) ||
        Math.abs(scene.start - scene.startFrame / 30) > 0.000001 ||
        Math.abs(scene.end - scene.endFrame / 30) > 0.000001) fail('INVALID_REVIEW_CHAPTERS')
    ids.add(scene.id)
    cursor = scene.endFrame
    return { title: scene.title, start: scene.start, end: scene.end }
  })
  if (cursor !== technical.frameCount) fail('INVALID_REVIEW_CHAPTERS')
  return validateChapters(chapters, technical.duration)
}

function requireSaveConsent(options, inspected) {
  if (options.saveConsentFor !== inspected.cutFingerprint) fail('SAVE_CONSENT_REQUIRED')
}

async function validateOutput(output, cut) {
  if (typeof output !== 'string' || !isAbsolute(output) || resolve(output) === cut ||
      resolve(output).startsWith(cut + '/')) fail('OUTPUT_INVALID')
  const resolved = resolve(output)
  let parent
  try {
    parent = await realpath(dirname(resolved))
  } catch {
    fail('OUTPUT_INVALID')
  }
  if (parent !== dirname(resolved)) fail('OUTPUT_INVALID')
  return resolved
}

async function saveExclusive(output, name, content) {
  try {
    await mkdir(output, { mode: 0o700 })
  } catch (error) {
    fail(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_UNAVAILABLE')
  }
  let file
  try {
    file = await open(join(output, name), constants.O_WRONLY | constants.O_CREAT |
      constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
    await file.writeFile(content, 'utf8')
  } catch {
    fail('OUTPUT_UNAVAILABLE')
  } finally {
    if (file) await file.close()
  }
}

async function confirmCurrent(inspected) {
  const current = await inspectCut({ cut: inspected.cut })
  if (current.cutFingerprint !== inspected.cutFingerprint) fail('CUT_CHANGED')
}

function relativeLink(output, path) {
  return relative(output, path).split('/').map(segment => encodeURIComponent(segment)).join('/')
}

export async function createReviewPage(options) {
  const inspected = await inspectCut({ cut: options?.cut })
  const duration = validateInspected(inspected)
  requireSaveConsent(options, inspected)
  const output = await validateOutput(options.output, inspected.cut)
  const chapters = options.chapters === undefined ? await readTiming(inspected) :
    validateChapters(options.chapters, duration)
  const packet = validateNotes(options.notes === undefined ? emptyNotes(inspected.cutFingerprint) :
    options.notes, inspected)
  const captions = await readReviewFile(join(inspected.cut, 'captions.vtt'),
    inspected.files['captions.vtt'].sha256, { captions: true })
  const html = renderPage(inspected, chapters, packet, {
    film: relativeLink(output, inspected.film),
    captions: relativeLink(output, join(inspected.cut, 'captions.vtt'))
  }, captions)
  await confirmCurrent(inspected)
  await saveExclusive(output, 'index.html', html)
  return { schema_version: 'cmo-review-page-1', status: 'review_page_saved',
    exactCutFingerprint: inspected.cutFingerprint, output: join(output, 'index.html'),
    humanReview: null, production_qualified: false }
}

export async function recordReviewNotes(input, options) {
  const inspected = await inspectCut({ cut: options?.cut })
  validateInspected(inspected)
  const packet = validateNotes(input, inspected)
  requireSaveConsent(options, inspected)
  const output = await validateOutput(options.output, inspected.cut)
  const result = { ...packet, status: 'notes_recorded_not_approval',
    recordedAt: new Date().toISOString(), source: 'operator_recorded_review_notes',
    authenticated: false, humanReview: null, production_qualified: false }
  await confirmCurrent(inspected)
  await saveExclusive(output, 'review-notes.json', JSON.stringify(result, null, 2) + '\n')
  return result
}