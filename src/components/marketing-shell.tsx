"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon, Logo } from "@/components/ui-icons";

const navItems = [
  { href: "/features", label: "ฟีเจอร์" },
  { href: "/how-it-works", label: "วิธีใช้งาน" },
  { href: "/pricing", label: "แพ็กเกจ" },
  { href: "/case-studies", label: "ผลลัพธ์ลูกค้า" },
  { href: "/faq", label: "คำถามพบบ่อย" },
];

export default function MarketingShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <div className="min-h-screen" lang="th">
      <header className="marketing-header">
        <div className="container nav-inner">
          <Link href="/" onClick={() => setMobileNav(false)} aria-label="SEO Platform หน้าหลัก">
            <Logo />
          </Link>
          <nav className={mobileNav ? "nav-links nav-open" : "nav-links"} aria-label="เมนูหลัก">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={pathname === item.href ? "active" : ""}
                onClick={() => setMobileNav(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/contact"
              className={`mobile-only ${pathname === "/contact" ? "active" : ""}`}
              onClick={() => setMobileNav(false)}
            >
              ติดต่อเรา
            </Link>
            <Link
              href="/login"
              className="mobile-only"
              onClick={() => setMobileNav(false)}
            >
              เข้าสู่ระบบ
            </Link>
            <Link
              href="/content"
              className="mobile-only"
              onClick={() => setMobileNav(false)}
            >
              เริ่มใช้งาน
            </Link>
          </nav>
          <div className="nav-actions">
            <Link href="/login" className="btn btn-ghost">
              เข้าสู่ระบบ
            </Link>
            <Link href="/content" className="btn btn-primary">
              เริ่มใช้งาน <Icon name="arrow" size={17} />
            </Link>
          </div>
          <button
            type="button"
            className="menu-btn"
            aria-label={mobileNav ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={mobileNav}
            onClick={() => setMobileNav((v) => !v)}
          >
            <Icon name={mobileNav ? "close" : "menu"} />
          </button>
        </div>
      </header>

      <main>{children}</main>

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <Logo inverse />
            <p>
              เปลี่ยนข้อมูลธุรกิจให้เป็นแผนเนื้อหาที่ชัดเจน
              <br />
              สำหรับ Search และ AI Answer Engines
            </p>
          </div>
          <div>
            <b>ผลิตภัณฑ์</b>
            <Link href="/features">ฟีเจอร์ทั้งหมด</Link>
            <Link href="/pricing">แพ็กเกจ</Link>
            <Link href="/how-it-works">วิธีใช้งาน</Link>
          </div>
          <div>
            <b>แหล่งข้อมูล</b>
            <Link href="/case-studies">ผลลัพธ์ลูกค้า</Link>
            <Link href="/faq">คำถามพบบ่อย</Link>
            <Link href="/contact">ติดต่อฝ่ายขาย</Link>
          </div>
          <div>
            <b>ข้อกำหนด</b>
            <Link href="/legal">นโยบายและข้อกำหนด</Link>
            <span>support@seoplatform.co.th</span>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© 2025 SEO Platform. สงวนลิขสิทธิ์</span>
          <span>สร้างเพื่อธุรกิจไทย</span>
        </div>
      </footer>
    </div>
  );
}

export function PageIntro({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <section className="page-intro">
      <div className="container narrow">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </section>
  );
}

export function MarketingCta() {
  return (
    <section className="cta">
      <div className="container">
        <span className="eyebrow">พร้อมเริ่มหรือยัง?</span>
        <h2>สร้างแผนบทความแรกของคุณวันนี้</h2>
        <p>ใช้ฟรี ไม่ต้องใช้บัตรเครดิต และมีข้อมูลตัวอย่างให้ลองทันที</p>
        <Link href="/content" className="btn btn-primary">
          ทดลองวางแผนบทความ <Icon name="arrow" />
        </Link>
      </div>
    </section>
  );
}
