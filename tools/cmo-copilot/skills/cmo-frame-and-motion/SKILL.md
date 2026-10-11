---
name: cmo-frame-and-motion
description: "Use when suggesting CMO film layouts, HPE branding, screenshot or recording compositions, frames or animation. Offer accepted film patterns as suggestions. REQUIRED: brand tokens, local fonts and caption clearance. FORBIDDEN: logo wipes or decorative effects without meaning."
user-invocable: false
---

# Frame and Motion

Use the selected pack's complete brand token set and licensed local HPE Graphik
400/500/600/700 fonts. Never fetch fonts over the network or distribute them
publicly. Missing licensed assets are a doctor failure, not a silent substitution.

## Suggested Starting Patterns

Offer these owner-accepted patterns as suggestions, not a mandatory template.
Choose what serves the new film's audience, evidence and narration; confirm the
visual direction with its owner. Approval of the example film is not approval
of another film, its claims, media access or production operations.

- For a screenshot or recording scene, suggest a three-column grid: one media
  area spanning the left two-thirds and concise narration points in the right
  one-third. Do not split the media area into two decorative cards. Reflow or
  deliberately frame the relevant UI so labels remain readable; avoid shrinking
  a whole desktop until its content becomes illegible.
- Give each scene a purpose and a distinct composition within the same visual
  language. An animated signal illustration, a browser interaction and a decision
  summary worked well together; they are examples, not required scene subjects.
- Emphasize short narration points as their measured speech cues arrive. Keep
  subtitles in their own clear band below the content, not over the recording.
- Suggest a restrained forest-green background (`#061c19`), light media surfaces,
  HPE Graphik typography, and green rules or highlights that communicate focus.
  Preserve the recording's real colors and the meaning of status colors.
- Prefer simple fade-out/fade-in between scenes, without an interstitial logo.
  The accepted example used 12 frames out and 12 frames in at 30fps; adjust dwell
  and transition timing to the narration instead of treating this as a fixed rule.
- Capture actual browser interactions when illustrating a workflow. Label any
  fabricated interface or data as a fictional demo; never imply product proof.

## HPE Branding Defaults

Use the green HPE rectangle followed by `HPE` in HPE Graphik by default. Ask
which product, if any, the film represents before adding a name; reuse an
explicitly confirmed choice rather than asking again. Examples: `HPE OpsRamp`,
`HPE GreenLake`, or `HPE Morpheus`, all in the same font beside the rectangle.
Do not use the standalone OpsRamp logo. Do not use logo wipes or HPE slide
transitions. Keep branding in the header, not as a dramatic scene interruption.

The shared HPE header and chapter footer are mandatory across HPE diagram,
footage and illustrated films. Use `packs/shared/brand.mjs`, not independent
per-format copies. Keep the same lockup, title alignment, footer rule, chapter
label and chapter count. Reserve y965-1064 for captions; footer text ends by
y951. Do not add a legal disclaimer or product name without owner direction.
HPE illustrations select `presentation: 'hpe'`. Diagram/footage rendering also
requires the authorized local `assets` font directory. Font binaries stay out
of the shared kit and are removed from temporary render staging afterward.

## Reference Inspection

For large reference recordings, inspect metadata first, then seek directly to
a few relevant timestamps and extract small stills. Do not load the whole video
into context or run a full-file decode merely to browse its style. Distinguish
what the samples show from unverified motion or layout assumptions. This sampling
does not replace final-film decode checks or a required full privacy review.

## Composition Checks

- Master 1920x1080 at 30fps. Reserve the pack's caption band and safe edges.
- Diagram reference stage: 1744x632. Footage well: x64/y165, 1168x710;
  conclusion panel: x1280/y174, width552. Explainer content: x104-1816,
  y170-887; footer <=951; captions y965-1064.
- Green signals structure/active relationships; amber a real boundary, risk or
  question; mint connected evidence; blue human authority. Footage retains its
  own colors. Do not show false green success over an unconfirmed assumption.
- Motion communicates a change in meaning. No gratuitous pans, bounces, spins,
  glows or activity loops. Respect the selected form and the owner's confirmed
  transition direction; do not copy a reference's effects indiscriminately.
- Bind reveals and cuts to measured speech. Deterministic time-to-pose animation
  must reproduce correctly when seeking, not only during continuous playback.
- Progressive states need readable dwell time. A closing animation is not a
  set of four static narrated slides; use the pack's appropriate minimums.
- Inspect text bounds, overlaps, connector contrast, captions, actual encoded
  midpoints and transition frames. Browser screenshots alone do not prove output.

Checklist: one visual grammar, no missing fonts/assets, readable text, meaningful
color, valid cue timing, deterministic seek, clear captions, human visual review.