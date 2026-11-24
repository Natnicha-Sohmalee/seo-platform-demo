import type { SeoPage } from "@/lib/seo-audit";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type CrawlStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export const CRAWL_STATUS_LABELS: Record<CrawlStatus, string> = {
  queued: "รอเริ่มงาน",
  running: "กำลังอ่านเว็บไซต์",
  completed: "อ่านเสร็จแล้ว",
  failed: "งานไม่สำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};
export type CrawlPage = SeoPage & { markdown?: string; text?: string; warnings?: string[] };
export type CrawlJob = {
  id: string;
  project_id?: string;
  status: CrawlStatus;
  current_url?: string | null;
  attempted?: number;
  pages: CrawlPage[];
  error?: string | null;
  brief_storage_id?: string;
  result?: { succeeded: number; elapsed_seconds: number; stop_reason: string } | null;
};
export type CrawlHistoryEntry = {
  id: string;
  seed_url: string;
  status: CrawlStatus;
  max_pages: number;
  max_depth: number;
  render_js: boolean;
  attempted: number;
  created_at: string;
  finished_at: string | null;
  error_message: string | null;
};
