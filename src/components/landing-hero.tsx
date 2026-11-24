"use client";

import Link from "next/link";
import MarketingShell from "@/components/marketing-shell";
import { Badge, Icon } from "@/components/ui-icons";

function ProductMockup() {
  return (
    <div className="product-mock" aria-label="ตัวอย่างหน้าจอ Content Studio">
      <div className="browser-bar">
        <i />
        <i />
        <i />
        <span>app.seoplatform.co.th</span>
      </div>
      <div className="mock-body">
        <aside>
          <div className="mock-logo" />
          <i className="on" />
          <i />
          <i />
          <i />
        </aside>
        <div className="mock-main">
          <div className="mock-heading">
            <div>
              <small>CONTENT STUDIO</small>
              <b>วางแผนบทความใหม่</b>
            </div>
            <Badge tone="blue">ขั้นตอน 2 จาก 4</Badge>
          </div>
          <div className="mock-step">
            <i className="done" />
            <i className="active" />
            <i />
            <i />
          </div>
          <p className="tiny-label">หัวข้อที่แนะนำจากข้อมูลของคุณ</p>
          <div className="topic-card selected">
            <span>แนะนำ</span>
            <b>คู่มือเลือกเมล็ดกาแฟไทยให้เหมาะกับวิธีชง</b>
            <p>เหมาะกับกลุ่มคนเริ่มดื่มกาแฟ Specialty</p>
            <button type="button">เลือกเรื่องนี้</button>
          </div>
          <div className="topic-card">
            <b>กาแฟคั่วอ่อน ต่างจากคั่วกลางอย่างไร?</b>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingHero() {
  return (
    <MarketingShell>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <Badge tone="blue">
              <span className="pulse-dot" /> SEO + AEO + GEO ในพื้นที่เดียว
            </Badge>
            <h1>
              วางแผนคอนเทนต์ให้คนค้นเจอ
              <br />
              <em>และ AI เลือกไปตอบ</em>
            </h1>
            <p className="lead">
              แพลตฟอร์มวางแผนเนื้อหาที่เปลี่ยนข้อมูลเว็บไซต์ คีย์เวิร์ด และความเชี่ยวชาญของธุรกิจ
              ให้เป็นบทความที่มีโครงสร้างและตรวจสอบที่มาได้
            </p>
            <div className="hero-actions">
              <Link href="/content" className="btn btn-primary">
                ทดลองวางแผนบทความ <Icon name="arrow" />
              </Link>
              <Link href="/contact" className="btn btn-secondary">
                นัดหมายรับ Demo
              </Link>
            </div>
            <div className="trust-row">
              <span>
                <Icon name="check" size={16} /> ทดลองใช้ฟรี
              </span>
              <span>
                <Icon name="check" size={16} /> ไม่ต้องใช้บัตรเครดิต
              </span>
              <span>
                <Icon name="check" size={16} /> เหมาะกับธุรกิจไทย
              </span>
            </div>
          </div>
          <ProductMockup />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head center">
            <span className="eyebrow">จากความสับสน สู่แผนที่ลงมือทำได้</span>
            <h2>ทำคอนเทนต์อย่างมีเหตุผล ไม่ใช่แค่เดา</h2>
          </div>
          <div className="compare-grid">
            <article className="compare-card problem">
              <span className="card-icon">
                <Icon name="alert" />
              </span>
              <p className="overline">ปัญหาที่ธุรกิจเจอ</p>
              <h3>มีข้อมูล แต่ไม่รู้จะเริ่มตรงไหน</h3>
              <ul>
                <li>คีย์เวิร์ดเยอะจนเลือกไม่ถูก</li>
                <li>เขียนแล้วไม่เชื่อมกับหน้าเว็บ</li>
                <li>AI เขียนข้อมูลเกินจริง</li>
              </ul>
            </article>
            <article className="compare-card solution">
              <span className="card-icon">
                <Icon name="spark" />
              </span>
              <p className="overline">สิ่งที่เราช่วย</p>
              <h3>เปลี่ยนข้อมูลให้เป็นแผนชัดเจน</h3>
              <ul>
                <li>รวมข้อมูลจริงไว้ก่อนเริ่มเขียน</li>
                <li>แนะนำหัวข้อพร้อมเหตุผล</li>
                <li>แจ้งจุดที่ต้อง Fact-check</li>
              </ul>
            </article>
            <article className="compare-card why">
              <span className="card-icon">
                <Icon name="check" />
              </span>
              <p className="overline">ทำไมต้องเรา</p>
              <h3>โปร่งใสและควบคุมได้</h3>
              <ul>
                <li>อ้างอิงแหล่งข้อมูลเป็นหมายเลข</li>
                <li>คนเป็นผู้ตัดสินใจทุกขั้นตอน</li>
                <li>รองรับทั้ง Search และ AI</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="section showcase">
        <div className="container two-col">
          <div>
            <span className="eyebrow">พื้นที่ทำงานเดียว ครบทุกขั้นตอน</span>
            <h2>
              เห็นที่มาของทุกคำแนะนำ
              <br />
              ก่อนกดสร้างบทความ
            </h2>
            <p>
              เลือกข้อมูลจากหน้าเว็บไซต์และคีย์เวิร์ดของคุณ สร้าง Brief ที่มีหมายเลขอ้างอิง
              พร้อมตรวจประเด็นที่ AI ไม่ควรเดาแทน
            </p>
            <Link href="/features" className="btn btn-secondary">
              ดูฟีเจอร์ทั้งหมด <Icon name="arrow" />
            </Link>
          </div>
          <div className="mini-brief">
            <div className="mock-top">
              <b>Content Brief</b>
              <Badge>พร้อมใช้งาน</Badge>
            </div>
            <h3>วิธีเลือกเมล็ดกาแฟสำหรับมือใหม่</h3>
            <div className="outline-row">
              <span>H2</span>
              <p>
                รู้จักระดับการคั่วและรสชาติ <sup>[1]</sup>
              </p>
            </div>
            <div className="outline-row">
              <span>H2</span>
              <p>
                เลือกให้เหมาะกับวิธีชง <sup>[2]</sup>
              </p>
            </div>
            <div className="fact-box">
              <Icon name="alert" />
              <div>
                <b>ตรวจสอบก่อนเขียน</b>
                <p>ราคาและแหล่งที่มาของเมล็ดกาแฟอาจเปลี่ยนแปลง</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
