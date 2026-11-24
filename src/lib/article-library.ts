import type { ContentStore } from "@/lib/content-storage";
import { isRecord as record, isSavedArticle as savedArticle } from "@/lib/content-validation";
import type { ArticleStatus } from "@/lib/content-types";

export type ArticleListEntry = {
  key: string;
  title: string;
  business: string;
  businessDetails: string;
  topic: string;
  status: ArticleStatus;
  createdAt: string;
  updatedAt: string;
  excerpt: string;
  keywords: string[];
};

export async function getStoredArticle(store: ContentStore, key: string) {
  if (!key.startsWith("article:")) throw new Error("ลิงก์บทความไม่ถูกต้อง");
  const stored = await store.load<unknown>(key);
  if (!stored) return null;
  if (!savedArticle(stored.job)) throw new Error("ข้อมูลบทความนี้อ่านไม่ได้ ข้อมูลเดิมยังไม่ได้ถูกแก้ไข");
  return { job: stored.job, savedAt: stored.savedAt };
}

export async function listArticles(store: ContentStore): Promise<{ entries: ArticleListEntry[]; skipped: number }> {
  const rows = await store.list("article:");
  const entries: ArticleListEntry[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (!record(row.value) || !savedArticle(row.value.job)) { skipped++; continue; }
    const { article, input } = row.value.job;
    entries.push({
      key: row.key,
      title: article.title,
      business: input.context.brand.trim(),
      businessDetails: input.context.businessDetails,
      topic: input.context.topic,
      keywords: input.context.keywordResearch?.terms.map((term) => term.keyword) ?? [],
      status: article.status ?? "draft",
      createdAt: article.createdAt,
      updatedAt: typeof row.value.savedAt === "string" && Number.isFinite(Date.parse(row.value.savedAt))
        ? row.value.savedAt : article.createdAt,
      excerpt: article.markdown.replace(/[#*_`>\[\]\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 135),
    });
  }
  return { entries, skipped };
}

export function articleHref(key: string, view: "edit" | "preview" = "edit") {
  return `/articles/${encodeURIComponent(key)}${view === "preview" ? "?view=preview" : ""}`;
}

export function articleDate(value: string) {
  return Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "ไม่ระบุเวลา";
}
