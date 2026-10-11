from __future__ import annotations

import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import cast


class PlanError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def compile_plan(
    adapted: dict[str, object], validation: dict[str, object], project: dict[str, object]
) -> dict[str, object]:
    schema = json.loads(
        (Path(__file__).resolve().parent.parent / "schemas/explainer-plan.schema.json").read_text()
    )
    projection = cast(dict[str, object], adapted["document"])
    sources = cast(list[dict[str, object]], projection["sources"])
    source_ids = [cast(str, source["id"]) for source in sources]
    if any(not re.fullmatch(schema["$defs"]["id"]["pattern"], source) for source in source_ids):
        raise PlanError("PLAN_CONTRACT_INVALID")
    presentation = cast(list[dict[str, object]], adapted["presentation"])
    narration = cast(list[dict[str, object]], projection["scenes"])
    scenes = []
    previous_end = 0
    for visual, spoken in zip(presentation, narration, strict=True):
        if not visual["theme"] or not visual["slot"]:
            raise PlanError("PRESENTATION_REQUIRED")
        slot = cast(str, visual["slot"])
        properties = schema["$defs"]["scene"]["properties"]
        if not re.fullmatch(properties["slot"]["pattern"], slot) or not re.fullmatch(
            properties["id"]["pattern"], cast(str, visual["id"])
        ):
            raise PlanError("PLAN_CONTRACT_INVALID")
        start = int(slot[:2]) * 60 + int(slot[3:5])
        end = int(slot[6:8]) * 60 + int(slot[9:11])
        if start != previous_end or end <= start:
            raise PlanError("TIMELINE_INVALID")
        previous_end = end
        scenes.append({**visual, "sentences": spoken["sentences"]})
    encoded_visual = json.dumps(
        {"title": adapted["title"], "scenes": presentation},
        sort_keys=True,
        ensure_ascii=True,
        separators=(",", ":"),
    ).encode()
    names = schema["$defs"]["stage"]["properties"]["id"]["enum"]
    stages = [
        {
            "id": name,
            "depends_on": names[index - 1 : index] if index else [],
            "executable": False,
            "blocked_by": schema["$defs"]["stage"]["properties"]["blocked_by"]["const"],
        }
        for index, name in enumerate(names)
    ]
    return deepcopy(
        {
            "schema_version": schema["properties"]["schema_version"]["const"],
            "status": "planned_not_executable",
            "project_id": project["project_id"],
            "film_id": project["film_id"],
            "form": "explainer",
            "title": adapted["title"],
            "input_fingerprint": validation["fingerprint"],
            "narration_fingerprint": validation["narration_fingerprint"],
            "visual_fingerprint": hashlib.sha256(encoded_visual).hexdigest(),
            "timing_status": "editorial_estimate_only",
            "source_ids": source_ids,
            "scenes": scenes,
            "stages": stages,
            "production_qualified": False,
        }
    )
