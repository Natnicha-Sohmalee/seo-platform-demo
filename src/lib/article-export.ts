import type { ArticleDraft } from "@/lib/content-types";

export function articleText(article: ArticleDraft) {
  const sources = article.sources.length
    ? "\n\n## แหล่งข้อมูลประกอบ\n" + article.sources.map(
        (source, index) => `${index + 1}. ${source.title} — ${source.url}`
      ).join("\n") : "";
  return `# ${article.title}\n\n${article.markdown}${sources}`;
}

export function downloadArticleMarkdown(article: ArticleDraft) {
  const metadata = `\n\n---\nSEO Title: ${article.seoTitle}\nMeta description: ${article.metaDescription}\nSlug: ${article.slug}\n`;
  const keywordMetadata = article.keywordResearch
    ? `\nPrimary keyword: ${article.keywordResearch.terms[0].keyword}\nSupporting keywords: ${article.keywordResearch.terms.slice(1).map((term) => term.keyword).join(", ")}\n`
    : "";
  const url = URL.createObjectURL(new Blob([articleText(article), metadata, keywordMetadata], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${article.slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 100) || "article-draft"}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
