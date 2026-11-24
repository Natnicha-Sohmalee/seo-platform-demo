"use client";

import { useEffect, useRef, useState } from "react";
import ArticleDraftPanel from "@/components/article-draft-panel";
import briefStyles from "./content-brief.module.css";
import type { ContentBrief, ContentContext, ContentSource } from "@/lib/content-types";
import { ContentAccountBoundary, useContentStore } from "@/components/content-account";
import LegacyContentImport from "@/components/legacy-content-import";
import { isSavedBrief } from "@/lib/content-validation";
import type { KeywordSelection } from "@/lib/keyword-data";
import KeywordResearchSummary from "@/components/keyword-research-summary";
import ActionLink from "@/components/action-link";
import { copyText } from "@/lib/clipboard";

type SourcePage = {
  url: string;
  title?: string | null;
  status: string;
  text?: string;
  markdown?: string;
};

type Topic = {
  id: string;
  title: string;
  reason: string;
  audience: string;
  sourceUrls: string[];
};

type Recommendations = {
  summary: string;
  topics: Topic[];
  model: string;
  createdAt: string;
  sources: { url: string; title: string }[];
};

type BriefResult = ContentBrief;

type SavedState = {
  keywordResearch?: KeywordSelection;
  brand: string;
  businessDetails: string;
  topic: string;
  audience: string;
  selectedUrls: string[];
  recommendations: Recommendations | null;
  result: BriefResult | null;
};

type Props = {
  pages: SourcePage[];
  storageId: string;
};

const INITIAL: SavedState = {
  brand: "",
  businessDetails: "",
  topic: "",
  audience: "",
  selectedUrls: [],
  recommendations: null,
  result: null,
};

function content(page: SourcePage) {
  return page.text?.trim() || page.markdown?.trim() || "";
}

async function askAI<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/content-brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await response.text();

  if (!raw.trim()) {
    throw new Error(
      `เซิร์ฟเวอร์ส่งคำตอบว่างกลับมา (HTTP ${response.status}) กรุณาดูข้อความใน Terminal ที่รัน npm run dev`
    );
  }

  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `เซิร์ฟเวอร์ไม่ได้ส่งผลลัพธ์ JSON (HTTP ${response.status}) กรุณาดูข้อผิดพลาดใน Terminal`
    );
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `ทำรายการไม่สำเร็จ (HTTP ${response.status})`;

    throw new Error(message);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("รูปแบบคำตอบจากเซิร์ฟเวอร์ไม่ถูกต้อง");
  }

  return data as T;
}

export default function ContentBriefPanel(props: Props) {
  return <ContentAccountBoundary><ContentAssistant key={props.storageId} {...props} /></ContentAccountBoundary>;
}

function ContentAssistant({ pages, storageId }: Props) {
  const store = useContentStore();
  const [storageError, setStorageError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<SavedState>(INITIAL);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"recommend" | "brief" | null>(null);
  const [message, setMessage] = useState("");
  const requestLock = useRef(false);
  const latestDraft = useRef<SavedState | null>(null);
  const dirtyDraft = useRef(false);

  const seen = new Set<string>();
  const savedSources: SourcePage[] = (data.result?.context?.sources ?? []).map((source) => ({ ...source, status: "ok" }));
  const eligiblePages = [...pages, ...savedSources].filter((page) => {
    if (
      page.status !== "ok" ||
      !content(page) ||
      seen.has(page.url)
    ) {
      return false;
    }

    seen.add(page.url);
    return true;
  });

  const selectedPages = eligiblePages.filter((page) =>
    data.selectedUrls.includes(page.url)
  );

  // แผนรุ่นใหม่ใช้ snapshot ต้นทาง แผนเดิมจับคู่ URL ตามลำดับอ้างอิง
  const legacySources = data.result?.sources.map((reference) => {
    const page = eligiblePages.find((item) => item.url === reference.url);
    return page ? {
      url: reference.url,
      title: reference.title,
      text: content(page).slice(0, 6000),
    } : null;
  }) ?? [];
  const legacyContext: ContentContext | null = data.result &&
    !legacySources.some((source) => source === null) &&
    (legacySources.length > 0 || data.businessDetails.trim())
      ? {
          brand: data.brand,
          businessDetails: data.businessDetails,
          topic: data.result.topic || data.topic,
          audience: data.audience,
          keywordResearch: data.keywordResearch,
          sources: legacySources.filter((source): source is ContentSource => source !== null),
        }
      : null;
  const articleContext = data.result?.context ?? legacyContext;

  // ใช้ key เดิมเพื่ออ่าน Brief ที่เคยบันทึกไว้ได้
  const storageKey = `brief:${storageId}`;
  useEffect(() => { latestDraft.current = data; }, [data]);
  useEffect(() => () => {
    if (dirtyDraft.current && latestDraft.current) {
      void store.save(storageKey, latestDraft.current).catch(() => {});
    }
  }, [storageKey, store]);

  useEffect(() => {
    let active = true;
    setReady(false);
    setStorageError("");
    void store.load<unknown>(storageKey).then((saved) => {
      if (!active) return;
      if (saved && !isSavedBrief(saved.job)) throw new Error("ข้อมูล Brief เดิมอ่านไม่ได้ ระบบยังไม่แก้ไขข้อมูลนั้น");
      const restored = saved ? { ...INITIAL, ...saved.job as Partial<SavedState> } : INITIAL;
      dirtyDraft.current = false;
      latestDraft.current = restored;
      setData(restored);
      setSavedAt(saved?.savedAt ?? null);
      setSaving(false);
      setMessage(saved ? "โหลดงานจากบัญชีแล้ว โดยไม่ได้เรียก AI ซ้ำ" : "");
      setReady(true);
    }).catch((error) => {
      if (active) setStorageError(error instanceof Error ? error.message : "โหลด Brief จากบัญชีไม่ได้");
    });
    return () => { active = false; };
  }, [storageKey, store, reload]);

  useEffect(() => {
    if (!ready || !dirtyDraft.current) return;
    let active = true;
    setSaving(true);
    const timer = window.setTimeout(() => {
      void store.save(storageKey, data).then((time) => {
        if (active && latestDraft.current === data) {
          dirtyDraft.current = false;
          setSavedAt(time);
          setStorageError("");
          setSaving(false);
        }
      }).catch((error) => {
        if (active) {
          setSaving(false);
          setStorageError(error instanceof Error ? error.message : "บันทึก Brief ไม่สำเร็จ กรุณาคัดลอกงานก่อนปิดหน้า");
        }
      });
    }, 500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [data, ready, storageKey, store]);

  async function retryStorage() {
    if (!ready) { setReload((value) => value + 1); return; }
    setSaving(true);
    try {
      const current = latestDraft.current ?? data;
      const time = await store.save(storageKey, current);
      if (latestDraft.current === current) {
        dirtyDraft.current = false;
        setSavedAt(time);
        setStorageError("");
      }
    } catch (error) { setStorageError(error instanceof Error ? error.message : "บันทึกไม่ได้"); }
    finally { setSaving(false); }
  }

  function update(patch: Partial<SavedState>) {
    dirtyDraft.current = true;
    setData((previous) => ({ ...previous, ...patch }));
  }

  async function recommend() {
    if (requestLock.current) return;
    if (!eligiblePages.length && !data.businessDetails.trim()) {
      setMessage("เล่ารายละเอียดธุรกิจด้านบนก่อน แล้ว AI จะช่วยแนะนำหัวข้อให้");
      return;
    }

    requestLock.current = true;
    setBusy("recommend");
    setMessage("");

    try {
      const recommendations = await askAI<Recommendations>({
        action: "recommend",
        keywordResearch: data.keywordResearch,
        brand: data.brand,
        businessDetails: data.businessDetails,
        sources: eligiblePages.slice(0, 10).map((page) => ({
          url: page.url,
          title: (page.title || page.url).slice(0, 500),
          text: content(page).slice(0, 1500),
        })),
      });

      update({
        recommendations,
        topic: "",
        audience: "",
        selectedUrls: [],
        result: null,
      });

      setMessage("เลือกเรื่องที่อยากเขียนด้านล่างได้เลย");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "แนะนำหัวข้อไม่สำเร็จ"
      );
    } finally {
      requestLock.current = false;
      setBusy(null);
    }
  }

  function chooseTopic(topic: Topic) {
    update({
      topic: topic.title,
      audience: topic.audience,
      selectedUrls: topic.sourceUrls,
      result: null,
    });

    setMessage(
      "เลือกหัวข้อและข้อมูลประกอบให้แล้ว กดวางแผนบทความได้เลย"
    );
  }

  function toggleSource(url: string) {
    const current = selectedPages.map((page) => page.url);

    if (current.includes(url)) {
      update({
        selectedUrls: current.filter((item) => item !== url),
      });
    } else if (current.length < 3) {
      update({ selectedUrls: [...current, url] });
    } else {
      setMessage("เลือกข้อมูลประกอบได้สูงสุด 3 หน้า");
    }
  }

  async function createBrief() {
    if (requestLock.current) return;

    if (!data.topic.trim() || (!selectedPages.length && !data.businessDetails.trim())) {
      setMessage("กรุณาระบุหัวข้อ พร้อมรายละเอียดธุรกิจหรือข้อมูลประกอบอย่างน้อยหนึ่งหน้า");
      return;
    }

    requestLock.current = true;
    setBusy("brief");
    setMessage("");

    try {
      const result = await askAI<BriefResult>({
        action: "brief",
        keywordResearch: data.keywordResearch,
        brand: data.brand,
        businessDetails: data.businessDetails,
        topic: data.topic,
        audience: data.audience,
        sources: selectedPages.map((page) => ({
          url: page.url,
          title: (page.title || page.url).slice(0, 500),
          text: content(page).slice(0, 6000),
        })),
      });

      update({ result });
      setMessage(result.warnings?.length
        ? "ได้รับแผนบทความแล้ว มีข้อสังเกตให้ตรวจด้านล่าง"
        : "วางแผนบทความแล้ว ตรวจข้อมูลก่อนนำไปเขียนต่อ");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "วางแผนบทความไม่สำเร็จ"
      );
    } finally {
      requestLock.current = false;
      setBusy(null);
    }
  }

  async function copyBrief() {
    if (!data.result) return;

    try {
      await copyText(data.result.brief);
      setMessage("คัดลอกแผนบทความแล้ว");
    } catch {
      setMessage("กรุณาเลือกข้อความแล้วคัดลอกด้วยตัวเอง");
    }
  }

  const disabled = !ready || busy !== null;

  return (
    <section className={briefStyles.assistant}>
      <h3>อยากเขียนบทความเรื่องอะไร?</h3>
      <KeywordResearchSummary research={data.keywordResearch} />
      {!data.keywordResearch && <p className={briefStyles.note}><ActionLink href="/keywords">เลือกคีย์เวิร์ดจากข้อมูลค้นหา</ActionLink><br />หรือเริ่มจากรายละเอียดธุรกิจด้านล่างได้เลย</p>}
      <p className={briefStyles.note} role="status">{saving ? "กำลังบันทึกในบัญชี…" : savedAt ? `บันทึกในบัญชีแล้ว ${new Date(savedAt).toLocaleString("th-TH")}` : ready ? "การแก้ไขจะบันทึกในบัญชีอัตโนมัติ" : "กำลังโหลดงานจากบัญชี…"}</p>
      {storageError && <div role="alert"><p>{storageError}</p><button type="button" disabled={saving} onClick={() => void retryStorage()}>{ready ? "ลองบันทึกอีกครั้ง" : "ลองโหลดอีกครั้ง"}</button></div>}
      {ready && <LegacyContentImport onlyKey={storageKey} onImported={() => setReload((value) => value + 1)} />}

      <p className={briefStyles.note}>
        ให้ AI ช่วยแนะนำหัวข้อ หรือพิมพ์เรื่องที่อยากเขียนเองก็ได้
        ยังไม่มีเว็บไซต์ก็เริ่มจากรายละเอียดธุรกิจได้
      </p>

      <fieldset className={briefStyles.controls} disabled={disabled}>
        <label>
          เล่าเกี่ยวกับธุรกิจของคุณ {eligiblePages.length ? "— ไม่บังคับ" : "— กรอกเพื่อเริ่มต้น"}
          <textarea
            rows={5}
            maxLength={3000}
            value={data.businessDetails}
            onChange={(event) => update({ businessDetails: event.target.value })}
            placeholder="เช่น ร้านกาแฟบ้านสวน เชียงใหม่ ขายกาแฟคั่วกลางและเบเกอรี ลูกค้าหลักเป็นคนทำงาน จุดเด่นคือเมล็ดกาแฟท้องถิ่น อยากเขียนบทความให้คนรู้จักร้านและสนใจเมนูกาแฟส้ม"
          />
          <small>เล่าว่าขายอะไร ลูกค้าเป็นใคร จุดเด่น และอยากให้บทความช่วยเรื่องอะไร ({data.businessDetails.length}/3,000 อักขระ)</small>
        </label>
        {!eligiblePages.length && (
          <p className={briefStyles.note}>ไม่ต้องมีเว็บไซต์หรือสั่ง Crawl ระบบจะใช้รายละเอียดที่คุณกรอก และไม่ค้นเว็บเพิ่มเติม</p>
        )}
        <details>
          <summary>มีหัวข้ออยู่แล้ว — พิมพ์เอง</summary>

          <label>
            อยากเขียนเรื่องอะไร?
            <input
              maxLength={300}
              value={data.topic}
              onChange={(event) =>
                update({ topic: event.target.value })
              }
              placeholder="เช่น เปิดร้านกาแฟเล็ก ๆ ต้องเตรียมอะไรบ้าง"
            />
          </label>

          <label>
            อยากให้ใครอ่าน? — ไม่บังคับ
            <textarea
              rows={2}
              maxLength={500}
              value={data.audience}
              onChange={(event) =>
                update({ audience: event.target.value })
              }
              placeholder="เช่น คนที่อยากเปิดร้านกาแฟเป็นครั้งแรก"
            />
          </label>

          {eligiblePages.length > 0 ? (
            <>
              <p>เลือกข้อมูลประกอบ · {selectedPages.length}/3 หน้า</p>
              <p className={briefStyles.note}>เลือกหน้าที่เกี่ยวข้อง หรือใช้รายละเอียดธุรกิจที่กรอกด้านบน</p>
            </>
          ) : (
            <p className={briefStyles.note}>ใช้รายละเอียดธุรกิจด้านบนประกอบการวางแผน ไม่ต้องเลือกหน้าเว็บ</p>
          )}

          {eligiblePages.map((page) => {
            const checked = data.selectedUrls.includes(page.url);

            return (
              <label className={briefStyles.source} key={page.url}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selectedPages.length >= 3}
                  onChange={() => toggleSource(page.url)}
                />
                <span>
                  {page.title || page.url}
                  <small>{page.url}</small>
                </span>
              </label>
            );
          })}
        </details>
        <details>
          <summary>ชื่อธุรกิจหรือแบรนด์ — ไม่บังคับ</summary>
          <label>
            ชื่อที่ต้องการใช้ในบทความ
            <textarea
              rows={2}
              maxLength={200}
              value={data.brand}
              onChange={(event) => update({ brand: event.target.value })}
              placeholder="เช่น ร้านกาแฟบ้านสวน"
            />
          </label>
          <p className={briefStyles.note}>
            ระบุธุรกิจของคุณเองได้ แม้ข้อมูลที่อ่านมาจะเป็นเว็บคู่แข่ง
            หรือเว็บสำหรับศึกษา
          </p>
        </details>

        <button type="button" onClick={recommend}>
          {busy === "recommend"
            ? "กำลังคิดหัวข้อให้…"
            : data.recommendations
              ? "แนะนำหัวข้อใหม่"
              : "แนะนำหัวข้อให้ฉัน"}
        </button>

        <p className={briefStyles.note}>
          {eligiblePages.length
            ? "ส่งรายละเอียดธุรกิจและข้อความย่อจากสูงสุด 10 หน้า หน้าละไม่เกิน 1,500 อักขระให้ บริการ AI ที่ตั้งค่า"
            : "ส่งเฉพาะรายละเอียดธุรกิจที่คุณกรอกให้ บริการ AI ที่ตั้งค่า"}
          {" "}เมื่อกดปุ่ม โดยมีข้อจำกัดตามแผนของผู้ให้บริการ
        </p>

        {data.recommendations && (
          <section>
            <p>{data.recommendations.summary}</p>

            <div className={briefStyles.topics}>
              {data.recommendations.topics.map((topic) => (
                <article
                  className={
                    data.topic === topic.title ? `${briefStyles.card} ${briefStyles.selected}` : briefStyles.card
                  }
                  key={topic.id}
                >
                  <h4>{topic.title}</h4>
                  <p>{topic.reason}</p>
                  <p className={briefStyles.note}>เหมาะกับ: {topic.audience}</p>
                  <button
                    type="button"
                    onClick={() => chooseTopic(topic)}
                  >
                    {data.topic === topic.title
                      ? "เลือกเรื่องนี้แล้ว"
                      : "เลือกเรื่องนี้"}
                  </button>
                </article>
              ))}
            </div>

            {data.recommendations.sources.length > 0 && <details>
              <summary>ข้อมูลที่ AI ใช้แนะนำหัวข้อ</summary>
              <ul>
                {data.recommendations.sources.map((source) => (
                  <li key={source.url}>
                    {source.title}
                    <small>{source.url}</small>
                  </li>
                ))}
              </ul>
            </details>}

            <p className={briefStyles.note}>
              เป็นแนวคิดจากข้อมูลที่คุณให้ ยังไม่ได้ตรวจปริมาณค้นหา
              หรือยืนยันว่าทั้งเว็บไซต์ขาดเนื้อหาเหล่านี้
            </p>
          </section>
        )}

        {data.topic && (
          <section className={briefStyles.plan}>
            <h4>เรื่องที่จะเขียน: {data.topic}</h4>

            <details>
              <summary>ปรับหัวข้อ ผู้อ่าน และข้อมูลประกอบ</summary>

              <label>
                หัวข้อบทความ
                <input
                  maxLength={300}
                  value={data.topic}
                  onChange={(event) =>
                    update({ topic: event.target.value })
                  }
                />
              </label>

              <label>
                เขียนให้ใคร และอยากช่วยเขาเรื่องอะไร?
                <textarea
                  rows={3}
                  maxLength={500}
                  value={data.audience}
                  onChange={(event) =>
                    update({ audience: event.target.value })
                  }
                />
              </label>

              <p>{eligiblePages.length ? `ข้อมูลประกอบ · ${selectedPages.length}/3 หน้า` : "ข้อมูลประกอบ: รายละเอียดธุรกิจที่คุณกรอก"}</p>

              {eligiblePages.map((page) => {
                const checked = data.selectedUrls.includes(page.url);

                return (
                  <label className={briefStyles.source} key={page.url}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && selectedPages.length >= 3}
                      onChange={() => toggleSource(page.url)}
                    />
                    <span>
                      {page.title || page.url}
                      <small>{page.url}</small>
                    </span>
                  </label>
                );
              })}
            </details>

            <p className={briefStyles.note}>
              {selectedPages.length
                ? `ส่งรายละเอียดธุรกิจและข้อมูลประกอบ ${selectedPages.length} หน้า หน้าละไม่เกิน 6,000 อักขระ`
                : "ส่งรายละเอียดธุรกิจและหัวข้อที่เลือก"}
              {" "}ให้ บริการ AI ที่ตั้งค่า เมื่อกดวางแผน โดยมีข้อจำกัดตามแผนของผู้ให้บริการ
            </p>

            <button
              type="button"
              onClick={createBrief}
              disabled={
                disabled ||
                !data.topic.trim() ||
                (!selectedPages.length && !data.businessDetails.trim())
              }
            >
              {busy === "brief"
                ? "กำลังวางแผนบทความ…"
                : data.result
                  ? "วางแผนบทความใหม่"
                  : "วางแผนบทความ"}
            </button>
          </section>
        )}
      </fieldset>

      {message && (
        <p role="status" aria-live="polite">
          {message}
        </p>
      )}

      {data.result && (
        <section className={briefStyles.result}>
          <h4>
            แผนบทความ
            {data.result.topic ? `: ${data.result.topic}` : ""}
          </h4>

          <p className={briefStyles.note}>
            {data.result.model} ·{" "}
            {new Date(data.result.createdAt).toLocaleString("th-TH")}
          </p>

          <button type="button" onClick={copyBrief}>
            คัดลอกแผนบทความ
          </button>

          {Boolean(data.result.warnings?.length) && (
            <div className={briefStyles.reviewNotice} role="status">
              <strong>สิ่งที่ควรตรวจในแผนนี้</strong>
              <ul>{data.result.warnings?.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}</ul>
            </div>
          )}

          <details className={briefStyles.briefDetails}><summary>ดูแผนบทความฉบับเต็ม</summary><pre>{data.result.brief}</pre></details>

          {data.result.sources.length > 0 ? <details>
            <summary>แหล่งข้อมูลที่ใช้สร้างแผนนี้</summary>
            <ol>
              {data.result.sources.map((source, index) => (
                <li key={`${source.url}-${index}`}>
                  {source.title}
                  <small>{source.url}</small>
                </li>
              ))}
            </ol>
          </details> : <p className={briefStyles.note}>ข้อมูลประกอบ: รายละเอียดธุรกิจที่คุณกรอก ไม่มีแหล่งอ้างอิงเว็บไซต์</p>}

          <p className={briefStyles.note}>
            ตรวจข้อเท็จจริงและหมายเลขอ้างอิงก่อนนำไปเขียน
            ผลลัพธ์ไม่ได้รับประกันอันดับหรือการถูก AI อ้างอิง
          </p>

          <ArticleDraftPanel
            key={data.result.createdAt}
            brief={data.result}
            context={articleContext}
            storageId={storageId}
            usingLegacyContext={!data.result.context}
            disabled={disabled}
          />
        </section>
      )}

      <p className={briefStyles.note}>
        งานที่บันทึกสำเร็จเก็บในบัญชี Supabase เปิดจากเบราว์เซอร์อื่นด้วยบัญชีเดียวกันได้
        การโหลดงานเดิมไม่เรียก AI ซ้ำ
      </p>


    </section>
  );
}