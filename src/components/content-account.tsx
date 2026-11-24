"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import ActionLink from "@/components/action-link";
import { createContentStore, type ContentStore } from "@/lib/content-storage";
import { useProjectAccount } from "@/lib/use-project-account";

const StoreContext = createContext<ContentStore | null>(null);

export function useContentStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("ยังไม่ได้เปิดพื้นที่เนื้อหาของบัญชีนี้");
  return store;
}

export function ContentAccountBoundary({ children }: { children: ReactNode }) {
  const inherited = useContext(StoreContext);
  return inherited ? children : <AccountRoot>{children}</AccountRoot>;
}

function AccountRoot({ children }: { children: ReactNode }) {
  const { userId, checking, error } = useProjectAccount();
  const store = useMemo(() => userId ? createContentStore(userId) : null, [userId]);
  if (checking) return <p role="status" style={{ padding: 24 }}>กำลังเปิดพื้นที่เนื้อหาของคุณ…</p>;
  if (!store || error) return <div role="alert" style={{ padding: 24 }}>
    <p>{error || "กรุณาเข้าสู่ระบบเพื่อเปิดงานที่บันทึกไว้"}</p>
    <ActionLink variant="primary" href="/login">เข้าสู่ระบบ</ActionLink>
  </div>;
  // A different account remounts all editors; no preserved draft crosses the boundary.
  return <StoreContext.Provider key={store.ownerId} value={store}>{children}</StoreContext.Provider>;
}
