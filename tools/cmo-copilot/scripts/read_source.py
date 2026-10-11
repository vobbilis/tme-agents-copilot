from __future__ import annotations

import argparse
import hashlib
import io
import json
import logging
import os
import re
import stat
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET


SCHEMA = "cmo-source-extract-1"
MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_XML_BYTES = 8 * 1024 * 1024
MAX_OUTPUT_BYTES = 256 * 1024
MAX_MEMBERS = 10000
MAX_SECTIONS = 1000
MAX_PDF_SECONDS = 20
PDF_VERSION = "6.19.0"
WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
PRESENTATION_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


class SourceError(ValueError):
    pass


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise SourceError("SOURCE_USAGE_INVALID")


class NoDoctype(ET.TreeBuilder):
    def doctype(self, name: str, pubid: str | None, system: str | None) -> None:
        raise SourceError("SOURCE_XML_UNSAFE")


def parse_xml(payload: bytes) -> ET.Element:
    if len(payload) > MAX_XML_BYTES:
        raise SourceError("SOURCE_XML_TOO_LARGE")
    try:
        return ET.fromstring(payload, parser=ET.XMLParser(target=NoDoctype()))
    except ET.ParseError:
        raise SourceError("SOURCE_XML_INVALID") from None


def select_sections(scope: str | None, total: int) -> list[int]:
    if total < 1 or total > MAX_SECTIONS:
        raise SourceError("SOURCE_SECTION_COUNT_INVALID")
    if scope == "all":
        return list(range(1, total + 1))
    if not scope or len(scope) > 6000 or not re.fullmatch(r"[1-9][0-9]{0,4}(,[1-9][0-9]{0,4})*", scope):
        raise SourceError("SOURCE_SCOPE_INVALID")
    selected = [int(value) for value in scope.split(",")]
    if len(set(selected)) != len(selected) or any(number > total for number in selected):
        raise SourceError("SOURCE_SCOPE_INVALID")
    return sorted(selected)


def section(number: int, anchor: str, text: str) -> dict[str, object]:
    return {"number": number, "anchor": anchor, "text": text,
            "status": "text_extracted" if text.strip() else "no_extractable_text"}


def validate_archive(archive: zipfile.ZipFile) -> None:
    entries = archive.infolist()
    if len(entries) > MAX_MEMBERS:
        raise SourceError("SOURCE_PACKAGE_TOO_LARGE")
    names = [entry.filename for entry in entries]
    if len(set(names)) != len(names):
        raise SourceError("SOURCE_PACKAGE_UNSAFE")
    expanded = 0
    for entry in entries:
        name = entry.filename
        if "\\" in name or ":" in name or "\x00" in name or name.startswith("/") or ".." in PurePosixPath(name).parts:
            raise SourceError("SOURCE_PACKAGE_UNSAFE")
        if entry.flag_bits & 1:
            raise SourceError("SOURCE_ENCRYPTED")
        if name.endswith((".xml", ".rels")):
            if entry.file_size > MAX_XML_BYTES:
                raise SourceError("SOURCE_XML_TOO_LARGE")
            expanded += entry.file_size
    if expanded > MAX_SOURCE_BYTES:
        raise SourceError("SOURCE_PACKAGE_TOO_LARGE")


def archive_xml(archive: zipfile.ZipFile, name: str) -> ET.Element:
    try:
        with archive.open(name) as stream:
            return parse_xml(stream.read(MAX_XML_BYTES + 1))
    except KeyError:
        raise SourceError("SOURCE_PACKAGE_INVALID") from None


def slide_notes(archive: zipfile.ZipFile, slide_target: str) -> str:
    rel_path = f"ppt/slides/_rels/{PurePosixPath(slide_target).name}.rels"
    try:
        archive.getinfo(rel_path)
    except KeyError:
        return ""
    relationships = archive_xml(archive, rel_path)
    if relationships.tag != f"{{{PACKAGE_NS}}}Relationships":
        raise SourceError("SOURCE_PACKAGE_INVALID")
    matches = [item for item in relationships.findall(f"{{{PACKAGE_NS}}}Relationship")
               if item.get("Type") == f"{REL_NS}/notesSlide"]
    if not matches:
        return ""
    if len(matches) != 1:
        raise SourceError("SOURCE_PACKAGE_INVALID")
    relationship = matches[0]
    target = relationship.get("Target", "")
    parts = PurePosixPath(target).parts
    if (relationship.get("TargetMode", "Internal") != "Internal" or len(parts) != 3
            or parts[:2] != ("..", "notesSlides") or not parts[2].endswith(".xml")
            or "\\" in target or ":" in target):
        raise SourceError("SOURCE_PACKAGE_UNSAFE")
    notes = archive_xml(archive, f"ppt/notesSlides/{parts[2]}")
    if notes.tag != f"{{{PRESENTATION_NS}}}notes":
        raise SourceError("SOURCE_PACKAGE_INVALID")
    paragraphs = []
    for shape in notes.iter(f"{{{PRESENTATION_NS}}}sp"):
        placeholder = shape.find(f"{{{PRESENTATION_NS}}}nvSpPr/{{{PRESENTATION_NS}}}nvPr/{{{PRESENTATION_NS}}}ph")
        if placeholder is not None and placeholder.get("type") != "body":
            continue
        for paragraph in shape.iter(f"{{{DRAWING_NS}}}p"):
            paragraphs.append("".join("\n" if element.tag == f"{{{DRAWING_NS}}}br" else (element.text or "")
                              for element in paragraph.iter()
                              if element.tag in {f"{{{DRAWING_NS}}}t", f"{{{DRAWING_NS}}}br"}))
    return "\n".join(paragraphs)


def extract_pptx(payload: bytes, scope: str | None, include_notes: bool = False) -> tuple[list[dict[str, object]], int, list[str]]:
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            validate_archive(archive)
            presentation = archive_xml(archive, "ppt/presentation.xml")
            relationships = archive_xml(archive, "ppt/_rels/presentation.xml.rels")
            if presentation.tag != f"{{{PRESENTATION_NS}}}presentation" or relationships.tag != f"{{{PACKAGE_NS}}}Relationships":
                raise SourceError("SOURCE_PACKAGE_INVALID")
            relationship_map: dict[str, ET.Element] = {}
            for relationship in relationships.findall(f"{{{PACKAGE_NS}}}Relationship"):
                identifier = relationship.get("Id", "")
                if not identifier or identifier in relationship_map:
                    raise SourceError("SOURCE_PACKAGE_INVALID")
                relationship_map[identifier] = relationship
            slides = presentation.findall(f"{{{PRESENTATION_NS}}}sldIdLst/{{{PRESENTATION_NS}}}sldId")
            selected = select_sections(scope, len(slides))
            targets = []
            for slide in slides:
                relationship = relationship_map.get(slide.get(f"{{{REL_NS}}}id", ""))
                if relationship is None or relationship.get("Type") != f"{REL_NS}/slide":
                    raise SourceError("SOURCE_PACKAGE_INVALID")
                target = relationship.get("Target", "")
                parts = PurePosixPath(target).parts
                if (relationship.get("TargetMode", "Internal") != "Internal" or not target
                        or target.startswith("/") or ".." in parts or "\\" in target or ":" in target
                        or not target.startswith("slides/") or not target.endswith(".xml")):
                    raise SourceError("SOURCE_PACKAGE_UNSAFE")
                targets.append("ppt/" + target)
            if len(set(targets)) != len(targets):
                raise SourceError("SOURCE_PACKAGE_INVALID")
            sections = []
            text_size = 0
            for number in selected:
                slide = archive_xml(archive, targets[number - 1])
                if slide.tag != f"{{{PRESENTATION_NS}}}sld":
                    raise SourceError("SOURCE_PACKAGE_INVALID")
                paragraphs = []
                for paragraph in slide.iter(f"{{{DRAWING_NS}}}p"):
                    text = "".join("\n" if element.tag == f"{{{DRAWING_NS}}}br" else (element.text or "")
                                   for element in paragraph.iter()
                                   if element.tag in {f"{{{DRAWING_NS}}}t", f"{{{DRAWING_NS}}}br"})
                    paragraphs.append(text)
                text = "\n".join(paragraphs)
                text_size += len(text.encode("utf-8"))
                if text_size > MAX_OUTPUT_BYTES:
                    raise SourceError("SOURCE_OUTPUT_TOO_LARGE")
                extracted = section(number, f"slide:{number}", text)
                if include_notes:
                    notes = slide_notes(archive, targets[number - 1])
                    text_size += len(notes.encode("utf-8"))
                    if text_size > MAX_OUTPUT_BYTES:
                        raise SourceError("SOURCE_OUTPUT_TOO_LARGE")
                    extracted.update({"notes": notes, "notes_anchor": f"slide:{number}:notes",
                                      "notes_status": "text_extracted" if notes.strip() else "no_extractable_text"})
                sections.append(extracted)
            return sections, len(slides), ["notes_placeholders_excluded" if include_notes else "speaker_notes_not_read", "images_and_charts_not_interpreted",
                                           "embedded_and_linked_content_not_read", "xml_order_not_visual_reading_order"]
    except (zipfile.BadZipFile, zipfile.LargeZipFile, NotImplementedError, RuntimeError):
        raise SourceError("SOURCE_PACKAGE_INVALID") from None


def docx_text(element: ET.Element) -> str:
    local_name = element.tag.removeprefix(f"{{{WORD_NS}}}")
    if local_name in {"drawing", "pict", "object", "del", "instrText"}:
        return ""
    if local_name == "t":
        return element.text or ""
    if local_name == "tab":
        return "\t"
    if local_name in {"br", "cr"}:
        return "\n"
    separator = "\n" if local_name in {"tbl", "tc"} else "\t" if local_name == "tr" else ""
    children = [child for child in element if child.tag not in {
        f"{{{WORD_NS}}}tblPr", f"{{{WORD_NS}}}tblGrid", f"{{{WORD_NS}}}trPr", f"{{{WORD_NS}}}tcPr"}]
    return separator.join(docx_text(child) for child in children)


def extract_docx(payload: bytes, scope: str | None) -> tuple[list[dict[str, object]], int, list[str]]:
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            validate_archive(archive)
            document = archive_xml(archive, "word/document.xml")
            body = document.find(f"{{{WORD_NS}}}body")
            if document.tag != f"{{{WORD_NS}}}document" or body is None:
                raise SourceError("SOURCE_PACKAGE_INVALID")
            blocks = [child for child in body if child.tag != f"{{{WORD_NS}}}sectPr"]
            if any(block.tag not in {f"{{{WORD_NS}}}p", f"{{{WORD_NS}}}tbl"} for block in blocks):
                raise SourceError("SOURCE_DOCX_CONTENT_UNSUPPORTED")
            selected = select_sections(scope, len(blocks))
            sections = []
            text_size = 0
            for number in selected:
                text = docx_text(blocks[number - 1])
                text_size += len(text.encode("utf-8"))
                if text_size > MAX_OUTPUT_BYTES:
                    raise SourceError("SOURCE_OUTPUT_TOO_LARGE")
                sections.append(section(number, f"block:{number}", text))
            return sections, len(blocks), ["page_layout_not_available", "tracked_changes_not_resolved",
                "headers_footers_comments_notes_not_read", "images_and_textboxes_not_read",
                "embedded_and_linked_content_not_read"]
    except (zipfile.BadZipFile, zipfile.LargeZipFile, NotImplementedError, RuntimeError, RecursionError):
        raise SourceError("SOURCE_PACKAGE_INVALID") from None


def pdf_worker(scope: str) -> int:
    logger = logging.getLogger("pypdf")
    logger.handlers = [logging.NullHandler()]
    logger.propagate = False
    try:
        import resource
        from importlib.metadata import version
        from pypdf import PdfReader, filters

        resource.setrlimit(resource.RLIMIT_CPU, (MAX_PDF_SECONDS, MAX_PDF_SECONDS))
        if version("pypdf") != PDF_VERSION or not hasattr(filters, "ZLIB_MAX_OUTPUT_LENGTH"):
            raise SourceError("SOURCE_DEPENDENCY_INCOMPATIBLE")
        filters.ZLIB_MAX_OUTPUT_LENGTH = MAX_XML_BYTES
        payload = sys.stdin.buffer.read(MAX_SOURCE_BYTES + 1)
        if len(payload) > MAX_SOURCE_BYTES:
            raise SourceError("SOURCE_TOO_LARGE")
        document = PdfReader(io.BytesIO(payload), strict=True)
        if document.is_encrypted:
            raise SourceError("SOURCE_ENCRYPTED")
        total = len(document.pages)
        selected = select_sections(scope, total)
        sections = []
        text_size = 0
        for number in selected:
            page = document.pages[number - 1]
            content = page.get_contents()
            if content is not None and len(content.get_data()) > MAX_XML_BYTES:
                raise SourceError("SOURCE_PDF_STREAM_TOO_LARGE")
            text = page.extract_text() or ""
            text_size += len(text.encode("utf-8"))
            if text_size > MAX_OUTPUT_BYTES:
                raise SourceError("SOURCE_OUTPUT_TOO_LARGE")
            sections.append(section(number, f"page:{number}", text))
        result = {"sections": sections, "total": total, "limitations": [
            "images_not_ocr_processed", "visual_reading_order_not_verified",
            "annotations_forms_attachments_not_read", "embedded_and_linked_content_not_read"]}
        output = json.dumps(result, ensure_ascii=True)
        if len(output.encode()) + 1 > MAX_OUTPUT_BYTES:
            raise SourceError("SOURCE_OUTPUT_TOO_LARGE")
        print(output)
        return 0
    except SourceError as error:
        code = str(error)
    except ImportError:
        code = "SOURCE_DEPENDENCY_MISSING"
    except (MemoryError, RecursionError):
        code = "SOURCE_PDF_RESOURCE_LIMIT"
    except Exception:
        code = "SOURCE_PDF_INVALID"
    print(json.dumps({"code": code}))
    return 2


def extract_pdf(payload: bytes, scope: str | None) -> tuple[list[dict[str, object]], int, list[str]]:
    try:
        process = subprocess.run(
            [sys.executable, "-I", "-B", str(Path(__file__).resolve()), "--pdf-worker", scope or ""],
            input=payload, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            timeout=MAX_PDF_SECONDS,
        )
    except subprocess.TimeoutExpired:
        raise SourceError("SOURCE_PDF_TIMEOUT") from None
    except OSError:
        raise SourceError("SOURCE_PDF_WORKER_FAILED") from None
    if process.returncode not in {0, 2}:
        raise SourceError("SOURCE_PDF_RESOURCE_LIMIT")
    if len(process.stdout) > MAX_OUTPUT_BYTES:
        raise SourceError("SOURCE_OUTPUT_TOO_LARGE")
    try:
        result = json.loads(process.stdout)
        if process.returncode == 2:
            raise SourceError(result["code"])
        return result["sections"], result["total"], result["limitations"]
    except (ValueError, KeyError, TypeError) as error:
        if isinstance(error, SourceError):
            raise
        raise SourceError("SOURCE_PDF_WORKER_FAILED") from None


def extract(payload: bytes, suffix: str, scope: str | None, include_notes: bool = False) -> tuple[list[dict[str, object]], int, list[str]]:
    if suffix == ".pptx":
        return extract_pptx(payload, scope, include_notes)
    if suffix == ".docx":
        return extract_docx(payload, scope)
    if suffix == ".pdf":
        return extract_pdf(payload, scope)
    select_sections(scope, 1)
    try:
        text = payload.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise SourceError("SOURCE_ENCODING_UNSUPPORTED") from None
    if "\x00" in text:
        raise SourceError("SOURCE_TEXT_INVALID")
    return [section(1, f"lines:1-{max(1, len(text.splitlines()))}", text)], 1, ["plain_text_only"]


def identity(info: os.stat_result) -> tuple[int, int, int, int, int]:
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def read_source(path: Path, source_id: str, scope: str | None, approved: bool,
                include_notes: bool = False, notes_approved: bool = False) -> dict[str, object]:
    if not approved:
        raise SourceError("SOURCE_READ_CONSENT_REQUIRED")
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,79}", source_id):
        raise SourceError("SOURCE_ID_INVALID")
    suffix = path.suffix.lower()
    if suffix not in {".pptx", ".txt", ".md", ".docx", ".pdf"}:
        raise SourceError("SOURCE_FORMAT_UNSUPPORTED")
    if include_notes and not notes_approved:
        raise SourceError("SOURCE_NOTES_CONSENT_REQUIRED")
    if include_notes and suffix != ".pptx":
        raise SourceError("SOURCE_NOTES_FORMAT_UNSUPPORTED")
    if notes_approved and not include_notes:
        raise SourceError("SOURCE_NOTES_SCOPE_REQUIRED")
    if not path.is_absolute() or path.is_symlink():
        raise SourceError("SOURCE_PATH_INVALID")
    if scope is None:
        raise SourceError("SOURCE_SCOPE_REQUIRED")
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise SourceError("SOURCE_PATH_INVALID")
            if before.st_size > MAX_SOURCE_BYTES:
                raise SourceError("SOURCE_TOO_LARGE")
            payload = stream.read(MAX_SOURCE_BYTES + 1)
            if len(payload) > MAX_SOURCE_BYTES:
                raise SourceError("SOURCE_TOO_LARGE")
            sections, total, limitations = (extract(payload, suffix, scope, include_notes=True)
                                           if include_notes else extract(payload, suffix, scope))
            if (len(payload) != before.st_size or identity(before) != identity(os.fstat(stream.fileno()))
                    or identity(before) != identity(path.stat(follow_symlinks=False))):
                raise SourceError("SOURCE_CHANGED")
    except FileNotFoundError:
        raise SourceError("SOURCE_NOT_FOUND") from None
    except OSError:
        raise SourceError("SOURCE_READ_FAILED") from None
    result: dict[str, object] = {
        "schema_version": SCHEMA, "status": "extracted_not_reviewed",
        "source": {"id": source_id, "name": path.name, "format": suffix[1:],
                   "sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload)},
        "scope": {"requested_sections": scope, **({"include_notes": True} if include_notes else {})}, "sections": sections,
        "coverage": {"total": total, "selected": len(sections),
                     "empty": sum(item["status"] == "no_extractable_text" for item in sections),
                     "limitations": limitations},
        "authority": {"approval": "operator_declared", "authenticated": False, "claims_verified": False},
    }
    if len(json.dumps(result, ensure_ascii=True).encode("utf-8")) + 1 > MAX_OUTPUT_BYTES:
        raise SourceError("SOURCE_OUTPUT_TOO_LARGE")
    return result


def main() -> int:
    parser = Parser(description="Read approved source text without saving an extract.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--sections")
    parser.add_argument("--approve-read", action="store_true")
    parser.add_argument("--include-notes", action="store_true")
    parser.add_argument("--approve-notes", action="store_true")
    try:
        options = parser.parse_args()
        result = read_source(options.input, options.source_id, options.sections, options.approve_read,
                     options.include_notes, options.approve_notes)
    except SourceError as error:
        print(json.dumps({"schema_version": SCHEMA, "status": "failed", "code": str(error)}))
        return 2
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--pdf-worker":
        sys.exit(pdf_worker(sys.argv[2]))
    sys.exit(main())