import Link from "next/link";
import MarketingShell, { PageIntro } from "@/components/marketing-shell";
import { Icon } from "@/components/ui-icons";

const plans = [
  {
    name: "Starter",
    price: "ฟรี",
    desc: "ลองวางแผนบทความแรก",
    users: "1 ผู้ใช้",
    sites: "1 เว็บไซต์ / 10 หน้า",
    ai: "3 งาน AI / เดือน",
    features: ["นำเข้า CSV", "สร้าง Brief", "ส่งออก Markdown"],
    popular: false,
  },
  {
    name: "Business / SME",
    price: "฿1,490",
    desc: "สำหรับธุรกิจที่ทำคอนเทนต์ต่อเนื่อง",
    users: "3 ผู้ใช้",
    sites: "5 เว็บไซต์ / 500 หน้า",
    ai: "60 งาน AI / เดือน",
    features: ["ทุกอย่างใน Starter", "ประวัติ Crawl", "Article Library", "Priority support"],
    popular: true,
  },
  {
    name: "Agency & Team",
    price: "ติดต่อเรา",
    desc: "สำหรับทีมและหลายแบรนด์",
    users: "ไม่เกิน 15 ผู้ใช้",
    sites: "20 เว็บไซต์ / 5,000 หน้า",
    ai: "ปรับตามการใช้งาน",
    features: ["ทุกอย่างใน Business", "สิทธิ์ผู้ใช้งาน", "Onboarding ส่วนตัว", "SLA Support"],
    popular: false,
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <PageIntro
        eyebrow="Simple, transparent pricing"
        title="เลือกแพ็กเกจที่เติบโตไปกับทีมคุณ"
        body="เริ่มฟรี อัปเกรดเมื่อพร้อม ทุกแพ็กเกจเห็นโควตาชัดเจนและยกเลิกได้ทุกเมื่อ"
      />
      <section className="section pt-0">
        <div className="container pricing-grid">
          {plans.map((p) => (
            <article className={`price-card ${p.popular ? "popular" : ""}`} key={p.name}>
              {p.popular && <div className="popular-label">เหมาะกับธุรกิจส่วนใหญ่</div>}
              <h3>{p.name}</h3>
              <p>{p.desc}</p>
              <div className="price">
                {p.price}
                <small>{p.price.startsWith("฿") ? "/ เดือน" : ""}</small>
              </div>
              <Link
                href={p.name === "Agency & Team" ? "/contact" : "/login"}
                className={`btn ${p.popular ? "btn-primary" : "btn-secondary"}`}
              >
                {p.name === "Agency & Team" ? "คุยกับฝ่ายขาย" : "เริ่มใช้งาน"}
              </Link>
              <div className="plan-meta">
                <span>
                  <Icon name="users" /> {p.users}
                </span>
                <span>
                  <Icon name="globe" /> {p.sites}
                </span>
                <span>
                  <Icon name="spark" /> {p.ai}
                </span>
              </div>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <Icon name="check" /> {f}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="container transparency">
          <Icon name="alert" />
          <div>
            <h3>การทำงานอย่างโปร่งใส</h3>
            <p>
              เปิดงานเดิมหรือแก้ไขเนื้อหาไม่เสียโควตา AI ซ้ำ ระบบนับโควตาเมื่อขอให้สร้างผลลัพธ์ใหม่เท่านั้น
              และ SEO Platform ไม่รับประกันอันดับบน Search Engine เพราะผลลัพธ์ขึ้นอยู่กับหลายปัจจัย
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
