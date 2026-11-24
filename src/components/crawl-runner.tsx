"use client";

import { useEffect, useState } from "react";
import ContentBriefPanel from "@/components/content-brief-panel";
import SeoAuditPanel from "@/components/seo-audit-panel";
import { loadCrawlResult } from "@/lib/crawl-storage";
import { CRAWL_STATUS_LABELS, type CrawlJob } from "@/lib/crawl-types";
import styles from "./crawl-results.module.css";

type Props = {
  projectId: string;
  jobId?: string;
  legacyStorageId?: string;
  onStatusChanged?: () => void;
};

export default function CrawlRunner({ projectId, jobId, legacyStorageId, onStatusChanged }: Props) {
  const [job, setJob] = useState<CrawlJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastStatus = "";
    const controller = new AbortController();
    setLoading(true);
    setError("");

    async function read() {
      try {
        if (legacyStorageId) {
          const stored = await loadCrawlResult<CrawlJob>(legacyStorageId);
          if (!active) return;
          if (!stored || !stored.job || !Array.isArray(stored.job.pages)) throw new Error("ไม่พบผลเดิมในเบราว์เซอร์นี้ แบบร่างเดิมยังอยู่");
          setJob(stored.job);
          return;
        }
        if (!jobId) throw new Error("กรุณาเลือกงานที่ต้องการเปิด");
        const response = await fetch(`/api/crawl/${jobId}`, { cache: "no-store", signal: controller.signal });
        const raw = await response.text();
        let data;
        try { data = JSON.parse(raw); }
        catch { throw new Error(`อ่านผลจากบัญชีไม่ได้ (HTTP ${response.status}) กรุณาลองใหม่`); }
        if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "เปิดผลการอ่านเว็บไซต์ไม่ได้");
        if (data.id !== jobId || data.project_id !== projectId || !Array.isArray(data.pages)) throw new Error("ข้อมูลงานไม่ตรงกับโปรเจกต์นี้");
        if (!active) return;
        setJob(data as CrawlJob);
        if (data.status !== lastStatus) { lastStatus = data.status; onStatusChanged?.(); }
        // A lost start acknowledgement is not proof that a worker is running.
        if (data.status === "running" || (data.status === "queued" && !data.error)) timer = setTimeout(read, 2500);
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "อ่านผลไม่สำเร็จ");
      } finally { if (active) setLoading(false); }
    }
    void read();
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [projectId, jobId, legacyStorageId, retry, onStatusChanged]);

  function downloadResult() {
    if (!job) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(job, null, 2)], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `crawl-${job.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const selectedPage = job?.pages[selectedIndex];
  const briefStorageId = job ? legacyStorageId ? `${legacyStorageId}:${job.id}` : job.brief_storage_id || `crawl-job:${job.id}` : "";

  return <section className={styles.runner}>
    <div className={styles.actions}>
      <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={loading}>{loading ? "กำลังโหลดผล…" : "ตรวจสถานะอีกครั้ง"}</button>
      {job && <button type="button" onClick={downloadResult}>ดาวน์โหลด JSON</button>}
    </div>
    <p className={styles.storage}>{legacyStorageId ? "ผลเดิมนี้เก็บเฉพาะในเบราว์เซอร์ที่เคยใช้" : "เปิดจากผลที่บันทึกไว้ การเปิดดูไม่เริ่มอ่านเว็บไซต์หรือเรียก AI ใหม่"}</p>
    {error && <p role="alert" className={styles.warning}>{error}</p>}
    {job && <div aria-live="polite">
      <p><strong>{job.status === "queued" && job.error ? "ยังยืนยันการเริ่มงานไม่ได้" : CRAWL_STATUS_LABELS[job.status] ?? job.status}</strong> · มีผลบันทึก {job.pages.length} หน้า</p>
      {job.status === "running" && job.current_url && <p className={styles.url}>{job.current_url}</p>}
      {job.result && <p>ได้ข้อความถึงเกณฑ์ {job.result.succeeded} หน้า · ใช้เวลา {job.result.elapsed_seconds} วินาที</p>}
      {job.error && <p className={styles.warning}>{job.error}{job.status === "queued" ? " · กรุณาตรวจสถานะงานนี้ก่อนเริ่มรอบใหม่" : ""}</p>}
    </div>}
    {!!job?.pages.length && <>
      <div className={styles.pageList}>{job.pages.map((page, index) => <button type="button" key={page.url} aria-pressed={selectedIndex === index}
        className={selectedIndex === index ? styles.selected : ""} onClick={() => setSelectedIndex(index)}>{index + 1}. {page.title || page.url} · {page.status}</button>)}</div>
      {selectedPage && <div><p className={styles.url}>{selectedPage.url}</p>
        {selectedPage.warnings?.map((warning, index) => <p key={index} className={styles.warning}>{warning}</p>)}
        <pre className={styles.content}>{selectedPage.markdown || selectedPage.text || `ไม่มีเนื้อหา · ${selectedPage.status}`}</pre>
      </div>}
      <SeoAuditPanel pages={job.pages} />
    </>}
    {job?.status === "completed" && job.pages.length > 0 && <ContentBriefPanel key={`${job.id}:${briefStorageId}`} storageId={briefStorageId} pages={job.pages} />}
  </section>;
}
