"use client";

import { useState } from "react";
import MarketingShell, { PageIntro } from "@/components/marketing-shell";
import { Icon } from "@/components/ui-icons";

const faqGroups: [string, [string, string][]][] = [
  [
    "สำหรับคนไม่มีเว็บไซต์",
    [
      [
        "ถ้ายังไม่มีเว็บไซต์ ใช้งานได้ไหม?",
        "ได้ คุณเริ่มจากกรอกชื่อแบรนด์ รายละเอียดสินค้า กลุ่มลูกค้า และจุดเด่นของธุรกิจ แล้วนำเข้าคีย์เวิร์ดเพื่อวางแผนได้ทันที",
      ],
      [
        "ต้องมีความรู้ SEO มาก่อนไหม?",
        "ไม่จำเป็น ทุกหน้ามีคำอธิบายภาษาธรรมดา และระบบจะบอกสิ่งที่ควรตัดสินใจทีละขั้น",
      ],
    ],
  ],
  [
    "ราคาและโควตา AI",
    [
      [
        "โควตา AI นับอย่างไร?",
        "นับเมื่อคุณขอสร้างหัวข้อ Brief หรือร่างใหม่เท่านั้น การเปิด แก้ไข หรือดาวน์โหลดงานเดิมไม่เสียโควตาซ้ำ",
      ],
      [
        "ยกเลิกแพ็กเกจได้ไหม?",
        "ยกเลิกได้ทุกเมื่อ และยังเข้าถึงงานเดิมได้จนสิ้นสุดรอบบิล",
      ],
    ],
  ],
  [
    "ไฟล์ CSV และการตรวจ SEO",
    [
      [
        "รองรับ CSV จากที่ไหน?",
        "รองรับไฟล์ CSV ที่ส่งออกจาก Google Keyword Planner และสามารถจับคู่คอลัมน์เองได้",
      ],
      [
        "ระบบตรวจ SEO ได้ครบทุกอย่างไหม?",
        "ระบบตรวจโครงสร้างพื้นฐานจากหน้าที่เข้าถึงได้ เช่น Title, Meta, H1 และสถานะการอ่าน ไม่ใช่ Technical SEO Audit เต็มรูปแบบ",
      ],
    ],
  ],
  [
    "ความปลอดภัยของข้อมูล",
    [
      [
        "AI นำข้อมูลธุรกิจไปฝึกโมเดลหรือไม่?",
        "ข้อมูลของคุณใช้เพื่อสร้างผลลัพธ์ในพื้นที่ทำงานเท่านั้น และไม่ถูกนำไปเผยแพร่ต่อ โปรดดูรายละเอียดในนโยบายความเป็นส่วนตัว",
      ],
      [
        "ลบโปรเจกต์ได้หรือไม่?",
        "ได้ ผู้ดูแลโปรเจกต์สามารถลบข้อมูลและประวัติงานของโปรเจกต์ได้จากการตั้งค่า",
      ],
    ],
  ],
];

export default function FaqPage() {
  const [open, setOpen] = useState("0-0");

  return (
    <MarketingShell>
      <PageIntro
        eyebrow="Frequently asked questions"
        title="มีคำถาม? เรารวมคำตอบไว้ให้แล้ว"
        body="คำตอบแบบตรงไปตรงมาเกี่ยวกับการเริ่มใช้งาน ราคา ข้อมูล และขอบเขตของแพลตฟอร์ม"
      />
      <section className="section pt-0">
        <div className="container faq-layout">
          <aside>
            {faqGroups.map((g, i) => (
              <a href={`#faq-${i}`} key={g[0]}>
                {g[0]}
              </a>
            ))}
          </aside>
          <div>
            {faqGroups.map((g, gi) => (
              <section className="faq-group" id={`faq-${gi}`} key={g[0]}>
                <h2>{g[0]}</h2>
                {g[1].map((x, qi) => {
                  const id = `${gi}-${qi}`;
                  return (
                    <article
                      className={open === id ? "faq-item open" : "faq-item"}
                      key={x[0]}
                    >
                      <button
                        type="button"
                        onClick={() => setOpen(open === id ? "" : id)}
                      >
                        <span>{x[0]}</span>
                        <Icon name={open === id ? "close" : "plus"} />
                      </button>
                      {open === id && <p>{x[1]}</p>}
                    </article>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
