"use client";

import { createClient } from "@/lib/supabase/client";

export type CloudRecord<T> = { job: T; savedAt: string };
export type CloudListRow = { key: string; value: CloudRecord<unknown> };

export type ContentStore = {
  ownerId: string;
  load<T>(key: string): Promise<CloudRecord<T> | null>;
  save<T>(key: string, payload: T): Promise<string>;
  list(prefix: "article:" | "brief:" | "keyword-set:"): Promise<CloudListRow[]>;
  importRecord(key: string, payload: unknown): Promise<void>;
};

type Row = { storage_key: string; payload: unknown; version: number; updated_at: string };
type Revision = { version: number; json: string; savedAt: string } | null;

function tableFor(key: string) {
  if (key.length > 2048) throw new Error("รหัสงานยาวเกินกำหนด");
  if (key.startsWith("article:")) return "articles";
  if (key.startsWith("brief:")) return "content_briefs";
  // The existing owner-protected JSON document store also holds immutable CSV
  // imports under an isolated prefix. Brief lists query only `brief:` records.
  if (key.startsWith("keyword-set:")) return "content_briefs";
  throw new Error("รหัสงานไม่ถูกต้อง");
}

function databaseError(error: { code?: string }): Error {
  if (error.code === "23505") return conflict();
  if (error.code === "42501") return new Error("ไม่มีสิทธิ์บันทึกงานนี้ กรุณาตรวจบัญชีและสิทธิ์ Supabase");
  if (["42P01", "PGRST205", "PGRST204"].includes(error.code ?? "")) {
    return new Error("ตารางบันทึกเนื้อหายังตั้งค่าไม่ครบ กรุณาตรวจโครงสร้าง Supabase");
  }
  return new Error("ติดต่อพื้นที่บันทึก Supabase ไม่สำเร็จ กรุณาลองใหม่ ข้อมูลบนหน้าจอยังไม่ได้ซิงก์");
}

function conflict() {
  return new Error("งานนี้มีฉบับใหม่ในบัญชีแล้ว กรุณาคัดลอกหรือดาวน์โหลดการแก้ไขปัจจุบัน แล้วรีโหลดเพื่อเปิดฉบับล่าสุด ระบบยังไม่เขียนทับงานเดิม");
}

export function createContentStore(ownerId: string): ContentStore {
  const client = createClient();
  const revisions = new Map<string, Revision>();
  const pending = new Map<string, Promise<unknown>>();

  async function checkAccount() {
    const { data, error } = await client.auth.getUser();
    if (error || data.user?.id !== ownerId) {
      throw new Error("บัญชีเปลี่ยนหรือหมดเวลาการเข้าสู่ระบบ กรุณาเข้าสู่ระบบด้วยบัญชีเดิมก่อนบันทึก");
    }
  }

  function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    pending.set(key, next);
    void next.then(() => {
      if (pending.get(key) === next) pending.delete(key);
    }, () => {
      if (pending.get(key) === next) pending.delete(key);
    });
    return next;
  }

  function remember(key: string, row: Row | null) {
    revisions.set(key, row ? {
      version: row.version,
      json: JSON.stringify(row.payload),
      savedAt: row.updated_at,
    } : null);
  }

  async function read<T>(key: string): Promise<CloudRecord<T> | null> {
    const { data, error } = await client.from(tableFor(key))
      .select("storage_key,payload,version,updated_at")
      .eq("user_id", ownerId).eq("storage_key", key).maybeSingle();
    if (error) throw databaseError(error);
    const row = data as Row | null;
    remember(key, row);
    return row ? { job: row.payload as T, savedAt: row.updated_at } : null;
  }

  return {
    ownerId,
    load<T>(key: string) {
      return serial(key, async () => { await checkAccount(); return read<T>(key); });
    },
    save<T>(key: string, payload: T) {
      // Capture the exact edit before queuing another request for this record.
      const snapshot = JSON.parse(JSON.stringify(payload)) as unknown;
      return serial(key, async () => {
        await checkAccount();
        const table = tableFor(key);
        if (!revisions.has(key)) await read(key);
        const revision = revisions.get(key);
        if (revision && revision.json === JSON.stringify(snapshot)) return revision.savedAt;

        // A failed optimistic update never becomes an upsert: another tab's work wins.
        const query = revision
          ? client.from(table).update({ payload: snapshot, version: revision.version + 1, updated_at: new Date().toISOString() })
              .eq("user_id", ownerId).eq("storage_key", key).eq("version", revision.version)
          : client.from(table).insert({ user_id: ownerId, storage_key: key, payload: snapshot });
        const { data, error } = await query.select("storage_key,payload,version,updated_at").maybeSingle();
        if (error) throw databaseError(error);
        if (!data) throw conflict();
        const row = data as Row;
        remember(key, row);
        return row.updated_at;
      });
    },
    async list(prefix) {
      await checkAccount();
      const rows: CloudListRow[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await client.from(tableFor(prefix))
          .select("storage_key,payload,updated_at")
          .eq("user_id", ownerId).like("storage_key", `${prefix}%`)
          .order("id").range(offset, offset + pageSize - 1);
        if (error) throw databaseError(error);
        for (const row of data ?? []) {
          rows.push({ key: row.storage_key, value: { job: row.payload, savedAt: row.updated_at } });
        }
        if ((data?.length ?? 0) < pageSize) return rows;
      }
    },
    importRecord(key, payload) {
      return serial(key, async () => {
        await checkAccount();
        // Explicit import inserts only; local records can never overwrite a cloud record.
        const { data, error } = await client.from(tableFor(key))
          .insert({ user_id: ownerId, storage_key: key, payload })
          .select("storage_key,payload,version,updated_at").single();
        if (error) throw databaseError(error);
        remember(key, data as Row);
      });
    },
  };
}
