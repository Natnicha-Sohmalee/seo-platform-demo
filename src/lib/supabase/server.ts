import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export class ApiError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export async function requireUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new ApiError("การตั้งค่า Supabase ยังไม่ครบ");
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();

  if (error && error.name !== "AuthSessionMissingError") {
    const status = error.status;
    throw new ApiError(
      status === 401 || status === 403
        ? "กรุณาเข้าสู่ระบบใหม่"
        : "ตรวจสอบบัญชีไม่ได้ กรุณาลองใหม่",
      status === 401 || status === 403 ? 401 : 503
    );
  }

  if (!data.user) {
    throw new ApiError("กรุณาเข้าสู่ระบบก่อน", 401);
  }

  return { supabase, user: data.user };
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new ApiError("ยังไม่ได้ตั้งค่า Supabase ฝั่งเซิร์ฟเวอร์");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}