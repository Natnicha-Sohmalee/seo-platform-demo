"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { Icon, Logo, type IconName } from "@/components/ui-icons";

export type WorkspaceRoute = "/dashboard" | "/projects" | "/keywords" | "/content" | "/articles";

const workspaceLinks: { href: WorkspaceRoute; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "ภาพรวม", icon: "chart" },
  { href: "/projects", label: "โปรเจกต์เว็บไซต์", icon: "grid" },
  { href: "/keywords", label: "คีย์เวิร์ด", icon: "search" },
  { href: "/content", label: "Content Studio", icon: "spark" },
  { href: "/articles", label: "คลังบทความ", icon: "library" },
];

const routeTitles: Record<WorkspaceRoute, string> = {
  "/dashboard": "ภาพรวม",
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

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : "บัญชี";
  const displayName = userEmail ?? "บัญชีของคุณ";

  return (
    <div className="workspace" lang="th">
      <a href="#ws-main-content" className="skip-link">
        ข้ามไปยังเนื้อหาหลัก
      </a>

      {open && (
        <div
          className="ws-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        id="ws-sidebar-nav"
        className={open ? "ws-sidebar open" : "ws-sidebar"}
        aria-label="แถบนำทางหลัก"
      >
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
          {workspaceLinks.map((item) => {
            const isCurrent = activeRoute === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={isCurrent ? "active" : ""}
                aria-current={isCurrent ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {isCurrent && <i aria-hidden="true" />}
              </Link>
            );
          })}
        </nav>

        <div className="workspace-usage">
          <div>
            <span>พื้นที่ทำงานของคุณ</span>
            <b>พร้อมใช้งาน</b>
          </div>
          <div className="usage-bar" aria-hidden="true">
            <i />
          </div>
          <small>การเปิดงานเดิมไม่เรียก AI ซ้ำ</small>
        </div>

        <Link href="/login" className="ws-user" onClick={() => setOpen(false)}>
          <span aria-hidden="true">{initials}</span>
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
            aria-expanded={open}
            aria-controls="ws-sidebar-nav"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="ws-breadcrumb">
            <small>พื้นที่ทำงาน /</small>
            <b>{breadcrumb ?? routeTitles[activeRoute]}</b>
          </div>
          <div className="ws-head-actions">
            <Link href="/" className="btn btn-ghost ws-home-link">
              หน้าหลัก
            </Link>
            <Link
              href="/login"
              className="avatar-pill"
              title={displayName}
              aria-label={`จัดการบัญชี ${displayName}`}
            >
              {initials}
            </Link>
          </div>
        </header>
        <main id="ws-main-content" className="ws-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
