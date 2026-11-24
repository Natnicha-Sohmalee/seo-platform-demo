"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useProjectAccount() {
  const router = useRouter();

  const [client] = useState(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  });

  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(client));
  const [error, setError] = useState(
    client ? "" : "การตั้งค่า Supabase ยังไม่ครบ"
  );

  useEffect(() => {
    if (!client) return;

    let active = true;
    let revision = 0;

    // ตรวจใหม่ทุกครั้งที่หน้ากลับมาแสดง
    setChecking(true);
    setUserId(null);
    setError("");

    const { data: listener } = client.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return;

        if (event === "SIGNED_OUT") {
          revision++;
          setUserId(null);
          setError("");
          setChecking(false);
          router.replace("/login");
          return;
        }

        if (event === "SIGNED_IN" && session?.user) {
          revision++;
          setUserId(session.user.id);
          setError("");
          setChecking(false);
        }
      }
    );

    const requestRevision = revision;

    void client.auth.getSession()
      .then(async ({ data: sessionData, error: sessionError }) => {
        if (!active || requestRevision !== revision) return;
        if (sessionError) throw sessionError;

        if (!sessionData.session) {
          setUserId(null);
          setChecking(false);
          router.replace("/login");
          return;
        }

        const { data, error: authError } = await client.auth.getUser();
        if (!active || requestRevision !== revision) return;

        if (
          authError &&
          authError.name !== "AuthSessionMissingError"
        ) {
          throw authError;
        }

        setUserId(data.user?.id ?? null);

        // เปลี่ยนหน้าหลังตรวจบัญชีรอบนี้เสร็จเท่านั้น
        if (!data.user) {
          router.replace("/login");
        }
      })
      .catch(() => {
        if (!active || requestRevision !== revision) return;

        setUserId(null);
        setError(
          "ตรวจสอบบัญชีไม่ได้ กรุณารีโหลดแล้วลองใหม่"
        );
      })
      .finally(() => {
        if (active && requestRevision === revision) {
          setChecking(false);
        }
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client, router]);

  return { client, userId, checking, error };
}