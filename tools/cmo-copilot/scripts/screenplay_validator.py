from __future__ import annotations

import hashlib
import json
import re
import sys
from typing import NamedTuple, NoReturn, TypedDict, cast

SCHEMA_VERSION = "cmo-screenplay-prototype-1"
MARKDOWN_SCHEMA_VERSION = "cmo-screenplay-markdown-1"
MAX_INPUT_BYTES = 1024 * 1024
TAG_ID = r"[A-Za-z0-9][A-Za-z0-9_.:-]*"
NARRATION_LINE = re.compile(rf"> (.+?) \[id:({TAG_ID})\]((?: \[src:{TAG_ID}\])+)")


class ValidationError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class ValidationResult(TypedDict):
    status: str
    fingerprint: str
    sentence_count: int
    source_count: int
    permissions: dict[str, bool]
    human_origin_verified: bool
    truth_verified: bool


class SentenceReferences(NamedTuple):
    scene_id: str
    source_ids: frozenset[str]


class DocumentIndex(NamedTuple):
    sources: dict[str, dict[str, object]]
    sentences: dict[str, SentenceReferences]


def _record(value: object, fields: set[str]) -> dict[str, object]:
    if type(value) is not dict:
        raise ValidationError("SCHEMA")
    record = cast(dict[str, object], value)
    if any(type(key) is not str for key in record) or set(record) != fields:
        raise ValidationError("SCHEMA")
    return record


def _items(value: object) -> list[object]:
    if type(value) is not list or not value:
        raise ValidationError("SCHEMA")
    return cast(list[object], value)


def _text(value: object) -> str:
    if type(value) is not str or not value.strip():
        raise ValidationError("SCHEMA")
    return value


def _identifier(value: object) -> str:
    identifier = _text(value)
    if identifier != identifier.strip():
        raise ValidationError("SCHEMA")
    return identifier


def _index(document: object) -> DocumentIndex:
    root = _record(document, {"schema_version", "sources", "scenes", "approvals"})
    if _text(root["schema_version"]) != SCHEMA_VERSION:
        raise ValidationError("SCHEMA")
    if type(root["approvals"]) is not list or root["approvals"]:
        raise ValidationError("AUTHORITY_UNQUALIFIED")

    sources: dict[str, dict[str, object]] = {}
    for value in _items(root["sources"]):
        source = _record(
            value,
            {
                "id",
                "kind",
                "owner",
                "statement",
                "limitations",
                "confirmation_event",
            },
        )
        source_id = _identifier(source["id"])
        if source_id in sources:
            raise ValidationError("DUPLICATE_ID")
        if _text(source["kind"]) not in ("owner-fiction", "owner-document"):
            raise ValidationError("SCHEMA")
        for field in ("owner", "statement", "confirmation_event"):
            _text(source[field])
        for limitation in _items(source["limitations"]):
            _text(limitation)
        sources[source_id] = source

    scenes: set[str] = set()
    sentences: dict[str, SentenceReferences] = {}
    for value in _items(root["scenes"]):
        scene = _record(value, {"id", "sentences"})
        scene_id = _identifier(scene["id"])
        if scene_id in scenes:
            raise ValidationError("DUPLICATE_ID")
        scenes.add(scene_id)
        for value in _items(scene["sentences"]):
            sentence = _record(value, {"id", "text", "source_ids", "status"})
            sentence_id = _identifier(sentence["id"])
            if sentence_id in sentences:
                raise ValidationError("DUPLICATE_ID")
            _text(sentence["text"])
            status = _text(sentence["status"])
            if status == "CHECK":
                raise ValidationError("UNRESOLVED_CHECK")
            if status != "supported":
                raise ValidationError("SCHEMA")
            source_ids: set[str] = set()
            for reference in _items(sentence["source_ids"]):
                source_id = _identifier(reference)
                if source_id in source_ids:
                    raise ValidationError("DUPLICATE_ID")
                if source_id not in sources:
                    raise ValidationError("SOURCE_UNRESOLVED")
                source_ids.add(source_id)
            sentences[sentence_id] = SentenceReferences(scene_id, frozenset(source_ids))
    return DocumentIndex(sources, sentences)


def _preserve_references(current: DocumentIndex, previous: DocumentIndex) -> None:
    for source_id, source in previous.sources.items():
        if current.sources.get(source_id) != source:
            raise ValidationError("SOURCE_CHANGED")
    for sentence_id, sentence in previous.sentences.items():
        revised = current.sentences.get(sentence_id)
        if revised is None:
            raise ValidationError("SENTENCE_DROPPED")
        if revised.scene_id != sentence.scene_id:
            raise ValidationError("SCENE_CHANGED")
        if not sentence.source_ids.issubset(revised.source_ids):
            raise ValidationError("SOURCE_REFERENCE_DROPPED")


def validate_screenplay(
    document: object,
    previous: object = None,
) -> ValidationResult:
    current = _index(document)
    if previous is not None:
        _preserve_references(current, _index(previous))
    serialized = json.dumps(document, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    return {
        "status": "structurally_valid",
        "fingerprint": hashlib.sha256(serialized.encode("ascii")).hexdigest(),
        "sentence_count": len(current.sentences),
        "source_count": len(current.sources),
        "permissions": {
            "screenplay_approved": False,
            "tts": False,
            "render": False,
            "delivery": False,
        },
        "human_origin_verified": False,
        "truth_verified": False,
    }


class AdaptedScreenplay(TypedDict):
    title: str | None
    document: dict[str, object]
    presentation: list[dict[str, object]]


def _check_cues(presentation: dict[str, object], sentences: list[dict[str, object]]) -> None:
    narration = " ".join(_text(sentence["text"]) for sentence in sentences)
    cues = cast(list[str], presentation["cues"])
    if len(set(cues)) != len(cues):
        raise ValidationError("CUE_ORDER")
    previous_position = -1
    for cue in cues:
        if not 3 <= len(cue.split()) <= 6 or narration.count(cue) != 1:
            raise ValidationError("CUE_MATCH")
        position = narration.index(cue)
        if position <= previous_position:
            raise ValidationError("CUE_ORDER")
        previous_position = position


def adapt_screenplay(document: object) -> AdaptedScreenplay:
    root = _record(document, {"schema_version", "text", "sources", "approvals"})
    if _text(root["schema_version"]) != MARKDOWN_SCHEMA_VERSION:
        raise ValidationError("SCHEMA")
    if type(root["approvals"]) is not list or root["approvals"]:
        raise ValidationError("AUTHORITY_UNQUALIFIED")
    text = _text(root["text"])
    if "[CHECK]" in text:
        raise ValidationError("UNRESOLVED_CHECK")
    scenes: list[dict[str, object]] = []
    presentation: list[dict[str, object]] = []
    title = None
    current: dict[str, object] | None = None
    sentences: list[dict[str, object]] = []
    section = None
    seen_fields: set[str] = set()
    for line in text.splitlines():
        if not line.strip():
            continue
        if line.startswith("# ") and not scenes and title is None:
            title = _text(line[2:])
            continue
        heading = re.fullmatch(r"## (S\d+)\. (\S.*)", line)
        if heading:
            if current is not None:
                _check_cues(current, sentences)
            scene_id, scene_title = heading.groups()
            sentences = []
            scenes.append({"id": scene_id, "sentences": sentences})
            current = {
                "id": scene_id,
                "title": scene_title,
                "slot": None,
                "theme": None,
                "status": None,
                "labels": [],
                "points": [],
                "cues": [],
            }
            presentation.append(current)
            section = None
            seen_fields = set()
            continue
        if current is None:
            raise ValidationError("MARKDOWN_FORMAT")
        field = re.fullmatch(r"(Slot|Theme|Status|Labels): (\S.*)", line)
        if field:
            name, value = field.groups()
            if name in seen_fields:
                raise ValidationError("MARKDOWN_FORMAT")
            seen_fields.add(name)
            section = None
            if name == "Slot":
                if not re.fullmatch(r"\d{2}:[0-5]\d-\d{2}:[0-5]\d", value):
                    raise ValidationError("MARKDOWN_FORMAT")
                if value[:5] >= value[6:]:
                    raise ValidationError("MARKDOWN_FORMAT")
            if name == "Theme" and value not in ("light", "dark"):
                raise ValidationError("MARKDOWN_FORMAT")
            current[name.lower()] = (
                [_text(label.strip()) for label in value.split(",")] if name == "Labels" else value
            )
            continue
        if line in ("Points:", "Narration:", "Cues:"):
            if line in seen_fields:
                raise ValidationError("MARKDOWN_FORMAT")
            seen_fields.add(line)
            section = line[:-1].lower()
            continue
        if section in ("points", "cues") and line.startswith("- "):
            cast(list[str], current[section]).append(_text(line[2:]))
            continue
        if section == "narration" and line.startswith("> "):
            match = NARRATION_LINE.fullmatch(line)
            if not match:
                raise ValidationError("MARKDOWN_FORMAT")
            narration, sentence_id, references = match.groups()
            if re.search(r"\[(?:id:|src:|CHECK)", narration):
                raise ValidationError("MARKDOWN_FORMAT")
            sentences.append(
                {
                    "id": sentence_id,
                    "text": narration,
                    "source_ids": re.findall(rf"\[src:({TAG_ID})\]", references),
                    "status": "supported",
                }
            )
            continue
        raise ValidationError("MARKDOWN_FORMAT")
    if current is not None:
        _check_cues(current, sentences)
    projection = {
        "schema_version": SCHEMA_VERSION,
        "sources": root["sources"],
        "scenes": scenes,
        "approvals": [],
    }
    validate_screenplay(projection)
    return {"title": title, "document": projection, "presentation": presentation}


def validate_markdown(document: object, previous: object = None) -> dict[str, object]:
    current = adapt_screenplay(document)
    baseline = adapt_screenplay(previous)["document"] if previous is not None else None
    report: dict[str, object] = dict(validate_screenplay(current["document"], baseline))
    report["narration_fingerprint"] = report["fingerprint"]
    serialized = json.dumps(document, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    report["fingerprint"] = hashlib.sha256(serialized.encode("ascii")).hexdigest()
    return report


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    record: dict[str, object] = {}
    for key, value in pairs:
        if key in record:
            raise ValidationError("JSON_DUPLICATE_KEY")
        record[key] = value
    return record


def _reject_constant(constant: str) -> NoReturn:
    raise ValidationError("JSON_INVALID")


def _validate_stdin(operation: str) -> dict[str, object]:
    payload = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(payload) > MAX_INPUT_BYTES:
        raise ValidationError("INPUT_TOO_LARGE")
    request = json.loads(
        payload.decode("utf-8"),
        object_pairs_hook=_unique_object,
        parse_constant=_reject_constant,
    )
    fields = {"document"}
    if type(request) is dict and "previous" in request:
        fields.add("previous")
    envelope = _record(request, fields)
    if "previous" in envelope and envelope["previous"] is None:
        raise ValidationError("SCHEMA")
    validator = validate_markdown if operation == "validate-markdown" else validate_screenplay
    report: dict[str, object] = dict(validator(envelope["document"], envelope.get("previous")))
    report["comparison_performed"] = "previous" in envelope
    report["production_qualified"] = False
    return report


def main() -> int:
    arguments = sys.argv[1:]
    if arguments in (["--help"], ["-h"]):
        print(
            "Usage: screenplay_validator.py validate | validate-markdown\n"
            "Read one UTF-8 JSON object from stdin (maximum 1 MiB):\n"
            '  {"document": <screenplay>, "previous": <optional screenplay>}\n'
            "Write a validation report to stdout. No input files are saved.\n"
            "Production is disabled; validation grants no approval or consent."
        )
        return 0
    code = ""
    try:
        if arguments not in (["validate"], ["validate-markdown"]):
            raise ValidationError("USAGE")
        report = _validate_stdin(arguments[0])
    except ValidationError as error:
        code = error.code
    except (ValueError, RecursionError):
        code = "JSON_INVALID"
    except OSError:
        code = "INPUT_IO"
    if code:
        report = {"status": "rejected", "code": code, "production_qualified": False}
    print(json.dumps(report, sort_keys=True, ensure_ascii=True))
    return 2 if code else 0


if __name__ == "__main__":
    raise SystemExit(main())
