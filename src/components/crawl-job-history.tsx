"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CRAWL_STATUS_LABELS, UUID_PATTERN, type CrawlHistoryEntry } from "@/lib/crawl-types";
import ActionLink from "@/components/action-link";
import CrawlRunner from "@/components/crawl-runner";
import styles from "./crawl-job-history.module.css";

type Props = { projectId: string; ownerId: string; refreshKey?: string | null };
const PAGE_SIZE = 20;

export default function CrawlJobHistory(props: Props) {
  return <Suspense fallback={<p role="status">กำลังเปิดประวัติการอ่านเว็บไซต์…</p>}>
    <History key={`${props.ownerId}:${props.projectId}`} {...props} />
  </Suspense>;
}

function History({ projectId, ownerId, refreshKey }: Props) {
  const client = useMemo(() => createClient(), []);
  const query = useSearchParams();
  const queryJob = query.get("job");
  const selectedId = queryJob && UUID_PATTERN.test(queryJob) ? queryJob : null;
  const [jobs, setJobs] = useState<CrawlHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const revision = useRef(0);

  const load = useCallback(async (offset = 0, append = false) => {
    const current = ++revision.current;
    setLoading(true);
    setError("");
    try {
      const account = await client.auth.getUser();
      if (account.error || account.data.user?.id !== ownerId) throw new Error("กรุณาเข้าสู่ระบบด้วยบัญชีเดิมเพื่อเปิดประวัติ");
      const { data, error: readError } = await client.from("crawl_jobs")
        .select("id,seed_url,status,max_pages,max_depth,render_js,attempted,created_at,finished_at,error_message")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + PAGE_SIZE);
      if (readError) throw new Error("โหลดประวัติการอ่านเว็บไซต์ไม่ได้ กรุณาลองอีกครั้ง");
      if (current !== revision.current) return;
      const rows = (data ?? []) as CrawlHistoryEntry[];
      const visible = rows.slice(0, PAGE_SIZE);
      setHasMore(rows.length > PAGE_SIZE);
      setJobs((previous) => append
        ? [...previous, ...visible.filter((row) => !previous.some((old) => old.id === row.id))]
        : visible);
    } catch (cause) {
      if (current === revision.current) setError(cause instanceof Error ? cause.message : "โหลดประวัติไม่ได้");
    } finally { if (current === revision.current) setLoading(false); }
  }, [client, ownerId, projectId]);

  useEffect(() => {
    void load();
    const focus = () => { void load(); };
    window.addEventListener("focus", focus);
    return () => { revision.current++; window.removeEventListener("focus", focus); };
  }, [load, refreshKey]);

  const statusChanged = useCallback(() => { void load(); }, [load]);

  return <section className={styles.history} aria-label="ประวัติการอ่านเว็บไซต์">
    <div className={styles.heading}><div><h2>ประวัติการอ่านเว็บไซต์</h2><p>แต่ละรอบเก็บแยกกัน เปิดผลเดิมได้โดยไม่เริ่มอ่านใหม่</p></div>
      <button type="button" className={styles.secondary} disabled={loading} onClick={() => void load()}>{loading ? "กำลังโหลด…" : "รีเฟรชประวัติ"}</button>
    </div>
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    {!loading && !error && !jobs.length && <p className={styles.empty}>ยังไม่มีประวัติ เริ่มอ่านเว็บไซต์จากแบบฟอร์มด้านบนได้เลย</p>}
    {jobs.length > 0 && <div className={styles.list}>{jobs.map((job) => <article key={job.id} className={`${styles.card} ${selectedId === job.id ? styles.selected : ""}`}>
      <div className={styles.info}>
        <div className={styles.meta}><span className={styles.badge}>{job.status === "queued" && job.error_message ? "ยังยืนยันการเริ่มงานไม่ได้" : CRAWL_STATUS_LABELS[job.status] ?? job.status}</span><time dateTime={job.created_at}>{new Date(job.created_at).toLocaleString("th-TH")}</time></div>
        <p className={styles.url}>{job.seed_url}</p>
        <p className={styles.settings}>อ่านแล้ว {job.attempted ?? 0} หน้า · สูงสุด {job.max_pages} หน้า · ลึก {job.max_depth} ระดับ · {job.render_js ? "เปิด JavaScript" : "อ่าน HTML"}</p>
      </div>
      <ActionLink variant={selectedId === job.id ? "primary" : "secondary"} href={`/projects/${projectId}?job=${job.id}#crawl-result`} aria-current={selectedId === job.id ? "true" : undefined}>เปิดผล</ActionLink>
    </article>)}</div>}
    {hasMore && <button type="button" className={styles.secondary} disabled={loading} onClick={() => void load(jobs.length, true)}>โหลดประวัติเพิ่ม</button>}
    {selectedId && <section id="crawl-result" className={styles.result} aria-label="ผลการอ่านเว็บไซต์ที่เลือก">
      <h2>ผลการอ่านเว็บไซต์</h2>
      <CrawlRunner key={selectedId} projectId={projectId} jobId={selectedId} onStatusChanged={statusChanged} />
    </section>}
  </section>;
}
