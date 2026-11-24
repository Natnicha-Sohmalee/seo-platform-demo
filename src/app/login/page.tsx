"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { authFeedback, type AuthFeedback } from "@/lib/auth-feedback";
import { Badge, Icon, Logo } from "@/components/ui-icons";
import styles from "./auth.module.css";

type Mode = "login" | "signup" | "reset";

export default function LoginPage() {
  const [client] = useState(() => {
    try { return createClient(); } catch { return null; }
  });
  const [mode, setMode] = useState<Mode>("login");
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(Boolean(client));
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<AuthFeedback | null>(client ? null : {
    tone: "error", title: "ระบบสมาชิกยังตั้งค่าไม่ครบ", detail: "กรุณาตรวจ Supabase URL และ Publishable key ในการตั้งค่าโปรเจกต์ แล้วเปิดเซิร์ฟเวอร์ใหม่",
  });
  const lock = useRef(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const query = new URLSearchParams(window.location.search);
    if (query.get("mode") === "reset") setMode("reset");
    if (query.get("error")) setNotice({ tone: "error", title: "เปิดลิงก์ไม่สำเร็จ", detail: "ลิงก์อาจหมดอายุ ถูกใช้แล้ว หรือเปิดคนละเบราว์เซอร์กับที่เริ่มคำขอ กรุณาขอลิงก์ใหม่" });

    // ป้องกันหน้าค้างหากเครือข่ายหรือ Supabase ตอบช้า
    const fallbackTimer = window.setTimeout(() => {
      if (active) setChecking(false);
    }, 4000);

    // ตรวจ session ในเครื่องก่อน (เร็วมาก ไม่ต้องรอเครือข่ายหากยังไม่ได้ล็อกอิน)
    void client.auth.getSession().then(async ({ data: sessionData, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setNotice(authFeedback(sessionError));
        setChecking(false);
        return;
      }
      if (!sessionData.session) {
        setUser(null);
        setChecking(false);
        return;
      }
      // หากมี session ในเครื่อง ค่อยยืนยันกับเซิร์ฟเวอร์
      setUser(sessionData.session.user);
      setChecking(false);
      const { data, error } = await client.auth.getUser();
      if (!active) return;
      setUser(data.user);
      if (error && error.name !== "AuthSessionMissingError") setNotice(authFeedback(error));
    }).catch((error) => {
      if (active) {
        setNotice(authFeedback(error));
        setChecking(false);
      }
    }).finally(() => {
      window.clearTimeout(fallbackTimer);
      if (active) setChecking(false);
    });

    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setChecking(false);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setPassword("");
        setConfirmation("");
      }
    });
    return () => {
      active = false;
      window.clearTimeout(fallbackTimer);
      data.subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function switchMode(next: Mode) {
    if (busy) return;
    setMode(next);
    setPassword("");
    setConfirmation("");
    setShowPassword(false);
    setCapsLock(false);
    setNotice(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || lock.current || (mode !== "login" && cooldown > 0)) return;
    if (mode === "signup" && password !== confirmation) {
      setNotice({ tone: "error", title: "รหัสผ่านสองช่องไม่ตรงกัน", detail: "กรุณากรอกรหัสผ่านและช่องยืนยันให้เหมือนกัน" });
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/recovery`,
        });
        if (error) throw error;
        setCooldown(60);
        setNotice({ tone: "success", title: "รับคำขอตั้งรหัสผ่านใหม่แล้ว", detail: "หากมีบัญชีที่ใช้อีเมลนี้ ระบบจะส่งลิงก์ให้ กรุณาตรวจ Inbox และ Spam แล้วเปิดในเบราว์เซอร์นี้" });
      } else if (mode === "signup") {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        } });
        if (error) throw error;
        setUser(data.user && data.session ? data.user : null);
        setCooldown(60);
        setNotice(data.session
          ? { tone: "success", title: "สมัครสมาชิกสำเร็จ", detail: "เริ่มจัดการโปรเจกต์ได้เลย" }
          : { tone: "info", title: "กรุณาตรวจอีเมลของคุณ", detail: "หากบัญชียังต้องยืนยันอีเมล ระบบจะส่งลิงก์ให้ ตรวจ Inbox และ Spam แล้วเปิดลิงก์ในเบราว์เซอร์นี้ หากเคยสมัครแล้วให้ลองเข้าสู่ระบบ", confirmEmail: true });
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setUser(data.user);
        setNotice(null);
      }
      setPassword("");
      setConfirmation("");
    } catch (error) {
      const feedback = authFeedback(error);
      setNotice(feedback);
      if (typeof error === "object" && error !== null && "status" in error && error.status === 429) setCooldown(60);
    } finally { lock.current = false; setBusy(false); }
  }

  async function resend() {
    if (!client || lock.current || cooldown > 0) return;
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setNotice({ tone: "info", title: "กรอกอีเมลก่อน", detail: "ใส่อีเมลที่ใช้สมัครในช่องด้านบน แล้วขอส่งอีเมลยืนยันอีกครั้ง" });
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const { error } = await client.auth.resend({ type: "signup", email: email.trim(), options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      } });
      if (error) throw error;
      setNotice({ tone: "info", title: "รับคำขอแล้ว", detail: "หากบัญชียังต้องยืนยัน ระบบจะส่งอีเมลให้ ตรวจ Inbox และ Spam โดยไม่ต้องกดส่งซ้ำ", confirmEmail: true });
    } catch (error) { setNotice(authFeedback(error)); }
    finally { setCooldown(60); lock.current = false; setBusy(false); }
  }

  async function logout() {
    if (!client || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      setUser(null);
      setMode("login");
      setPassword("");
      setConfirmation("");
      setShowPassword(false);
      setNotice({ tone: "info", title: "ออกจากระบบแล้ว", detail: "กลับมาเข้าสู่ระบบได้ทุกเมื่อ" });
    } catch (error) { setNotice(authFeedback(error)); }
    finally { lock.current = false; setBusy(false); }
  }

  const locked = busy || checking || !client;

  return (
    <div className="login-page" lang="th">
      <div className="login-aside">
        <Link href="/">
          <Logo inverse />
        </Link>
        <div>
          <Badge tone="blue">พื้นที่ทำงานสำหรับทีมคอนเทนต์</Badge>
          <h1>
            วางแผนอย่างมีข้อมูล
            <br />
            เขียนอย่างมีที่มา
          </h1>
          <p>จัดการเว็บไซต์ คีย์เวิร์ด Brief และบทความทั้งหมดใน Workflow เดียว</p>
          <div className="login-quote">
            “ช่วยให้เราใช้เวลาคิดเรื่องที่สำคัญ แทนที่จะเสียเวลารวมข้อมูล”
            <small>— Content Team, Wellness Plus</small>
          </div>
        </div>
        <small>© 2025 SEO Platform</small>
      </div>

      <main className="login-main">
        <Link className="back-link" href="/">
          <span>←</span> กลับหน้าหลัก
        </Link>

        <section className="login-card" aria-labelledby="auth-title">
          {checking ? (
            <>
              <p className="eyebrow">Account check</p>
              <h1 id="auth-title">กำลังตรวจสอบบัญชี…</h1>
              <p role="status">รอสักครู่ กำลังเชื่อมต่อระบบสมาชิก</p>
            </>
          ) : user ? (
            <>
              <span className={styles.successIcon} aria-hidden="true">
                <Icon name="check" size={26} />
              </span>
              <p className="eyebrow">Signed in</p>
              <h1 id="auth-title">เข้าสู่ระบบแล้ว</h1>
              <p className={styles.email}>{user.email}</p>
              <div className={styles.signed}>
                <Link href="/projects" className="btn btn-primary full">
                  เปิดโปรเจกต์ของฉัน <Icon name="arrow" size={17} />
                </Link>
                <button
                  className="btn btn-secondary full"
                  type="button"
                  disabled={busy}
                  onClick={logout}
                >
                  ออกจากระบบ
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">
                {mode === "signup"
                  ? "Create your workspace"
                  : mode === "reset"
                    ? "Reset password"
                    : "Welcome back"}
              </p>
              <h1 id="auth-title">
                {mode === "signup"
                  ? "เริ่มต้นใช้งานฟรี"
                  : mode === "reset"
                    ? "ลืมรหัสผ่าน?"
                    : "เข้าสู่พื้นที่ทำงาน"}
              </h1>
              <p>
                {mode === "reset"
                  ? "กรอกอีเมลเพื่อรับลิงก์ตั้งรหัสผ่านใหม่"
                  : mode === "signup"
                    ? "กรอกข้อมูลด้านล่าง แล้วตรวจอีเมลเพื่อยืนยันบัญชี"
                    : "ใช้บัญชีของคุณเพื่อทำงานต่อ"}
              </p>

              {mode !== "reset" && (
                <div className="auth-tabs" aria-label="เลือกเข้าสู่ระบบหรือสมัครสมาชิก">
                  <button
                    type="button"
                    disabled={locked}
                    aria-pressed={mode === "login"}
                    className={mode === "login" ? "active" : ""}
                    onClick={() => switchMode("login")}
                  >
                    เข้าสู่ระบบ
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    aria-pressed={mode === "signup"}
                    className={mode === "signup" ? "active" : ""}
                    onClick={() => switchMode("signup")}
                  >
                    สมัครสมาชิก
                  </button>
                </div>
              )}

              <form onSubmit={submit}>
                <label htmlFor="email">
                  อีเมล
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={locked}
                    placeholder="name@company.com"
                  />
                </label>

                {mode !== "reset" && (
                  <>
                    <div className={styles.field}>
                      <div className={styles.row}>
                        <label htmlFor="password" className={styles.inlineLabel}>
                          รหัสผ่าน
                        </label>
                      </div>
                      <div className={styles.passwordWrap}>
                        <input
                          className={styles.passwordInput}
                          id="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete={mode === "signup" ? "new-password" : "current-password"}
                          minLength={mode === "signup" ? 8 : undefined}
                          required
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                          onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                          onBlur={() => setCapsLock(false)}
                          disabled={locked}
                          placeholder={mode === "signup" ? "อย่างน้อย 8 ตัวอักษร" : "รหัสผ่านของคุณ"}
                        />
                        <button
                          className={styles.reveal}
                          type="button"
                          disabled={locked}
                          aria-pressed={showPassword}
                          aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                          onClick={() => setShowPassword((value) => !value)}
                        >
                          {showPassword ? "ซ่อน" : "แสดง"}
                        </button>
                      </div>
                      {capsLock && <p className={styles.caps}>เปิด Caps Lock อยู่</p>}
                    </div>

                    {mode === "signup" && (
                      <label htmlFor="confirmation">
                        ยืนยันรหัสผ่าน
                        <input
                          id="confirmation"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          minLength={8}
                          required
                          value={confirmation}
                          onChange={(event) => setConfirmation(event.target.value)}
                          disabled={locked}
                          placeholder="กรอกรหัสผ่านอีกครั้ง"
                        />
                      </label>
                    )}
                  </>
                )}

                <button
                  className="btn btn-primary full"
                  style={{ marginTop: 20 }}
                  type="submit"
                  disabled={locked || (mode !== "login" && cooldown > 0)}
                >
                  {busy
                    ? "กำลังดำเนินการ…"
                    : mode === "login"
                      ? "เข้าสู่ระบบ"
                      : cooldown > 0
                        ? `เว้นช่วงอีก ${cooldown} วินาที`
                        : mode === "signup"
                          ? "สร้างบัญชีฟรี"
                          : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
                </button>
              </form>

              {mode === "login" && (
                <button
                  type="button"
                  className="text-link"
                  disabled={locked}
                  onClick={() => switchMode("reset")}
                >
                  ลืมรหัสผ่าน?
                </button>
              )}
              {mode === "reset" && (
                <button
                  type="button"
                  className="text-link"
                  disabled={busy}
                  onClick={() => switchMode("login")}
                >
                  กลับไปเข้าสู่ระบบ
                </button>
              )}

              <div className="or">
                <span />
                หรือ
                <span />
              </div>

              <Link href="/content" className="btn btn-secondary full">
                <Icon name="spark" size={18} /> ทดลองวางแผนบทความ
              </Link>
            </>
          )}

          {notice && (
            <div
              className={`${styles.notice} ${
                notice.tone === "error"
                  ? styles.error
                  : notice.tone === "success"
                    ? styles.success
                    : ""
              }`}
              role={notice.tone === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              <strong>{notice.title}</strong>
              <p>{notice.detail}</p>
            </div>
          )}

          {!checking && !user && mode !== "reset" && (
            <details className={styles.help} open={notice?.confirmEmail || undefined}>
              <summary>ยังไม่ได้รับอีเมลยืนยัน?</summary>
              <p>ตรวจ Inbox และ Spam ของอีเมลที่ใช้สมัคร หากยังไม่พบให้กรอกอีเมลด้านบนแล้วกดปุ่มนี้</p>
              <button
                className="text-link"
                style={{ margin: "8px 0 0" }}
                type="button"
                disabled={locked || cooldown > 0}
                onClick={resend}
              >
                {cooldown > 0 ? `เว้นช่วงอีก ${cooldown} วินาที` : "ส่งอีเมลยืนยันอีกครั้ง"}
              </button>
            </details>
          )}
        </section>
      </main>
    </div>
  );
}
