"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  articleDate,
  articleHref,
  getStoredArticle,
  listArticles,
  type ArticleListEntry,
} from "@/lib/article-library";
import { downloadArticleMarkdown } from "@/lib/article-export";
import type { ArticleStatus } from "@/lib/content-types";
import styles from "./library.module.css";
import { ContentAccountBoundary, useContentStore } from "@/components/content-account";
import LegacyContentImport from "@/components/legacy-content-import";
import WorkspaceShell from "@/components/workspace-shell";
import { Badge, Icon, WsTitle } from "@/components/ui-icons";
import { isSavedBrief } from "@/lib/content-validation";
import { createUuid } from "@/lib/uuid";

type BriefEntry = { key: string; title: string; business: string; savedAt: string };
type LibraryTab = "articles" | "briefs";

export default function ArticleLibraryPage() {
  return (
    <WorkspaceShell activeRoute="/articles">
      <ContentAccountBoundary>
        <ArticleLibrary />
      </ContentAccountBoundary>
    </WorkspaceShell>
  );
}

function ArticleLibrary() {
  const store = useContentStore();
  const router = useRouter();
  const [entries, setEntries] = useState<ArticleListEntry[]>([]);
  const [briefs, setBriefs] = useState<BriefEntry[]>([]);
  const [tab, setTab] = useState<LibraryTab>("articles");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ArticleStatus>("all");
  const [sort, setSort] = useState("latest");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const [result, briefRows] = await Promise.all([
        listArticles(store),
        store.list("brief:"),
      ]);
      if (request !== sequence.current) return;
      setEntries(result.entries);
      setSkipped(result.skipped);
      setBriefs(
        briefRows
          .filter((row) => isSavedBrief(row.value.job))
          .map((row) => {
            const draft = row.value.job as Record<string, unknown>;
            return {
              key: row.key,
              title: String(draft.topic || draft.brand || "แผนที่ยังไม่ได้ตั้งชื่อ"),
              business: String(draft.brand || ""),
              savedAt: row.value.savedAt,
            };
          })
      );
    } catch (cause) {
      if (request === sequence.current)
        setError(cause instanceof Error ? cause.message : "โหลดงานที่บันทึกไว้ไม่ได้");
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      sequence.current++;
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);

  const search = query.normalize("NFKC").trim().toLocaleLowerCase("th");
  const filtered = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            (status === "all" || entry.status === status) &&
            (!search ||
              `${entry.title} ${entry.business} ${entry.topic} ${entry.keywords.join(" ")}`
                .normalize("NFKC")
                .toLocaleLowerCase("th")
                .includes(search))
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title, "th")
            : sort === "oldest"
              ? Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
              : Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
        ),
    [entries, search, status, sort]
  );

  const filteredBriefs = useMemo(
    () =>
      briefs
        .filter(
          (brief) =>
            !search ||
            `${brief.title} ${brief.business}`
              .normalize("NFKC")
              .toLocaleLowerCase("th")
              .includes(search)
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title, "th")
            : sort === "oldest"
              ? Date.parse(a.savedAt) - Date.parse(b.savedAt)
              : Date.parse(b.savedAt) - Date.parse(a.savedAt)
        ),
    [briefs, search, sort]
  );

  async function download(key: string) {
    if (downloading) return;
    setDownloading(key);
    setMessage("");
    try {
      const stored = await getStoredArticle(store, key);
      if (!stored) throw new Error("ไม่พบบทความนี้แล้ว กรุณารีเฟรชรายการ");
      downloadArticleMarkdown(stored.job.article);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "ดาวน์โหลดไม่ได้");
    } finally {
      setDownloading(null);
    }
  }

  function createArticle() {
    router.push(`/content?workspace=${createUuid()}`);
  }
  function changeTab(next: LibraryTab) {
    setTab(next);
    setQuery("");
    setStatus("all");
    setMessage("");
  }
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? "articles"
        : event.key === "End"
          ? "briefs"
          : tab === "articles"
            ? "briefs"
            : "articles";
    changeTab(next);
    document.getElementById(`library-tab-${next}`)?.focus();
  }

  const visibleCount = tab === "articles" ? filtered.length : filteredBriefs.length;
  const totalCount = tab === "articles" ? entries.length : briefs.length;

  return (
    <>
      <WsTitle
        eyebrow="Content Library"
        title="คลังบทความ"
        body="เก็บ จัดการ และกลับมาทำงานต่อได้จากที่เดียว · การเปิดงานเดิมไม่เรียก AI ซ้ำ"
        action={
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading}
              onClick={() => void refresh()}
            >
              รีเฟรช
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowImport((v) => !v)}
            >
              นำเข้างานเก่า
            </button>
            <button type="button" className="btn btn-primary" onClick={createArticle}>
              <Icon name="plus" size={18} /> สร้างบทความใหม่
            </button>
          </div>
        }
      />

      {showImport && (
        <section className="studio-card" aria-label="นำเข้างานเก่า" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              นำเข้างานจากเบราว์เซอร์นี้
            </h2>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowImport(false)}
            >
              ปิด
            </button>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            ใช้ครั้งแรกเพื่อย้ายงานที่เคยสร้างไว้ เข้าสู่บัญชีของคุณ โดยต้นฉบับยังอยู่เหมือนเดิม
          </p>
          <LegacyContentImport onImported={() => void refresh()} />
        </section>
      )}

      <section className="library-card" aria-label="งานที่บันทึกไว้">
        <div className="library-tabs" role="tablist" aria-label="ประเภทงาน">
          {(["articles", "briefs"] as const).map((item) => (
            <button
              type="button"
              role="tab"
              id={`library-tab-${item}`}
              key={item}
              aria-selected={tab === item}
              aria-controls="library-list"
              tabIndex={tab === item ? 0 : -1}
              className={tab === item ? "active" : ""}
              onClick={() => changeTab(item)}
              onKeyDown={tabKey}
            >
              {item === "articles" ? "บทความ" : "แผนบทความ"}{" "}
              <Badge tone="gray">{item === "articles" ? entries.length : briefs.length}</Badge>
            </button>
          ))}
        </div>

        <div className="table-tools">
          <div className="search-input">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`ค้นหา${tab === "articles" ? "บทความ" : "แผนบทความ"}จากชื่อเรื่องหรือธุรกิจ...`}
            />
          </div>
          {tab === "articles" && (
            <select
              aria-label="สถานะ"
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | ArticleStatus)}
            >
              <option value="all">สถานะ: ทั้งหมด</option>
              <option value="draft">ฉบับร่าง</option>
              <option value="ready_for_review">พร้อมให้ตรวจ</option>
            </select>
          )}
          <select
            aria-label="เรียงตาม"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="latest">แก้ไขล่าสุด</option>
            <option value="oldest">แก้ไขเก่าสุด</option>
            <option value="title">ชื่อ ก–ฮ</option>
          </select>
        </div>

        {error && (
          <div className={styles.notice} role="alert">
            <p style={{ margin: "0 0 8px" }}>{error}</p>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading}
              onClick={() => void refresh()}
            >
              ลองโหลดอีกครั้ง
            </button>
          </div>
        )}
        {message && (
          <p className={styles.notice} role="status">
            {message}
          </p>
        )}
        {skipped > 0 && (
          <p className={styles.notice}>มี {skipped} งานที่อ่านไม่ได้ ข้อมูลเดิมยังอยู่</p>
        )}

        <div role="tabpanel" id="library-list" aria-labelledby={`library-tab-${tab}`} tabIndex={0}>
          {loading && totalCount === 0 ? (
            <div className="empty-table" role="status">
              กำลังโหลดงานของคุณ…
            </div>
          ) : totalCount === 0 ? (
            <div className="empty-table">
              <h3 style={{ marginBottom: 8 }}>
                {error
                  ? "ยังโหลดงานไม่ได้"
                  : tab === "articles"
                    ? "เริ่มบทความแรกของคุณ"
                    : "ยังไม่มีแผนบทความ"}
              </h3>
              <p style={{ marginBottom: 18 }}>
                {error
                  ? "กดลองโหลดอีกครั้งด้านบน"
                  : tab === "articles"
                    ? "เล่าเกี่ยวกับธุรกิจ ให้ AI ช่วยวางแผน แล้วเริ่มเขียนได้เลย"
                    : "แผนที่บันทึกไว้จะอยู่ในแท็บนี้ เพื่อกลับมาเขียนต่อได้"}
              </p>
              {!error && (
                <button type="button" className="btn btn-primary" onClick={createArticle}>
                  <Icon name="plus" size={17} /> สร้างบทความ
                </button>
              )}
            </div>
          ) : visibleCount === 0 ? (
            <div className="empty-table">
              <p>ไม่พบรายการที่ตรงกับการค้นหา</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                ล้างตัวกรอง
              </button>
            </div>
          ) : tab === "articles" ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">ชื่อบทความ</th>
                    <th scope="col">ธุรกิจ</th>
                    <th scope="col">สถานะ</th>
                    <th scope="col">แก้ไขล่าสุด</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr key={entry.key}>
                      <td>
                        <Link className={styles.articleTitle} href={articleHref(entry.key)}>
                          {entry.title || "บทความยังไม่มีชื่อ"}
                        </Link>
                        <small>{entry.excerpt || "ยังไม่มีเนื้อหา"}</small>
                      </td>
                      <td>{entry.business || "ไม่ระบุชื่อธุรกิจ"}</td>
                      <td>
                        <Badge tone={entry.status === "ready_for_review" ? "green" : "gray"}>
                          {entry.status === "ready_for_review" ? "พร้อมให้ตรวจ" : "ฉบับร่าง"}
                        </Badge>
                      </td>
                      <td>{articleDate(entry.updatedAt)}</td>
                      <td>
                        <div className="row-actions">
                          <Link href={articleHref(entry.key)}>เขียนต่อ</Link>
                          <Link href={articleHref(entry.key, "preview")}>ดูตัวอย่าง</Link>
                          <button
                            type="button"
                            title="ดาวน์โหลด Markdown"
                            disabled={downloading !== null}
                            onClick={() => void download(entry.key)}
                          >
                            {downloading === entry.key ? "…" : <Icon name="download" size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">ชื่อแผนบทความ</th>
                    <th scope="col">ธุรกิจ</th>
                    <th scope="col">แก้ไขล่าสุด</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {filteredBriefs.map((brief) => (
                    <tr key={brief.key}>
                      <td>
                        <b className={styles.articleTitle}>{brief.title}</b>
                      </td>
                      <td>{brief.business || "ไม่ระบุชื่อธุรกิจ"}</td>
                      <td>{articleDate(brief.savedAt)}</td>
                      <td>
                        <div className="row-actions">
                          <Link href={`/content?brief=${encodeURIComponent(brief.key)}`}>
                            เปิดแผน
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
