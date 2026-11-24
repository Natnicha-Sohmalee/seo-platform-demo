const DATABASE_NAME = "seo-platform";
const STORE_NAME = "crawl-results";

type StoredResult<T> = {
  job: T;
  savedAt: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);

    request.onerror = () => {
      reject(request.error ?? new Error("เปิดพื้นที่จัดเก็บไม่ได้"));
    };

    request.onblocked = () => {
      reject(new Error("กรุณาปิดแท็บแพลตฟอร์มอื่นแล้วลองใหม่"));
    };
  });
}

export async function saveCrawlResult<T>(
  key: string,
  job: T
): Promise<string> {
  const database = await openDatabase();
  const savedAt = new Date().toISOString();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");

      transaction.objectStore(STORE_NAME).put({ job, savedAt }, key);

      transaction.oncomplete = () => resolve();
      transaction.onabort = () => {
        reject(transaction.error ?? new Error("บันทึกผลไม่สำเร็จ"));
      };
    });

    return savedAt;
  } finally {
    database.close();
  }
}

export async function loadCrawlResult<T>(
  key: string
): Promise<StoredResult<T> | null> {
  const database = await openDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => {
        reject(request.error ?? new Error("อ่านผลที่บันทึกไว้ไม่ได้"));
      };
    });
  } finally {
    database.close();
  }
}
export async function listStoredResults(prefix: string): Promise<{ key: string; value: unknown }[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const rows: { key: string; value: unknown }[] = [];
      const transaction = database.transaction(STORE_NAME, "readonly");
      const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
      const request = transaction.objectStore(STORE_NAME).openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
          rows.push({ key: cursor.key, value: cursor.value });
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error("อ่านรายการงานไม่ได้"));
      transaction.oncomplete = () => resolve(rows);
      transaction.onabort = () => reject(transaction.error ?? new Error("อ่านรายการงานไม่สำเร็จ"));
      transaction.onerror = () => reject(transaction.error ?? new Error("อ่านรายการงานไม่สำเร็จ"));
    });
  } finally {
    database.close();
  }
}
