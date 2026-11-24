import { isKeywordSelection } from "@/lib/keyword-data";
import type { SavedArticle } from "@/lib/content-types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function source(value: unknown, includeText: boolean): boolean {
  if (!isRecord(value) || typeof value.url !== "string" || typeof value.title !== "string") return false;
  if (includeText && typeof value.text !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(value.url).protocol); } catch { return false; }
}

function context(value: unknown): boolean {
  return isRecord(value) && ["brand", "businessDetails", "topic", "audience"].every((key) => typeof value[key] === "string") &&
    Array.isArray(value.sources) && value.sources.every((item) => source(item, true)) &&
    (value.keywordResearch === undefined || isKeywordSelection(value.keywordResearch));
}

export function isSavedArticle(value: unknown): value is SavedArticle {
  if (!isRecord(value) || !isRecord(value.article) || !isRecord(value.input)) return false;
  const article = value.article;
  return ["title", "markdown", "seoTitle", "metaDescription", "slug", "model", "createdAt"].every((key) => typeof article[key] === "string") &&
    typeof article.createdAt === "string" && Number.isFinite(Date.parse(article.createdAt)) &&
    (article.status === undefined || article.status === "draft" || article.status === "ready_for_review") &&
    Array.isArray(article.reviewNotes) && article.reviewNotes.every((note) => typeof note === "string") &&
    Array.isArray(article.sources) && article.sources.every((item) => source(item, false)) &&
    typeof value.input.brief === "string" && context(value.input.context) &&
    (article.keywordResearch === undefined || isKeywordSelection(article.keywordResearch));
}

export function isSavedBrief(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || !["brand", "businessDetails", "topic", "audience"].every((key) => typeof value[key] === "string") ||
      !Array.isArray(value.selectedUrls) || !value.selectedUrls.every((url) => typeof url === "string")) return false;
  if (value.keywordResearch !== undefined && !isKeywordSelection(value.keywordResearch)) return false;
  if (value.result != null) {
    const brief = value.result;
    if (!isRecord(brief) || typeof brief.brief !== "string" || typeof brief.model !== "string" ||
        typeof brief.createdAt !== "string" || !Array.isArray(brief.sources) || !brief.sources.every((item) => source(item, false)) ||
        (brief.context != null && !context(brief.context)) ||
        (brief.warnings != null && (!Array.isArray(brief.warnings) || !brief.warnings.every((note) => typeof note === "string")))) return false;
  }
  if (value.recommendations != null) {
    const recommendations = value.recommendations;
    if (!isRecord(recommendations) || typeof recommendations.summary !== "string" || !Array.isArray(recommendations.topics) ||
        !recommendations.topics.every((topic) => isRecord(topic) &&
          ["id", "title", "reason", "audience"].every((key) => typeof topic[key] === "string") &&
          Array.isArray(topic.sourceUrls) && topic.sourceUrls.every((url) => typeof url === "string"))) return false;
  }
  return true;
}
