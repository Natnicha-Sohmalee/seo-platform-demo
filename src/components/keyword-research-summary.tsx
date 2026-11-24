import type { KeywordSelection } from "@/lib/keyword-data";
import styles from "./keyword-research-summary.module.css";

export default function KeywordResearchSummary({ research }: { research?: KeywordSelection }) {
  if (!research) return null;
  const { metadata, terms } = research;
  const network = metadata.network === "google" ? "Google" : metadata.network === "google-and-partners" ? "Google และพาร์ทเนอร์" : "ไม่ระบุเครือข่าย";
  return <section className={styles.summary} aria-label="คีย์เวิร์ดสำหรับงานนี้">
    <p><strong>คำหลักสำหรับงานนี้</strong><span className={styles.primary}>{terms[0].keyword}</span></p>
    {terms.length > 1 && <p>คำประกอบ: {terms.slice(1).map((term) => term.keyword).join(" · ")}</p>}
    <details><summary>ข้อมูลที่ใช้เลือกคำ</summary>
      <p>Google Keyword Planner · {metadata.location || "ยังไม่ระบุพื้นที่"} · {metadata.fromMonth && metadata.toMonth ? `${metadata.fromMonth} ถึง ${metadata.toMonth}` : "ยังไม่ระบุช่วงข้อมูล"} · {network}</p>
      <ul>{terms.map((term) => <li key={term.id}>{term.keyword}: ปริมาณค้นหาเฉลี่ยต่อเดือน {term.volume || "ไม่มีข้อมูล"} · การแข่งขันโฆษณา {term.adsCompetition || "ไม่มีข้อมูล"}</li>)}</ul>
      <p>นำเข้าจาก {metadata.fileName} เมื่อ {new Date(metadata.importedAt).toLocaleDateString("th-TH")} ข้อมูลนี้มาจากไฟล์ที่ผู้ใช้ให้ ยังไม่ได้ตรวจสอบกับผู้ให้บริการ ไม่ใช่คะแนนความยาก SEO หรือการรับประกันอันดับ</p>
    </details>
  </section>;
}
