import os
import secrets
import threading
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl

from crawler_engine import BrowserSession, crawl_site, public_fetch

from uuid import UUID
from supabase_store import (
    assert_configured,
    persist_job,
    persist_page,
    utc_now,
)

load_dotenv(Path(__file__).with_name(".env"))

assert_configured()

API_KEY = os.getenv("CRAWLER_API_KEY", "").strip()

if not API_KEY:
    raise RuntimeError("กรุณาตั้งค่า CRAWLER_API_KEY ใน worker/.env")


app = FastAPI(title="SEO Platform Crawler Worker")

jobs = {}
jobs_lock = threading.Lock()
worker_slot = threading.BoundedSemaphore(1)


class CrawlRequest(BaseModel):
    url: HttpUrl
    max_pages: int = Field(default=5, ge=1, le=10, strict=True)
    max_depth: int = Field(default=2, ge=1, le=3, strict=True)
    render_js: bool = False
    database_job_id: UUID

def require_api_key(
    x_api_key: str | None = Header(default=None),
):
    if not x_api_key or not secrets.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Unauthorized")


def execute_job(job_id: str, request: CrawlRequest):
    try:
        persist_job(
            job_id,
            status="running",
            started_at=utc_now(),
            error_message=None,
        )

        with jobs_lock:
            jobs[job_id]["status"] = "running"

        def on_update(event):
            with jobs_lock:
                job = jobs[job_id]

                if "current_url" in event:
                    job["current_url"] = event["current_url"]

                if "attempted" in event:
                    job["attempted"] = event["attempted"]

                if "page" in event:
                    job["pages"].append(event["page"])

                attempted = job["attempted"]
                current_url = job["current_url"]

            # บันทึกนอก lock เพื่อไม่กั้นการอ่านสถานะ
            if "page" in event:
                persist_page(job_id, event["page"])
                persist_job(
                    job_id,
                    attempted=attempted,
                    current_url=current_url,
                )

        if request.render_js:
            with BrowserSession() as browser_session:
                result = crawl_site(
                    seed=str(request.url),
                    max_pages=request.max_pages,
                    max_depth=request.max_depth,
                    scope="page",
                    fetcher=browser_session.fetch,
                    on_update=on_update,
                )
        else:
            result = crawl_site(
                seed=str(request.url),
                max_pages=request.max_pages,
                max_depth=request.max_depth,
                scope="page",
                fetcher=public_fetch,
                on_update=on_update,
            )

        summary = {
            "succeeded": result.get("succeeded", 0),
            "elapsed_seconds": result.get("elapsed_seconds", 0),
            "stop_reason": result.get("stop_reason", ""),
        }

        persist_job(
            job_id,
            status="completed",
            finished_at=utc_now(),
            current_url=None,
            attempted=len(result.get("pages", [])),
            result_summary=summary,
            error_message=None,
        )

        with jobs_lock:
            jobs[job_id].update(
                status="completed",
                result=result,
                render_js=request.render_js,
            )

    except Exception as error:
        message = str(error)[:500]

        with jobs_lock:
            jobs[job_id].update(
                status="failed",
                error=message,
            )

        try:
            persist_job(
                job_id,
                status="failed",
                finished_at=utc_now(),
                error_message=message,
            )
        except Exception:
            print(
                f"[Crawl {job_id}] บันทึกสถานะล้มเหลวไม่ได้ "
                "กรุณาตรวจการเชื่อมต่อ Supabase",
                flush=True,
            )

    finally:
        worker_slot.release()


@app.get("/health")
def health():
    return {"status": "ok", "service": "crawler-worker"}


@app.post("/jobs", dependencies=[Depends(require_api_key)])
def create_job(request: CrawlRequest):
    if not worker_slot.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="มีงานกำลังทำอยู่ กรุณารอให้งานเดิมจบ",
        )

    job_id = str(request.database_job_id)

    try:
        with jobs_lock:
            # เก็บประวัติชั่วคราวไม่เกิน 20 งาน
            while len(jobs) >= 20:
                removable = next(
                    (
                        key
                        for key, value in jobs.items()
                        if value["status"] in ("completed", "failed")
                    ),
                    None,
                )

                if removable is None:
                    raise RuntimeError("พื้นที่เก็บงานชั่วคราวเต็ม")

                del jobs[removable]

            jobs[job_id] = {
                "id": job_id,
                "status": "queued",
                "seed_url": str(request.url),
                "current_url": None,
                "attempted": 0,
                "pages": [],
                "result": None,
                "error": None,
            }

        threading.Thread(
            target=execute_job,
            args=(job_id, request),
            daemon=True,
        ).start()

    except Exception:
        worker_slot.release()

        with jobs_lock:
            jobs.pop(job_id, None)

        raise HTTPException(
            status_code=500,
            detail="เริ่มงานไม่สำเร็จ",
        )

    return {"job_id": job_id}


@app.get("/jobs/{job_id}", dependencies=[Depends(require_api_key)])
def get_job(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)

        if job is None:
            raise HTTPException(status_code=404, detail="ไม่พบงาน")

        return deepcopy(job)