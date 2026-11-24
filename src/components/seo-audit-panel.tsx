"use client";

import { analyzeSeo, type SeoPage } from "@/lib/seo-audit";

export default function SeoAuditPanel({ pages }: { pages: SeoPage[] }) {
  if (pages.length === 0) return null;

  const report = analyzeSeo(pages);

  const labels = {
    problem: "พบปัญหา",
    review: "ควรตรวจเพิ่มเติม",
    unavailable: "ข้อมูลยังไม่พอ",
  };

  return (
    <section className="audit">
      <h3>ตรวจ SEO เบื้องต้น</h3>

      <p className="description">
        ตรวจจากข้อมูลของ {report.totalPages} หน้าที่อ่านมาแล้ว
        ยังไม่ใช่ผลตรวจทั้งเว็บไซต์หรือคะแนนจัดอันดับ
      </p>

      <div className="summary">
        <span>พบปัญหา {report.problems}</span>
        <span>ควรตรวจ {report.reviews}</span>
        <span>ข้อมูลยังไม่พอ {report.unavailable}</span>
      </div>

      {report.findings.length === 0 ? (
        <p>
          ไม่พบข้อสังเกตตามกฎที่เปิดใช้
          ไม่ได้หมายความว่าหน้าเว็บผ่าน SEO ทุกด้าน
        </p>
      ) : (
        <div className="findings">
          {report.findings.map((finding, index) => (
            <article className="finding" key={`${finding.code}-${index}`}>
              <span className={`badge ${finding.level}`}>
                {labels[finding.level]}
              </span>

              <h4>{finding.title}</h4>
              <p>{finding.detail}</p>

              <ul>
                {finding.urls.map((url) => (
                  <li key={url}>{url}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      <p className="description">
        ยังไม่ตรวจ robots directives, Structured Data,
        ความเร็วหน้าเว็บ หรือการปรากฏในคำตอบ AI
      </p>

      <style jsx>{`
        .audit {
          margin-top: 28px;
          border-top: 1px solid var(--line);
          padding-top: 22px;
        }
        h3 {
          margin: 0 0 12px;
          font-size: 19px;
          font-weight: 700;
        }
        .description {
          color: var(--muted);
          font-size: 13px;
          line-height: 1.8;
        }
        .summary {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin: 18px 0;
        }
        .summary span {
          padding: 8px 12px;
          border-radius: 8px;
          background: var(--mint);
          color: var(--ink);
          font-size: 13px;
          font-weight: 600;
        }
        .findings {
          display: grid;
          gap: 12px;
        }
        .finding {
          padding: 18px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: #fff;
        }
        h4 {
          margin: 10px 0 8px;
          font-weight: 700;
        }
        .finding p {
          margin: 0;
          line-height: 1.8;
          color: var(--muted);
          font-size: 13px;
        }
        ul {
          padding-left: 20px;
          margin-bottom: 0;
          color: var(--muted);
          font-size: 12px;
          overflow-wrap: anywhere;
        }
        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
        }
        .problem {
          background: #fbe8e5;
          color: #a43d34;
        }
        .review {
          background: #fff0db;
          color: #95601b;
        }
        .unavailable {
          background: #eef1ef;
          color: #5d6c68;
        }
      `}</style>
    </section>
  );
}