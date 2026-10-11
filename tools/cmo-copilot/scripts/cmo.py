from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import platform
import re
import shutil
import stat
import sys
import tempfile
import time
from collections.abc import Iterator
from contextlib import ExitStack, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import TypedDict, cast

SPEC = importlib.util.spec_from_file_location(
    "cmo_screenplay_validator", Path(__file__).resolve().with_name("screenplay_validator.py")
)
assert SPEC is not None and SPEC.loader is not None
validator = importlib.util.module_from_spec(SPEC)

STATE_FILE = "cmo-project.json"
STATE_VERSION = "cmo-editorial-project-1"
MAX_STATE_BYTES = 16 * 1024 * 1024
FORMS = {"diagram", "footage", "explainer"}


class ProjectError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ProjectError("USAGE")


class ReadinessCheck(TypedDict):
    status: str
    code: str
    action: str


class ReadinessReport(TypedDict):
    schema_version: str
    status: str
    python_version: str
    platform: str
    checks: dict[str, ReadinessCheck]
    capabilities: dict[str, ReadinessCheck]
    production_qualified: bool


def _load_validator() -> None:
    if hasattr(validator, "validate_screenplay"):
        return
    try:
        assert SPEC is not None and SPEC.loader is not None
        SPEC.loader.exec_module(validator)
    except (OSError, ImportError, SyntaxError):
        raise ProjectError("PACKAGE_INCOMPLETE") from None


def readiness_report() -> ReadinessReport:
    package = Path(__file__).resolve().parent.parent
    current_platform = platform.system()
    python_compatible = sys.version_info[:2] >= (3, 10)
    platform_target = current_platform == "Darwin"
    package_present = all(
        (package / name).is_file()
        for name in (
            "plugin.json",
            "scripts/screenplay_validator.py",
            "packs/explainer/picture.mjs",
        )
    )
    checks: dict[str, ReadinessCheck] = {
        "python": {
            "status": "compatible_unqualified" if python_compatible else "unsupported",
            "code": "PYTHON_FLOOR_MET" if python_compatible else "PYTHON_UNSUPPORTED",
            "action": "Python 3.10+ required. Ask the maintainer for certified versions.",
        },
        "platform": {
            "status": "target_unqualified" if platform_target else "unsupported_target",
            "code": "MACOS_TARGET" if platform_target else "PLATFORM_UNSUPPORTED",
            "action": "macOS is the initial target; other platforms need separate qualification.",
        },
        "package": {
            "status": "present_unverified" if package_present else "incomplete",
            "code": "PACKAGE_FILES_PRESENT" if package_present else "PACKAGE_INCOMPLETE",
            "action": "Ask the maintainer to verify package integrity, not only file presence.",
        },
    }
    for tool in ("node", "ffmpeg", "ffprobe"):
        located = shutil.which(tool) is not None
        checks[tool] = {
            "status": "located_unverified" if located else "missing",
            "code": "TOOL_LOCATED" if located else "TOOL_MISSING",
            "action": (
                f"Ask the maintainer to verify the managed {tool} version."
                if located
                else f"Ask the maintainer to install the managed {tool} dependency."
            ),
        }
    checks["browser_fonts_voice"] = {
        "status": "not_checked",
        "code": "PACK_DEPENDENCIES_UNQUALIFIED",
        "action": "The maintainer must qualify browser, licensed fonts and voice dependencies.",
    }
    editorial_present = python_compatible and platform_target and package_present
    return {
        "schema_version": "cmo-readiness-1",
        "status": "blocked",
        "python_version": ".".join(str(part) for part in sys.version_info[:3]),
        "platform": current_platform,
        "checks": checks,
        "capabilities": {
            "editorial": {
                "status": "prerequisites_present" if editorial_present else "blocked",
                "code": "EDITORIAL_PREREQUISITES_PRESENT"
                if editorial_present
                else "EDITORIAL_BLOCKED",
                "action": "Editorial checks do not certify production or runtime safety.",
            },
            "production": {
                "status": "blocked",
                "code": "PRODUCTION_UNQUALIFIED",
                "action": "The maintainer must qualify film stages, human consent and isolation.",
            },
        },
        "production_qualified": False,
    }


def format_readiness(report: ReadinessReport) -> str:
    lines = ["CMO readiness", "", "Production: blocked", ""]
    for name, check in report["checks"].items():
        lines.append(f"{name}: {check['status']}. {check['action']}")
    lines.extend(
        [
            "",
            "Editorial: " + report["capabilities"]["editorial"]["status"],
            report["capabilities"]["production"]["action"],
            "No tools were executed, files changed, or network requests made.",
            "Tool presence does not certify a supported installation or authorize production.",
        ]
    )
    return "\n".join(lines)


def _encode(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode()


def _digest(value: object) -> str:
    return hashlib.sha256(_encode(value)).hexdigest()


def _is_digest(value: object) -> bool:
    return type(value) is str and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def _root(path: Path) -> Path:
    if not path.is_absolute() or path.is_symlink():
        raise ProjectError("ROOT_INVALID")
    return path.resolve()


@contextmanager
def _lock(root: Path) -> Iterator[None]:
    lock = root / ".cmo-lock"
    try:
        lock.mkdir(mode=0o700)
    except FileExistsError:
        raise ProjectError("PROJECT_BUSY") from None
    try:
        yield
    finally:
        lock.rmdir()


def _write(root: Path, state: dict[str, object], *, filename: str = STATE_FILE) -> None:
    payload = dict(state)
    payload.pop("checksum", None)
    payload["checksum"] = _digest(payload)
    encoded = _encode(payload)
    if len(encoded) > MAX_STATE_BYTES:
        raise ProjectError("STATE_FULL")
    descriptor, temporary = tempfile.mkstemp(prefix=".cmo-state-", dir=root)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, root / filename)
    finally:
        Path(temporary).unlink(missing_ok=True)


def _check_baseline(value: object) -> None:
    if value is None:
        return
    baseline = validator._record(value, {"sources", "sentences"})
    sources, sentences = baseline["sources"], baseline["sentences"]
    if type(sources) is not dict or not sources or type(sentences) is not dict or not sentences:
        raise ProjectError("STATE_INVALID")
    for source_id, digest in sources.items():
        validator._identifier(source_id)
        if not _is_digest(digest):
            raise ProjectError("STATE_INVALID")
    for sentence_id, value in sentences.items():
        validator._identifier(sentence_id)
        sentence = validator._record(value, {"scene_id", "source_ids"})
        validator._identifier(sentence["scene_id"])
        references = validator._items(sentence["source_ids"])
        for reference in references:
            validator._identifier(reference)
            if reference not in sources:
                raise ProjectError("STATE_INVALID")
        if len(set(references)) != len(references):
            raise ProjectError("STATE_INVALID")


def _load(root: Path, *, dir_fd: int | None = None) -> dict[str, object]:
    _load_validator()
    path = root / STATE_FILE
    if dir_fd is None and not path.exists() and not path.is_symlink():
        raise ProjectError("PROJECT_MISSING")
    try:
        descriptor = os.open(path if dir_fd is None else STATE_FILE,
                             os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                             dir_fd=dir_fd)
        with os.fdopen(descriptor, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ProjectError("STATE_INVALID")
            raw = stream.read(MAX_STATE_BYTES + 1)
        if len(raw) > MAX_STATE_BYTES:
            raise ProjectError("STATE_INVALID")
        state = validator._record(
            json.loads(
                raw.decode("utf-8"),
                object_pairs_hook=validator._unique_object,
                parse_constant=validator._reject_constant,
            ),
            {
                "schema_version",
                "root",
                "project_id",
                "film_id",
                "form",
                "baseline",
                "receipts",
                "checksum",
            },
        )
        payload = dict(state)
        checksum = payload.pop("checksum")
        if checksum != _digest(payload) or state["schema_version"] != STATE_VERSION:
            raise ProjectError("STATE_INVALID")
        if state["root"] != str(root) or state["form"] not in FORMS:
            raise ProjectError("STATE_INVALID")
        for field in ("project_id", "film_id"):
            if type(state[field]) is not str or not re.fullmatch(
                r"[A-Za-z0-9_-]{1,80}", state[field]
            ):
                raise ProjectError("STATE_INVALID")
        _check_baseline(state["baseline"])
        receipts = state["receipts"]
        if type(receipts) is not list:
            raise ProjectError("STATE_INVALID")
        previous_hash = None
        for sequence, value in enumerate(receipts, 1):
            receipt = validator._record(
                value,
                {
                    "sequence",
                    "stage",
                    "status",
                    "code",
                    "fingerprint",
                    "timestamp",
                    "elapsed_ms",
                    "previous_hash",
                    "hash",
                },
            )
            body = dict(receipt)
            digest = body.pop("hash")
            if digest != _digest(body) or receipt["previous_hash"] != previous_hash:
                raise ProjectError("STATE_INVALID")
            if type(receipt["sequence"]) is not int or receipt["sequence"] != sequence:
                raise ProjectError("STATE_INVALID")
            if receipt["stage"] != "validate" or receipt["status"] not in ("passed", "failed"):
                raise ProjectError("STATE_INVALID")
            if type(receipt["elapsed_ms"]) is not int or receipt["elapsed_ms"] < 0:
                raise ProjectError("STATE_INVALID")
            if type(receipt["timestamp"]) is not str:
                raise ProjectError("STATE_INVALID")
            stamp = datetime.fromisoformat(receipt["timestamp"])
            if stamp.tzinfo is None or stamp.utcoffset() != timezone.utc.utcoffset(stamp):
                raise ProjectError("STATE_INVALID")
            if receipt["status"] == "passed":
                if not _is_digest(receipt["fingerprint"]) or receipt["code"] is not None:
                    raise ProjectError("STATE_INVALID")
            elif (
                receipt["fingerprint"] is not None
                or type(receipt["code"]) is not str
                or not re.fullmatch(r"[A-Z_]{1,50}", receipt["code"])
            ):
                raise ProjectError("STATE_INVALID")
            previous_hash = digest
        return state
    except (OSError, ValueError, TypeError, RecursionError):
        raise ProjectError("STATE_INVALID") from None


def _status(state: dict[str, object]) -> dict[str, object]:
    receipts = cast(list[dict[str, object]], state["receipts"])
    return {
        "project_id": state["project_id"],
        "film_id": state["film_id"],
        "form": state["form"],
        "validation_status": receipts[-1]["status"] if receipts else "pending",
        "receipt_count": len(receipts),
        "production_qualified": False,
        "human_origin_verified": False,
        "truth_verified": False,
    }


def initialize_project(root: Path, project_id: str, film_id: str, form: str) -> dict[str, object]:
    root = _root(root)
    if form not in FORMS or not all(
        re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value) for value in (project_id, film_id)
    ):
        raise ProjectError("USAGE")
    root.mkdir(mode=0o700, exist_ok=True)
    with _lock(root):
        if any(path.name != ".cmo-lock" for path in root.iterdir()):
            raise ProjectError("ROOT_NOT_EMPTY")
        state: dict[str, object] = {
            "schema_version": STATE_VERSION,
            "root": str(root),
            "project_id": project_id,
            "film_id": film_id,
            "form": form,
            "baseline": None,
            "receipts": [],
        }
        _write(root, state)
    return _status(state)


def _snapshot(document: object) -> dict[str, object]:
    index = validator._index(document)
    return {
        "sources": {source_id: _digest(source) for source_id, source in index.sources.items()},
        "sentences": {
            sentence_id: {"scene_id": sentence.scene_id, "source_ids": sorted(sentence.source_ids)}
            for sentence_id, sentence in index.sentences.items()
        },
    }


def _preserve(current: dict[str, object], previous: object) -> None:
    if previous is None:
        return
    baseline = cast(dict[str, object], previous)
    sources = cast(dict[str, str], current["sources"])
    for source_id, digest in cast(dict[str, str], baseline["sources"]).items():
        if sources.get(source_id) != digest:
            raise ProjectError("SOURCE_CHANGED")
    sentences = cast(dict[str, dict[str, object]], current["sentences"])
    for sentence_id, sentence in cast(dict[str, dict[str, object]], baseline["sentences"]).items():
        revised = sentences.get(sentence_id)
        if revised is None:
            raise ProjectError("SENTENCE_DROPPED")
        if revised["scene_id"] != sentence["scene_id"]:
            raise ProjectError("SCENE_CHANGED")
        if not set(cast(list[str], sentence["source_ids"])).issubset(
            cast(list[str], revised["source_ids"])
        ):
            raise ProjectError("SOURCE_REFERENCE_DROPPED")


def validate_project(root: Path, document: object) -> dict[str, object]:
    _load_validator()
    root = _root(root)
    if not root.is_dir():
        raise ProjectError("PROJECT_MISSING")
    with _lock(root):
        state = _load(root)
        receipts = cast(list[dict[str, object]], state["receipts"])
        started = time.perf_counter()
        code = None
        fingerprint = None
        try:
            if (
                type(document) is dict
                and document.get("schema_version") == validator.MARKDOWN_SCHEMA_VERSION
            ):
                report = validator.validate_markdown(document)
                projection = validator.adapt_screenplay(document)["document"]
            else:
                report = validator.validate_screenplay(document)
                projection = document
            baseline = _snapshot(projection)
            _preserve(baseline, state["baseline"])
            state["baseline"] = baseline
            fingerprint = report["fingerprint"]
        except (validator.ValidationError, ProjectError) as error:
            code = error.code
        receipt: dict[str, object] = {
            "sequence": len(receipts) + 1,
            "stage": "validate",
            "status": "failed" if code else "passed",
            "code": code,
            "fingerprint": fingerprint,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
            "previous_hash": receipts[-1]["hash"] if receipts else None,
        }
        receipt["hash"] = _digest(receipt)
        receipts.append(receipt)
        _write(root, state)
    result = _status(state)
    if code:
        result["code"] = code
    return result


def plan_project(root: Path, document: object) -> dict[str, object]:
    state = _load(_root(root))
    if state["form"] != "explainer":
        raise ProjectError("FORM_UNSUPPORTED")
    receipts = cast(list[dict[str, object]], state["receipts"])
    if not receipts or receipts[-1]["status"] != "passed":
        raise ProjectError("VALIDATION_REQUIRED")
    if (
        type(document) is not dict
        or document.get("schema_version") != validator.MARKDOWN_SCHEMA_VERSION
    ):
        raise ProjectError("MARKDOWN_REQUIRED")
    validation = validator.validate_markdown(document)
    if validation["fingerprint"] != receipts[-1]["fingerprint"]:
        raise ProjectError("VALIDATION_STALE")
    spec = importlib.util.spec_from_file_location(
        "cmo_explainer_plan", Path(__file__).resolve().with_name("explainer_plan.py")
    )
    assert spec is not None and spec.loader is not None
    compiler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(compiler)
    return compiler.compile_plan(validator.adapt_screenplay(document), validation, state)


CHECKPOINT_VERSION = "cmo-checkpoint-1"
CHECKPOINT_INPUTS = {
    "approved_script": "approved-script.json",
    "plan": "plan.json",
    "source_references": "source-references.json",
}
MAX_SOURCE_BYTES = 512 * 1024 * 1024


def _checkpoint_record(path: Path | str, *, dir_fd: int | None = None) -> dict[str, object]:
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                             dir_fd=dir_fd)
        with os.fdopen(descriptor, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise ProjectError("CHECKPOINT_INVALID")
            raw = stream.read(MAX_STATE_BYTES + 1)
        if len(raw) > MAX_STATE_BYTES:
            raise ProjectError("CHECKPOINT_INVALID")
        value = json.loads(raw.decode("utf-8"),
                           object_pairs_hook=validator._unique_object,
                           parse_constant=validator._reject_constant)
        if type(value) is not dict:
            raise ProjectError("CHECKPOINT_INVALID")
        body = dict(value)
        checksum = body.pop("checksum", None)
        if not _is_digest(checksum) or checksum != _digest(body):
            raise ProjectError("CHECKPOINT_INVALID")
        return value
    except (OSError, ValueError, TypeError, RecursionError):
        raise ProjectError("CHECKPOINT_INVALID") from None


@contextmanager
def _checkpoint_directory(path: Path | str, *, dir_fd: int | None = None,
                          create: bool = False,
                          missing_code: str = "CHECKPOINT_INVALID") -> Iterator[int]:
    try:
        if create:
            try:
                os.mkdir(path, mode=0o700, dir_fd=dir_fd)
            except FileExistsError:
                pass
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                             dir_fd=dir_fd)
    except FileNotFoundError:
        raise ProjectError(missing_code) from None
    except OSError:
        raise ProjectError("CHECKPOINT_INVALID") from None
    try:
        yield descriptor
    finally:
        os.close(descriptor)


@contextmanager
def _checkpoint_scope(root: Path, *, create: bool = False
                      ) -> Iterator[tuple[dict[str, object], int]]:
    try:
        with ExitStack() as directories:
            root_fd = directories.enter_context(_checkpoint_directory(root.anchor))
            for component in root.parts[1:]:
                root_fd = directories.enter_context(_checkpoint_directory(
                    component, dir_fd=root_fd, missing_code="PROJECT_MISSING"))
            try:
                os.mkdir(".cmo-lock", mode=0o700, dir_fd=root_fd)
            except FileExistsError:
                raise ProjectError("PROJECT_BUSY") from None
            try:
                try:
                    os.stat(STATE_FILE, dir_fd=root_fd, follow_symlinks=False)
                except FileNotFoundError:
                    raise ProjectError("PROJECT_MISSING") from None
                state = _load(root, dir_fd=root_fd)
                with _checkpoint_directory("checkpoints", dir_fd=root_fd, create=create,
                                           missing_code="CHECKPOINT_MISSING") as directory:
                    yield state, directory
            finally:
                os.rmdir(".cmo-lock", dir_fd=root_fd)
    except (AttributeError, NotImplementedError):
        raise ProjectError("CHECKPOINT_UNSUPPORTED") from None


def _checkpoint_write(directory: int, state: dict[str, object], *, filename: str) -> None:
    payload = dict(state)
    payload.pop("checksum", None)
    payload["checksum"] = _digest(payload)
    encoded = _encode(payload)
    if len(encoded) > MAX_STATE_BYTES:
        raise ProjectError("STATE_FULL")
    temporary = ".cmo-state-" + os.urandom(16).hex()
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                         0o600, dir_fd=directory)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.rename(temporary, filename, src_dir_fd=directory, dst_dir_fd=directory)
    finally:
        try:
            os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError:
            pass


def _generation_name(generation: str) -> None:
    if type(generation) is not str or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", generation):
        raise ProjectError("USAGE")


def _checkpoint_inputs(request: object) -> dict[str, object]:
    try:
        value = validator._record(request, set(CHECKPOINT_INPUTS))
        for field in ("approved_script", "plan"):
            if type(value[field]) not in (str, dict) or not value[field]:
                raise ProjectError("CHECKPOINT_INPUT_INVALID")
            if type(value[field]) is str and not value[field].strip():
                raise ProjectError("CHECKPOINT_INPUT_INVALID")
        references = value["source_references"]
        if type(references) is not list or not references or len(references) > 1000:
            raise ProjectError("CHECKPOINT_INPUT_INVALID")
        identifiers = set()
        for reference in references:
            source = validator._record(reference, {"source_id", "path", "sha256"})
            validator._identifier(source["source_id"])
            if source["source_id"] in identifiers or not _is_digest(source["sha256"]):
                raise ProjectError("CHECKPOINT_INPUT_INVALID")
            identifiers.add(source["source_id"])
            path = source["path"]
            if (type(path) is not str or "\x00" in path or not Path(path).is_absolute()
                    or ".." in Path(path).parts):
                raise ProjectError("CHECKPOINT_INPUT_INVALID")
        encoded = json.dumps(value, allow_nan=False).encode("utf-8")
        if len(encoded) > MAX_STATE_BYTES:
            raise ProjectError("INPUT_TOO_LARGE")
        return value
    except ProjectError:
        raise
    except (ValueError, TypeError, RecursionError):
        raise ProjectError("CHECKPOINT_INPUT_INVALID") from None


def _source_hash(path: str) -> str:
    descriptor = None
    try:
        parts = Path(path).parts
        descriptor = os.open(parts[0], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        for component in parts[1:-1]:
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                            dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        source_descriptor = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                                    dir_fd=descriptor)
        with os.fdopen(source_descriptor, "rb") as stream:
            initial = os.fstat(stream.fileno())
            if not stat.S_ISREG(initial.st_mode) or initial.st_size > MAX_SOURCE_BYTES:
                raise ProjectError("SOURCE_UNAVAILABLE")
            digest = hashlib.sha256()
            total = 0
            while chunk := stream.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise ProjectError("SOURCE_UNAVAILABLE")
                digest.update(chunk)
            final = os.fstat(stream.fileno())
            if (initial.st_size, initial.st_mtime_ns, initial.st_ctime_ns) != (
                    final.st_size, final.st_mtime_ns, final.st_ctime_ns):
                raise ProjectError("SOURCE_CHANGED")
            return digest.hexdigest()
    except OSError:
        raise ProjectError("SOURCE_UNAVAILABLE") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _checkpoint_result(state: dict[str, object], generation: str,
                       hashes: dict[str, object]) -> dict[str, object]:
    return {
        **_status(state), "generation": generation, "hashes": hashes,
        "authority": {"kind": "user_declared", "authenticated": False},
        "fresh_chat_acceptance": "pending",
        "semantic_validation": "delegated_to_form_module",
    }


def save_checkpoint(root: Path, generation: str, request: object, *,
                    approve_save: bool = False) -> dict[str, object]:
    if approve_save is not True:
        raise ProjectError("CHECKPOINT_SAVE_CONSENT_REQUIRED")
    _load_validator()
    _generation_name(generation)
    inputs = _checkpoint_inputs(request)
    root = _root(root)
    if not root.is_dir():
        raise ProjectError("PROJECT_MISSING")
    with _checkpoint_scope(root, create=True) as (state, directory):
        try:
            os.stat("latest.json", dir_fd=directory, follow_symlinks=False)
        except FileNotFoundError:
            previous = None
        else:
            previous = _checkpoint_record("latest.json", dir_fd=directory)
        sequence = 1
        if previous is not None:
            if (set(previous) != {"generation", "sequence", "checkpoint_hash", "checksum"}
                    or type(previous["sequence"]) is not int or previous["sequence"] < 1
                    or not _is_digest(previous["checkpoint_hash"])):
                raise ProjectError("CHECKPOINT_INVALID")
            _generation_name(previous["generation"])
            sequence = previous["sequence"] + 1
        try:
            os.mkdir(generation, mode=0o700, dir_fd=directory)
        except FileExistsError:
            raise ProjectError("CHECKPOINT_EXISTS") from None
        hashes = {field: _digest(value) for field, value in inputs.items()}
        manifest = {
            "schema_version": CHECKPOINT_VERSION, "generation": generation,
            "sequence": sequence, "project_id": state["project_id"],
            "film_id": state["film_id"], "form": state["form"],
            "state_hash": state["checksum"], "hashes": hashes,
            "save_approval_declared": True,
            "previous_hash": previous["checkpoint_hash"] if previous else None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        with _checkpoint_directory(generation, dir_fd=directory) as destination:
            for field, filename in CHECKPOINT_INPUTS.items():
                _checkpoint_write(destination, {"value": inputs[field]}, filename=filename)
            _checkpoint_write(destination, manifest, filename="checkpoint.json")
        _checkpoint_write(directory, {"generation": generation, "sequence": sequence,
                                     "checkpoint_hash": _digest(manifest)}, filename="latest.json")
        return {**_checkpoint_result(state, generation, hashes), "status": "saved"}


def resume_checkpoint(root: Path, generation: str, *, approve_read: bool = False,
                      expected_hashes: object = None) -> dict[str, object]:
    if approve_read is not True:
        raise ProjectError("SOURCE_READ_CONSENT_REQUIRED")
    _load_validator()
    _generation_name(generation)
    root = _root(root)
    if not root.is_dir():
        raise ProjectError("PROJECT_MISSING")
    with _checkpoint_scope(root) as (state, directory), \
            _checkpoint_directory(generation, dir_fd=directory) as destination:
        latest = _checkpoint_record("latest.json", dir_fd=directory)
        manifest = _checkpoint_record("checkpoint.json", dir_fd=destination)
        if set(manifest) != {"schema_version", "generation", "sequence", "project_id",
                            "film_id", "form", "state_hash", "hashes",
                            "save_approval_declared", "previous_hash", "timestamp", "checksum"}:
            raise ProjectError("CHECKPOINT_INVALID")
        if (manifest["schema_version"] != CHECKPOINT_VERSION
                or manifest["generation"] != generation
                or manifest["save_approval_declared"] is not True):
            raise ProjectError("CHECKPOINT_INVALID")
        if (latest.get("generation") != generation
                or latest.get("sequence") != manifest["sequence"]
                or latest.get("checkpoint_hash") != manifest["checksum"]
                or manifest["state_hash"] != state["checksum"]
                or any(manifest[field] != state[field] for field in ("project_id", "film_id", "form"))):
            raise ProjectError("CHECKPOINT_STALE")
        hashes = manifest["hashes"]
        if (type(hashes) is not dict or set(hashes) != set(CHECKPOINT_INPUTS)
                or not all(_is_digest(value) for value in hashes.values())):
            raise ProjectError("CHECKPOINT_INVALID")
        if expected_hashes is not None:
            if (type(expected_hashes) is not dict or set(expected_hashes) != set(CHECKPOINT_INPUTS)
                    or not all(_is_digest(value) for value in expected_hashes.values())):
                raise ProjectError("CHECKPOINT_INPUT_INVALID")
            if expected_hashes != hashes:
                raise ProjectError("CHECKPOINT_INPUT_CHANGED")
        inputs = {}
        for field, filename in CHECKPOINT_INPUTS.items():
            record = _checkpoint_record(filename, dir_fd=destination)
            if set(record) != {"value", "checksum"} or _digest(record["value"]) != hashes[field]:
                raise ProjectError("CHECKPOINT_INVALID")
            inputs[field] = record["value"]
        _checkpoint_inputs(inputs)
        for source in inputs["source_references"]:
            if _source_hash(source["path"]) != source["sha256"]:
                raise ProjectError("SOURCE_CHANGED")
        return {**_checkpoint_result(state, generation, hashes), **inputs, "status": "resumed"}


def main() -> int:
    parser = Parser(description="Local CMO editorial state. Production is disabled.")
    parser.add_argument("operation")
    parser.add_argument("--root")
    parser.add_argument("--json", action="store_true", help="Machine-readable doctor report")
    parser.add_argument("--project-id")
    parser.add_argument("--film-id")
    parser.add_argument("--form", choices=sorted(FORMS))
    parser.add_argument("--generation")
    parser.add_argument("--approve-save", action="store_true")
    parser.add_argument("--approve-read", action="store_true")
    try:
        args = parser.parse_args()
        checkpoint_operation = args.operation in {"save-checkpoint", "resume-checkpoint"}
        if not checkpoint_operation and any((args.generation, args.approve_save, args.approve_read)):
            raise ProjectError("USAGE")
        if args.operation in {"tts", "render", "deliver", "approve", "review-render"}:
            raise ProjectError("PRODUCTION_DISABLED")
        if args.operation == "doctor":
            if any((args.root, args.project_id, args.film_id, args.form)):
                raise ProjectError("USAGE")
            report = readiness_report()
            print(json.dumps(report, sort_keys=True) if args.json else format_readiness(report))
            return 2
        if args.json or not args.root:
            raise ProjectError("USAGE")
        if args.operation not in {"init", "validate", "status", "history", "plan",
                      "save-checkpoint", "resume-checkpoint"}:
            raise ProjectError("USAGE")
        _load_validator()
        root = _root(Path(args.root))
        if args.operation == "init":
            if not args.project_id or not args.film_id or not args.form:
                raise ProjectError("USAGE")
            result = initialize_project(root, args.project_id, args.film_id, args.form)
        else:
            if any((args.project_id, args.film_id, args.form)):
                raise ProjectError("USAGE")
            if checkpoint_operation:
                if not args.generation:
                    raise ProjectError("USAGE")
                if args.operation == "save-checkpoint" and not args.approve_save:
                    raise ProjectError("CHECKPOINT_SAVE_CONSENT_REQUIRED")
                if args.operation == "resume-checkpoint" and not args.approve_read:
                    raise ProjectError("SOURCE_READ_CONSENT_REQUIRED")
                if ((args.operation == "save-checkpoint" and args.approve_read)
                        or (args.operation == "resume-checkpoint" and args.approve_save)):
                    raise ProjectError("USAGE")
                raw = sys.stdin.buffer.read(MAX_STATE_BYTES + 1)
                if len(raw) > MAX_STATE_BYTES:
                    raise ProjectError("INPUT_TOO_LARGE")
                request = (json.loads(raw.decode("utf-8"),
                                     object_pairs_hook=validator._unique_object,
                                     parse_constant=validator._reject_constant) if raw else {})
                if args.operation == "save-checkpoint":
                    result = save_checkpoint(root, args.generation, request, approve_save=True)
                else:
                    if type(request) is not dict or set(request) - {"expected_hashes"}:
                        raise ProjectError("CHECKPOINT_INPUT_INVALID")
                    if "expected_hashes" in request and request["expected_hashes"] is None:
                        raise ProjectError("CHECKPOINT_INPUT_INVALID")
                    result = resume_checkpoint(root, args.generation, approve_read=True,
                                               expected_hashes=request.get("expected_hashes"))
            elif args.operation in {"validate", "plan"}:
                raw = sys.stdin.buffer.read(validator.MAX_INPUT_BYTES + 1)
                if len(raw) > validator.MAX_INPUT_BYTES:
                    raise ProjectError("INPUT_TOO_LARGE")
                request = validator._record(
                    json.loads(
                        raw.decode("utf-8"),
                        object_pairs_hook=validator._unique_object,
                        parse_constant=validator._reject_constant,
                    ),
                    {"document"},
                )
                operation = validate_project if args.operation == "validate" else plan_project
                result = operation(root, request["document"])
            else:
                state = _load(root)
                result = _status(state)
                if args.operation == "history":
                    result["receipts"] = state["receipts"]
        exit_code = 2 if result.get("code") else 0
    except ProjectError as error:
        result = {"status": "rejected", "code": error.code, "production_qualified": False}
        exit_code = 2
    except (ValueError, RecursionError) as error:
        result = {
            "status": "rejected",
            "code": getattr(error, "code", "JSON_INVALID"),
            "production_qualified": False,
        }
        exit_code = 2
    except OSError:
        result = {"status": "rejected", "code": "IO_ERROR", "production_qualified": False}
        exit_code = 2
    print(json.dumps(result, sort_keys=True, ensure_ascii=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
