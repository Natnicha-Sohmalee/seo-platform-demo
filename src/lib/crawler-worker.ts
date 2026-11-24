export class CrawlerWorkerError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

export async function callCrawlerWorker(
  path: string,
  method: "GET" | "POST",
  body?: unknown
) {
  const baseUrl = process.env.CRAWLER_API_URL;
  const apiKey = process.env.CRAWLER_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new CrawlerWorkerError("ยังไม่ได้ตั้งค่าการเชื่อม Python worker");
  }

  let response: Response;

  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new CrawlerWorkerError(
      "ยังยืนยันการเริ่มงานไม่ได้ กรุณาตรวจ Python worker ที่พอร์ต 8787"
    );
  }

  const raw = await response.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new CrawlerWorkerError(
      `Python worker ส่งคำตอบที่อ่านไม่ได้ (HTTP ${response.status})`
    );
  }

  if (!response.ok) {
    throw new CrawlerWorkerError(
      typeof data.detail === "string"
        ? data.detail
        : "Python worker ปฏิเสธคำขอ",
      response.status
    );
  }

  return data;
}