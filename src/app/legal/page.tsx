"use client";

import { useState } from "react";
import MarketingShell, { PageIntro } from "@/components/marketing-shell";
import { Badge } from "@/components/ui-icons";

const tabs = [
  "Privacy Policy",
  "Terms of Service",
  "Cookie Policy",
  "AI & SEO Disclaimer",
] as const;

const content: Record<(typeof tabs)[number], [string, string][]> = {
  "Privacy Policy": [
    [
      "ข้อมูลที่เราเก็บรวบรวม",
      "เราเก็บข้อมูลบัญชี ข้อมูลโปรเจกต์ และข้อมูลการใช้งานที่จำเป็นต่อการให้บริการเท่านั้น",
    ],
    [
      "การใช้ข้อมูล",
      "ข้อมูลถูกใช้เพื่อสร้างผลลัพธ์ ปรับปรุงประสบการณ์ และดูแลความปลอดภัยของบัญชี",
    ],
    ["สิทธิ์ของคุณ", "คุณขอเข้าถึง แก้ไข ส่งออก หรือลบข้อมูลส่วนบุคคลได้"],
  ],
  "Terms of Service": [
    [
      "การใช้บริการ",
      "ผู้ใช้งานต้องให้ข้อมูลที่ถูกต้องและรับผิดชอบต่อเนื้อหาที่นำเข้าสู่ระบบ",
    ],
    [
      "ทรัพย์สินทางปัญญา",
      "คุณยังคงเป็นเจ้าของข้อมูลธุรกิจและเนื้อหาที่สร้างในพื้นที่ทำงาน",
    ],
    [
      "ข้อจำกัดความรับผิด",
      "บริการช่วยวางแผนและไม่ถือเป็นคำแนะนำทางกฎหมายหรือการรับประกันผลลัพธ์",
    ],
  ],
  "Cookie Policy": [
    [
      "คุกกี้ที่จำเป็น",
      "ใช้เพื่อรักษาสถานะการเข้าสู่ระบบ ความปลอดภัย และการตั้งค่าหลัก",
    ],
    [
      "คุกกี้วิเคราะห์",
      "ช่วยให้เราเข้าใจการใช้งานในภาพรวม โดยไม่ขายข้อมูลให้บุคคลภายนอก",
    ],
    ["การจัดการคุกกี้", "คุณสามารถเปลี่ยนการอนุญาตได้จากการตั้งค่าเบราว์เซอร์"],
  ],
  "AI & SEO Disclaimer": [
    [
      "บทบาทของ AI",
      "AI ช่วยสรุป เสนอแนวคิด และสร้างร่างจากข้อมูลที่ได้รับ ไม่ได้แทนที่การตรวจทานโดยมนุษย์",
    ],
    [
      "การตรวจข้อเท็จจริง",
      "ข้อมูลราคา สถิติ สุขภาพ กฎหมาย และข้อมูลที่เปลี่ยนแปลงได้ควรตรวจจากแหล่งที่เชื่อถือได้ทุกครั้ง",
    ],
    [
      "ผลลัพธ์ SEO",
      "เราไม่รับประกันอันดับ Traffic หรือการถูกเลือกโดย AI Answer Engine เนื่องจากขึ้นอยู่กับหลายปัจจัยภายนอก",
    ],
  ],
};

export default function LegalPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);

  return (
    <MarketingShell>
      <PageIntro
        eyebrow="Trust & transparency"
        title="นโยบายที่อ่านเข้าใจได้"
        body="เราอธิบายการดูแลข้อมูล ขอบเขตบริการ และบทบาทของ AI อย่างตรงไปตรงมา"
      />
      <section className="section pt-0">
        <div className="container legal-wrap">
          <div className="legal-tabs">
            {tabs.map((x) => (
              <button
                type="button"
                className={tab === x ? "active" : ""}
                onClick={() => setTab(x)}
                key={x}
              >
                {x}
              </button>
            ))}
          </div>
          <article className="legal-content">
            <Badge tone="gray">อัปเดตล่าสุด 15 มกราคม 2025</Badge>
            <h2>{tab}</h2>
            <p className="legal-lead">
              เอกสารนี้สรุปหลักการสำคัญสำหรับผู้ใช้งาน SEO Platform โดยใช้ภาษาที่ชัดเจนและตรวจสอบได้
            </p>
            {content[tab].map((x, i) => (
              <section key={x[0]}>
                <h3>
                  {i + 1}. {x[0]}
                </h3>
                <p>{x[1]}</p>
              </section>
            ))}
          </article>
        </div>
      </section>
    </MarketingShell>
  );
}
