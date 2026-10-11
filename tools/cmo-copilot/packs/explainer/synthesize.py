import argparse
import asyncio
import hashlib
import importlib
import json
import os
import re
import sys
from pathlib import Path


def validate_request(request: object) -> dict[str, str]:
    fields = {"id", "text", "voice", "rate", "engine", "fingerprint"}
    if not isinstance(request, dict) or set(request) != fields:
        raise ValueError("SPEECH_REQUEST_INVALID")
    if any(not isinstance(value, str) or not value for value in request.values()):
        raise ValueError("SPEECH_REQUEST_INVALID")
    if (
        not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", request["id"])
        or len(request["text"]) > 32768
        or len(request["voice"]) > 128
        or not re.fullmatch(
            r"[a-z]{2,3}-[A-Z]{2}-(?:[A-Za-z0-9]+-)*[A-Za-z][A-Za-z0-9]*Neural",
            request["voice"],
        )
        or not re.fullmatch(r"[+-][0-9]{1,3}%", request["rate"])
        or abs(int(request["rate"][:-1])) > 100
        or request["engine"] != "edge-tts==7.2.8"
    ):
        raise ValueError("SPEECH_REQUEST_INVALID")
    payload = {key: request[key] for key in ("text", "voice", "rate", "engine")}
    payload["boundary"] = "WordBoundary"
    try:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    except UnicodeError:
        raise ValueError("SPEECH_REQUEST_INVALID") from None
    if hashlib.sha256(encoded).hexdigest() != request["fingerprint"]:
        raise ValueError("SPEECH_REQUEST_INVALID")
    return request


async def synthesize(
    request: object, output: Path, consent_fingerprint: str | None
) -> dict[str, str]:
    request = validate_request(request)
    if consent_fingerprint != request["fingerprint"]:
        raise ValueError("SPEECH_CONSENT_REQUIRED")
    if not output.is_absolute() or output.parent.resolve(strict=True) != output.parent:
        raise ValueError("SPEECH_OUTPUT_INVALID")
    if output.exists() or output.is_symlink():
        raise ValueError("SPEECH_OUTPUT_EXISTS")
    try:
        provider = importlib.import_module("edge_tts")
    except ImportError:
        raise ValueError("SPEECH_ENGINE_MISSING") from None
    if getattr(provider, "__version__", None) != "7.2.8":
        raise ValueError("SPEECH_ENGINE_MISMATCH")
    try:
        output.mkdir(mode=0o700)
        audio = output / "audio.mp3"
        metadata = output / "words.jsonl"
        for path in (audio, metadata):
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            os.close(descriptor)
    except OSError:
        raise ValueError("SPEECH_OUTPUT_UNAVAILABLE") from None
    try:
        speech = provider.Communicate(
            request["text"], request["voice"], rate=request["rate"], boundary="WordBoundary"
        )
        await asyncio.wait_for(speech.save(str(audio), str(metadata)), timeout=180)
    except Exception:
        raise ValueError("SPEECH_PROVIDER_FAILED") from None
    if not audio.stat().st_size or not metadata.stat().st_size:
        raise ValueError("SPEECH_OUTPUT_EMPTY")
    return {
        "id": request["id"],
        "fingerprint": request["fingerprint"],
        "status": "unverified_audio",
    }


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ValueError("SPEECH_USAGE")


def unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("SPEECH_REQUEST_INVALID")
        result[key] = value
    return result


def main() -> int:
    try:
        parser = Parser(description="Synthesize one explicitly authorized narration request.")
        parser.add_argument("--output", required=True, type=Path)
        parser.add_argument("--consent-for", required=True)
        args = parser.parse_args()
        data = sys.stdin.buffer.read(262145)
        if len(data) > 262144:
            raise ValueError("SPEECH_REQUEST_INVALID")
        try:
            request = json.loads(data, object_pairs_hook=unique_object)
        except (ValueError, UnicodeError, RecursionError):
            raise ValueError("SPEECH_REQUEST_INVALID") from None
        result = asyncio.run(synthesize(request, args.output, args.consent_for))
    except (ValueError, OSError, KeyboardInterrupt) as error:
        code = str(error)
        if not re.fullmatch(r"SPEECH_[A-Z_]+", code):
            code = "SPEECH_FAILED"
        print(json.dumps({"status": "failed", "code": code}))
        return 2
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
