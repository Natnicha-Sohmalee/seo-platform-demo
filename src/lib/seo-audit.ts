export type SeoPage = {
  url: string;
  final_url?: string;
  status: string;
  http_status?: number | null;
  title?: string | null;
  description?: string | null;
  canonical?: string | null;
  headings?: {
    level: string;
    text: string;
  }[];
};

export type SeoFinding = {
  code: string;
  level: "problem" | "review" | "unavailable";
  title: string;
  detail: string;
  urls: string[];
};

export function analyzeSeo(pages: SeoPage[]) {
  const findings: SeoFinding[] = [];
  const titleGroups = new Map<string, string[]>();

  function add(
    page: SeoPage,
    code: string,
    level: SeoFinding["level"],
    title: string,
    detail: string
  ) {
    findings.push({
      code,
      level,
      title,
      detail,
      urls: [page.url],
    });
  }

  for (const page of pages) {
    if (page.http_status === 404 || page.http_status === 410) {
      add(
        page,
        "page-not-found",
        "problem",
        `ไม่พบหน้าเว็บ HTTP ${page.http_status}`,
        "ตรวจว่า URL ถูกต้องหรือหน้านี้ถูกลบไปแล้ว"
      );
      continue;
    }

    if (
      typeof page.http_status === "number" &&
      page.http_status >= 500
    ) {
      add(
        page,
        "server-error",
        "problem",
        `เซิร์ฟเวอร์ตอบ HTTP ${page.http_status}`,
        "พบข้อผิดพลาดในการอ่านครั้งนี้ ควรตรวจต้นทางก่อนสรุปว่าเป็นปัญหาถาวร"
      );
      continue;
    }

    if (!["ok", "thin_content_or_js"].includes(page.status)) {
      add(
        page,
        "crawl-unavailable",
        "unavailable",
        "ยังประเมินเนื้อหาหน้านี้ไม่ได้",
        `Crawler รายงาน ${page.status} ไม่ได้ยืนยันว่า Google จะเข้าถึงหน้านี้ไม่ได้`
      );
      continue;
    }

    const title = page.title?.trim() ?? "";

    if ("title" in page) {
      if (!title) {
        add(
          page,
          "missing-title",
          "problem",
          "ไม่พบ Title",
          "ตรวจแท็ก title ใน HTML และกำหนดชื่อหน้าที่อธิบายเนื้อหา"
        );
      } else {
        const normalized = title
          .normalize("NFKC")
          .replace(/\s+/g, " ")
          .toLowerCase();

        const urls = titleGroups.get(normalized) ?? [];
        if (!urls.includes(page.url)) urls.push(page.url);
        titleGroups.set(normalized, urls);
      }
    } else {
      add(
        page,
        "title-unavailable",
        "unavailable",
        "ไม่มีข้อมูล Title สำหรับตรวจ",
        "ผล Crawl ชุดนี้ไม่ได้ส่งฟิลด์ title กลับมา"
      );
    }

    if ("description" in page) {
      if (!page.description?.trim()) {
        add(
          page,
          "missing-description",
          "review",
          "ไม่พบ Meta description",
          "พิจารณาเพิ่มคำอธิบายที่ตรงกับเนื้อหาและจุดประสงค์ของหน้า"
        );
      }
    } else {
      add(
        page,
        "description-unavailable",
        "unavailable",
        "ไม่มีข้อมูล Meta description สำหรับตรวจ",
        "ต้องมีฟิลด์ description จึงแยกได้ว่าไม่มีแท็กหรือยังไม่ได้เก็บข้อมูล"
      );
    }

    if (Array.isArray(page.headings)) {
      const h1 = page.headings.filter(
        (heading) =>
          heading.level.toLowerCase() === "h1" &&
          heading.text.trim()
      );

      if (h1.length === 0) {
        add(
          page,
          "h1-not-observed",
          "review",
          "ไม่พบ H1 ในข้อมูลที่เก็บมา",
          "ตรวจ HTML ต้นฉบับก่อนสรุป เพราะตัวกรองอาจไม่ได้เก็บหัวข้อนั้น"
        );
      } else if (h1.length > 1) {
        add(
          page,
          "multiple-h1",
          "review",
          `พบ H1 จำนวน ${h1.length} รายการ`,
          "ตรวจว่าหัวข้อสะท้อนโครงสร้างหน้าอย่างชัดเจน ไม่ถือว่าเป็นข้อผิดพลาดอัตโนมัติ"
        );
      }
    }

    if ("canonical" in page && !page.canonical?.trim()) {
      add(
        page,
        "canonical-not-observed",
        "review",
        "ไม่พบ Canonical",
        "ตรวจว่าหน้ามี URL ซ้ำหรือหลายรูปแบบที่จำเป็นต้องระบุหน้าหลักหรือไม่"
      );
    }

    if (page.status === "thin_content_or_js") {
      add(
        page,
        "limited-extraction",
        "review",
        "Crawler เก็บข้อความได้น้อย",
        "อาจเป็นหน้าสั้นจริง เนื้อหาอยู่ในรูป หรือยังโหลดไม่ครบ ไม่ใช่ข้อสรุปว่าเนื้อหาคุณภาพต่ำ"
      );
    }
  }

  for (const urls of titleGroups.values()) {
    if (urls.length > 1) {
      findings.push({
        code: "duplicate-title",
        level: "review",
        title: `พบ Title เดียวกันใน ${urls.length} URL`,
        detail:
          "ตรวจว่าหน้าเหล่านี้มีจุดประสงค์ต่างกันหรือเป็น URL หลายรูปแบบของเนื้อหาเดียวกัน",
        urls,
      });
    }
  }

  return {
    totalPages: pages.length,
    problems: findings.filter((item) => item.level === "problem").length,
    reviews: findings.filter((item) => item.level === "review").length,
    unavailable: findings.filter(
      (item) => item.level === "unavailable"
    ).length,
    findings,
  };
}