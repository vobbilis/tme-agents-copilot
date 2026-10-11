---
title: TME Agents Handoff
description: Direct source-grounded films in ordinary Copilot Chat, with explicit current production capabilities and consent boundaries.
---

# TME Agents

Make diagram films, footage films and illustrated explainers in ordinary
Copilot Chat. Describe your film and provide approved source material; the
director handles the tools. You do not need to write scripts or JSON.

## Quick Start

1. Open the whole kit folder in **Visual Studio Code**, using **File > Open Folder**.
2. Open **Copilot Chat** and select **cmo-chat-director** from the agent selector.
3. Send this message:

> Help me set up this kit and make a film. Check the local tools first and ask before installing anything. Do not generate narration or video until we have agreed on the story and I approve the processing.

Stay in that Chat. The director checks setup, helps shape the story, makes the
approved film, handles revisions and delivers the accepted MP4 and captions.
The detailed steps below are there when you need them, not a prerequisite to
starting. You need a Mac, VS Code and your organization's approved Copilot account.

Only provide material your organization permits Copilot to receive. Model
requests use Copilot; separately approved narration uses Edge TTS. Rendering
runs locally. Setup downloads software only with your permission.

## Validation Status

**Current production tools:** source intake, briefing, screenplay, all three
production forms, review, revision and local delivery are
implemented and unit-tested. On the author's Mac, the three non-demo films completed rendering,
owner review and TTS listening, fresh Chat resume, visual and narration revisions,
the named-reviewer workflow and hash-checked local delivery. Recorded review
limitations remain; these results are not blanket privacy or production clearance.

Clean-copy setup passed in a fresh Chat on the same Mac on 2026-10-10. The
approved local installer and offline verifier returned `ready`; no system
changes or film/reviewer operations ran. A second Mac remains untested. Swift
OCR on a recipient's Mac remains unverified. The kit excludes private films, source
material, licensed fonts, credentials and caches. A clearly fictional example
plan is included; it is optional, not a replacement for your story.

## Start Here

You need a Mac and your organization's approved Copilot account. You do not
need to understand the scripts in this folder, type terminal commands or edit JSON.

### 1. Open the Kit

1. Locate the prepared workspace folder your sender provided.
2. Open **Visual Studio Code**. If you do not have it, install it from
   [code.visualstudio.com](https://code.visualstudio.com/) or ask IT.
3. In VS Code, choose **File > Open Folder**.
4. Select the extracted **cmo-filmmaker** folder, or **tme-agents-copilot** if
   that is the prepared workspace your sender provided. Open that whole folder,
   not a folder inside it or this Markdown file by itself.
5. If VS Code asks whether you trust the folder, approve only if you trust the
   sender and your organization permits it.

The correct folder contains `START-HERE.md`, `setup.command`, `.github/agents`
and `tools/cmo-copilot` directly inside it. Finder hides `.github`;
you do not need to open it. Do not open only the tools folder or the agents folder.
**A new VS Code window does not inherit the folder from another window.** Use
**File > Open Folder** in the window where you intend to use the director.

### 2. Open the Director

1. Open **Copilot Chat** in VS Code.
2. Sign in with your organization's Copilot-enabled account if prompted.
3. In Chat's agent selector, choose **cmo-chat-director**.

VS Code discovers workspace agent definitions from the included `.github/agents`
folder. Opening the whole kit makes those definitions discoverable; it does not
run scripts or install software. Only the director is intended to appear in the
picker. Its four specialists are intentionally hidden and invoked by the director.

If Copilot is missing, open VS Code's **Extensions** view (Cmd+Shift+X), search
for **GitHub Copilot** and install the official extension published by GitHub,
subject to your organization's policy. The kit does not include a Copilot license.

If the director is missing, first confirm you opened the entire extracted
folder. If it is still missing, stop and tell the sender: **"I opened the
extracted folder, but cmo-chat-director isn't listed."** You should not need a
plugin installation, slash command or security workaround.

### 3. Send This Message

Copy this into the director's Chat:

> Prepare this workspace for our walkthrough. Explain the required local downloads and ask my permission before installing anything. Do not generate narration or video yet.

Stay in this Chat with the director. Seeing it in the selector confirms agent
discovery, not that the film tools are ready. Sending this message does not
approve downloads or media generation.

The director should handle the commands and guide these steps:

1. Check this workspace without downloading anything and explain what is missing.
2. Ask separately about missing system tools and kit-local downloads. The local
   downloads include Edge TTS, Playwright, Chromium and Hyperframes, along with
   their dependencies and npm install scripts. Approve only the scope explained
   to you and permitted by your organization.
3. Install only what you approved, then verify the tools. Wait for confirmation
   that offline execution checks passed before moving to the film task.

On the author's clean `tme-agents-copilot` walkthrough, the system tools were
already present; these four local packages/browser components were missing.
Your Mac may differ, so let the director check. `setup_required` (exit code 2)
means setup is incomplete, not that a film failed. `tools_present` is not enough:
the verification must report `ready`. Even `ready` does not verify speech-service
access, a completed film, font rights or human acceptance.

Installation permission does not authorize speech processing, artwork capture,
rendering or billed specialist reviews. The director must explain and request
those permissions separately. Declining does not erase your brief or work.

#### Reply to the Local-Download Request

If the director reports only the kit-local components above as missing, explains
their dependency install scripts, and you choose to approve that scope, reply:

> Yes. Install only those kit-local components and dependencies, including their install scripts, then verify setup. No system-level changes, narration, artwork, video rendering or specialist review calls.

This is a suggested reply, not permission granted by this guide. If the director
requests a different scope, clarify it before approving. Stay in the same Chat
and wait for the installation and verification result. The expected successful
result is `ready`; if setup fails, preserve the reported phase and error instead
of approving unrelated changes or assuming success.

**Initial setup checkpoint, 2026-10-06 (historical).** The
owner reported that the director completed the approved kit-local installation
without system-level package changes. Chromium's first mirror returned HTTP 400;
Playwright's built-in fallback succeeded. After the toolkit moved to
`tools/cmo-copilot`, a local offline verification returned `ready`, with no
missing tools and `resume_film_task` as its next action. Package versions, media
encoders, Chromium launch and the Hyperframes CLI passed. The owner then reported
that the other director Chat recognized the new location and retained its setup
checkpoint without reinstalling. No film or cut had been selected at that checkpoint.

That initial setup-only checkpoint did not cover speech, rendering or human
review. Later local workflow results appear in Validation Status above. Those
results do not establish readiness on another Mac or grant permission to process
your material. This guide authorizes no downloads or media processing by itself.

**Your job is to answer approval questions, not run commands.** If your Mac needs
IT-managed prerequisites, the director should explain exactly what to request.
If setup fails or the director asks you to write scripts or JSON, stop and tell
the sender what happened. Do not disable security controls to proceed.

### 4. Start or Resume Your Film

Once the director confirms setup verification passed, continue your original
film task if you already chose one. Otherwise, the director should ask whether
you want to start a new film or resume an existing film, not assume a resume.
`resume_film_task` means return to the filmmaking conversation after setup; it
does not require a previously saved film. A first-time user needs no existing
project folder. Do not substitute an old demo or earlier accepted cut.

#### Start With Material You Already Have

For a new film, the director should ask this before a detailed briefing interview:

> Do you have a PowerPoint deck, PDF, document, product brief, approved web page or other source material we should start from? Share only material your organization permits you to use with Copilot; tell me which source should guide the film if there are several.

You do not need to rewrite an existing deck into a brief. If you have already
provided material, the director should acknowledge it instead of asking again.
Confirm which files/pages it may read, and which source is authoritative when
you have several. Permission to read does not grant permission to publish.

The director operates the packaged `scripts/read_source.py` reader; you do not
run it or prepare its arguments. It supports UTF-8 `.txt` and `.md`, `.docx` body
text, `.pdf` page text and ordinary unencrypted `.pptx` slide text. PDF uses
pypdf 6.19.0 in the kit's Python environment; setup checks its exact version and
any missing-package installation needs your approval. The other formats use the
Python standard library. Approve the exact file and all or selected sections.
PDF references retain original page numbers; DOCX references identify body
paragraphs/tables, not rendered pages. Text/Markdown is one section with a line
reference. The reader preserves source order and paragraphs, reports
empty sections, and does not save an extract or follow external links.

The result includes a source ID, byte hash and slide/line references. Its status
is `extracted_not_reviewed`: readable text is not a fact-check or publication
approval. This is text access,
not visual inspection, OCR or chart interpretation.
Notes stay excluded by default. After separate notes approval, the director can
include speaker notes for selected PPTX slides, retaining their slide references
and reporting empty notes. This does not permit saving notes, reviewer calls or
publication. DOCX body reading does not include footnotes or endnotes.
Synthetic tests passed for this reader; your actual file must still be read
successfully before the director can claim to have used it. The reader stops
on unsafe, malformed, encrypted, changed or oversized inputs rather than silently
returning partial content. Limits are 64 MiB input and 256 KiB complete output.

PDF parsing has a 20-second deadline. Encrypted PDFs and unsupported DOCX body
structures stop with an explanation. Scanned-document OCR remains outside this
reader's scope; footage-frame OCR is a separate operation. DOCX headers,
footers, comments, notes and tracked-change resolution
are not included; the director must retain these access gaps.

Audio memo transcription, DOCX footnote/endnote extraction, scanned-document OCR
and additional import formats are outside the agreed source-reader scope.
If a file is unreadable, the director explains the specific limitation and asks for an
approved text export or relevant pasted excerpts. It must not invent an extractor,
silently install converters, widen your approved scope or use an external service.

The next steps should be:

1. Read the permitted material and keep source IDs, titles/versions and
   slide/page/section references in Chat. Flag missing or conflicting evidence.
2. Propose a brief covering the audience, takeaway, story arc, runtime/tone and
   visual approach. Distinguish source statements from suggested creative choices.
3. Ask one compact set of unresolved questions and have you confirm or correct
   the brief. Do not ask you to repeat facts already present in the sources.
4. Take the creative lead on a screenplay and visual plan, then propose a bounded
   fact-checker review with its scope and estimated cost before asking permission.

An authoritative source is the basis you selected, not automatic proof that every
claim is current or correct. The director must retain qualifications and ask
about conflicts rather than silently choose a convenient version.

If you already supplied a brief in this Chat, do not repeat it. Only if you
choose to resume an existing film in a new Chat, give the director your authorized
saved handoff's location; it must not invent missing text or retrieve it from
chat logs.

If you have no source material, send a message such as:

> I have no source material. My audience is [audience], and the main thing they should understand is [message]. Propose a brief and sensible creative defaults for me to confirm. Keep the verified setup; do not generate media or run specialist reviews until I separately approve them.

Replace the bracketed words with your idea. The director should recommend
creative details such as the closing line and visual labels, not require you to
write every part of the film. Review the proposed narration and visual plan before approving speech
processing and render attempts. Watch the resulting film locally, request a
change if needed, then confirm acceptance and a local delivery folder.

For all three forms, the director builds the plan and operates the tools from
your approved story. It must not ask you to write JSON, scripts or an editor.
You may choose voice/pace and pronunciation substitutions, which leave display
text and caption spelling intact. The director requests exact speech consent,
then offers the current cut with captions, chapters and timestamped notes.
Tell it whether you actually watched, listened and completed privacy review,
and whether you accept or reject that cut. Opening playback is not watch/listen
proof. Rejection can be saved; it never authorizes delivery. Permission to save
notes or a restart checkpoint remains separate from permission to process media.

For the animated HPE demonstration, provide a local folder of licensed HPE
Graphik fonts when asked. The kit cannot grant font rights or download those fonts.

**You can stop reading here and continue in Chat.** The remaining sections are
reference material for the agent and anyone troubleshooting the kit, not commands
you need to perform yourself. This colleague workflow still needs its acceptance
run; report any point where these instructions do not match what you see.

Do not share secrets or material your organization has not approved for Copilot.
Copilot sees the text you provide. Approved narration goes to Edge TTS; local rendering does not need
network access. The kit supplies no organization-wide privacy or license clearance.

## What the Agent Does

### Your Review Team

You stay with the director; you do not need to switch agents or prepare review
files. The director explains each review, gets permission for billed calls,
supplies cleared evidence and brings the findings back to you.

| Specialist | Review Stage | Important Limit |
| --- | --- | --- |
| `cmo-fact-checker` | Script and source references before narration approval | References are not proof; no screenplay approval authority. |
| `cmo-sync-editor` | Measured narration/caption/visual timing before final acceptance | Timing receipts cannot replace watching and listening. |
| `cmo-privacy-reviewer` | Cleared risk summaries from actual scoped OCR receipts and human inspection notes before final acceptance | No raw-media access; frame OCR is not full-recording inspection or privacy clearance. |
| `cmo-producer` | Exact-cut acceptance, checks, findings and preservation before delivery | Proposes the handover; cannot invent acceptance or claim files were delivered before copying. |

Missing evidence remains missing. If a specialist cannot run, the director must
name that failure, not pretend to have performed the review itself. Findings
stay open until you give a disposition. Changing the script or cut invalidates
affected reviews; the director requests any needed re-review permission.
No reviewer can authorize production, grant a font license or approve publication.

### Local Tools

The director resolves `tools/cmo-copilot` relative to this workspace,
verifies its local source files and handles the CLI below. It preserves approved
text and previous cuts, stops on missing tools or permission, and asks for
specific owner decisions. It must not install a plugin, change hooks or select
another agent to evade a denial.

Before production, the director runs the no-download check, explains missing
tools, obtains scoped permission, installs, verifies and resumes your original
task. Declining an install does not erase your brief or previous cuts. Existing
film inspection and delivery need only Node and local files, not a full install.

Setup requires macOS, Python 3.10+, Node 24+ with npm and FFmpeg/ffprobe. The
author used Python 3.14.4, Node 25.6.1 and FFmpeg 9.0.2. Missing system tools can
be installed through **existing approved Homebrew**; this kit does not bootstrap
Homebrew or bypass administrator controls. Local setup installs Edge TTS 7.2.8,
Playwright 1.42.1, Chromium and Hyperframes 0.8.62. It runs dependency install
scripts, including native dependencies, inside the approved setup scope.

The kit-local installation path passed from a clean extraction using the
author's existing system prerequisites. Homebrew installation and a second Mac
remain untested. Direct package versions are pinned; the full dependency closure
is not locked. The freshly downloaded Chromium 123.0.6312.4 (build 1105) passed
both renders with Playwright 1.42.1. The installer used Playwright's built-in
fallback mirror after the first mirror returned HTTP 400; no command was rerun.

The explainer renderer supports subject-specific vector states as plates with
timed fades. Diagram and footage plans use the existing Hyperframes branch;
the plan's form selects it. Accepted starting suggestions remain HPE text branding,
simple fade-out/fade-in, readable media and a 2:1 media/notes layout when useful.
The single-story animated demo is not a general motion engine. No font is bundled.
Licensed assets require separate approval; installation grants no asset rights.
Hyperframes CLI checks do not prove browser compatibility or film acceptance.
Telemetry suppression is not a network sandbox or privacy certification.

## Agent Command Reference

### Setup

In every terminal call, replace `/absolute/path/to/kit` with the resolved
absolute path of the extracted kit. Submit the literal quoted script path,
not a relative name or a shell variable from an earlier call. The setup script
changes to its own folder once launched.

| Command | Meaning |
| --- | --- |
| `/bin/bash "/absolute/path/to/kit/setup.command" --check` | Read-only inventory; JSON reports missing tools and next action. Exit 2 means setup is required. |
| `/bin/bash "/absolute/path/to/kit/setup.command" --install-system --approve-downloads` | Only after system-install consent: install missing prerequisites using existing Homebrew. |
| `/bin/bash "/absolute/path/to/kit/setup.command" --install --approve-downloads` | Only after local-download consent: create `.venv`, install packages and Chromium, then verify. |
| `/bin/bash "/absolute/path/to/kit/setup.command" --verify` | Check required encoders and launch Chromium and the Hyperframes CLI under a deny-network sandbox. No TTS or film render. |

The approval flag is not an authentication mechanism. The agent must obtain
actual consent first. Without it, interactive setup asks for INSTALL;
noninteractive setup stops before mutation with `CONSENT_REQUIRED`.
`tools_present` means files/versions only. `ready` means offline execution checks
passed, **not** speech-service access, a rendered film, asset licensing or human
acceptance. A system install can exit 2 because local packages remain missing;
read the JSON next action before reporting an installation failure.

If setup stops, retain the completed environment and displayed phase. Diagnose
the cause and get permission before retrying downloads. Never delete an existing
environment to make the check pass. A `.setup-lock` prevents concurrent local
installs; confirm the earlier process has stopped before requesting permission
to remove a stale lock. Never disable Gatekeeper or other controls.

### Film Commands

Run commands from the resolved tools directory. Use verified executable paths;
all reel and output paths are absolute, explicitly chosen local locations.
The agent prepares inputs. Do not ask the filmmaker to edit data files.

### Editorial Work

Use `scripts/cmo.py init --root <new-project> --project-id <id> --film-id <id>
--form <diagram|footage|explainer>` with Python, only after project-save consent.
Read project state with `status --root <project>` and
`history --root <project>`. The script never overwrites an existing project.
The legacy `doctor` reports production as unqualified; this is not a missing
plugin to install. Do not alter its disabled production commands.

Use `validate --root <project>` with stdin JSON `{"document": document}`.
The document is `cmo-screenplay-markdown-1` with `text`, `sources`, and an empty
`approvals` list. Read the bundled `scripts/screenplay_validator.py` when preparing
the exact grammar and preserve stable source/scene/sentence IDs. Resolve every
CHECK before screenplay approval and production. The existing `plan --root
<project>` command is explainer-only: use that same envelope after latest
validation passes, then attach custom illustrations. Save inputs only with permission.

| Form | Director-Operated Existing API |
| --- | --- |
| Diagram | `buildDiagramPlan(input)` / `validateDiagramPlan(plan)` in `packs/diagram/plan.mjs`: source-bound sentences, ordered cues and explicit node/connection geometry. |
| Footage | `buildFootagePlan(input)` / `validateFootagePlan(plan)` in `packs/footage/plan.mjs`: approved recording paths, hashes/metadata, excerpts, crops and annotations. |
| Illustrated explainer | `attachIllustrations(existingPlan, illustrations)` / `validateStagePlan(plan)` in `packs/explainer/plan.mjs`: attach subject-specific `cmo-vector-1` states to the editorial plan, recomputing bindings. |

The director reads the actual form contracts and authors the inputs from the
approved screenplay, never hand-edits fingerprints or asks the owner for JSON.
Illustrations support rect/circle/polyline/text with one initial state plus one
per cue, not arbitrary scripts or a new image service. Do not write an ad hoc
extractor or ad hoc editor; use the existing source reader and plan APIs.

All three HPE formats use the shared HPE header and chapter footer in
`packs/shared/brand.mjs`: the green rectangle and HPE wordmark, film title,
chapter label and chapter count. Keep the footer above the separate caption band.
Do not invent a product name, legal disclaimer or per-format brand frame.
Diagram content and footage display areas fit inside the reserved regions;
footage source crops and source timing do not change to make room for branding.

For the approved HPE treatment, set `presentation: 'hpe'` on the `cmo-vector-1`
illustrations before attaching them. It keeps the HPE rectangle and wordmark at
the top, with a forest background, white headings and green emphasis. It uses
HPE Graphik and adds no product name. Pass an authorized local `assets` directory
to `illustratePlan`, or `--assets` to the artwork CLI, containing
`fonts/HPEGraphik-Regular.otf`, `fonts/HPEGraphik-Medium.otf` and
`fonts/HPEGraphik-Bold.otf`. Capture loads those files locally, verifies the
rendered glyphs use Graphik, and rejects missing, invalid or substituted fonts.
It does not download fonts or copy font binaries into the output or shared kit.
Diagram and footage `finishPlan` also require the authorized `assets` directory
(`--assets` for the render CLI). These renderers stage fonts locally during
Hyperframes execution, remove those copies afterward, and record font hashes.
Missing or invalid assets stop rendering; the kit does not supply licensed fonts.
Explainer reveal dissolves now begin on or after their measured spoken cue;
chapter dissolves retain their existing timing. Stage the authored states so
objects build within a stable scene and hold while the narration explains them.

Footage privacy uses `buildFootagePrivacyReport` / `runFootageOcr` in
`packs/footage/ocr.mjs`, not an invented CLI. It requires exact-plan
`ocrConsentFor`, approved excerpt scope and hash-bound local frames. Only approved
frames are covered; provenance remains operator-supplied, not verified, and
human clearance remains not_recorded. Obtain separate local frame access and
processing consent. Send only cleared bounded summaries to reviewers, not raw
OCR/images. Swift toolchain execution remains unverified; a failed local OCR
operation must not become an automatic privacy pass.

### Authorized Production

The following are separate operations of `packs/explainer/produce.mjs`, run with
Node and approved plan JSON on stdin. Never execute them as an automatic batch.

| Operation | Required Arguments |
| --- | --- |
| `--operation narrate` | `--python`, `--ffmpeg`, `--ffprobe`, new `--output`, `--consent-for` from `narrationConsentFingerprint(plan, speechConfig)`; optional `--speech-config` and `--previous-narration` |
| `--operation artwork` (explainer) | `--playwright`, `--chromium`, new `--output`, `--artwork-consent-for` matching `input_fingerprint` |
| `--operation render` (explainer) | `--narration`, `--plates`, `--ffmpeg`, `--ffprobe`, new `--output`, `--render-consent-for` matching `input_fingerprint`; optional `--speech-config` |
| `--operation render` (diagram/footage) | Same narration/encoder/output/render-consent arguments, but absolute `--node`, `--hyperframes`, `--browser`, `--assets` replace `--plates`; footage also needs `--asset-consent-for` matching `input_fingerprint` |

Use setup's reported paths. Obtain exact narration/provider/voice/rate permission
before Edge TTS and bounded attempts before synthesis or rendering. Keep browser
capture and rendering offline with the approved local isolation mechanism; the
author used macOS `sandbox-exec` with `(version 1)(allow default)(deny network*)`.
This is network isolation, not a filesystem confidentiality boundary.

`--speech-config` takes a serialized JSON argument, not a file path, with optional
`voice`, `rate` and `substitutions` (each exactly `display` and `spoken`). Defaults
are en-US-AndrewMultilingualNeural and +2%. Normalize via `normalizeSpeechControls`
in `packs/explainer/speech-controls.mjs`; compute `narrationConsentFingerprint`
from `packs/explainer/narration.mjs` for the approved plan/settings. Only default
controls reuse input_fingerprint as speech consent. Substitutions change spoken
text, not display text, source references or captions. Timing maps back to display
words; `measured_not_listened` is not proof of pronunciation or TTS listening.

Render can inherit the saved narration's speechConfig by omitting --speech-config;
an explicit override must match the audio requests. For authorized revisions,
--previous-narration names the prior narration directory, not the delivery folder.
Only unchanged scene identity/text/voice/rate/engine/fingerprint with verified audio
and word hashes qualifies for reuse, and only into a new output. Changed speech
needs new bounded TTS consent. Read narration.json for reusedSceneIds and
synthesizedSceneIds; preserve every earlier cut. Visual-only changes still need
new artwork/render consent and a new exact-cut review. Never reset saved controls
to defaults during finish or imply that reuse itself grants permission.

### Optional Animated Demonstration

Use `examples/signal-to-decision.plan.json` only when the filmmaker chooses
**From Signal to Decision**, a fictional three-scene workflow with no product
claims. Its `source-1` identifies the fictional scenario, not product evidence.
Never substitute it for the owner's screenplay. Keep the supplied fingerprints,
qualification limits and narration intact; changed stories need the editorial
validation path above, not edited demo hashes.

The agent runs the existing narrate, artwork and render operations above using
this plan, each with permission, to create a **baseline cut**. Budget three speech
requests, one artwork capture and one baseline render. The animated demonstration
then needs one additional render, reusing the baseline narration without new TTS:

```bash
node packs/explainer/revision.mjs --first-cut "$BASELINE" --output "$NEW_CUT" \
   --assets "$APPROVED_ASSETS" --playwright "$PLAYWRIGHT" --chromium "$CHROMIUM" \
   --ffmpeg "$FFMPEG" --ffprobe "$FFPROBE" --consent-for "$INPUT_FINGERPRINT"
```

Run that command inside the approved deny-network sandbox. Paths must be
absolute. Before rendering, check that the baseline retains `plan.json`,
`timing.json`, `render-report.json`, `film.mp4`, `voice-normalized.wav`,
`captions.srt`, `captions.vtt` and `chapters.ffmetadata`. Always point `--first-cut`
to that complete baseline, not a delivery folder or an earlier animated cut.
The assets folder must contain `fonts/HPEGraphik-Regular.otf`,
`fonts/HPEGraphik-Medium.otf` and `fonts/HPEGraphik-Bold.otf`, with permission to
use them. Check paths without reading font bytes into model context.

Ask whether to include a product. Omit `--product` for HPE only; supported
values are `OpsRamp`, `GreenLake` and `Morpheus`. The renderer verifies layout,
fonts, two real browser interactions, output metadata, full decode and loudness.
Preserve all prior cuts. The clean-extraction rehearsal produced 1,057 frames
(35.23 seconds), passed full decode and loudness checks, recorded two browser
interactions and zero external capture requests. This is technical evidence on
one Mac, not a substitute for watching each newly generated film. Inspect and review
the resulting animated cut before any delivery. Do not silently fall back to
static plates or substitute assets while claiming the same result.

### Review and Delivery

Use `--operation inspect --cut <cut>` with no stdin. It returns the file hashes
and `cutFingerprint`, checking current bytes against the prior render report
without repeating the decode. Open the MP4 in the local OS player, not in Chat.

For an approved local review page or saved notes, use separate operations:

```bash
node packs/explainer/produce.mjs --operation review-page --cut "$CUT" --output "$PAGE_OUTPUT" --save-consent-for "$CUT_FINGERPRINT"
node packs/explainer/produce.mjs --operation review-notes --cut "$CUT" --output "$NOTES_OUTPUT" --save-consent-for "$CUT_FINGERPRINT"
```

review-page references the existing MP4 and chapters from timing.json when
present. It embeds hash-verified VTT text as a page-local Blob so captions load
from disk without weakening browser security. Local playback, captions, chapters
and notes have passed in installed Google Chrome on the validation Mac. Use
installed Chrome for this review path; VS Code's embedded preview and the pinned
rendering Chromium are not verified review players. Ask before installing a
missing browser, and retain the colleague-Mac acceptance check.

Close stdin with no input, or serialize optional
`chapters` and `notes`. It neither renders nor copies a new film. Timestamped notes,
actual named-reviewer findings and owner dispositions bind to the current cut.
review-notes stdin has exactly `schema_version: "cmo-review-notes-1"`,
`exactCutFingerprint`, `notes`, `findings`, `dispositions`; read
`packs/review/experience.mjs` for entry/timestamp/disposition fields. The director
prepares this packet from Chat or an approved page export; the owner need not edit
JSON. Exporting page notes also needs persistence consent. Saved notes report
`notes_recorded_not_approval`, not acceptance. Opening playback is not watch/listen
proof; player progress, notes and technical checks establish no human attestation.

After the owner's actual decision and permission to save it, use `--operation
review --cut <cut> --output <new-review-folder>`. Stdin contains exactly
`cutFingerprint`, `decision`, `reviewer`, `statement`, `watched`, `listened`,
`privacy`. decision is `accepted` or `rejected`; watched/listened are booleans
declared by the owner. privacy is `not_recorded`, `passed`, `not_applicable` or
`failed`; ask if unknown and retain the reason for not_applicable. Preserve the
owner's verbatim statement. Rejection is recordable, not deliverable. Never invent
approval, watch/listen evidence or replace a reviewed fingerprint.

Use `--operation deliver --cut <cut> --review <review.json>
--output <new-delivery-folder>` with no stdin. The destination's parent must
exist. The driver verifies and copies unchanged MP4, SRT, VTT, render report and
review, then writes a delivery manifest. Every cut and delivery uses a new folder.
Changed bytes require another review; no overwrite or implicit rebaseline.
Delivery requires accepted status, watched/listened both true and privacy passed
or not_applicable. Legacy or incomplete records block with `REVIEW_INCOMPLETE`,
rejection with `REVIEW_REJECTED`, changed bytes with `CUT_CHANGED`.

Receipts are operator-recorded and unauthenticated. Delivery carries the recorded
human review, not security-grade proof. `delivered_local` is not publication
approval; redaction remains `not_recorded` and `production_qualified` remains false.

### Actionable Failures

The director records the operation, actual code, affected scene/input if supplied,
and one next action in concise cleared text. No raw private diagnostics, fabricated
codes, automatic retry/download/provider switch or scope expansion.

| Actual Code | Next Action |
| --- | --- |
| BROWSER_UNAVAILABLE | Locate the approved executable browser; downloads need separate consent. |
| HPE_GRAPHIK_ASSETS_REQUIRED / HPE_GRAPHIK_FONT_UNAVAILABLE / HPE_GRAPHIK_FONT_INVALID | Locate the authorized local font assets; do not download or silently substitute fonts. |
| DIAGRAM_FRAME_FIT_FAILED / FOOTAGE_FRAME_FIT_FAILED | Reframe the authored content within the shared header/footer boundaries without expanding the approved recording crop. |
| SPEECH_VOICE_INVALID / SPEECH_RATE_INVALID / SPEECH_SUBSTITUTION_INVALID | Correct proposed controls and renew any changed speech consent. |
| SCHEMA / INVALID_FOOTAGE_PLAN / ILLUSTRATION_INVALID | Repair director-authored inputs against the existing module contract. |
| NARRATION_STALE / ARTWORK_STALE / STALE_FOOTAGE_PLAN | Rebuild affected inputs through their module; authorize required new outputs. |
| FOOTAGE_EXCERPT_TOO_SHORT | Select a longer approved excerpt for the scene, not a silent freeze/stretch. |
| FOOTAGE_ASSET_MISMATCH / SOURCE_CHANGED | Reconfirm changed source bytes and invalidate affected reviews. |
| FOOTAGE_OCR_EXECUTABLE_REQUIRED / FOOTAGE_OCR_PROCESS_FAILED | Resolve the local executable/toolchain blocker; privacy remains uncleared. |
| REVIEW_INCOMPLETE / REVIEW_REJECTED / CUT_CHANGED | Obtain a real complete review or revise and review the intended cut. |
| CHECKPOINT_STALE / CHECKPOINT_INPUT_CHANGED | Reconcile the project generation and input hashes. |
| OUTPUT_EXISTS | Preserve the output and choose a new destination. |

## Resume

The director saves only permitted content in the owner's one project folder;
you do not need to prepare files or JSON. Ask permission for approved script/plan,
source references, brief, review dispositions, paths, allowances and next action.
Never save chat-only text, raw media or credentials. Use existing checkpoint CLIs:

```bash
"$PYTHON" -I -B "$TOOLS/scripts/cmo.py" save-checkpoint --root "$PROJECT" --generation "$GENERATION" --approve-save
"$PYTHON" -I -B "$TOOLS/scripts/cmo.py" resume-checkpoint --root "$PROJECT" --generation "$GENERATION" --approve-read
```

Save stdin has exactly `approved_script`, `plan`, `source_references`; script/plan
are nonempty strings or objects. Each source has source_id, absolute path and
sha256. Keep any permitted brief/ledger/next action with the approved document in
the approved_script object, not invented CLI fields. Choose a new generation
(ASCII letters/digits/_/-, 1-80 characters), preserve previous generations and
retain returned hashes. Saving does not validate meaning or grant speech consent.

Resume needs separate approval to read saved inputs and hash-check referenced
sources. Stdin is empty or contains only `expected_hashes` for approved_script,
plan and source_references. The CLI verifies the latest generation, project
state, checksums, saved input hashes and source bytes. Changed/missing inputs stop
reuse. Semantic validation remains delegated to the form module: revalidate the
restored plan/script, then inspect any cut hashes before reusing review receipts.
Continue the recorded next action without repeated brief questions or spending
attempts/review calls to demonstrate resume. Saved consent is not authenticated
or renewed. If persistence was declined, explain fresh Chat recovery limits;
never retrieve chat-only content from logs. Fresh Chat resume passed for the
existing acceptance films on the author's Mac; recipient setup still needs its
own check and does not inherit access to someone else's sources.

Fonts, private sources, generated films and credentials still need their own
sharing approval. File hashes detect changes; they do not authenticate the sender.

## Colleague Acceptance

The existing films have already exercised production, restart, revision, human
review and local delivery. Do not repeat that work to check the kit handoff.

Open a clean kit copy in a separate VS Code window and fresh director Chat.
Confirm that the director appears, finds the bundled tools, explains any missing
prerequisites and completes setup verification after any required installation
approval. Stop there: no new sources, narration, reviewer calls or films are
needed for this setup check. Record the actual result or blocker.

When another Mac is unavailable, this check can run in a separate session on
the same Mac. Label it accurately: it verifies the clean-copy handoff, not a
second Mac or an independent colleague's experience. Production and processing
permissions never transfer from the author's films to a recipient's new work.

If the agent is absent, confirm the whole workspace folder is open and trusted
under your organization's policy. If a tool is denied, retain that denial and
ask the maintainer; do not disable controls. If setup fails, retain the displayed
error for the maintainer. Do not forward private screenplay text with diagnostics.