import type { KeywordSelection } from "@/lib/keyword-data";

export type ContentSource = {
  url: string;
  title: string;
  text: string;
};

export type ContentContext = {
  keywordResearch?: KeywordSelection;
  brand: string;
  businessDetails: string;
  topic: string;
  audience: string;
  sources: ContentSource[];
};

export type ContentBrief = {
  brief: string;
  topic?: string;
  model: string;
  createdAt: string;
  warnings?: string[];
  sources: { url: string; title: string }[];
  context?: ContentContext;
};

export type ArticleStatus = "draft" | "ready_for_review";

export type ArticleDraft = {
  keywordResearch?: KeywordSelection;
  status?: ArticleStatus;
  title: string;
  markdown: string;
  seoTitle: string;
  metaDescription: string;
  slug: string;
  reviewNotes: string[];
  model: string;
  createdAt: string;
  sources: { url: string; title: string }[];
};

export type SavedArticle = {
  article: ArticleDraft;
  input: { brief: string; context: ContentContext };
};
