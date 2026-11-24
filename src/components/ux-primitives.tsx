"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui-icons";

/**
 * พจนานุกรมคำอธิบายศัพท์เทคนิคภาษาไทยแบบสั้น (ตามเกณฑ์ USA-03)
 */
export const TECH_TERM_GLOSSARY: Record<string, string> = {
  "Meta Description": "คำอธิบายสั้นใต้ชื่อเว็บในหน้าผลค้นหา Google ควรยาวประมาณ 120–160 ตัวอักษร",
  H1: "หัวข้อหลักของหน้าเว็บ ควรมี 1 หัวข้อต่อหน้าเพื่อบอกคนอ่านและ Google ว่าหน้านี้เกี่ยวกับอะไร",
  Canonical: "ลิงก์ต้นฉบับที่บอก Google ว่าหน้าไหนคือหน้าหลักกรณีมีเนื้อหาซ้ำกันหลาย URL",
  LCP: "เวลาที่หน้าเว็บใช้แสดงภาพหรือเนื้อหาหลักจนเสร็จ (เกณฑ์ดีคือไม่เกิน 2.5 วินาที)",
  INP: "ความเร็วในการตอบสนองเมื่อผู้ใช้กดปุ่มหรือแตะหน้าจอ (เกณฑ์ดีคือไม่เกิน 200 มิลลิวินาที)",
  CLS: "ความนิ่งของหน้าเว็บขณะโหลด ไม่ให้ปุ่มหรือข้อความกระโดดหนีนิ้ว (เกณฑ์ดีคือไม่เกิน 0.1)",
  "Search Intent": "จุดประสงค์ของคนค้นหา เช่น ต้องการหาความรู้ เปรียบเทียบก่อนซื้อ หรือพร้อมซื้อทันที",
  Crawl: "การให้ระบบเข้าไปอ่านโครงสร้างและข้อความในหน้าเว็บที่เปิดสาธารณะโดยเคารพ robots.txt",
  "robots.txt": "ไฟล์กำหนดกติกาของเว็บไซต์ว่าอนุญาตให้บอตเข้าอ่านหน้าไหนได้บ้าง",
  "sitemap.xml": "แผนผังรวมลิงก์ทุกหน้าในเว็บ ช่วยให้ Google และ AI ค้นพบหน้าใหม่ได้เร็วขึ้น",
  Slug: "ส่วนท้ายของลิงก์ URL ที่ควรสั้น ชัดเจน และสื่อถึงหัวข้อบทความ",
  "AEO / GEO": "การทำเนื้อหาให้ชัดเจนและตรวจสอบที่มาได้ เพื่อให้ AI Answer Engine นำไปอ้างอิงตอบคำถาม",
  "การแข่งขันโฆษณา": "ระดับการแข่งขันซื้อโฆษณา Google Ads ไม่ใช่ความยากในการติดอันดับ SEO แบบออร์แกนิก",
};

/**
 * ป้ายคำอธิบายศัพท์เทคนิคแบบกด/แตะ/โฟกัสได้ (รองรับมือถือ 375px และคีย์บอร์ด — USA-03)
 */
export function TermHelp({
  term,
  explanation,
}: {
  term: string;
  explanation?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const text = explanation ?? TECH_TERM_GLOSSARY[term] ?? "";

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!text) return <span>{term}</span>;

  return (
    <span className="term-help" ref={wrapRef}>
      <button
        type="button"
        className="term-help-btn"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{term}</span>
        <span className="term-help-mark" aria-hidden="true">
          ?
        </span>
      </button>
      {open && (
        <span id={id} role="tooltip" className="term-popover">
          <strong>{term}</strong>
          <span>{text}</span>
        </span>
      )}
    </span>
  );
}

/**
 * ป้ายระบุแหล่งที่มาของข้อมูลและเวลาอัปเดตล่าสุด (ตามเกณฑ์ REL-02)
 */
export function SourceStamp({
  source,
  updatedAt,
}: {
  source: string;
  updatedAt?: string | null;
}) {
  const formatted = (() => {
    if (!updatedAt) return null;
    const ms = Date.parse(updatedAt);
    if (!Number.isFinite(ms)) return updatedAt;
    return new Date(ms).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  })();

  return (
    <div className="source-stamp" role="note">
      <Icon name="file" size={14} />
      <span>
        แหล่งข้อมูล: <b>{source}</b>
        {formatted ? ` · อัปเดตล่าสุด ${formatted}` : ""}
      </span>
    </div>
  );
}

/**
 * กล่องแจ้งเตือน / ข้อผิดพลาด / ข้อมูลไม่เพียงพอ พร้อมคำแนะนำขั้นถัดไป (ตามเกณฑ์ USA-08 & REL-03)
 */
export function ActionableNotice({
  tone = "info",
  title,
  detail,
  nextStep,
  action,
}: {
  tone?: "error" | "warning" | "info" | "insufficient";
  title: string;
  detail?: string;
  nextStep?: string;
  action?: ReactNode;
}) {
  const isAlert = tone === "error";
  return (
    <div
      className={`action-notice action-notice-${tone}`}
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
    >
      <span className="action-notice-icon" aria-hidden="true">
        <Icon name={tone === "info" ? "spark" : "alert"} size={18} />
      </span>
      <div className="action-notice-body">
        <strong>{title}</strong>
        {detail && <p>{detail}</p>}
        {nextStep && (
          <p className="action-notice-next">
            <b>ขั้นถัดไป:</b> {nextStep}
          </p>
        )}
        {action && <div className="action-notice-action">{action}</div>}
      </div>
    </div>
  );
}
