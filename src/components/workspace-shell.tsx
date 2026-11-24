"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon, Logo, type IconName } from "@/components/ui-icons";

export type WorkspaceRoute = "/projects" | "/keywords" | "/content" | "/articles";

const workspaceLinks: { href: WorkspaceRoute; label: string; icon: IconName }[] = [
  { href: "/projects", label: "โปรเจกต์เว็บไซต์", icon: "grid" },
  { href: "/keywords", label: "คีย์เวิร์ด", icon: "search" },
  { href: "/content", label: "Content Studio", icon: "spark" },
  { href: "/articles", label: "คลังบทความ", icon: "library" },
];

const routeTitles: Record<WorkspaceRoute, string> = {
  "/projects": "โปรเจกต์เว็บไซต์",
  "/keywords": "คีย์เวิร์ด",
  "/content": "Content Studio",
  "/articles": "คลังบทความ",
};

export default function WorkspaceShell({
  activeRoute,
  breadcrumb,
  children,
}: {
  activeRoute: WorkspaceRoute;
  breadcrumb?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    try {
      const client = createClient();
      void client.auth.getSession().then(({ data }) => {
        if (active && data.session?.user?.email) {
          setUserEmail(data.session.user.email);
        }
      });
    } catch {
      // Supabase env may not be configured in preview mode
    }
    return () => {
      active = false;
    };
  }, []);

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "บัญชี";
  const displayName = userEmail ?? "บัญชีของคุณ";

  return (
    <div className="workspace" lang="th">
      <aside className={open ? "ws-sidebar open" : "ws-sidebar"}>
        <div className="ws-logo">
          <Link href="/" onClick={() => setOpen(false)}>
            <Logo inverse />
          </Link>
          <button
            type="button"
            className="sidebar-close"
            aria-label="ปิดแถบเมนู"
            onClick={() => setOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>

        <nav aria-label="เมนูพื้นที่ทำงาน">
          {workspaceLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={activeRoute === item.href ? "active" : ""}
              onClick={() => setOpen(false)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {activeRoute === item.href && <i />}
            </Link>
          ))}
        </nav>

        <div className="workspace-usage">
          <div>
            <span>พื้นที่ทำงานของคุณ</span>
            <b>พร้อมใช้งาน</b>
          </div>
          <div className="usage-bar">
            <i />
          </div>
          <small>การเปิดงานเดิมไม่เรียก AI ซ้ำ</small>
        </div>

        <Link href="/login" className="ws-user" onClick={() => setOpen(false)}>
          <span>{initials}</span>
          <div>
            <b>{displayName}</b>
            <small>{userEmail ? "จัดการบัญชี" : "เข้าสู่ระบบ"}</small>
          </div>
        </Link>
      </aside>

      <div className="ws-main">
        <header className="ws-header">
          <button
            type="button"
            className="ws-menu"
            aria-label="เปิดเมนู"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <div>
            <small>พื้นที่ทำงาน /</small>
            <b>{breadcrumb ?? routeTitles[activeRoute]}</b>
          </div>
          <div className="ws-head-actions">
            <Link href="/" className="btn btn-ghost" style={{ minHeight: 34, fontSize: 13 }}>
              หน้าหลัก
            </Link>
            <Link
              href="/login"
              className="avatar-pill"
              title={displayName}
              aria-label="จัดการบัญชี"
            >
              {initials}
            </Link>
          </div>
        </header>
        <main className="ws-content">{children}</main>
      </div>
    </div>
  );
}
