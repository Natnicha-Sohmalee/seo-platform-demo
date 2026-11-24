import MarketingShell, { MarketingCta, PageIntro } from "@/components/marketing-shell";
import { Badge } from "@/components/ui-icons";

const cases = [
  {
    tag: "เริ่มโดยไม่มีเว็บไซต์",
    title: "บ้านสวน Coffee Lab",
    type: "ร้านกาแฟท้องถิ่น • เชียงใหม่",
    quote:
      "จากที่ไม่รู้จะเล่าเรื่องร้านอย่างไร เราได้แผนบทความ 8 เรื่องที่สะท้อนตัวตนของร้านจริง ๆ",
    stats: [
      ["20", "คีย์เวิร์ดที่คัดเลือก"],
      ["8", "แผนบทความ"],
      ["3 สัปดาห์", "เริ่มเผยแพร่ได้"],
    ],
    flow: ["เล่ารายละเอียดธุรกิจ", "นำเข้า Keyword CSV", "เลือกหัวข้อและเขียน"],
  },
  {
    tag: "มีเว็บไซต์อยู่แล้ว",
    title: "Wellness Plus Clinic",
    type: "คลินิกสุขภาพ • กรุงเทพฯ",
    quote:
      "ทีมเห็นทันทีว่าหน้าบริการไหนข้อมูลซ้ำ และดึงข้อมูลเดิมมาใช้เขียนได้โดยไม่ต้องเริ่มจากศูนย์",
    stats: [
      ["32", "หน้าที่ Crawl"],
      ["11", "จุดที่แก้ไข"],
      ["2 เท่า", "ผลิตงานได้เร็วขึ้น"],
    ],
    flow: ["Crawl เว็บไซต์", "ตรวจโครงสร้าง SEO", "ใช้หน้าเว็บเป็นอ้างอิง"],
  },
];

export default function CaseStudiesPage() {
  return (
    <MarketingShell>
      <PageIntro
        eyebrow="Customer stories"
        title="ทุกธุรกิจเริ่มจากจุดที่ต่างกันได้"
        body="ไม่ว่าจะมีเว็บไซต์พร้อมแล้ว หรือมีเพียงเรื่องราวของธุรกิจ SEO Platform ช่วยจัดข้อมูลให้เป็นระบบและเริ่มทำงานต่อได้"
      />
      <section className="section pt-0">
        <div className="container case-list">
          {cases.map((c, idx) => (
            <article className="case-card" key={c.title}>
              <div className={`case-brand brand-${idx}`}>
                <span>{c.title.split(" ")[0][0]}</span>
                <Badge tone={idx ? "blue" : "green"}>{c.tag}</Badge>
              </div>
              <div>
                <p className="overline">{c.type}</p>
                <h2>{c.title}</h2>
                <blockquote>“{c.quote}”</blockquote>
                <div className="case-stats">
                  {c.stats.map((s) => (
                    <span key={s[1]}>
                      <b>{s[0]}</b>
                      <small>{s[1]}</small>
                    </span>
                  ))}
                </div>
                <div className="flow-row">
                  {c.flow.map((f, i) => (
                    <span key={f}>
                      <i>{i + 1}</i>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="container review-row">
          <article>
            <div className="stars">★★★★★</div>
            <p>“Interface เข้าใจง่ายมาก เจ้าของร้านที่ไม่รู้ศัพท์ SEO ก็ทำตามได้”</p>
            <small>— คุณมีน, เจ้าของธุรกิจอาหารสุขภาพ</small>
          </article>
          <article>
            <div className="stars">★★★★★</div>
            <p>“ชอบที่ระบบเตือนว่าอะไรต้องเช็ก ไม่ได้ทำเหมือน AI รู้ทุกอย่าง”</p>
            <small>— คุณต้น, Content Lead</small>
          </article>
        </div>
      </section>
      <MarketingCta />
    </MarketingShell>
  );
}
