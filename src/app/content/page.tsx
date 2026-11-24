"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ContentBriefPanel from "@/components/content-brief-panel";
import WorkspaceShell from "@/components/workspace-shell";
import { Icon, WsTitle } from "@/components/ui-icons";
import { createUuid } from "@/lib/uuid";

function ContentWorkspace() {
  const query = useSearchParams();
  const router = useRouter();
  const workspace = query.get("workspace");
  const briefKey = query.get("brief");
  const storageId =
    briefKey?.startsWith("brief:") && briefKey.length <= 2048
      ? briefKey.slice("brief:".length)
      : workspace && /^[a-f0-9-]{36}$/i.test(workspace)
        ? `business-workspace:${workspace}`
        : "business-only-v1";

  const stepNames = [
    "ข้อมูล & อ้างอิง",
    "เลือกหัวข้อ",
    "วางแผนบทความ",
    "แก้ไข & ส่งออก",
  ];

  return (
    <WorkspaceShell activeRoute="/content">
      <WsTitle
        eyebrow="Content Studio"
        title="วางแผนบทความใหม่"
        body="ข้อมูลจริงก่อน AI — เริ่มจากรายละเอียดธุรกิจ เลือกหัวข้อ แล้วพัฒนาเป็นบทความที่คุณปรับแก้ได้"
        action={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => router.push(`/content?workspace=${createUuid()}`)}
          >
            <Icon name="plus" size={17} /> เริ่มงานใหม่
          </button>
        }
      />

      <div className="studio-stepper" aria-label="ขั้นตอนการสร้างบทความ">
        {stepNames.map((name, i) => (
          <div key={name} className={i === 0 ? "active" : ""}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <small>ขั้นตอนที่ {i + 1}</small>
            <b>{name}</b>
          </div>
        ))}
      </div>

      <section className="studio-card">
        <ContentBriefPanel pages={[]} storageId={storageId} />
      </section>
    </WorkspaceShell>
  );
}

export default function ContentPage() {
  return (
    <Suspense
      fallback={
        <WorkspaceShell activeRoute="/content">
          <div className="studio-card">
            <p style={{ margin: 0 }}>กำลังเตรียมพื้นที่ทำงาน…</p>
          </div>
        </WorkspaceShell>
      }
    >
      <ContentWorkspace />
    </Suspense>
  );
}
