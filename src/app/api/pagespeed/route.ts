import { NextResponse } from "next/server";
import { ApiError, requireUser } from "@/lib/supabase/server";

export type PageSpeedMetric = {
  id: "LCP" | "INP" | "CLS";
  label: string;
  value: string;
  tone: "green" | "amber" | "red" | "gray";
  statusLabel: string;
};

export type PageSpeedOpportunity = {
  id: string;
  title: string;
  detail: string;
  severity: "red" | "amber" | "gray";
  severityLabel: string;
};

export type PageSpeedReport = {
  url: string;
  strategy: "mobile" | "desktop";
  checkedAt: string;
  source: string;
  scores: {
    performance: number | null;
    seo: number | null;
    accessibility: number | null;
    bestPractices: number | null;
  };
  vitals: PageSpeedMetric[];
  opportunities: PageSpeedOpportunity[];
  indexFiles: {
    robots: { ok: boolean; status: number | null };
    sitemap: { ok: boolean; status: number | null };
  };
};

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const requestUrl = new URL(request.url);
  if (origin === requestUrl.origin) return true;

  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    requestUrl.protocol.replace(/:$/, "");

  return Boolean(host && origin === `${proto}://${host}`);
}

function scoreToPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function toneFromScore(score: unknown): { tone: "green" | "amber" | "red" | "gray"; label: string } {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return { tone: "gray", label: "ไม่มีข้อมูล" };
  }
  if (score >= 0.9) return { tone: "green", label: "ดี" };
  if (score >= 0.5) return { tone: "amber", label: "ควรปรับ" };
  return { tone: "red", label: "ควรแก้" };
}

async function probeUrl(target: string): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "SEOPlatformAudit/1.0" },
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "ไม่อนุญาตคำขอจากเว็บไซต์อื่น" }, { status: 403 });
  }

  try {
    await requireUser();

    let body: Record<string, unknown>;
    try {
      body = asRecord(await request.json());
    } catch {
      throw new ApiError("รูปแบบคำขอไม่ถูกต้อง", 400);
    }

    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const strategy: "mobile" | "desktop" = body.strategy === "desktop" ? "desktop" : "mobile";

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
        throw new Error();
      }
      if (
        ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(parsedUrl.hostname) ||
        /^192\.168\./.test(parsedUrl.hostname) ||
        /^10\./.test(parsedUrl.hostname)
      ) {
        throw new ApiError("Google PageSpeed Insights ตรวจได้เฉพาะเว็บไซต์สาธารณะบนอินเทอร์เน็ต", 400);
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError("URL ไม่ถูกต้อง กรุณาระบุขึ้นต้นด้วย https://", 400);
    }

    const psiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    psiUrl.searchParams.set("url", parsedUrl.href);
    psiUrl.searchParams.set("strategy", strategy);
    psiUrl.searchParams.set("locale", "th");
    for (const category of ["performance", "seo", "accessibility", "best-practices"]) {
      psiUrl.searchParams.append("category", category);
    }
    const apiKey = process.env.PAGESPEED_API_KEY?.trim();
    if (apiKey) {
      psiUrl.searchParams.set("key", apiKey);
    }

    const [psiResponse, robotsProbe, sitemapProbe] = await Promise.all([
      fetch(psiUrl.toString(), {
        cache: "no-store",
        signal: AbortSignal.timeout(55_000),
      }),
      probeUrl(`${parsedUrl.origin}/robots.txt`),
      probeUrl(`${parsedUrl.origin}/sitemap.xml`),
    ]);

    const raw = await psiResponse.text();
    let payload: Record<string, unknown>;
    try {
      payload = asRecord(JSON.parse(raw));
    } catch {
      throw new ApiError(`Google PageSpeed ส่งคำตอบไม่สมบูรณ์ (HTTP ${psiResponse.status})`, 502);
    }

    if (!psiResponse.ok) {
      const errObj = asRecord(payload.error);
      const errMsg = typeof errObj.message === "string" ? errObj.message : "";
      if (psiResponse.status === 429) {
        throw new ApiError(
          "Google PageSpeed Insights จำกัดโควตาชั่วคราว (สามารถเพิ่ม PAGESPEED_API_KEY ฟรีใน .env.local / Vercel เพื่อขยายโควตาเป็น 25,000 ครั้ง/วัน)",
          429
        );
      }
      throw new ApiError(
        errMsg ? `Google PageSpeed ตรวจไม่สำเร็จ: ${errMsg.slice(0, 180)}` : "ตรวจ PageSpeed ไม่สำเร็จ",
        502
      );
    }

    const lighthouse = asRecord(payload.lighthouseResult);
    const categories = asRecord(lighthouse.categories);
    const audits = asRecord(lighthouse.audits);

    const lcpAudit = asRecord(audits["largest-contentful-paint"]);
    const inpAudit =
      Object.keys(asRecord(audits["interaction-to-next-paint"])).length > 0
        ? asRecord(audits["interaction-to-next-paint"])
        : asRecord(audits["total-blocking-time"]);
    const clsAudit = asRecord(audits["cumulative-layout-shift"]);

    const lcpStatus = toneFromScore(lcpAudit.score);
    const inpStatus = toneFromScore(inpAudit.score);
    const clsStatus = toneFromScore(clsAudit.score);

    const vitals: PageSpeedMetric[] = [
      {
        id: "LCP",
        label: "เวลาแสดงเนื้อหาหลัก",
        value: typeof lcpAudit.displayValue === "string" ? lcpAudit.displayValue : "—",
        tone: lcpStatus.tone,
        statusLabel: lcpStatus.label,
      },
      {
        id: "INP",
        label:
          Object.keys(asRecord(audits["interaction-to-next-paint"])).length > 0
            ? "ความไวในการตอบสนอง"
            : "ความหน่วงการตอบสนอง (TBT)",
        value: typeof inpAudit.displayValue === "string" ? inpAudit.displayValue : "—",
        tone: inpStatus.tone,
        statusLabel: inpStatus.label,
      },
      {
        id: "CLS",
        label: "ความนิ่งของหน้าเว็บ",
        value: typeof clsAudit.displayValue === "string" ? clsAudit.displayValue : "—",
        tone: clsStatus.tone,
        statusLabel: clsStatus.label,
      },
    ];

    const candidateAuditIds = [
      "render-blocking-resources",
      "unused-javascript",
      "unused-css-rules",
      "modern-image-formats",
      "uses-optimized-images",
      "uses-responsive-images",
      "unsized-images",
      "meta-description",
      "document-title",
      "image-alt",
      "link-text",
      "largest-contentful-paint-element",
      "server-response-time",
    ];

    const opportunities: PageSpeedOpportunity[] = candidateAuditIds
      .map((auditId) => {
        const item = asRecord(audits[auditId]);
        const score = typeof item.score === "number" ? item.score : null;
        const title = typeof item.title === "string" ? item.title : "";
        const displayValue = typeof item.displayValue === "string" ? item.displayValue : "";
        if (!title || score === null || score >= 0.9) return null;
        const severity: "red" | "amber" | "gray" =
          score < 0.5 ? "red" : score < 0.75 ? "amber" : "gray";
        return {
          id: auditId,
          title,
          detail: displayValue || "ตรวจและปรับปรุงรายการนี้เพื่อช่วยให้หน้าเว็บโหลดเร็วขึ้นและอ่านง่ายขึ้น",
          severity,
          severityLabel: severity === "red" ? "สำคัญ" : severity === "amber" ? "ควรทำ" : "แนะนำ",
          _score: score,
        };
      })
      .filter((item): item is PageSpeedOpportunity & { _score: number } => item !== null)
      .sort((a, b) => a._score - b._score)
      .slice(0, 3)
      .map(({ _score: _, ...rest }) => rest);

    const report: PageSpeedReport = {
      url: parsedUrl.href,
      strategy,
      checkedAt: new Date().toISOString(),
      source: "Google PageSpeed Insights API v5",
      scores: {
        performance: scoreToPercent(asRecord(categories.performance).score),
        seo: scoreToPercent(asRecord(categories.seo).score),
        accessibility: scoreToPercent(asRecord(categories.accessibility).score),
        bestPractices: scoreToPercent(asRecord(categories["best-practices"]).score),
      },
      vitals,
      opportunities,
      indexFiles: {
        robots: robotsProbe,
        sitemap: sitemapProbe,
      },
    };

    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const isTimeout = error instanceof Error && /TimeoutError|AbortError/i.test(error.name);
    return NextResponse.json(
      {
        error: isTimeout
          ? "Google PageSpeed ใช้เวลานานเกินกำหนด กรุณาลองกดตรวจอีกครั้ง"
          : "ไม่สามารถเชื่อมต่อ Google PageSpeed Insights ได้ในขณะนี้",
      },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
