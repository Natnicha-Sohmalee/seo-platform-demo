import { NextResponse } from "next/server";
import { ApiError, requireUser } from "@/lib/supabase/server";
import { UUID_PATTERN } from "@/lib/crawl-types";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    if (!UUID_PATTERN.test(jobId)) throw new ApiError("รหัสงานไม่ถูกต้อง", 400);
    const { supabase, user } = await requireUser();
    const { data: job, error } = await supabase.from("crawl_jobs")
      .select("id,project_id,status,seed_url,max_pages,max_depth,render_js,created_at,started_at,finished_at,current_url,attempted,error_message,result_summary")
      .eq("id", jobId).maybeSingle();
    if (error) throw new ApiError("อ่านสถานะงานไม่ได้");
    if (!job) throw new ApiError("ไม่พบงานในบัญชีของคุณ", 404);

    // Verify ownership explicitly in addition to the table's RLS policies.
    const { data: project, error: ownerError } = await supabase.from("projects")
      .select("id").eq("id", job.project_id).eq("user_id", user.id).maybeSingle();
    if (ownerError) throw new ApiError("ตรวจสอบสิทธิ์โปรเจกต์ไม่ได้");
    if (!project) throw new ApiError("ไม่พบงานในบัญชีของคุณ", 404);

    const { data: pages, error: pagesError } = await supabase.from("crawl_pages")
      .select("url,final_url,status,http_status,title,description,canonical,text_content,markdown,headings,links,warnings,fetched_at,raw_result")
      .eq("crawl_job_id", jobId).order("created_at", { ascending: true });
    if (pagesError) throw new ApiError("อ่านผลหน้าเว็บไม่ได้");

    const canonicalKey = `brief:crawl-job:${jobId}`;
    let briefKey = canonicalKey;
    if (job.status === "completed") {
      // Earlier records used a browser draft ID. Reopen that same cloud Brief
      // when unambiguous, instead of creating another blank workspace.
      const { data: briefs, error: briefError } = await supabase.from("content_briefs")
        .select("storage_key").eq("user_id", user.id).like("storage_key", `brief:%:${jobId}`).limit(20);
      if (!briefError && briefs) {
        if (briefs.some((brief) => brief.storage_key === canonicalKey)) briefKey = canonicalKey;
        else if (briefs.length === 1) briefKey = briefs[0].storage_key;
      }
    }

    return NextResponse.json({
      id: job.id,
      project_id: job.project_id,
      status: job.status,
      seed_url: job.seed_url,
      max_pages: job.max_pages,
      max_depth: job.max_depth,
      render_js: job.render_js,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at,
      current_url: job.current_url,
      attempted: job.attempted,
      error: job.error_message,
      brief_storage_id: briefKey.slice("brief:".length),
      result: job.result_summary && Object.keys(job.result_summary).length ? job.result_summary : null,
      pages: (pages ?? []).map((page) => {
        const raw = page.raw_result && typeof page.raw_result === "object" && !Array.isArray(page.raw_result) ? page.raw_result : {};
        return {
          ...raw,
          url: page.url,
          final_url: page.final_url,
          status: page.status,
          http_status: page.http_status,
          title: page.title,
          description: page.description,
          canonical: page.canonical,
          text: page.text_content,
          markdown: page.markdown,
          headings: page.headings ?? [],
          links: page.links ?? [],
          warnings: page.warnings ?? [],
          fetched_at: page.fetched_at,
        };
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ApiError ? error.message : "อ่านสถานะงานไม่สำเร็จ" },
      { status: error instanceof ApiError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
  }
}
