from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PINS = {"edge_tts": "7.2.8", "pypdf": "6.19.0", "playwright": "1.42.1", "hyperframes": "0.8.62"}
BASE = ("python", "node", "npm", "ffmpeg", "ffprobe")
RUNTIME_FILES = tuple("tools/cmo-copilot/" + name for name in (
    "scripts/cmo.py", "scripts/read_source.py", "scripts/screenplay_validator.py",
    "scripts/explainer_plan.py", "schemas/explainer-plan.schema.json",
    "packs/explainer/produce.mjs", "packs/explainer/plan.mjs",
    "packs/explainer/narration.mjs", "packs/explainer/speech.mjs",
    "packs/explainer/speech-controls.mjs", "packs/explainer/synthesize.py",
    "packs/explainer/incremental.mjs", "packs/explainer/artwork.mjs",
    "packs/explainer/illustration.mjs", "packs/explainer/picture.mjs",
    "packs/explainer/finish.mjs", "packs/diagram/plan.mjs",
    "packs/diagram/diagram.mjs", "packs/diagram/composition.mjs",
    "packs/footage/plan.mjs", "packs/footage/assets.mjs",
    "packs/footage/composition.mjs", "packs/footage/ocr.mjs",
    "packs/review/records.mjs", "packs/review/experience.mjs",
))


def probe(arguments: list[str], root: Path) -> str | None:
    try:
        result = subprocess.run(
            arguments, cwd=root, capture_output=True, text=True, timeout=30, check=False,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1",
                  "PLAYWRIGHT_BROWSERS_PATH": str(root / ".browsers"), "DO_NOT_TRACK": "1",
                  "HYPERFRAMES_NO_TELEMETRY": "1"},
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def readiness(root: Path) -> dict[str, object]:
    checks: dict[str, dict[str, object]] = {}
    missing_files = [name for name in RUNTIME_FILES if not (root / name).is_file()]
    checks["kit_runtime"] = {
        "status": "missing" if missing_files else "present",
        "code": "KIT_RUNTIME_MISSING" if missing_files else "KIT_RUNTIME_FILES_PRESENT",
        "required_files": list(RUNTIME_FILES), "missing_files": missing_files,
        "action": "Restore the listed files from the current complete kit; preserve films, "
        "checkpoints and completed setup. Dependency installation cannot restore kit files."
        if missing_files else "Files present only; film engines remain unqualified.",
    }
    ocr_source = root / "tools/cmo-copilot/packs/footage/vision-ocr.swift"
    compiler = shutil.which("swiftc")
    ocr_code = "OCR_SOURCE_MISSING" if not ocr_source.is_file() else (
        "OCR_COMPILER_MISSING" if not compiler else "OCR_COMPILE_UNVERIFIED")
    optional_checks = {"ocr": {
        "status": "unavailable" if ocr_code != "OCR_COMPILE_UNVERIFIED" else "unverified",
        "code": ocr_code, "ready": False, "required": False,
        "source": str(ocr_source), "compiler": compiler,
        "action": {
            "OCR_SOURCE_MISSING": "Restore vision-ocr.swift from the current kit before OCR.",
            "OCR_COMPILER_MISSING": "Ask workstation support for an approved Swift compiler "
            "only if OCR is needed; no compiler installer is provided.",
            "OCR_COMPILE_UNVERIFIED": "Compiler presence is not readiness. Separately authorize "
            "and verify compilation of vision-ocr.swift before OCR; this check does not compile.",
        }[ocr_code],
    }}
    python = str(Path(sys.executable).resolve())
    checks["python"] = {"status": "present", "path": python, "version": platform.python_version()}
    for name in BASE[1:]:
        executable = shutil.which(name)
        output = probe(
            [executable, "-version" if name in ("ffmpeg", "ffprobe") else "--version"], root,
        ) if executable else None
        compatible = bool(output)
        if name == "node" and output:
            try:
                compatible = int(output.lstrip("v").split(".")[0]) >= 24
            except ValueError:
                compatible = False
        checks[name] = {
            "status": "present" if compatible else "missing_or_incompatible",
            "path": executable, "version": output.splitlines()[0] if output else None,
        }
    local_python = root / ".venv/bin/python"
    edge_version = probe(
        [str(local_python), "-I", "-B", "-c",
         "from importlib.metadata import version; print(version('edge-tts'))"], root,
    ) if local_python.is_file() else None
    checks["edge_tts"] = {
        "status": "present" if edge_version == PINS["edge_tts"] else "missing_or_incompatible",
        "path": str(local_python), "version": edge_version, "required": PINS["edge_tts"],
    }
    pdf_version = probe(
        [str(local_python), "-I", "-B", "-c",
         "from importlib.metadata import version; print(version('pypdf'))"], root,
    ) if local_python.is_file() else None
    checks["pypdf"] = {
        "status": "present" if pdf_version == PINS["pypdf"] else "missing_or_incompatible",
        "path": str(local_python), "version": pdf_version, "required": PINS["pypdf"],
    }
    for name in ("playwright", "hyperframes"):
        package = root / "node_modules" / name / "package.json"
        try:
            metadata = json.loads(package.read_text())
            version = metadata.get("version") if isinstance(metadata, dict) else None
        except (OSError, ValueError, KeyError, TypeError):
            version = None
        entry = "index.mjs" if name == "playwright" else "bin/hyperframes.mjs"
        entry_path = package.parent / entry
        checks[name] = {
            "status": "present" if version == PINS[name] and entry_path.is_file()
            else "missing_or_incompatible",
            "path": str(entry_path), "version": version, "required": PINS[name],
        }
    chromium = None
    if checks["node"]["status"] == checks["playwright"]["status"] == "present":
        chromium = probe(
            [str(checks["node"]["path"]), "-e",
             "process.stdout.write(require('./node_modules/playwright').chromium.executablePath())"],
            root,
        )
    checks["chromium"] = {
        "status": "present" if chromium and Path(chromium).is_file() else "missing_or_incompatible",
        "path": chromium,
    }
    missing = [name for name, check in checks.items() if check["status"] != "present"]
    missing_base = [name for name in missing if name in BASE]
    return {
        "schema_version": "cmo-setup-2",
        "status": "setup_required" if missing else "tools_present",
        "checks": checks, "missing": missing,
        "optional_checks": optional_checks,
        "next_action": "restore_kit" if missing_files else "install_system" if missing_base
        else "install_local" if missing else "verify",
        "system_packages": sorted({"node" if name in ("node", "npm") else "ffmpeg"
                                   for name in missing_base}),
        "platform": platform.system(), "production_qualified": False,
    }


def verify(root: Path, report: dict[str, object]) -> dict[str, object]:
    if report["missing"]:
        return report
    checks = report["checks"]
    assert isinstance(checks, dict)
    sandbox = "/usr/bin/sandbox-exec"
    if platform.system() != "Darwin" or not Path(sandbox).is_file():
        return {**report, "status": "verification_failed", "failure": "OFFLINE_SANDBOX_REQUIRED"}
    prefix = [sandbox, "-p", "(version 1)(allow default)(deny network*)"]
    encoders = probe(prefix + [str(checks["ffmpeg"]["path"]), "-hide_banner", "-encoders"], root)
    if not encoders or "libx264" not in encoders or " aac " not in encoders:
        return {**report, "status": "verification_failed", "failure": "MEDIA_ENCODERS_MISSING"}
    browser_check = (
        "const {chromium}=require('./node_modules/playwright');"
        "(async()=>{const browser=await chromium.launch({headless:true,args:"
        "['--disable-background-networking','--disable-component-update','--no-first-run']});"
        "try{const context=await browser.newContext({offline:true,serviceWorkers:'block'});"
        "const page=await context.newPage();await page.setContent('<title>CMO check</title>');"
        "if(await page.title()!=='CMO check')throw Error('BROWSER_CHECK');"
        "console.log('browser_verified')}finally{await browser.close()}})()"
        ".catch(()=>{process.stderr.write('BROWSER_CHECK_FAILED');process.exitCode=2})"
    )
    if probe(prefix + [str(checks["node"]["path"]), "-e", browser_check], root) != "browser_verified":
        return {**report, "status": "verification_failed", "failure": "BROWSER_LAUNCH_FAILED"}
    hyperframes = probe(
        prefix + [str(checks["node"]["path"]), str(checks["hyperframes"]["path"]), "--version"],
        root,
    )
    if not hyperframes or PINS["hyperframes"] not in hyperframes:
        return {**report, "status": "verification_failed", "failure": "HYPERFRAMES_CLI_FAILED"}
    return {
        **report, "status": "ready", "next_action": "resume_film_task",
        "verified": ["speech_package_version", "pdf_parser_version", "media_encoders", "offline_browser", "hyperframes_cli"],
        "not_verified": ["speech_service", "film_render", "licensed_assets", "human_review",
                 "swift_ocr_compilation", "swift_ocr_execution"],
    }


def main() -> int:
    if sys.argv[1:] not in ([], ["--verify"]):
        print("USAGE: setup_tools.py [--verify]", file=sys.stderr)
        return 2
    report = readiness(ROOT)
    if sys.argv[1:]:
        report = verify(ROOT, report)
    print(json.dumps(report))
    return 0 if report["status"] in ("ready", "tools_present") else 2


if __name__ == "__main__":
    raise SystemExit(main())