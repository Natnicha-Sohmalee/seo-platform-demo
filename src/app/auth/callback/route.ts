import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    requestUrl.protocol.replace(/:$/, "");
  const publicOrigin = host ? `${proto}://${host}` : requestUrl.origin;

  const code = requestUrl.searchParams.get("code");
  // รับเฉพาะปลายทางภายในที่กำหนดไว้ ป้องกัน redirect ออกนอกเว็บ
  const destination = requestUrl.pathname === "/auth/recovery" || requestUrl.searchParams.get("next") === "/update-password"
    ? "/update-password"
    : "/login";

  const failureUrl = new URL("/login", publicOrigin);
  failureUrl.searchParams.set("error", destination === "/update-password" ? "recovery" : "confirmation");
  if (destination === "/update-password") failureUrl.searchParams.set("mode", "reset");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!code || !url || !key) {
    return NextResponse.redirect(failureUrl);
  }

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(failureUrl);
    }

    return NextResponse.redirect(new URL(destination, publicOrigin));
  } catch {
    return NextResponse.redirect(failureUrl);
  }
}