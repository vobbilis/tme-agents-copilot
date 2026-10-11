---
title: TME Agents
description: Make narrated diagram films, footage films and illustrated explainers in GitHub Copilot Chat.
---

# TME Agents

**Your sources. Your story. A director in Copilot Chat.**

Turn approved slides, documents, ideas or recordings into narrated films with
captions. Describe what you want, agree on the story, then review and refine the
result. The director operates the bundled tools; you make the creative decisions.
You do not need to write code, prepare JSON or install a custom Copilot plugin.

## What you can make

| Film form | Use it for | Start with |
| --- | --- | --- |
| **Diagram films** | Architecture, processes and flows | An explanation of the system and its relationships |
| **Footage films** | Product demos and recorded walkthroughs | Approved local recordings and the moments you want to show |
| **Illustrated explainers** | Concepts and stories told through illustrated scenes | An idea, brief, deck or document |

The workflow covers briefing, screenplay, narration, production, review,
revision and local delivery of an **MP4 with SRT and VTT captions**.

## Before you start

- **A Mac** with [Visual Studio Code](https://code.visualstudio.com/) and your
  organization's approved GitHub Copilot account.
- **Access to this repository.** It is private; ask the owner for access if
  GitHub shows a 404 or cloning fails with a permission error.
- **An internet connection** for initial downloads, Copilot and approved speech
  generation. The small kit download does not include its installed dependencies.
- **Permission to use your material.** Bring only sources your organization
  permits Copilot to receive, and provide local paths for recordings.
- **Authorized font assets.** The current branded renderers require local
  HPE Graphik Regular, Medium and Bold fonts. Obtain them through your approved
  team or licensing channel; this kit neither supplies nor downloads them.

## Get started

### 1. Clone and open the kit

In VS Code, press **Cmd+Shift+P**, choose **Git: Clone**, and paste:

```text
https://github.com/vobbilis/tme-agents-copilot.git
```

Choose a local destination, then open the cloned **tme-agents-copilot** folder.
Approve workspace trust only if you trust the source and your policy permits it.

Prefer a download? Use **Code > Download ZIP** on GitHub, extract it, and open
the extracted folder in VS Code. **Choose either clone or download; you do not
need to clone and then unzip another kit.**

Open the whole folder containing [START-HERE.md](START-HERE.md),
[setup.command](setup.command) and [.github/agents](.github/agents), not a
subfolder or an individual file. If VS Code needs Git or other managed software,
ask IT for the approved installation.

### 2. Open your director

Open **Copilot Chat** and select **cmo-chat-director** in the agent picker.
Sign in with your Copilot-enabled account if prompted.

Only the director belongs in your picker. It can call its fact, timing, privacy
and production specialists after explaining the scope and getting permission.
You do not need to switch between agents yourself.

### 3. Check setup

Send this in the director's Chat:

```text
Help me set up this kit. Check the local tools and explain anything missing.
Ask before downloading or installing anything. Do not generate narration,
artwork or video, or call specialist reviewers yet.
```

Answer the director's questions and approve only the installation scope you
understand and are permitted to authorize. Wait for setup verification to report
**ready**, then continue in the same Chat.

<details>
<summary>What setup checks</summary>

The kit requires macOS, Python 3.10+, Node 24+ with npm, and FFmpeg/ffprobe.
With permission, setup installs kit-local speech, browser and rendering tools,
including Edge TTS, Playwright/Chromium and Hyperframes.

Missing system prerequisites require an existing approved Homebrew installation
or help from IT. The kit does not install Homebrew or bypass workstation controls.
The director handles commands; you do not need to run the setup scripts yourself.

**ready** means the offline tool checks passed. It does not certify a film,
verify speech-service access or grant font or source-material rights.

</details>

## Make your first film

Use these prompts one at a time. Replace the bracketed parts with your details,
then answer the director's questions before moving on. When you have already
supplied information, continue from that point instead of repeating the brief.

### Shape the story

```text
Help me make a film about [topic] for [audience], about [duration] long.
My source material is at [local file paths], or I can describe the idea.
Ask which material you may read. Recommend a film form, then propose a brief,
narration and visual plan for me to review. Ask before saving project files.
```

Text, Markdown, PowerPoint slide text, PDF page text and Word document body text
can inform the story. This is not an automatic recreation of a slide deck's
layouts or animations. Scanned documents and audio transcription need an
approved text alternative; see the [full guide](START-HERE.md) for reader limits.

### Make the agreed film

Once you agree on the story and visual plan, send:

```text
Use the story and visual plan we agreed on. Explain the required narration,
rendering and specialist-review operations, including their scope and any
estimated costs. Ask for the necessary permissions before running them.
Then give me the resulting cut to watch and listen to.
```

The director may ask about voice, pace, pronunciation, recordings or authorized
font assets. Installation approval does not approve these later operations.

### Request a revision

Watch the film with sound. Describe a change in ordinary language, for example:

```text
At [timestamp or scene], change [what needs changing] to [what I want].
Keep the previous cut. Explain which steps need to run again and ask before
processing. Reuse unchanged work where the existing tools support it.
```

### Review and take delivery

```text
Help me record my decision and actual watch/listen and privacy-review results
for this exact cut. If I accept it and the required reviews are complete,
ask permission to deliver the MP4 and captions to [local delivery folder].
Do not upload or publish anything.
```

Record what you actually reviewed. Opening the film is not a full watch/listen
review, and approval of an earlier cut does not approve a revised one.

### Come back later

Before leaving, ask the director to save a checkpoint and a handoff, with your
permission. In a fresh director Chat, use:

```text
Resume my film from [saved handoff path]. Ask before reading saved material.
Use the existing checkpoint, check for changed inputs, and tell me the next
unfinished step. Do not repeat completed processing or assume earlier approvals
apply to a changed cut.
```

## Where your work goes

- **Copilot handles the conversation and reasoning.** Only provide text and
  evidence your organization permits it to receive; do not paste raw recordings,
  screenshots or credentials into Chat.
- **Edge TTS handles separately approved narration text.** Speech generation
  uses an external service, not an offline voice engine.
- **Rendering and delivery run locally.** The director asks before accessing
  assets, saving work or running processing. You choose the local delivery folder.
- **Human approval stays with you.** Specialist findings support your decision;
  they do not grant licensing rights, privacy clearance or publication permission.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| GitHub shows 404 or clone access fails | Confirm repository access and the GitHub account you are using. |
| Copilot is missing | Install the official GitHub Copilot extension if policy allows, or ask IT. |
| The director is missing | Confirm you opened the whole kit folder. If it still does not appear, tell the sender; do not install an unrelated plugin. |
| Setup stops or reports missing tools | Ask the director to explain the failed phase. Preserve completed files and approve any retry separately. |
| Rendering reports missing Graphik fonts | Provide the authorized local font assets. Do not download or substitute fonts to bypass the check. |
| The director asks you to write scripts or JSON | Tell it to use the packaged tools and handle the technical inputs itself. Report a missing capability instead of inventing a workaround. |

## What has been verified

All three film forms completed local rendering, owner watch/listen review,
revision, fresh-Chat resume and local delivery on the author's Mac. A clean-copy
setup in a separate fresh Chat on the **same Mac** returned **ready** on
2026-10-10.

Another Mac and optional Swift OCR compilation remain unverified. Recorded
review limitations remain; these checks are not blanket production or privacy
certification. The same kit and prompts do not guarantee identical films.

For detailed source support, tool commands and review requirements, read
[START-HERE.md](START-HERE.md).