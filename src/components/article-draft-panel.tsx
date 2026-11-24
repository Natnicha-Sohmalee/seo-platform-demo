"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import RichArticleEditor from "@/components/rich-article-editor";
import Link from "next/link";
import { articleText, downloadArticleMarkdown } from "@/lib/article-export";
import { copyText } from "@/lib/clipboard";
import styles from "./article-editor.module.css";
import { ContentAccountBoundary, useContentStore } from "@/components/content-account";
import { isSavedArticle } from "@/lib/content-validation";
import KeywordResearchSummary from "@/components/keyword-research-summary";
import type { ArticleDraft, ArticleStatus, ContentBrief, ContentContext, SavedArticle } from "@/lib/content-types";

type Props = {
  brief: ContentBrief;
  context: ContentContext | null;
  storageId: string;
  usingLegacyContext: boolean;
  disabled: boolean;
  recordKey?: string;
  initialView?: "edit" | "preview" | "seo";
};

export default function ArticleDraftPanel(props: Props) {
  return <ContentAccountBoundary><ArticleEditor key={props.recordKey ?? `${props.storageId}:${props.brief.createdAt}`} {...props} /></ContentAccountBoundary>;
}

function ArticleEditor({ brief, context, storageId, usingLegacyContext, disabled, recordKey, initialView = "edit" }: Props) {
  const store = useContentStore();
  const [reload, setReload] = useState(0);
  const storageKey = recordKey ?? `article:${storageId}:${brief.createdAt}`;
  const [saved, setSaved] = useState<SavedArticle | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [tab, setTab] = useState<"edit" | "preview" | "seo">(initialView);
  const tabId = useId();
  const lock = useRef(false);
  const saveSequence = useRef(0);
  const latestDraft = useRef<SavedArticle | null>(null);
  const dirtyDraft = useRef(false);
  useEffect(() => { latestDraft.current = saved; }, [saved]);
  useEffect(() => () => {
    if (dirtyDraft.current && latestDraft.current) {
      void store.save(storageKey, latestDraft.current).catch(() => {});
    }
  }, [storageKey, store]);
  const article = saved?.article;
  const unavailable = disabled || !ready || busy;

  useEffect(() => {
    let active = true;
    setReady(false);
    void store.load<SavedArticle>(storageKey).then((value) => {
      if (!active) return;
      if (value && !isSavedArticle(value.job)) throw new Error("ข้อมูลบทความเดิมอ่านไม่ได้ ระบบยังไม่แก้ไขข้อมูลนั้น");
      dirtyDraft.current = false;
      latestDraft.current = value?.job ?? null;
      setSaved(value?.job ?? null);
      setSavedAt(value?.savedAt ?? null);
      setSaveFailed(false);
      setReady(true);
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : "โหลดฉบับร่างจากบัญชีไม่ได้");
    });
    return () => { active = false; };
  }, [storageKey, store, reload]);

  // เก็บการแก้ไขในบัญชี Supabase ไม่เรียก AI
  useEffect(() => {
    if (!ready || !saved || !dirtyDraft.current) return;
    const sequence = ++saveSequence.current;
    const timer = window.setTimeout(() => {
      void store.save(storageKey, saved).then((time) => {
        if (sequence === saveSequence.current) { dirtyDraft.current = false; setSavedAt(time); setSaveFailed(false); }
      }).catch((error) => {
        if (sequence === saveSequence.current) { setSaveFailed(true); setMessage(error instanceof Error ? error.message : "บันทึกฉบับร่างไม่ได้ กรุณาคัดลอกหรือดาวน์โหลดก่อนปิดหน้า"); }
      });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      if (sequence === saveSequence.current) saveSequence.current++;
    };
  }, [saved, ready, storageKey, store]);

  function edit(patch: Partial<ArticleDraft>) {
    dirtyDraft.current = true;
    setSaved((previous) => previous ? {
      ...previous,
      article: { ...previous.article, ...patch },
    } : previous);
    setSavedAt(null);
    setSaveFailed(false);
  }

  async function generate() {
    if (lock.current || unavailable || !context) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const input = { brief: brief.brief, context };

    try {
      const response = await fetch("/api/content-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "article", brief: input.brief, ...context }),
      });
      const raw = await response.text();
      if (!raw.trim()) throw new Error(`เซิร์ฟเวอร์ตอบว่าง (HTTP ${response.status}) กรุณาดู Terminal`);
      let result;
      try { result = JSON.parse(raw); }
      catch { throw new Error(`เซิร์ฟเวอร์ไม่ได้ส่ง JSON (HTTP ${response.status}) กรุณาดู Terminal`); }
      if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "สร้างบทความไม่สำเร็จ");
      if (!result || typeof result.title !== "string" || typeof result.markdown !== "string" ||
          typeof result.seoTitle !== "string" || typeof result.metaDescription !== "string" ||
          typeof result.slug !== "string" || !Array.isArray(result.reviewNotes) || !Array.isArray(result.sources)) {
        throw new Error("คำตอบบทความไม่ครบ ยังเก็บฉบับร่างเดิมไว้");
      }
      const next: SavedArticle = { article: { ...result, status: "draft" }, input };
      dirtyDraft.current = true;
      latestDraft.current = next;
      setSaved(next);
      setSavedAt(null);
      setSaveFailed(false);
      setTab("edit");
      // บันทึกผลทันที แม้ผู้ใช้จะออกจากหน้าระหว่างรอ AI
      try {
        const time = await store.save(storageKey, next);
        setSavedAt(time);
        setMessage("สร้างและบันทึกฉบับร่างในบัญชีแล้ว แก้เนื้อหาและรายละเอียด SEO ด้านล่างได้เลย");
      } catch (error) {
        setSaveFailed(true);
        setMessage(error instanceof Error ? error.message : "สร้างบทความแล้ว แต่บันทึกไม่ได้ กรุณาคัดลอกหรือดาวน์โหลดก่อนปิดหน้า");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สร้างบทความไม่สำเร็จ");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function saveNow() {
    if (!saved || !ready) return;
    const current = saved;
    try {
      const time = await store.save(storageKey, current);
      if (latestDraft.current === current) {
        dirtyDraft.current = false;
        setSavedAt(time);
        setSaveFailed(false);
        setMessage("บันทึกฉบับร่างในบัญชีแล้ว");
      }
    } catch (error) { setSaveFailed(true); setMessage(error instanceof Error ? error.message : "บันทึกไม่ได้ กรุณาคัดลอกหรือดาวน์โหลดฉบับร่าง"); }
  }

  async function copy() {
    if (!article) return;
    try {
      await copyText(articleText(article));
      setMessage("คัดลอกบทความพร้อมรายการแหล่งข้อมูลแล้ว");
    } catch { setMessage("คัดลอกอัตโนมัติไม่ได้ สามารถเลือกข้อความในช่องบทความได้"); }
  }

  function download() {
    if (article) downloadArticleMarkdown(article);
  }

  const changed = saved && (saved.input.brief !== brief.brief ||
    JSON.stringify(saved.input.context) !== JSON.stringify(context));

  const tabs = ["edit", "preview", "seo"] as const;
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? 2
      : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : 2)) % tabs.length;
    setTab(tabs[next]);
    document.getElementById(`${tabId}-${tabs[next]}`)?.focus();
  }
    const checks = article ? [
    {
      label: "มีชื่อบทความ",
      complete: Boolean(article.title.trim()),
    },
    {
      label: "มีเนื้อหาบทความ",
      complete: Boolean(article.markdown.trim()),
    },
    {
      label: "มีหัวข้อย่อย H2 สำหรับแบ่งเนื้อหา",
      complete: /^ {0,3}##[ \t]+\S/m.test(
        article.markdown.replace(
          /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm,
          ""
        )
      ),
    },
    {
      label: "มี Title สำหรับผลค้นหา",
      complete: Boolean(article.seoTitle.trim()),
    },
    {
      label: "มี Meta description",
      complete: Boolean(article.metaDescription.trim()),
    },
    {
      label: "URL slug ใช้ตัวเล็ก ตัวเลข และขีดกลาง",
      complete: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug),
    },
    {
      label: "เติมข้อความที่ระบุว่าเจ้าของธุรกิจต้องเติมแล้ว",
      complete: !/\[เจ้าของธุรกิจต้องเติม[^\]]*(?:\]|$)/.test(
        [
          article.title,
          article.markdown,
          article.seoTitle,
          article.metaDescription,
        ].join("\n")
      ),
    },
  ] : [];

const needsReview = checks.filter((check) => !check.complete).length;

  return (
    <section className={styles.workspace} aria-busy={busy}>
      <header className={styles.topline}>
        <div><p className={styles.eyebrow}>พื้นที่จัดการบทความ</p><h3 className={styles.heading}>{article ? "จัดการบทความ" : "สร้างบทความจากแผน"}</h3>
          <p className={styles.subtitle}>{article ? `สร้างด้วย ${article.model} · ${new Date(article.createdAt).toLocaleDateString("th-TH")}` : "นำแผนที่ตรวจแล้วมาเรียบเรียงเป็นบทความสำหรับธุรกิจของคุณ"}</p>
        </div>
        {article && <div className={styles.actions}>
          <Link href="/articles" className={styles.secondary}>คลังบทความ</Link>
          <button type="button" className={styles.secondary} disabled={unavailable} onClick={copy}>คัดลอก</button>
          <button type="button" className={styles.secondary} disabled={unavailable} onClick={download}>ดาวน์โหลด .md</button>
          <button type="button" className={styles.primary} disabled={unavailable} onClick={saveNow}>บันทึกฉบับร่าง</button>
        </div>}
      </header>

      <KeywordResearchSummary research={saved?.input.context.keywordResearch ?? context?.keywordResearch} />
      {!article && <div className={styles.generation}>
        <div className={styles.generationHeader}><span className={styles.documentIcon} aria-hidden="true"><svg width="24" height="26" viewBox="0 0 24 26" fill="none"><path d="M6 2h8l5 5v17H5V2h1ZM14 2v6h5M8 13h8M8 17h8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></span>
          <div><h4>เตรียมแผนเรียบร้อยแล้ว</h4><p>ระบบจะใช้แผน รายละเอียดธุรกิจ และข้อมูลอ้างอิงประกอบการเขียน เมื่อกดสร้างจะเรียก บริการ AI ที่ตั้งค่า หนึ่งครั้งโดยมีข้อจำกัดตามแผนของผู้ให้บริการ</p>
            <button type="button" className={styles.primary} disabled={unavailable || !context} onClick={generate}>{busy ? "กำลังเขียนบทความ…" : !ready ? "กำลังโหลดฉบับร่าง…" : "สร้างบทความจากแผนนี้"}</button>
          </div>
        </div>
      </div>}
      {usingLegacyContext && context && !article && <p className={styles.note}>แผนเดิมยังไม่ได้แนบรายละเอียดธุรกิจ จะใช้ข้อมูลปัจจุบันและหน้าเว็บที่ตรงกับรายการอ้างอิง กรุณาตรวจก่อนสร้าง</p>}
      {!context && <p className={styles.notice}>ข้อมูลต้นทางของแผนนี้ไม่ครบ กรุณาเปิดงาน Crawl เดิมหรือสร้างแผนใหม่จากรายละเอียดธุรกิจ</p>}
      {message && <p className={styles.message} role="status" aria-live="polite">{message}</p>}
      {!ready && message && <button type="button" className={styles.secondary} onClick={() => setReload((value) => value + 1)}>ลองโหลดฉบับร่างอีกครั้ง</button>}

      {article && <>
        <div className={styles.topline}>
          <span className={`${styles.status} ${saveFailed ? styles.failed : !savedAt ? styles.pending : ""}`} role="status">{saveFailed ? "บันทึกไม่สำเร็จ" : savedAt ? `บันทึกในบัญชีแล้ว ${new Date(savedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}` : "กำลังบันทึก…"}</span>
          <label className={styles.articleStatus}>สถานะ
            <select value={article.status ?? "draft"} disabled={unavailable} onChange={(event) => edit({ status: event.target.value as ArticleStatus })}>
              <option value="draft">ฉบับร่าง</option>
              <option value="ready_for_review">พร้อมให้ตรวจ</option>
            </select>
            <span className={styles.note}>กำหนดเอง · ยังไม่ได้เผยแพร่</span>
          </label>
        </div>
        {changed && <p className={styles.notice}>รายละเอียดปัจจุบันต่างจากตอนสร้างฉบับนี้ เนื้อหาที่แสดงยังอิงข้อมูลเดิม</p>}

        <div className={styles.tabs} role="tablist" aria-label="มุมมองบทความ">
          {tabs.map((item) => <button key={item} type="button" id={`${tabId}-${item}`} className={styles.tab} role="tab" aria-selected={tab === item} aria-controls={`${tabId}-panel-${item === "seo" ? "seo" : "document"}`} tabIndex={tab === item ? 0 : -1} onKeyDown={navigateTabs} onClick={() => setTab(item)}>{item === "edit" ? "แก้ไขบทความ" : item === "preview" ? "ดูตัวอย่าง" : "รายละเอียด SEO"}</button>)}
        </div>

        <div className={styles.body}>
          <div className={styles.main}>
            <div className={styles.documentPane} hidden={tab === "seo"}>
              <div className={styles.paper} role="tabpanel" id={`${tabId}-panel-document`} aria-labelledby={`${tabId}-${tab === "seo" ? "edit" : tab}`}>
                <div className={styles.paperTop}>
                  <span className={styles.documentLabel}>{tab === "preview" ? "ตัวอย่างบทความ" : "ชื่อบทความ · H1"}</span>
                  {tab === "preview" ? <h1 className={styles.previewTitle}>{article.title || "ยังไม่มีชื่อบทความ"}</h1> : <textarea aria-label="ชื่อบทความ" className={styles.titleInput} rows={2} maxLength={300} disabled={unavailable} value={article.title} onChange={(event) => edit({ title: event.target.value })} placeholder="ชื่อบทความของคุณ" />}
                </div>
                <RichArticleEditor documentId={article.createdAt} markdown={article.markdown} onChange={(markdown) => edit({ markdown })} readOnly={tab !== "edit"} disabled={unavailable} />
                {tab === "preview" && article.sources.length > 0 && <div className={styles.paperSources}><h3>แหล่งข้อมูลประกอบ</h3><ol>{article.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ol></div>}
                <div className={styles.paperBottom}><span>{article.markdown.length.toLocaleString("th-TH")} อักขระในต้นฉบับ</span><span>{tab === "preview" ? "ตัวอย่างเนื้อหา ยังไม่ได้เผยแพร่" : "แก้ไขแล้วบันทึกอัตโนมัติ"}</span></div>
              </div>
              {tab === "edit" && <details className={styles.advanced}><summary>ดูหรือแก้ต้นฉบับ Markdown</summary><p>ใช้เมื่อจำเป็นต้องแก้รูปแบบต้นฉบับโดยตรง</p><textarea aria-label="ต้นฉบับ Markdown" className={`${styles.input} ${styles.raw}`} value={article.markdown} disabled={unavailable} onChange={(event) => edit({ markdown: event.target.value })} /></details>}
            </div>

            <div className={styles.seoPane} hidden={tab !== "seo"} role="tabpanel" id={`${tabId}-panel-seo`} aria-labelledby={`${tabId}-seo`}>
              <h3>รายละเอียดสำหรับผลค้นหา</h3><p className={styles.note}>ปรับข้อความให้ตรงกับบทความและสิ่งที่ธุรกิจต้องการสื่อ</p>
              <label className={styles.field}><span className={styles.labelRow}>Title<span className={styles.counter}>{article.seoTitle.length} อักขระ</span></span><input className={styles.input} value={article.seoTitle} maxLength={200} disabled={unavailable} onChange={(event) => edit({ seoTitle: event.target.value })} /></label>
              <label className={styles.field}><span className={styles.labelRow}>Meta description<span className={styles.counter}>{article.metaDescription.length} อักขระ</span></span><textarea className={styles.input} rows={4} value={article.metaDescription} maxLength={500} disabled={unavailable} onChange={(event) => edit({ metaDescription: event.target.value })} /></label>
              <label className={styles.field}><span className={styles.labelRow}>URL slug</span><input className={styles.input} value={article.slug} maxLength={120} disabled={unavailable} onChange={(event) => edit({ slug: event.target.value })} placeholder="article-title" /><small className={styles.note}>ใช้ภาษาอังกฤษตัวเล็ก ตัวเลข และขีดกลาง เช่น coffee-menu-ideas</small></label>
              <div className={styles.searchPreview}><h4>ภาพตัวอย่างสำหรับตรวจข้อความ · โดเมนตัวอย่าง</h4><div className={styles.searchUrl}>example.com › {article.slug || "article-slug"}</div><p className={styles.searchTitle}>{article.seoTitle || article.title || "ชื่อสำหรับผลค้นหา"}</p><p className={styles.searchDescription}>{article.metaDescription || "เพิ่มคำอธิบายเพื่อสรุปว่าผู้อ่านจะได้อะไรจากบทความนี้"}</p></div>
              <p className={styles.note}>ข้อมูลนี้ยังไม่ได้เปลี่ยนเว็บไซต์จริง และภาพตัวอย่างไม่ได้ยืนยันรูปแบบที่จะปรากฏในผลค้นหา</p>
            </div>
          </div>

          <aside className={styles.sidebar} aria-label="ข้อมูลประกอบบทความ">
           <section className={styles.sideCard}>
                <h4>ตรวจบทความก่อนส่งออก</h4>

                <p className={styles.note} role="status">
                  {needsReview > 0
                    ? `มี ${needsReview} รายการที่ควรตรวจเพิ่มเติม`
                    : "รายการตรวจอัตโนมัติรอบนี้ครบแล้ว"}
                </p>

                <ul className={styles.checklist}>
                  {checks.map((check) => (
                    <li key={check.label}>
                      <span
                        className={check.complete ? styles.pass : styles.missing}
                        aria-label={check.complete ? "ครบ" : "ควรตรวจ"}
                      >
                        {check.complete ? "✓" : "○"}
                      </span>
                      {check.label}
                    </li>
                  ))}
                </ul>

                <p className={styles.note}>
                  ตรวจความครบของข้อมูลและรูปแบบพื้นฐาน
                  กรุณาพิจารณาหัวข้อย่อยให้เหมาะกับความยาวบทความ
                  และตรวจข้อเท็จจริงกับแหล่งอ้างอิงก่อนเผยแพร่
                  ผลนี้ไม่ใช่คะแนน SEO
                </p>
              </section>
            <section className={styles.sideCard}><h4>แหล่งข้อมูลประกอบ</h4>{article.sources.length ? <ol className={styles.sourceList}>{article.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ol> : <p className={styles.note}>ใช้รายละเอียดธุรกิจที่คุณให้ ไม่มีแหล่งข้อมูลเว็บไซต์ประกอบ</p>}
              {saved && <details><summary>ดูรายละเอียดธุรกิจต้นทาง</summary><p>{saved.input.context.brand || "ไม่ได้ระบุชื่อธุรกิจ"}</p><p className={styles.note}>{saved.input.context.businessDetails || "ใช้ข้อความจากเว็บไซต์ประกอบ"}</p></details>}
            </section>
            {article.reviewNotes.length > 0 && <section className={styles.sideCard}><details open><summary>ข้อสังเกตจากตอนสร้าง ({article.reviewNotes.length})</summary><ul className={styles.reviewList}>{article.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></details></section>}
          </aside>
        </div>
        <details className={styles.regenerate}><summary>สร้างฉบับร่างใหม่จากแผนเดิม</summary><p>เมื่อสร้างสำเร็จจะแทนที่ฉบับนี้ หากต้องการเก็บการแก้ไขปัจจุบันให้ดาวน์โหลดก่อน การกดสร้างจะเรียก บริการ AI ที่ตั้งค่า เพิ่มหนึ่งครั้ง</p><button type="button" className={styles.secondary} disabled={unavailable || !context} onClick={generate}>{busy ? "กำลังเขียนบทความ…" : "สร้างฉบับร่างใหม่"}</button></details>
        <p className={styles.storageNote}>ฉบับร่างที่บันทึกสำเร็จเก็บในบัญชี Supabase เปิดด้วยบัญชีเดียวกันจากเบราว์เซอร์อื่นได้ · ตรวจข้อมูลและอ้างอิงก่อนเผยแพร่ การจัดรูปแบบหรือแก้ข้อความไม่เรียก AI</p>
      </>}
    </section>
  );
}
