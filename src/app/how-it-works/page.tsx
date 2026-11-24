import MarketingShell, { MarketingCta, PageIntro } from "@/components/marketing-shell";
import { Icon, type IconName } from "@/components/ui-icons";

const steps: [string, string, IconName][] = [
  [
    "เตรียมข้อมูลตั้งต้น",
    "มีเว็บไซต์ ให้ระบบอ่านหน้าเว็บที่มีอยู่ หรือเริ่มจากรายละเอียดธุรกิจหากคุณยังไม่มีเว็บไซต์",
    "globe",
  ],
  [
    "เลือกหัวข้อที่เหมาะ",
    "เลือกจากหัวข้อที่ AI แนะนำจากข้อมูลจริง หรือกำหนดเอง พร้อมเลือกหน้าอ้างอิงได้สูงสุด 3 หน้า",
    "search",
  ],
  [
    "สร้างและตรวจ Brief",
    "ดูโครงเรื่องพร้อมหมายเลขอ้างอิง และตรวจกล่องคำเตือน Fact-check ก่อนเริ่มเขียน",
    "file",
  ],
  [
    "เขียน แก้ไข ส่งออก",
    "สร้างร่าง ปรับภาษาใน Rich Editor ตรวจ Preview และส่งออกเป็นไฟล์ Markdown",
    "edit",
  ],
];

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <PageIntro
        eyebrow="How it works"
        title="จากข้อมูลธุรกิจ สู่บทความพร้อมใช้ใน 4 ขั้นตอน"
        body="ทุกขั้นตอนบอกชัดเจนว่าข้อมูลมาจากไหน AI ช่วยตรงไหน และส่วนใดที่คุณควรเป็นคนตัดสินใจ"
      />
      <section className="section">
        <div className="container process">
          <div className="process-line" />
          {steps.map((s, i) => (
            <article className="process-row" key={s[0]}>
              <div className="step-number">{String(i + 1).padStart(2, "0")}</div>
              <div className="process-icon">
                <Icon name={s[2]} />
              </div>
              <div>
                <p className="overline">ขั้นตอนที่ {i + 1}</p>
                <h2>{s[0]}</h2>
                <p>{s[1]}</p>
                {i === 0 && (
                  <div className="choice-row">
                    <span>
                      <Icon name="globe" /> มีเว็บไซต์แล้ว
                    </span>
                    <span>
                      <Icon name="plus" /> ยังไม่มีเว็บไซต์
                    </span>
                  </div>
                )}
                {i === 2 && (
                  <div className="fact-box">
                    <Icon name="alert" />
                    <span>
                      <b>Fact-check checkpoint</b>
                      <br />
                      ตรวจข้อมูลที่เปลี่ยนแปลงได้เสมอ
                    </span>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <MarketingCta />
    </MarketingShell>
  );
}
