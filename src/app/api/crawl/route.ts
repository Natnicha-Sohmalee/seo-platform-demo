import { NextResponse } from "next/server";
import {
  ApiError,
  createAdminClient,
  requireUser,
} from "@/lib/supabase/server";
import {
  callCrawlerWorker,
  CrawlerWorkerError,
} from "@/lib/crawler-worker";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const requestUrl = new URL(request.url);
  if (origin === requestUrl.origin) return true;

  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    requestUrl.protocol.replace(/:$/, "");

  return Boolean(host && origin === `${proto}://${host}`);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "ไม่อนุญาตคำขอจากเว็บไซต์อื่น" },
      { status: 403 }
    );
  }

  try {
    const { supabase, user } = await requireUser();

    let body;
    try {
      body = await request.json();
    } catch {
      throw new ApiError("รูปแบบคำขอไม่ถูกต้อง", 400);
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      typeof body.project_id !== "string" ||
      !UUID.test(body.project_id) ||
      typeof body.url !== "string" ||
      body.url.length > 2048 ||
      !Number.isInteger(body.max_pages) ||
      body.max_pages < 1 ||
      body.max_pages > 10 ||
      !Number.isInteger(body.max_depth) ||
      body.max_depth < 1 ||
      body.max_depth > 3 ||
      typeof body.render_js !== "boolean"
    ) {
      throw new ApiError("ข้อมูลโปรเจกต์หรือการตั้งค่า Crawl ไม่ถูกต้อง", 400);
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, website_url")
      .eq("id", body.project_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError) throw new ApiError("ตรวจสอบโปรเจกต์ไม่ได้");
    if (!project) throw new ApiError("ไม่พบโปรเจกต์ในบัญชีของคุณ", 404);

    let seed: URL;

    try {
      seed = new URL(body.url);
      const website = new URL(project.website_url);

      if (
        !["http:", "https:"].includes(seed.protocol) ||
        seed.username ||
        seed.password ||
        seed.search ||
        seed.origin !== website.origin
      ) {
        throw new Error();
      }

      seed.hash = "";
    } catch {
      throw new ApiError(
        "URL เริ่มต้นต้องอยู่ในเว็บไซต์ของโปรเจกต์และไม่มี query",
        400
      );
    }

    const admin = createAdminClient();

    const { data: job, error: insertError } = await admin
      .from("crawl_jobs")
      .insert({
        project_id: project.id,
        seed_url: seed.href,
        max_pages: body.max_pages,
        max_depth: body.max_depth,
        render_js: body.render_js,
        status: "queued",
      })
      .select("id")
      .single();

    if (insertError || !job) {
      throw new ApiError("บันทึกงาน Crawl ลงฐานข้อมูลไม่ได้");
    }

    try {
      await callCrawlerWorker("/jobs", "POST", {
        database_job_id: job.id,
        url: seed.href,
        max_pages: body.max_pages,
        max_depth: body.max_depth,
        render_js: body.render_js,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "เริ่ม worker ไม่สำเร็จ";

      // ถ้า worker ตอบปฏิเสธชัดเจน ให้ปิดงานที่ยังไม่เริ่ม
      // ถ้าเชื่อมต่อหลุด ยังไม่สรุปว่างานล้มเหลว
      const rejected =
        error instanceof CrawlerWorkerError && error.status > 0;

      const { error: updateError } = await admin
        .from("crawl_jobs")
        .update({
          error_message: message,
          ...(rejected
            ? {
                status: "failed",
                finished_at: new Date().toISOString(),
              }
            : {}),
        })
        .eq("id", job.id)
        .eq("status", "queued");

      if (updateError) {
        console.error("[Crawl] บันทึกสถานะการเริ่มงานไม่ได้", job.id);
      }

      return NextResponse.json(
        { error: message, job_id: job.id },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { job_id: job.id },
      { status: 202, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof ApiError
            ? error.message
            : "เริ่มงาน Crawl ไม่สำเร็จ",
      },
      { status: error instanceof ApiError ? error.status : 500 }
    );
  }
}