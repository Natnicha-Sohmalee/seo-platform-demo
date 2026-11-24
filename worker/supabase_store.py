import json
import os
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from uuid import UUID


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def assert_configured():
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SECRET_KEY", "").strip()

    if not url or not key:
        raise RuntimeError(
            "กรุณาตั้งค่า SUPABASE_URL และ SUPABASE_SECRET_KEY ใน worker/.env"
        )

    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise RuntimeError("SUPABASE_URL ต้องเป็น URL แบบ https")

    return url, key


def _write(method, table, data, query):
    base, key = assert_configured()
    url = f"{base}/rest/v1/{table}?{urlencode(query)}"
    payload = json.dumps(data, ensure_ascii=False).encode("utf-8")

    for attempt in range(3):
        request = Request(
            url,
            data=payload,
            method=method,
            headers={
                "apikey": key,
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )

        try:
            with urlopen(request, timeout=15) as response:
                response.read()
            return

        except HTTPError as error:
            body = error.read().decode("utf-8", errors="replace")
            message = body.replace(key, "<REDACTED>")[:400]

            if attempt < 2 and (
                error.code == 429 or error.code >= 500
            ):
                time.sleep(attempt + 1)
                continue

            raise RuntimeError(
                f"บันทึก Supabase ไม่สำเร็จ HTTP {error.code}: {message}"
            ) from None

        except (URLError, TimeoutError, OSError):
            if attempt < 2:
                time.sleep(attempt + 1)
                continue

            raise RuntimeError(
                "ติดต่อ Supabase เพื่อบันทึกผลไม่ได้"
            ) from None


def persist_job(job_id, **fields):
    job_id = str(UUID(str(job_id)))
    _write("PATCH", "crawl_jobs", fields, {"id": f"eq.{job_id}"})


def persist_page(job_id, page):
    job_id = str(UUID(str(job_id)))

    row = {
        "crawl_job_id": job_id,
        "url": page["url"],
        "final_url": page.get("final_url"),
        "status": page.get("status", "fetch_error"),
        "http_status": page.get("http_status"),
        "title": page.get("title"),
        "description": page.get("description"),
        "canonical": page.get("canonical"),
        "text_content": page.get("text"),
        "markdown": page.get("markdown"),
        "headings": page.get("headings") or [],
        "links": page.get("links") or [],
        "warnings": page.get("warnings") or [],
        "fetched_at": page.get("fetched_at") or utc_now(),
        "raw_result": page,
    }

    _write(
        "POST",
        "crawl_pages",
        row,
        {"on_conflict": "crawl_job_id,url"},
    )