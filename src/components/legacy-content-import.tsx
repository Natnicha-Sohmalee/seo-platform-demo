"use client";

import { useEffect, useState } from "react";
import { listStoredResults } from "@/lib/crawl-storage";
import { isRecord, isSavedArticle, isSavedBrief } from "@/lib/content-validation";
import { useContentStore } from "@/components/content-account";
import { createUuid } from "@/lib/uuid";
import styles from "./legacy-content-import.module.css";

type Entry = { key: string; payload: unknown; title: string; kind: string };
type Props = { onlyKey?: string; onImported?: () => void };

export default function LegacyContentImport({ onlyKey, onImported }: Props) {
  const store = useContentStore();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [asCopy, setAsCopy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([listStoredResults("article:"), listStoredResults("brief:")]).then((groups) => {
      if (!active) return;
      const next: Entry[] = [];
      for (const row of groups.flat()) {
        if ((onlyKey && row.key !== onlyKey) || !isRecord(row.value)) continue;
        const payload = row.value.job;
        if (row.key.startsWith("article:") && isSavedArticle(payload)) {
          next.push({ key: row.key, payload, title: payload.article.title || "บทความไม่มีชื่อ", kind: "บทความ" });
        } else if (row.key.startsWith("brief:") && isSavedBrief(payload)) {
          next.push({ key: row.key, payload, title: String(payload.topic || payload.brand || "แบบร่างแผนบทความ"), kind: "Brief" });
        }
      }
      setEntries(next);
    }).catch(() => { if (active) setMessage("อ่านงานเก่าในเบราว์เซอร์ไม่ได้ งานบน Supabase ยังเปิดได้ตามปกติ"); });
    return () => { active = false; };
  }, [onlyKey]);

  async function importSelected() {
    if (busy || !selected.length) return;
    setBusy(true);
    setMessage("");
    const imported: string[] = [];
    const failures: string[] = [];
    try {
      for (const entry of entries.filter((item) => selected.includes(item.key))) {
        try {
          const targetKey = asCopy ? `${entry.key}:copy:${createUuid()}` : entry.key;
          await store.importRecord(targetKey, entry.payload);
          imported.push(entry.key);
        } catch (error) {
          failures.push(`${entry.title}: ${error instanceof Error ? error.message : "นำเข้าไม่ได้"}`);
        }
      }
      setEntries((previous) => previous.filter((entry) => !imported.includes(entry.key)));
      setSelected((previous) => previous.filter((key) => !imported.includes(key)));
      setMessage(`นำเข้า ${imported.length} งานแล้ว ต้นฉบับในเบราว์เซอร์ยังอยู่${failures.length ? ` · ${failures.join(" · ")}` : ""}`);
      if (imported.length) onImported?.();
    } finally { setBusy(false); }
  }

  if (!entries.length && !message) return null;
  return <section className={styles.panel} aria-label="นำเข้างานเก่า">
    <details>
      <summary>งานเก่าในเบราว์เซอร์นี้ · {entries.length} รายการ</summary>
      <p>เลือกเฉพาะงานของคุณเพื่อนำเข้าบัญชีที่เข้าสู่ระบบอยู่ ระบบจะไม่ลบต้นฉบับหรือเขียนทับงานที่มีในบัญชีแล้ว</p>
      <div className={styles.list}>{entries.map((entry) => <label key={entry.key}>
        <input type="checkbox" checked={selected.includes(entry.key)} disabled={busy} onChange={(event) => {
          setSelected((previous) => event.target.checked ? [...previous, entry.key] : previous.filter((key) => key !== entry.key));
        }} />
        <span><small>{entry.kind}</small>{entry.title}</span>
      </label>)}</div>
      <label className={styles.copyOption}><input type="checkbox" checked={asCopy} disabled={busy} onChange={(event) => setAsCopy(event.target.checked)} /> นำเข้าเป็นสำเนาใหม่ (ใช้เมื่อมีงานรหัสเดียวกันในบัญชีแล้ว)</label>
      <button type="button" disabled={busy || !selected.length} onClick={() => void importSelected()}>
        {busy ? "กำลังนำเข้า…" : `นำเข้า ${selected.length} งานเข้าบัญชีนี้`}
      </button>
    </details>
    {message && <p role="status">{message}</p>}
  </section>;
}
