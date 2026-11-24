import Link from "next/link";
import MarketingShell, { PageIntro } from "@/components/marketing-shell";
import { Badge, Icon, type IconName } from "@/components/ui-icons";

const features: {
  icon: IconName;
  n: string;
  title: string;
  th: string;
  body: string;
  href: string;
  ui: React.ReactNode;
}[] = [
  {
    icon: "globe",
    n: "01",
    title: "Website Crawler & SEO Audit",
    th: "อ่านโครงสร้างเว็บไซต์ก่อนเริ่มวางแผน",
    body: "รวบรวมหน้าเว็บที่เข้าถึงได้ ตรวจ Title, Meta Description, H1 และสัญญาณ SEO เบื้องต้น เพื่อให้คุณรู้ว่ามีเนื้อหาอะไรอยู่แล้ว",
    href: "/projects",
    ui: (
      <div className="crawl-ui">
        <div>
          <span>อ่านสำเร็จ</span>
          <b>8 หน้า</b>
        </div>
        <p>
          <Icon name="check" size={17} /> /menu/coffee-beans <Badge>สมบูรณ์</Badge>
        </p>
        <p>
          <Icon name="alert" size={17} /> /about <Badge tone="red">ไม่มี Meta</Badge>
        </p>
      </div>
    ),
  },
  {
    icon: "upload",
    n: "02",
    title: "Keyword CSV Workspace",
    th: "เปลี่ยนไฟล์ CSV ให้เป็นชุดคำที่ใช้ได้จริง",
    body: "นำเข้าข้อมูลจาก Google Keyword Planner จับคู่คอลัมน์ ค้นหาและเลือกคำหลักได้สูงสุด 5 คำ โดยไม่ทำให้ค่าการแข่งขันโฆษณาสับสนกับ SEO",
    href: "/keywords",
    ui: (
      <div className="keyword-chips">
        <Badge tone="blue">คำหลัก: เมล็ดกาแฟไทย</Badge>
        <Badge tone="gray">กาแฟดริป</Badge>
        <Badge tone="gray">กาแฟคั่วอ่อน</Badge>
        <div className="bar-chart">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
    ),
  },
  {
    icon: "spark",
    n: "03",
    title: "AI Brief & Fact-Check",
    th: "AI ที่เสนอแนะอย่างมีที่มา ไม่ใช่แต่งแทน",
    body: "สร้างหัวข้อและโครงบทความจากข้อมูลจริง มีหมายเลขอ้างอิง [1], [2] และคำเตือนสิ่งที่ต้องตรวจสอบก่อนเผยแพร่",
    href: "/content",
    ui: (
      <div className="brief-ui">
        <b>โครงสร้างบทความ</b>
        <p>
          01 — เข้าใจรสชาติกาแฟ <sup>[1]</sup>
        </p>
        <p>
          02 — เลือกให้ตรงวิธีชง <sup>[2]</sup>
        </p>
        <div className="fact-box">
          <Icon name="alert" />
          <small>ควรตรวจสอบข้อมูลราคาอีกครั้ง</small>
        </div>
      </div>
    ),
  },
  {
    icon: "edit",
    n: "04",
    title: "Rich Editor & Library",
    th: "เขียน แก้ไข และจัดการงานต่อได้ทันที",
    body: "ปรับเนื้อหาใน Rich Editor ดูตัวอย่าง เปลี่ยนสถานะงาน และส่งออก Markdown พร้อมเก็บทั้ง Brief และบทความไว้ในคลัง",
    href: "/articles",
    ui: (
      <div className="editor-ui">
        <div>
          <b>B</b>
          <i>I</i>
          <span>H2</span>
          <span>ลิงก์</span>
        </div>
        <h4>เลือกเมล็ดกาแฟให้เหมาะกับคุณ</h4>
        <p>รสชาติที่คุณชอบ คือจุดเริ่มต้นที่ดีที่สุด...</p>
      </div>
    ),
  },
];

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <PageIntro
        eyebrow="Product Features"
        title="เครื่องมือครบ แต่ไม่ซับซ้อน"
        body="ออกแบบมาให้เจ้าของธุรกิจและทีมคอนเทนต์มองเห็นภาพรวม ตัดสินใจจากข้อมูล และควบคุมคุณภาพได้ในทุกขั้นตอน"
      />
      <section className="section">
        <div className="container feature-list">
          {features.map((f, i) => (
            <article className={`feature-row ${i % 2 ? "reverse" : ""}`} key={f.n}>
              <div>
                <span className="feature-num">{f.n}</span>
                <span className="card-icon">
                  <Icon name={f.icon} />
                </span>
                <p className="overline">{f.title}</p>
                <h2>{f.th}</h2>
                <p>{f.body}</p>
                <Link href={f.href} className="btn btn-ghost">
                  ลองดูในพื้นที่ทำงาน <Icon name="arrow" />
                </Link>
              </div>
              <div className="feature-visual">{f.ui}</div>
            </article>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
