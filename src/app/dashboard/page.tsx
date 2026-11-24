"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import WorkspaceShell from "@/components/workspace-shell";
import { Badge, Icon } from "@/components/ui-icons";
import { ActionableNotice, SourceStamp, TermHelp } from "@/components/ux-primitives";
import { useProjectAccount } from "@/lib/use-project-account";
import { createContentStore } from "@/lib/content-storage";
import { analyzeSeo, type SeoPage } from "@/lib/seo-audit";
import { articleDate, articleHref, listArticles, type ArticleListEntry } from "@/lib/article-library";
import { isKeywordSet, type KeywordRow, type KeywordSet } from "@/lib/keyword-data";
import { isSavedBrief } from "@/lib/content-validation";
import type { PageSpeedReport } from "@/app/api/pagespeed/route";
import styles from "./dashboard.module.css";

type Project = { id: string; name: string; websiteUrl: string };
type BriefSummary = { key: string; title: string; business: string; savedAt: string };

function gaugeTone(score: number | null): "green" | "amber" | "red" | "gray" {
  if (score === null) return "gray";
  if (score >= 90) return "green";
  if (score >= 50) return "amber";
  return "red";
}

function csvCell(value: string): string {
  const safe = value.replace(/"/g, '""');
  return /[",\r\n]/.test(safe) ? `"${safe}"` : safe;
}

export default function DashboardPage() {
  const { client, userId, checking, error: accountError } = useProjectAccount();
  const store = useMemo(() => (userId ? createContentStore(userId) : null), [userId]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState("");

  // Crawl & SEO Audit state for active project
  const [crawledPages, setCrawledPages] = useState<SeoPage[]>([]);
  const [lastCrawlAt, setLastCrawlAt] = useState<string | null>(null);
  const [loadingCrawl, setLoadingCrawl] = useState(false);

  // Content & Keywords state
  const [articles, setArticles] = useState<ArticleListEntry[]>([]);
  const [briefs, setBriefs] = useState<BriefSummary[]>([]);
  const [topKeywords, setTopKeywords] = useState<{ setName: string; rows: KeywordRow[] }>({
    setName: "",
    rows: [],
  });

  // PageSpeed state (cached per project + strategy, persisted in localStorage)
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [psiCache, setPsiCache] = useState<Record<string, PageSpeedReport>>({});
  const [psiLoading, setPsiLoading] = useState(false);
  const [psiError, setPsiError] = useState("");
  const [psiErrorHint, setPsiErrorHint] = useState("");

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = window.localStorage.getItem(`seo-platform:psi-cache:${userId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, PageSpeedReport>;
        if (parsed && typeof parsed === "object") {
          setPsiCache(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [userId]);

  // Load projects, articles, briefs, keywords
  useEffect(() => {
    if (!client || !userId || !store) return;
    let active = true;
    setLoadingData(true);
    setDataError("");

    void Promise.all([
      client
        .from("projects")
        .select("id, name, website_url")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      listArticles(store),
      store.list("brief:"),
      store.list("keyword-set:"),
    ])
      .then(([projRes, artRes, briefRows, kwRows]) => {
        if (!active) return;
        if (projRes.error) {
          setDataError(`โหลดรายการโปรเจกต์ไม่ได้: ${projRes.error.message}`);
        } else {
          const list: Project[] = (projRes.data ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            websiteUrl: row.website_url,
          }));
          setProjects(list);
          if (list.length > 0) {
            setSelectedProjectId((prev) => prev || list[0].id);
          }
        }

        setArticles(artRes.entries);
        setBriefs(
          briefRows
            .filter((row) => isSavedBrief(row.value.job))
            .map((row) => {
              const d = row.value.job as Record<string, unknown>;
              return {
                key: row.key,
                title: String(d.topic || d.brand || "แผนบทความที่ยังไม่ได้ตั้งชื่อ"),
                business: String(d.brand || ""),
                savedAt: row.value.savedAt,
              };
            })
            .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
        );

        const validSets = kwRows
          .filter((row) => isKeywordSet(row.value.job))
          .map((row) => row.value.job as KeywordSet)
          .sort((a, b) => Date.parse(b.metadata.importedAt) - Date.parse(a.metadata.importedAt));
        if (validSets.length > 0) {
          setTopKeywords({ setName: validSets[0].name, rows: validSets[0].rows.slice(0, 5) });
        } else {
          setTopKeywords({ setName: "", rows: [] });
        }
      })
      .catch((err) => {
        if (active) {
          setDataError(err instanceof Error ? err.message : "โหลดข้อมูลแดชบอร์ดไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    return () => {
      active = false;
    };
  }, [client, userId, store]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId]
  );

  // Load latest completed crawl pages for active project
  useEffect(() => {
    if (!client || !activeProject) {
      setCrawledPages([]);
      setLastCrawlAt(null);
      return;
    }
    let active = true;
    setLoadingCrawl(true);

    async function loadLatestCrawl() {
      if (!client || !activeProject) return;
      try {
        const { data: job } = await client
          .from("crawl_jobs")
          .select("id, finished_at, created_at")
          .eq("project_id", activeProject.id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!active) return;
        if (!job) {
          setCrawledPages([]);
          setLastCrawlAt(null);
          return;
        }
        setLastCrawlAt(job.finished_at || job.created_at);
        const { data: pages } = await client
          .from("crawl_pages")
          .select("url, status, title, description, canonical, headings, text_content")
          .eq("crawl_job_id", job.id);

        if (!active) return;
        const mapped: SeoPage[] = (pages ?? []).map((p) => ({
          url: p.url,
          status: p.status ?? "ok",
          title: p.title,
          description: p.description,
          canonical: p.canonical,
          headings: Array.isArray(p.headings) ? p.headings : [],
          text: p.text_content ?? "",
        }));
        setCrawledPages(mapped);
      } finally {
        if (active) setLoadingCrawl(false);
      }
    }

    void loadLatestCrawl();

    return () => {
      active = false;
    };
  }, [client, activeProject]);

  const seoReport = useMemo(() => analyzeSeo(crawledPages), [crawledPages]);
  const sortedFindings = useMemo(() => {
    const order = { problem: 0, review: 1, unavailable: 2 };
    return [...seoReport.findings].sort((a, b) => order[a.level] - order[b.level]);
  }, [seoReport]);

  const psiKey = activeProject ? `${activeProject.id}:${device}` : "";
  const activePsi = psiKey ? psiCache[psiKey] ?? null : null;
  const mobilePsi = activeProject ? psiCache[`${activeProject.id}:mobile`] ?? null : null;

  const runPageSpeed = useCallback(
    async (targetStrategy: "mobile" | "desktop" = device, force = false) => {
      if (!activeProject || psiLoading) return;
      setPsiLoading(true);
      setPsiError("");
      setPsiErrorHint("");
      try {
        const res = await fetch("/api/pagespeed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: activeProject.websiteUrl,
            strategy: targetStrategy,
            force,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (typeof data?.hint === "string") setPsiErrorHint(data.hint);
          throw new Error(typeof data?.error === "string" ? data.error : "ตรวจ PageSpeed ไม่สำเร็จ");
        }
        setPsiCache((prev) => {
          const next = {
            ...prev,
            [`${activeProject.id}:${targetStrategy}`]: data as PageSpeedReport,
          };
          if (userId) {
            try {
              window.localStorage.setItem(`seo-platform:psi-cache:${userId}`, JSON.stringify(next));
            } catch {
              // ignore storage quota errors
            }
          }
          return next;
        });
      } catch (err) {
        setPsiError(err instanceof Error ? err.message : "ตรวจ PageSpeed ไม่สำเร็จ");
      } finally {
        setPsiLoading(false);
      }
    },
    [activeProject, device, psiLoading, userId]
  );

  // One-click CSV report export (Requirement 2.3.4 & 3.7)
  function exportSummaryCsv() {
    const rows: [string, string, string][] = [
      ["หัวข้อ", "ค่าที่ตรวจพบ", "แหล่งข้อมูล"],
      ["โปรเจกต์", activeProject?.name ?? "ยังไม่ได้เลือก", "Supabase Projects"],
      ["เว็บไซต์", activeProject?.websiteUrl ?? "—", "Supabase Projects"],
      [
        "PageSpeed Performance (Mobile)",
        mobilePsi?.scores.performance != null ? `${mobilePsi.scores.performance}/100` : "ยังไม่ได้ตรวจ",
        mobilePsi?.source ?? "—",
      ],
      [
        "PageSpeed SEO (Mobile)",
        mobilePsi?.scores.seo != null ? `${mobilePsi.scores.seo}/100` : "ยังไม่ได้ตรวจ",
        mobilePsi?.source ?? "—",
      ],
      ["จำนวนหน้าที่ Crawl ล่าสุด", `${crawledPages.length} หน้า`, "Python Crawler"],
      ["SEO Audit - พบปัญหา", `${seoReport.problems} รายการ`, "SEO Audit เบื้องต้น"],
      ["SEO Audit - ควรตรวจเพิ่ม", `${seoReport.reviews} รายการ`, "SEO Audit เบื้องต้น"],
      ["บทความในคลัง", `${articles.length} บทความ`, "Supabase Articles"],
      ["แผนบทความในคลัง", `${briefs.length} แผน`, "Supabase Content Briefs"],
    ];

    const csv = "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-report-${(activeProject?.name || "overview").replace(/[\\/:*?"<>|]/g, "-")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const recentWork = useMemo(() => {
    const items = [
      ...articles.map((a) => ({
        id: a.key,
        title: a.title || "บทความยังไม่มีชื่อ",
        business: a.business || "ไม่ระบุชื่อธุรกิจ",
        kind: "บทความ",
        statusLabel: a.status === "ready_for_review" ? "พร้อมให้ตรวจ" : "ฉบับร่าง",
        tone: (a.status === "ready_for_review" ? "green" : "gray") as "green" | "gray",
        updatedAt: a.updatedAt,
        href: articleHref(a.key),
        cta: "เขียนต่อ",
      })),
      ...briefs.map((b) => ({
        id: b.key,
        title: b.title,
        business: b.business || "ไม่ระบุชื่อธุรกิจ",
        kind: "แผนบทความ",
        statusLabel: "พร้อมเขียน",
        tone: "blue" as const,
        updatedAt: b.savedAt,
        href: `/content?brief=${encodeURIComponent(b.key)}`,
        cta: "เปิดใน Studio",
      })),
    ];
    return items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  }, [articles, briefs]);

  const scoreItems: [string, number | null][] = [
    ["Performance", activePsi?.scores.performance ?? null],
    ["SEO", activePsi?.scores.seo ?? null],
    ["Accessibility", activePsi?.scores.accessibility ?? null],
    ["Best Practices", activePsi?.scores.bestPractices ?? null],
  ];

  return (
    <WorkspaceShell activeRoute="/dashboard" breadcrumb="ภาพรวมสุขภาพเว็บไซต์">
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>ภาพรวมสุขภาพเว็บไซต์</h1>
          <p className={styles.subtitle}>
            ดูสัญญาณสำคัญจากเว็บไซต์ คีย์เวิร์ด และงานคอนเทนต์ เพื่อเลือกงานที่ควรทำต่อได้ในหน้าเดียว
          </p>
        </div>

        <div className={styles.headActions}>
          {projects.length > 0 && (
            <label className={styles.projectPicker}>
              <span>โปรเจกต์ที่กำลังดู</span>
              <select
                value={activeProject?.id ?? ""}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setPsiError("");
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.websiteUrl.replace(/^https?:\/\//, "")}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportSummaryCsv}
            disabled={loadingData}
          >
            <Icon name="download" size={17} /> ส่งออกรายงาน CSV
          </button>

          <button
            type="button"
            className="btn btn-primary"
            disabled={!activeProject || psiLoading}
            onClick={() => void runPageSpeed(device)}
          >
            <Icon name="globe" size={17} />{" "}
            {psiLoading ? "กำลังตรวจ PageSpeed…" : "ตรวจสุขภาพเว็บ (PageSpeed)"}
          </button>
        </div>
      </div>

      {accountError && (
        <ActionableNotice
          tone="error"
          title="ยังไม่ได้เข้าสู่ระบบ"
          detail={accountError}
          nextStep="เข้าสู่ระบบเพื่อดูข้อมูลโปรเจกต์และสถิติในบัญชีของคุณ"
          action={
            <Link href="/login" className="btn btn-primary">
              เข้าสู่ระบบ
            </Link>
          }
        />
      )}

      {dataError && (
        <ActionableNotice
          tone="error"
          title="โหลดข้อมูลบางส่วนไม่สำเร็จ"
          detail={dataError}
          nextStep="ลองรีเฟรชหน้าเว็บอีกครั้ง หรือเช็กการเชื่อมต่ออินเทอร์เน็ต"
        />
      )}

      {/* 4 KPI Summary Cards (USA-04) */}
      <section className={styles.kpiGrid} aria-label="ตัวชี้วัดสำคัญ">
        <article className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.iconSpeed}`}>
            <Icon name="chart" />
          </div>
          <div>
            <p>PageSpeed Mobile</p>
            <b>
              {mobilePsi?.scores.performance != null ? (
                <>
                  {mobilePsi.scores.performance}
                  <small>/100</small>
                </>
              ) : (
                <small style={{ fontSize: 15 }}>ยังไม่ตรวจ</small>
              )}
            </b>
            <span>
              {mobilePsi ? "จาก Google PageSpeed v5" : "กดปุ่มตรวจสุขภาพเว็บด้านบน"}
            </span>
          </div>
        </article>

        <article className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.iconIssue}`}>
            <Icon name="alert" />
          </div>
          <div>
            <p>SEO Audit เบื้องต้น</p>
            <b>
              {crawledPages.length > 0 ? (
                <>
                  {seoReport.problems} <small>พบปัญหา</small>
                </>
              ) : (
                <small style={{ fontSize: 15 }}>ยังไม่มีข้อมูล</small>
              )}
            </b>
            <span>
              {crawledPages.length > 0
                ? `และควรตรวจเพิ่ม ${seoReport.reviews} จุด`
                : "สั่ง Crawl เว็บไซต์เพื่อตรวจ"}
            </span>
          </div>
        </article>

        <article className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.iconCrawl}`}>
            <Icon name="globe" />
          </div>
          <div>
            <p>หน้าที่อ่านสำเร็จ</p>
            <b>
              {loadingCrawl ? "…" : crawledPages.length} <small>หน้า</small>
            </b>
            <span>
              {lastCrawlAt
                ? `อัปเดต ${new Date(lastCrawlAt).toLocaleDateString("th-TH")}`
                : "ยังไม่มีประวัติ Crawl"}
            </span>
          </div>
        </article>

        <article className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.iconContent}`}>
            <Icon name="library" />
          </div>
          <div>
            <p>คลังคอนเทนต์</p>
            <b>
              {checking || loadingData ? "…" : articles.length} <small>บทความ</small>
            </b>
            <span>และ {briefs.length} แผนบทความ</span>
          </div>
        </article>
      </section>

      {/* PageSpeed Insights & Core Web Vitals Card */}
      <section className={styles.card} aria-label="PageSpeed Insights และ Core Web Vitals">
        <div className={styles.cardHead}>
          <div>
            <h2>PageSpeed Insights &amp; Core Web Vitals</h2>
            <div style={{ marginTop: 6 }}>
              <SourceStamp
                source={activePsi?.source ?? "Google PageSpeed Insights API v5 (ฟรี)"}
                updatedAt={activePsi?.checkedAt ?? null}
              />
            </div>
          </div>

          <div className={styles.deviceToggle} role="group" aria-label="เลือกอุปกรณ์ที่ตรวจ">
            <button
              type="button"
              className={device === "mobile" ? styles.deviceActive : ""}
              onClick={() => setDevice("mobile")}
            >
              Mobile
            </button>
            <button
              type="button"
              className={device === "desktop" ? styles.deviceActive : ""}
              onClick={() => setDevice("desktop")}
            >
              Desktop
            </button>
          </div>
        </div>

        {psiError && (
          <ActionableNotice
            tone="error"
            title="ตรวจ PageSpeed ไม่สำเร็จ"
            detail={psiError}
            nextStep={
              psiErrorHint ||
              "ตรวจว่า URL เว็บไซต์เปิดเป็นสาธารณะ หรือสลับไปลองตรวจ Desktop / เปิดดูบน PageSpeed Web โดยตรง"
            }
            action={
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={psiLoading}
                  onClick={() => void runPageSpeed(device, true)}
                >
                  ลองตรวจอีกครั้ง
                </button>
                {activeProject && (
                  <a
                    href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(activeProject.websiteUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                  >
                    เปิดดูบน PageSpeed Web ↗
                  </a>
                )}
              </>
            }
          />
        )}

        {!activeProject ? (
          <ActionableNotice
            tone="insufficient"
            title="ยังไม่มีโปรเจกต์เว็บไซต์สำหรับตรวจความเร็ว"
            detail="เพิ่มเว็บไซต์ในหน้าโปรเจกต์ก่อน หรือเริ่มวางแผนบทความจากรายละเอียดธุรกิจได้ทันที"
            nextStep="ไปที่หน้าโปรเจกต์เพื่อเพิ่ม URL เว็บไซต์แรกของคุณ"
            action={
              <>
                <Link href="/projects" className="btn btn-primary">
                  เพิ่มโปรเจกต์เว็บไซต์
                </Link>
                <Link href="/content" className="btn btn-secondary">
                  เริ่มจากรายละเอียดธุรกิจ
                </Link>
              </>
            }
          />
        ) : !activePsi ? (
          <div className={styles.psiEmpty}>
            <div className={styles.psiEmptyIcon}>
              <Icon name="chart" size={26} />
            </div>
            <div>
              <h3>พร้อมตรวจความเร็วและสุขภาพหน้าแรก ({device === "mobile" ? "มือถือ" : "คอมพิวเตอร์"})</h3>
              <p>
                ระบบจะเรียก Google PageSpeed Insights v5 ตรวจคะแนน 4 ด้าน และค่า{" "}
                <TermHelp term="LCP" />, <TermHelp term="INP" />, <TermHelp term="CLS" /> ของ{" "}
                <b>{activeProject.websiteUrl}</b> (ใช้เวลาประมาณ 10–25 วินาที)
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={psiLoading}
              onClick={() => void runPageSpeed(device)}
            >
              <Icon name="spark" size={17} />{" "}
              {psiLoading ? "กำลังตรวจกับ Google…" : `เริ่มตรวจ ${device === "mobile" ? "Mobile" : "Desktop"}`}
            </button>
          </div>
        ) : (
          <>
            <div className={styles.scoreGrid}>
              {scoreItems.map(([label, score]) => {
                const tone = gaugeTone(score);
                const deg = score != null ? score * 3.6 : 0;
                return (
                  <div className={styles.scoreItem} key={label}>
                    <div
                      className={`${styles.gauge} ${styles[`gauge_${tone}`]}`}
                      style={{ "--score": `${deg}deg` } as CSSProperties}
                    >
                      <span>
                        <b>{score ?? "—"}</b>
                        <small>/100</small>
                      </span>
                    </div>
                    <p>{label}</p>
                  </div>
                );
              })}
            </div>

            <div className={styles.vitalsGrid}>
              {activePsi.vitals.map((metric) => (
                <article className={styles.vitalCard} key={metric.id}>
                  <div className={styles.vitalTop}>
                    <b>
                      <TermHelp term={metric.id} />
                    </b>
                    <Badge tone={metric.tone}>{metric.statusLabel}</Badge>
                  </div>
                  <strong>{metric.value}</strong>
                  <p>{metric.label}</p>
                </article>
              ))}
            </div>

            <div className={styles.improveBox}>
              <div className={styles.improveHead}>
                <span className="card-icon" style={{ margin: 0, width: 38, height: 38 }}>
                  <Icon name="spark" size={18} />
                </span>
                <div>
                  <h3>สิ่งที่ควรปรับปรุงก่อน (เรียงตามผลกระทบ)</h3>
                  <p>รายการจาก Google Lighthouse ที่นำไปคุยกับคนทำเว็บแก้ต่อได้ทันที</p>
                </div>
              </div>

              {activePsi.opportunities.length === 0 ? (
                <p className={styles.allGood}>
                  ไม่พบจุดคอขวดความเร็วหลักในหน้าแรกสำหรับอุปกรณ์นี้
                </p>
              ) : (
                <ul className={styles.improveList}>
                  {activePsi.opportunities.map((item, idx) => (
                    <li key={item.id}>
                      <span className={styles.improveNum}>{idx + 1}</span>
                      <div>
                        <b>{item.title}</b>
                        <small>{item.detail}</small>
                      </div>
                      <Badge tone={item.severity}>{item.severityLabel}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {/* Lower 2-Column Grid */}
      <div className={styles.lowerGrid}>
        {/* Left: Technical SEO & Sitemap */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h2>โครงสร้างเว็บ &amp; Sitemap</h2>
              <p className={styles.cardSub}>
                ตรวจ <TermHelp term="Meta Description" />, <TermHelp term="H1" />,{" "}
                <TermHelp term="Canonical" /> จากหน้าที่ Crawl ล่าสุด
              </p>
            </div>
            {activeProject && (
              <Link href={`/projects/${activeProject.id}`} className="btn btn-ghost">
                ดูผลตรวจทั้งหมด <Icon name="arrow" size={16} />
              </Link>
            )}
          </div>

          {crawledPages.length === 0 ? (
            <ActionableNotice
              tone="insufficient"
              title="ยังไม่มีข้อมูลโครงสร้างเว็บไซต์"
              detail="สั่งอ่านเว็บไซต์ (Crawl) อย่างน้อย 1 รอบ เพื่อดูจุดที่ควรปรับแก้ด้าน SEO พื้นฐาน"
              nextStep="เปิดหน้าโปรเจกต์แล้วกดเริ่มอ่านเว็บไซต์"
              action={
                activeProject ? (
                  <Link href={`/projects/${activeProject.id}`} className="btn btn-secondary">
                    ไปหน้า Crawl โปรเจกต์นี้
                  </Link>
                ) : null
              }
            />
          ) : (
            <div className={styles.auditList}>
              {sortedFindings.length === 0 ? (
                <p className={styles.allGood}>ไม่พบข้อสังเกตจากกฎตรวจเบื้องต้นใน {crawledPages.length} หน้าที่อ่านมา</p>
              ) : (
                sortedFindings.slice(0, 4).map((f, idx) => (
                  <div className={styles.auditRow} key={`${f.code}-${idx}`}>
                    <span
                      className={`${styles.dot} ${
                        f.level === "problem"
                          ? styles.dotRed
                          : f.level === "review"
                            ? styles.dotAmber
                            : styles.dotGray
                      }`}
                    />
                    <div className={styles.auditText}>
                      <b>{f.title}</b>
                      <small>{f.detail}</small>
                    </div>
                    <Badge
                      tone={
                        f.level === "problem" ? "red" : f.level === "review" ? "amber" : "gray"
                      }
                    >
                      {f.level === "problem"
                        ? "พบปัญหา"
                        : f.level === "review"
                          ? "ควรตรวจ"
                          : "ข้อมูลไม่พอ"}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          )}

          <div className={styles.indexGrid}>
            <div className={styles.indexPill}>
              <Icon name="file" size={18} />
              <div>
                <b>
                  <TermHelp term="sitemap.xml" />
                </b>
                <small>
                  {activePsi
                    ? activePsi.indexFiles.sitemap.ok
                      ? "เข้าถึงได้ปกติ"
                      : "ยังไม่พบหรือเข้าถึงไม่ได้"
                    : "กดตรวจ PageSpeed เพื่อเช็ก"}
                </small>
              </div>
              <Badge
                tone={
                  !activePsi ? "gray" : activePsi.indexFiles.sitemap.ok ? "green" : "amber"
                }
              >
                {!activePsi ? "รอตรวจ" : activePsi.indexFiles.sitemap.ok ? "ปกติ" : "ควรตรวจ"}
              </Badge>
            </div>

            <div className={styles.indexPill}>
              <Icon name="file" size={18} />
              <div>
                <b>
                  <TermHelp term="robots.txt" />
                </b>
                <small>
                  {activePsi
                    ? activePsi.indexFiles.robots.ok
                      ? "พบไฟล์และอ่านได้"
                      : "ยังไม่พบไฟล์"
                    : "กดตรวจ PageSpeed เพื่อเช็ก"}
                </small>
              </div>
              <Badge
                tone={
                  !activePsi ? "gray" : activePsi.indexFiles.robots.ok ? "green" : "amber"
                }
              >
                {!activePsi ? "รอตรวจ" : activePsi.indexFiles.robots.ok ? "ปกติ" : "ควรตรวจ"}
              </Badge>
            </div>
          </div>
        </section>

        {/* Right: Keywords & Transparency */}
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h2>คีย์เวิร์ดเป้าหมาย &amp; ภาพรวม</h2>
              <p className={styles.cardSub}>
                {topKeywords.setName
                  ? `จากชุดคีย์เวิร์ดล่าสุด: ${topKeywords.setName}`
                  : "นำเข้าไฟล์ CSV เพื่อเก็บคำค้นหาเป้าหมายไว้ใช้วางแผน"}
              </p>
            </div>
            <Link href="/keywords" className="btn btn-ghost">
              จัดการคีย์เวิร์ด <Icon name="arrow" size={16} />
            </Link>
          </div>

          {topKeywords.rows.length === 0 ? (
            <ActionableNotice
              tone="insufficient"
              title="ยังไม่มีชุดคีย์เวิร์ดในบัญชี"
              detail="นำเข้าไฟล์ CSV จาก Google Keyword Planner เพื่อดูคำค้นหาและปริมาณค้นหาในหน้านี้"
              nextStep="ไปที่หน้าจัดการคีย์เวิร์ดแล้วนำเข้าไฟล์ตัวอย่าง"
              action={
                <Link href="/keywords" className="btn btn-secondary">
                  นำเข้าคีย์เวิร์ด CSV
                </Link>
              }
            />
          ) : (
            <div className={styles.kwList}>
              <div className={styles.kwListHead}>
                <span>คำค้นหา</span>
                <span>ค้นหาเฉลี่ย/เดือน</span>
              </div>
              {topKeywords.rows.map((row, idx) => (
                <div className={styles.kwRow} key={row.id}>
                  <span className={styles.kwRank}>{idx + 1}</span>
                  <div className={styles.kwName}>
                    <b>{row.keyword}</b>
                    <small>
                      {idx === 0 ? "คำลำดับแรก" : "คำในชุด"}
                      {row.adsCompetition ? ` · แข่งโฆษณา: ${row.adsCompetition}` : ""}
                    </small>
                  </div>
                  <strong>{row.volume || "—"}</strong>
                </div>
              ))}
            </div>
          )}

          <div className={styles.serpNote}>
            <Icon name="alert" size={17} />
            <span>
              ข้อมูลคีย์เวิร์ดอ้างอิงจากไฟล์ที่ผู้ใช้นำเข้าเพื่อวางแผนเนื้อหา ไม่รับประกันอันดับ (การเชื่อม
              Google Search Console / SERP อัตโนมัติอยู่ในเฟสถัดไป)
            </span>
          </div>
        </section>
      </div>

      {/* Recent Work Table */}
      <section className={styles.card} aria-label="งานล่าสุด">
        <div className={styles.cardHead} style={{ marginBottom: 14 }}>
          <div>
            <h2>งานล่าสุด</h2>
            <p className={styles.cardSub}>กลับมาเขียนต่อจากจุดเดิมได้ทันทีโดยไม่เรียก AI ซ้ำ</p>
          </div>
          <Link href="/articles" className="btn btn-ghost">
            ดูคลังทั้งหมด <Icon name="arrow" size={16} />
          </Link>
        </div>

        {recentWork.length === 0 ? (
          <div className="empty-table">
            <p style={{ marginBottom: 14 }}>ยังไม่มีบทความหรือแผนบทความในบัญชี</p>
            <Link href="/content" className="btn btn-primary">
              <Icon name="spark" size={17} /> เริ่มวางแผนบทความแรก
            </Link>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ชื่องาน</th>
                  <th>ประเภท</th>
                  <th>สถานะ</th>
                  <th>แก้ไขล่าสุด</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recentWork.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.title}</b>
                      <small>{item.business}</small>
                    </td>
                    <td>{item.kind}</td>
                    <td>
                      <Badge tone={item.tone}>{item.statusLabel}</Badge>
                    </td>
                    <td>{articleDate(item.updatedAt)}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={item.href} className={styles.rowLink}>
                        {item.cta} <Icon name="arrow" size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}
