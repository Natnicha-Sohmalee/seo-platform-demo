"use client";

import { useState, type FormEvent } from "react";
import MarketingShell, { PageIntro } from "@/components/marketing-shell";
import { Icon } from "@/components/ui-icons";

export default function ContactPage() {
  const [sent, setSent] = useState(false);
  const [type, setType] = useState("Live Demo");

  return (
    <MarketingShell>
      {sent ? (
        <section className="success-page">
          <div className="success-card">
            <span>
              <Icon name="check" size={32} />
            </span>
            <p className="eyebrow">ส่งคำขอสำเร็จ</p>
            <h1>ขอบคุณที่สนใจ SEO Platform</h1>
            <p>
              ทีมงานได้รับข้อมูลแล้ว และจะติดต่อกลับภายใน 1 วันทำการ
              <br />
              หมายเลขคำขอ: DEMO-25048
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setSent(false)}
            >
              ส่งคำขอเพิ่มเติม
            </button>
          </div>
        </section>
      ) : (
        <>
          <PageIntro
            eyebrow="Let's talk"
            title="ดูให้เห็นว่า SEO Platform เหมาะกับทีมคุณอย่างไร"
            body="นัดคุยกับทีมของเรา 30 นาที พร้อมดูตัวอย่างจากโจทย์ธุรกิจที่ใกล้เคียงกับคุณ"
          />
          <section className="section pt-0">
            <div className="container contact-grid">
              <div className="contact-info">
                <h2>ใน Demo คุณจะได้รับ</h2>
                {[
                  "ดู Workflow ตั้งแต่นำเข้าข้อมูลจนส่งออกบทความ",
                  "คำแนะนำการเริ่มต้นตามรูปแบบธุรกิจของคุณ",
                  "ประเมินแพ็กเกจและโควตาที่เหมาะกับทีม",
                  "ช่วงถาม–ตอบกับผู้เชี่ยวชาญผลิตภัณฑ์",
                ].map((x) => (
                  <p key={x}>
                    <span>
                      <Icon name="check" />
                    </span>
                    {x}
                  </p>
                ))}
                <div className="contact-box">
                  <small>อีเมล</small>
                  <b>hello@seoplatform.co.th</b>
                  <small>เวลาทำการ</small>
                  <b>จันทร์–ศุกร์ 09:00–18:00 น.</b>
                </div>
              </div>
              <form
                className="form-card"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  setSent(true);
                }}
              >
                <h2>ส่งคำขอถึงทีมของเรา</h2>
                <div className="request-types">
                  {["Live Demo", "ใบเสนอราคา", "นัดประชุม"].map((x) => (
                    <button
                      type="button"
                      key={x}
                      className={type === x ? "active" : ""}
                      onClick={() => setType(x)}
                    >
                      {x}
                    </button>
                  ))}
                </div>
                <label>
                  ชื่อ–นามสกุล
                  <input required placeholder="ชื่อของคุณ" />
                </label>
                <label>
                  อีเมลธุรกิจ
                  <input required type="email" placeholder="name@company.com" />
                </label>
                <div className="form-row">
                  <label>
                    ชื่อบริษัท
                    <input placeholder="ชื่อบริษัท" />
                  </label>
                  <label>
                    ขนาดทีม
                    <select>
                      <option>1–5 คน</option>
                      <option>6–20 คน</option>
                      <option>มากกว่า 20 คน</option>
                    </select>
                  </label>
                </div>
                <label>
                  อยากให้เราช่วยเรื่องไหน
                  <textarea rows={4} placeholder="เล่าเป้าหมายหรือโจทย์ของทีมสั้น ๆ" />
                </label>
                <button type="submit" className="btn btn-primary">
                  ส่งคำขอ {type} <Icon name="arrow" />
                </button>
              </form>
            </div>
          </section>
        </>
      )}
    </MarketingShell>
  );
}
