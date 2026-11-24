"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import ArticleDraftPanel from "@/components/article-draft-panel";
import { getStoredArticle } from "@/lib/article-library";
import type { ContentBrief, SavedArticle } from "@/lib/content-types";
import styles from "../library.module.css";
import { ContentAccountBoundary, useContentStore } from "@/components/content-account";
import LegacyContentImport from "@/components/legacy-content-import";
import WorkspaceShell from "@/components/workspace-shell";

function ArticleDetail() {
  const store = useContentStore();
  const { id: routeId } = useParams<{ id: string }>();

  const id = (() => {
    if (routeId.startsWith("article:")) return routeId;
    try {
      return decodeURIComponent(routeId);
    } catch {
      return routeId;
    }
  })();

  const search = useSearchParams();
  const view = search.get("view") === "preview" ? "preview" : "edit";
  const [stored, setStored] = useState<SavedArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setStored(null);
    setMessage("");
    void getStoredArticle(store, id)
      .then((value) => {
        if (!active) return;
        if (value) setStored(value.job);
        else
          setMessage(
            "ไม่พบบทความนี้ในบัญชี หากเป็นงานเก่า ให้เปิดคลังบทความในเบราว์เซอร์ที่เคยสร้างแล้วเลือกนำเข้า"
          );
      })
      .catch((cause) => {
        if (active)
          setMessage(cause instanceof Error ? cause.message : "เปิดบทความไม่ได้");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, retry, store]);

  const brief: ContentBrief | null = stored
    ? {
        brief: stored.input.brief,
        topic: stored.input.context.topic,
        context: stored.input.context,
        model: stored.article.model,
        createdAt: stored.article.createdAt,
        sources: stored.input.context.sources.map(({ url, title }) => ({ url, title })),
      }
    : null;

  return (
    <WorkspaceShell
      activeRoute="/articles"
      breadcrumb={`คลังบทความ / ${view === "preview" ? "ดูตัวอย่าง" : "แก้ไขบทความ"}`}
    >
      <div style={{ marginBottom: 16 }}>
        <Link href="/articles" className="btn btn-secondary">
          ← กลับคลังบทความ
        </Link>
      </div>

      {loading ? (
        <div className="studio-card" role="status">
          กำลังเปิดบทความ…
        </div>
      ) : stored && brief ? (
        <section className="studio-card">
          <ArticleDraftPanel
            key={`${id}:${view}`}
            recordKey={id}
            initialView={view}
            brief={brief}
            context={stored.input.context}
            storageId="library"
            usingLegacyContext={false}
            disabled={false}
          />
        </section>
      ) : (
        <section className="studio-card">
          <p className={styles.notice} role="alert">
            {message}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              ลองโหลดอีกครั้ง
            </button>
            <Link href="/articles" className="btn btn-primary">
              กลับคลังบทความ
            </Link>
          </div>
          <LegacyContentImport onlyKey={id} onImported={() => setRetry((value) => value + 1)} />
        </section>
      )}
    </WorkspaceShell>
  );
}

export default function ArticleDetailPage() {
  return (
    <Suspense
      fallback={
        <WorkspaceShell activeRoute="/articles">
          <div className="studio-card">กำลังเปิดบทความ…</div>
        </WorkspaceShell>
      }
    >
      <ContentAccountBoundary>
        <ArticleDetail />
      </ContentAccountBoundary>
    </Suspense>
  );
}
