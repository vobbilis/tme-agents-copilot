---
name: cmo-narration
description: "Use when synthesizing, timing or correcting CMO speech. REQUIRED: measured word timestamps and separate spoken/display forms. FORBIDDEN: guessed cues or unapproved external TTS."
user-invocable: false
---

# Narration and Synchronization

- Use en-US-AndrewMultilingualNeural. Default +2%; evidence footage -12%.
  Estimates are approximately 153 words/minute at +2%, 2.45 words/second at
  -12%; measured speech, not the estimate, controls production timing.
- Pin edge-tts 7.2.8 and WordBoundary output. Cues are unique 3-6-word phrases;
  unresolved, duplicate, collapsed or out-of-order cues fail the build.
- Offsets belong to each pipeline: older helpers use 0.35s; SecOps uses 0.40s.
  Never import offsets or cue lead adjustments blindly.
- Word edits invalidate dependent speech, cuts, focus, timeline and approval.
- Keep canonical captions separate from speech-only hints. Examples: ITOM can
  be spoken as eye tom; SecOps as Seck-ops. Listen to short samples first.
- Diagnose pronunciation with local faster-whisper 1.2.1/base.en without a
  terminology prompt; bind the report to actual audio SHA-256. Recognition is
  diagnostic evidence, not proof of natural speech or human approval.
- A speech hint changes the external TTS payload. Renew consent as necessary.
  Reuse approved audio only when text, hint, rate, voice and audio hash match.
- Captions: two lines of at most 42 characters, at most six seconds, sentence
  boundaries when possible, selectable MP4 track plus SRT, never burned in.
- Check silence and end tails against the pack. Footage targets <=2s tails;
  diagram scenes have their own minimum; explainer closing has a configured cap.
- Historical browser-capture clock correction is not permission to speed up
  real-evidence excerpts. Inspect final encoded timing and marker removal.

Checklist: approved external payload, current audio, measured words, exact-once
cues, pack offset, local ASR, caption limits, and human watch-and-listen status.