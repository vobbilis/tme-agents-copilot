#!/bin/bash
set -euo pipefail
trap 'printf "Setup stopped at line %s. Keep completed files; the agent can diagnose and resume.\n" "$LINENO" >&2' ERR

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cd "$ROOT"
MODE=${1:---install}
APPROVAL=${2:-}
if [[ $# -gt 2 || ( -n "$APPROVAL" && "$APPROVAL" != --approve-downloads ) ]]; then
  printf '%s\n' 'Usage: setup.command --check|--verify|--install|--install-system [--approve-downloads]' >&2
  exit 2
fi
case "$MODE" in --check|--verify|--install|--install-system) ;; *) exit 2 ;; esac
if [[ ! -f .github/agents/cmo-chat-director.agent.md || ! -f tools/cmo-copilot/scripts/setup_tools.py ]]; then
  printf '%s\n' 'KIT_ROOT_MISSING: extract the whole kit and open its top-level folder.' >&2
  exit 2
fi
if [[ $(uname -s) != Darwin ]]; then
  printf '%s\n' 'UNSUPPORTED_PLATFORM: this kit targets macOS.' >&2
  exit 2
fi
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$ROOT/.browsers"
export DO_NOT_TRACK=1
export HYPERFRAMES_NO_TELEMETRY=1
PYTHON=''
for candidate in python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null && "$candidate" -I -B -S -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
    PYTHON=$(command -v "$candidate")
    break
  fi
done
if [[ "$MODE" == --check || "$MODE" == --verify ]]; then
  if [[ -z "$PYTHON" ]]; then
    printf '%s\n' '{"schema_version":"cmo-setup-2","status":"setup_required","checks":{"python":{"status":"missing"}},"missing":["python"],"next_action":"install_system","system_packages":["python@3.14"],"remaining_checks":"require_python","production_qualified":false}'
    exit 2
  fi
  if [[ "$MODE" == --verify ]]; then
    exec "$PYTHON" -I -B -S tools/cmo-copilot/scripts/setup_tools.py --verify
  fi
  exec "$PYTHON" -I -B -S tools/cmo-copilot/scripts/setup_tools.py
fi

if [[ "$MODE" == --install-system ]]; then
  printf '%s\n' 'System setup installs missing Python, Node/npm and FFmpeg through existing Homebrew.' \
    'This downloads software and changes Homebrew-managed packages. It does not create films.' >&2
else
  printf '%s\n' 'Local setup downloads Edge TTS 7.2.8, pypdf 6.19.0, Playwright 1.42.1, Hyperframes 0.8.62,' \
    'their dependencies and Chromium into this kit. No narration or film is generated.' >&2
fi
if [[ "$APPROVAL" != --approve-downloads ]]; then
  if [[ ! -t 0 ]]; then
    printf '%s\n' 'CONSENT_REQUIRED: the agent must obtain approval for the stated download scope.' >&2
    exit 2
  fi
  read -r -p 'Type INSTALL to approve this scope, or press Enter to cancel: ' consent
  if [[ "$consent" != INSTALL ]]; then printf '%s\n' 'Cancelled. Nothing installed.'; exit 0; fi
fi
if [[ "$MODE" == --install-system ]]; then
  if ! command -v brew >/dev/null; then
    printf '%s\n' 'HOMEBREW_REQUIRED: ask workstation support to provide approved Homebrew or Python/Node/FFmpeg. Do not bypass administrator controls.' >&2
    exit 2
  fi
  packages=()
  if [[ -z "$PYTHON" ]]; then packages+=(python@3.14); fi
  if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0])<24?1:0)' || ! command -v npm >/dev/null; then packages+=(node); fi
  if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then packages+=(ffmpeg); fi
  if [[ ${#packages[@]} -gt 0 ]]; then brew install "${packages[@]}"; fi
  exec /bin/bash "$ROOT/setup.command" --check
fi

if [[ -z "$PYTHON" ]] || ! command -v node >/dev/null || ! command -v npm >/dev/null || ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  printf '%s\n' 'SYSTEM_SETUP_REQUIRED: run the check, obtain system-install approval, and install missing prerequisites first.' >&2
  exit 2
fi
node -e 'if(Number(process.versions.node.split(".")[0])<24)throw Error("NODE_24_REQUIRED")'
if [[ -e "$ROOT/.setup-lock" ]]; then
  printf '%s\n' 'SETUP_BUSY: another or interrupted setup owns .setup-lock; verify it has stopped before removing only that lock.' >&2
  exit 2
fi
mkdir "$ROOT/.setup-lock"
trap 'rmdir "$ROOT/.setup-lock"' EXIT
printf '%s\n' 'Phase: local Python environment' >&2
"$PYTHON" -m venv "$ROOT/.venv"
printf '%s\n' 'Phase: speech and source-reading dependencies' >&2
"$ROOT/.venv/bin/python" -m pip install -r "$ROOT/requirements.txt"
printf '%s\n' 'Phase: browser and Hyperframes dependencies' >&2
npm install --no-audit --no-fund
printf '%s\n' 'Phase: Chromium' >&2
"$ROOT/node_modules/.bin/playwright" install chromium
printf '%s\n' 'Phase: offline tool verification' >&2
"$PYTHON" -I -B -S tools/cmo-copilot/scripts/setup_tools.py --verify