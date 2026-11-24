"use client";

import Link from "next/link";
import { useProjectAccount } from "@/lib/use-project-account";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import CrawlRunner from "@/components/crawl-runner";
import CrawlJobHistory from "@/components/crawl-job-history";
import WorkspaceShell from "@/components/workspace-shell";
import { Icon, WsTitle } from "@/components/ui-icons";
import { UUID_PATTERN } from "@/lib/crawl-types";

type Project = {
  id: string;
  name: string;
  websiteUrl: string;
};

type CrawlDraft = {
  id: string;
  projectId: string;
  seedUrl: string;
  maxPages: number;
  maxDepth: number;
  renderJs: boolean;
  createdAt: string;
};

const DRAFTS_KEY = "seo-platform:demo-crawl-drafts";

function readDrafts(): CrawlDraft[] {
  const saved = localStorage.getItem(DRAFTS_KEY);
  if (!saved) return [];

  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed)) {
    throw new Error("ข้อมูลแบบร่างไม่ถูกต้อง");
  }

  return parsed.filter(
    (item): item is CrawlDraft =>
      item !== null &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.projectId === "string" &&
      typeof item.seedUrl === "string" &&
      typeof item.maxPages === "number" &&
      typeof item.maxDepth === "number" &&
      typeof item.renderJs === "boolean" &&
      typeof item.createdAt === "string"
  );
}

function ProjectDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [showLegacy, setShowLegacy] = useState(false);
  const [legacyId, setLegacyId] = useState("");
  const startLock = useRef(false);
  const generation = useRef(0);
  const {
    client,
    userId,
    checking,
    error: accountError,
  } = useProjectAccount();

  const [project, setProject] = useState<Project | null>(null);
  const [drafts, setDrafts] = useState<CrawlDraft[]>([]);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");

  const [seedUrl, setSeedUrl] = useState("");
  const [maxPages, setMaxPages] = useState(5);
  const [maxDepth, setMaxDepth] = useState(2);
  const [renderJs, setRenderJs] = useState(false);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let active = true;
    startLock.current = false;
    setSubmitting(false);
    setShowLegacy(false);
    setLegacyId("");

    setReady(false);
    setProject(null);
    setDrafts([]);
    setMessage("");

    if (!client || !userId) {
      setMessage(accountError);
      setReady(!checking);
      return;
    }

    async function loadProject() {
      if (!client) return;

      try {
        const { data, error } = await client
          .from("projects")
          .select("id, name, website_url")
          .eq("id", id)
          .eq("user_id", userId)
          .maybeSingle();

        if (!active) return;
        if (error) throw new Error(error.message);

        if (!data) {
          setMessage("ไม่พบโปรเจกต์นี้ในบัญชีของคุณ");
          return;
        }

        setProject({
          id: data.id,
          name: data.name,
          websiteUrl: data.website_url,
        });

        setSeedUrl(data.website_url);

        try {
          setDrafts(readDrafts().filter((draft) => draft.projectId === id));
        } catch {
          setMessage(
            "เปิดโปรเจกต์แล้ว แต่อ่านรายการงานเก่าในเบราว์เซอร์ไม่ได้ ประวัติในบัญชียังเปิดได้ตามปกติ"
          );
        }
      } catch (error) {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "โหลดโปรเจกต์ไม่ได้"
          );
        }
      } finally {
        if (active) setReady(true);
      }
    }

    void loadProject();

    return () => {
      active = false;
      if (generation.current === currentGeneration) generation.current++;
    };
  }, [id, client, userId, checking, accountError]);

  async function handleStartCrawl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project || !userId || !ready || startLock.current) return;
    setMessage("");
    if (
      !Number.isInteger(maxPages) ||
      maxPages < 1 ||
      maxPages > 10 ||
      !Number.isInteger(maxDepth) ||
      maxDepth < 1 ||
      maxDepth > 3
    ) {
      setMessage("กำหนดจำนวนหน้า 1–10 และความลึก 1–3");
      return;
    }
    const currentGeneration = generation.current;
    startLock.current = true;
    setSubmitting(true);
    try {
      const url = new URL(seedUrl.trim());
      const website = new URL(project.websiteUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.origin !== website.origin
      ) {
        throw new Error(
          "URL เริ่มต้นต้องอยู่ในเว็บไซต์เดียวกับโปรเจกต์ และไม่มี query"
        );
      }
      url.hash = "";
      const response = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          url: url.href,
          max_pages: maxPages,
          max_depth: maxDepth,
          render_js: renderJs,
        }),
      });
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(
          `เซิร์ฟเวอร์ตอบกลับไม่สมบูรณ์ (HTTP ${response.status}) กรุณาตรวจประวัติก่อนเริ่มงานใหม่`
        );
      }
      if (currentGeneration !== generation.current) return;
      const jobId =
        typeof data?.job_id === "string" && UUID_PATTERN.test(data.job_id)
          ? data.job_id
          : null;
      if (jobId)
        router.replace(`/projects/${project.id}?job=${jobId}#crawl-result`, {
          scroll: false,
        });
      if (!response.ok)
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "เริ่มอ่านเว็บไซต์ไม่สำเร็จ กรุณาตรวจประวัติงาน"
        );
      if (!jobId) throw new Error("ไม่ได้รับรหัสงาน กรุณาตรวจประวัติก่อนเริ่มใหม่");
      setMessage(
        "บันทึกงานและส่งให้อ่านเว็บไซต์แล้ว เปิดติดตามผลในประวัติด้านล่างได้เลย"
      );
    } catch (error) {
      if (currentGeneration === generation.current)
        setMessage(
          error instanceof Error ? error.message : "เริ่มอ่านเว็บไซต์ไม่สำเร็จ"
        );
    } finally {
      if (currentGeneration === generation.current) {
        startLock.current = false;
        setSubmitting(false);
        setHistoryRevision((value) => value + 1);
      }
    }
  }

  async function handleDeleteProject() {
    if (!client || !project || !userId || deleting || submitting) return;

    const confirmed = window.confirm(
      `ต้องการลบโปรเจกต์ "${project.name}" และประวัติการอ่านเว็บไซต์ทั้งหมดของโปรเจกต์นี้ใช่หรือไม่?`
    );
    if (!confirmed) return;

    setDeleting(true);
    setMessage("");
    try {
      const { error } = await client
        .from("projects")
        .delete()
        .eq("id", project.id)
        .eq("user_id", userId);

      if (error) throw new Error(error.message);
      router.replace("/projects");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "ลบโปรเจกต์ไม่สำเร็จ"
      );
      setDeleting(false);
    }
  }

  return (
    <WorkspaceShell
      activeRoute="/projects"
      breadcrumb={project ? `โปรเจกต์เว็บไซต์ / ${project.name}` : "โปรเจกต์เว็บไซต์"}
    >
      {!ready ? (
        <div className="studio-card">
          <p style={{ margin: 0, color: "var(--muted)" }}>กำลังโหลดโปรเจกต์…</p>
        </div>
      ) : !project ? (
        <section className="studio-card">
          <h2>ไม่พบโปรเจกต์</h2>
          <p style={{ color: "var(--muted)" }}>
            {message || "โปรเจกต์อาจถูกลบหรืออยู่ในบัญชีอื่น"}
          </p>
          <Link href="/projects" className="btn btn-secondary">
            ← กลับไปหน้ารวมโปรเจกต์
          </Link>
        </section>
      ) : (
        <>
          <WsTitle
            eyebrow="Website Crawler & Audit"
            title={project.name}
            body={project.websiteUrl}
            action={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href="/projects" className="btn btn-secondary">
                  ← โปรเจกต์ทั้งหมด
                </Link>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: "#a43d34", borderColor: "#f0c2bc", background: "#fdf2f0" }}
                  disabled={deleting || submitting}
                  onClick={() => void handleDeleteProject()}
                >
                  {deleting ? "กำลังลบ…" : "ลบโปรเจกต์"}
                </button>
              </div>
            }
          />

          <div className="fact-box" style={{ marginBottom: 20 }}>
            <Icon name="alert" />
            <div>
              <b>เก็บประวัติแยกทุกรอบ</b>
              <p>
                เริ่มอ่านเว็บไซต์เพื่อเตรียมข้อมูลสำหรับบทความ งานแต่ละรอบเก็บแยกกันในประวัติ
                เปิดผลเดิมด้วยบัญชีเดียวกันได้จากเบราว์เซอร์อื่น
              </p>
            </div>
          </div>

          <section className="studio-card" style={{ marginBottom: 24 }}>
            <h2 style={{ marginBottom: 18, fontSize: 20, fontWeight: 700 }}>
              อ่านเว็บไซต์รอบใหม่
            </h2>

            <form onSubmit={handleStartCrawl}>
              <fieldset disabled={submitting} style={{ border: 0, padding: 0, margin: 0 }}>
                <label className="crawl-label">
                  URL เริ่มต้น
                  <input
                    className="seo-input"
                    type="url"
                    required
                    value={seedUrl}
                    onChange={(event) => setSeedUrl(event.target.value)}
                  />
                </label>

                <div className="crawl-fields">
                  <label className="crawl-label">
                    จำนวนหน้าสูงสุด รวมหน้าเริ่มต้น
                    <input
                      className="seo-input"
                      type="number"
                      min={1}
                      max={10}
                      required
                      value={maxPages}
                      onChange={(event) =>
                        setMaxPages(Number(event.target.value))
                      }
                    />
                  </label>

                  <label className="crawl-label">
                    ความลึกจากหน้าเริ่มต้น
                    <select
                      className="seo-input"
                      value={maxDepth}
                      onChange={(event) =>
                        setMaxDepth(Number(event.target.value))
                      }
                    >
                      <option value={1}>1 ระดับ</option>
                      <option value={2}>2 ระดับ</option>
                      <option value={3}>3 ระดับ</option>
                    </select>
                  </label>
                </div>

                <label className="crawl-checkbox">
                  <input
                    type="checkbox"
                    checked={renderJs}
                    onChange={(event) => setRenderJs(event.target.checked)}
                  />
                  <span>โหลด JavaScript ด้วย Edge</span>
                </label>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  <Icon name="globe" size={18} />{" "}
                  {submitting ? "กำลังเริ่มงาน…" : "เริ่มอ่านเว็บไซต์"}
                </button>
              </fieldset>
            </form>

            {message && (
              <p
                role="status"
                aria-live="polite"
                style={{ marginTop: 16, fontSize: 13, color: "var(--green)" }}
              >
                {message}
              </p>
            )}
          </section>

          {userId && (
            <CrawlJobHistory
              key={`${userId}:${project.id}`}
              projectId={project.id}
              ownerId={userId}
              refreshKey={String(historyRevision)}
            />
          )}

          {drafts.length > 0 && (
            <details
              className="studio-card"
              style={{ marginTop: 20 }}
              open={showLegacy}
              onToggle={(event) => setShowLegacy(event.currentTarget.open)}
            >
              <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--green)" }}>
                งานเดิมในเบราว์เซอร์นี้ · {drafts.length} รายการ
              </summary>
              {showLegacy && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>
                    เก็บสำเนาเดิมไว้ให้เปิดดู แยกจากประวัติในบัญชี การเปิดผลไม่เริ่มอ่านเว็บไซต์ใหม่
                  </p>
                  <label className="crawl-label">
                    เลือกงานเดิม
                    <select
                      className="seo-input"
                      value={legacyId}
                      onChange={(event) => setLegacyId(event.target.value)}
                    >
                      <option value="">เลือกงานที่ต้องการเปิด</option>
                      {drafts.map((draft) => (
                        <option key={draft.id} value={draft.id}>
                          {new Date(draft.createdAt).toLocaleString("th-TH")} ·{" "}
                          {draft.seedUrl}
                        </option>
                      ))}
                    </select>
                  </label>
                  {legacyId && (
                    <CrawlRunner
                      key={legacyId}
                      projectId={project.id}
                      legacyStorageId={legacyId}
                    />
                  )}
                </div>
              )}
            </details>
          )}
        </>
      )}

      <style jsx>{`
        .crawl-label {
          display: flex;
          flex-direction: column;
          gap: 7px;
          font-size: 13px;
          font-weight: 600;
        }
        .crawl-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin: 18px 0;
        }
        .crawl-checkbox {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 20px;
          font-size: 13px;
          cursor: pointer;
        }
        .crawl-checkbox input {
          width: 16px;
          height: 16px;
          accent-color: var(--green);
        }
        @media (max-width: 650px) {
          .crawl-fields {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </WorkspaceShell>
  );
}

export default function ProjectDetailPage() {
  return (
    <Suspense
      fallback={
        <WorkspaceShell activeRoute="/projects">
          <div className="studio-card">
            <p style={{ margin: 0 }}>กำลังเปิดโปรเจกต์…</p>
          </div>
        </WorkspaceShell>
      }
    >
      <ProjectDetailContent />
    </Suspense>
  );
}
