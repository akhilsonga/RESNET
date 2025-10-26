# pip install flask pymongo python-dateutil
from flask import Flask, request, jsonify
from pymongo import MongoClient
from dateutil import parser as dateparser
from urllib.parse import urlparse
from datetime import datetime
from typing import List, Dict, Any, Optional, Iterable
import re
import os

# --- Config ---
MONGO_HOST = "10.0.0.238"
MONGO_PORT = 27017
DB_NAME = "AI_youtube_data"
COLL_NAME = "AITUBE_24"
ARRAY_FIELD = "AI_News"

app = Flask(__name__)

# ---------- Utilities ----------
def _normalize_entity_key(entity: str) -> str:
    """Remove non-alphanumeric chars and lowercase: 'Open AI' -> 'openai', 'NVIDIA' -> 'nvidia'."""
    if entity is None:
        return ""
    return "".join(ch for ch in str(entity) if ch.isalnum()).lower()

def _parse_entities_field(raw) -> Iterable[str]:
    """Accept comma-separated string or list; yield trimmed, non-empty strings."""
    if raw is None:
        return []
    if isinstance(raw, str):
        return [e.strip() for e in raw.split(",") if e.strip()]
    if isinstance(raw, (list, tuple)):
        out = []
        for e in raw:
            if e is None:
                continue
            s = str(e).strip()
            if s:
                out.append(s)
        return out
    s = str(raw).strip()
    return [s] if s else []

def _parse_ts(val: Any) -> Optional[datetime]:
    if val is None:
        return None
    try:
        return dateparser.parse(str(val))
    except Exception:
        return None

def _favicon_candidates(page_url: Optional[str]) -> List[str]:
    """Generate a few likely favicon URLs from a page URL (no network calls)."""
    if not page_url:
        return []
    try:
        host = urlparse(page_url).netloc
        if not host:
            return []
        candidates = [
            f"https://www.google.com/s2/favicons?domain={host}",
            f"https://www.google.com/s2/favicons?sz=64&domain={host}",
            f"https://{host}/favicon.ico",
        ]
        # Deduplicate while preserving order
        seen, out = set(), []
        for c in candidates:
            if c not in seen:
                out.append(c); seen.add(c)
        return out
    except Exception:
        return []

def _first_non_empty(obj: dict, keys: List[str]) -> Optional[str]:
    for k in keys:
        try:
            v = obj.get(k)
            if v is None:
                continue
            s = str(v).strip()
            if s:
                return s
        except Exception:
            continue
    return None

def _extract_hex_color(val) -> Optional[str]:
    """Try to extract a hex color string from various shapes."""
    try:
        if val is None:
            return None
        if isinstance(val, str):
            s = val.strip()
            if s:
                return s
            return None
        if isinstance(val, dict):
            # Common shapes: { hex: "#RRGGBB" } or { card_color: { hex: "#..." } }
            if 'hex' in val and isinstance(val['hex'], str) and val['hex'].strip():
                return val['hex'].strip()
            # Nested under card_color / color keys
            for key in ('card_color', 'color', 'value'):
                nested = val.get(key)
                if isinstance(nested, dict):
                    h = _extract_hex_color(nested)
                    if h:
                        return h
                elif isinstance(nested, str) and nested.strip():
                    return nested.strip()
        # Fallback: nothing found
        return None
    except Exception:
        return None

def _fetch_items_by_entity(entity_query: str, require_id: bool = True) -> List[Dict[str, Any]]:
    """Core fetch logic used by the HTTP endpoint."""
    norm_query = _normalize_entity_key(entity_query)
    if not norm_query:
        return []

    client = MongoClient(host=MONGO_HOST, port=MONGO_PORT)
    coll = client[DB_NAME][COLL_NAME]

    cursor = coll.find({}, projection={ARRAY_FIELD: 1}).sort("_id", 1)
    results: List[Dict[str, Any]] = []

    for doc in cursor:
        items = (doc.get(ARRAY_FIELD) or [])
        for it in items:
            # id filter
            idv = it.get("id_number")
            if idv is not None:
                try:
                    idv = int(idv)
                except Exception:
                    idv = None
            if require_id and not isinstance(idv, int):
                continue

            ents = _parse_entities_field(it.get("entities"))
            if not ents:
                continue

            if not any(_normalize_entity_key(e) == norm_query for e in ents):
                continue

            ts = _parse_ts(it.get("timestamp"))
            page_url = it.get("page_url")

            favicons_field = it.get("favicon") or it.get("favicons")
            if isinstance(favicons_field, str):
                favicons = [favicons_field]
            elif isinstance(favicons_field, list):
                favicons = [str(x) for x in favicons_field if x]
            else:
                favicons = _favicon_candidates(page_url)

            # Normalize title/description with fallbacks
            title = _first_non_empty(it, ["title", "Title", "headline", "name"]) or None
            description = _first_non_empty(it, ["description", "desc", "summary"]) or None

            # Ensure image_url is a list
            raw_img = it.get("image_url")
            if isinstance(raw_img, str):
                image_url = [raw_img] if raw_img.strip() else []
            elif isinstance(raw_img, list):
                image_url = [str(x) for x in raw_img if str(x).strip()]
            else:
                image_url = []

            # Ensure page_url is a list
            if isinstance(page_url, str):
                page_url_list = [page_url] if page_url.strip() else []
            elif isinstance(page_url, list):
                page_url_list = [str(x) for x in page_url if str(x).strip()]
            else:
                page_url_list = []

            # Card colors (light/dark) from item if available
            bg_light = _extract_hex_color(it.get("card_color"))
            bg_dark = _extract_hex_color(it.get("card_color_dark"))

            results.append({
                "title": title,
                "description": description,
                "favicons": favicons,
                "image_url": image_url,
                "page_url": page_url_list,
                "id_number": idv,
                "timestamp": ts.isoformat() if ts else None,
                "bgColor": bg_light,
                "bgColorDark": bg_dark,
            })

    # Sort: newest → oldest (timestamp desc, then id_number desc)
    def _sort_key(row):
        ts = row.get("timestamp")
        ts_key = dateparser.parse(ts) if ts else datetime.min
        id_key = row.get("id_number") if isinstance(row.get("id_number"), int) else -1
        return (ts_key, id_key)

    results.sort(key=_sort_key, reverse=True)
    return results

# ---------- Routes ----------
@app.get("/")
def root():
    return jsonify({
        "ok": True,
        "message": "Use /search?entity=<name>&require_id=true|false",
        "example": "/search?entity=NVIDIA&require_id=true"
    })

@app.get("/search")
def search():
    entity = request.args.get("entity", "", type=str)
    require_id = request.args.get("require_id", "true").lower() in ("1", "true", "yes", "y")
    if not entity.strip():
        return jsonify({"ok": False, "error": "Missing 'entity' query parameter"}), 400

    try:
        items = _fetch_items_by_entity(entity_query=entity, require_id=require_id)
        return jsonify({
            "ok": True,
            "entity_query": entity,
            "count": len(items),
            "items": items
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# ---------- Entrypoint ----------
if __name__ == "__main__":
    # Listen on all interfaces on port 5001 (>=1024 avoids root requirement)
    app.run(host="0.0.0.0", port=5006, debug=False)