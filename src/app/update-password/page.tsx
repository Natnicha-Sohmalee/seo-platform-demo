"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { authFeedback, type AuthFeedback } from "@/lib/auth-feedback";
import styles from "../login/auth.module.css";

export default function UpdatePasswordPage() {
  const [client] = useState(() => { try { return createClient(); } catch { return null; } });
  const [checking, setChecking] = useState(Boolean(client));
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<AuthFeedback | null>(client ? null : { tone: "error", title: "ระบบสมาชิกยังตั้งค่าไม่ครบ", detail: "กรุณาตรวจการตั้งค่า Supabase ของโปรเจกต์" });
  const lock = useRef(false);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setAuthenticated(Boolean(data.user));
      if (error || !data.user) setNotice({ tone: "error", title: "ยังใช้ลิงก์นี้ตั้งรหัสผ่านไม่ได้", detail: "ขอลิงก์ตั้งรหัสผ่านใหม่ แล้วเปิดจากอีเมลในเบราว์เซอร์ที่ใช้เริ่มคำขอ" });
    }).catch((error) => { if (active) setNotice(authFeedback(error)); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [client]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !authenticated || lock.current) return;
    if (password !== confirmation) {
      setNotice({ tone: "error", title: "รหัสผ่านสองช่องไม่ตรงกัน", detail: "กรุณากรอกให้เหมือนกันแล้วลองอีกครั้ง" });
      return;
    }
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirmation("");
      setDone(true);
      setNotice({ tone: "success", title: "ตั้งรหัสผ่านใหม่สำเร็จ", detail: "บัญชีนี้เข้าสู่ระบบอยู่แล้ว ไปยังโปรเจกต์เพื่อทำงานต่อได้เลย" });
    } catch (error) { setNotice(authFeedback(error)); }
    finally { lock.current = false; setBusy(false); }
  }

  return <main className={styles.page} lang="th">
    <header className={styles.header}><Link href="/login" className={styles.logo}>SEO Platform</Link></header>
    <section className={`${styles.card} ${styles.single}`}>
      <h1 className={styles.title}>{checking ? "กำลังตรวจสอบลิงก์…" : done ? "ตั้งรหัสผ่านแล้ว" : "ตั้งรหัสผ่านใหม่"}</h1>
      <p className={styles.subtitle}>เลือกรหัสผ่านอย่างน้อย 8 ตัวอักษร และเก็บไว้สำหรับเข้าสู่ระบบครั้งต่อไป</p>
      {!checking && authenticated && !done && <form className={styles.form} onSubmit={submit}>
        <label className={styles.field} htmlFor="new-password"><span className={styles.label}>รหัสผ่านใหม่</span>
          <div className={styles.passwordWrap}><input id="new-password" className={`${styles.input} ${styles.passwordInput}`} type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
          <button className={styles.reveal} type="button" disabled={busy} aria-pressed={showPassword} aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "ซ่อน" : "แสดง"}</button></div>
        </label>
        <label className={styles.field} htmlFor="confirm-password"><span className={styles.label}>ยืนยันรหัสผ่านใหม่</span><input id="confirm-password" className={styles.input} type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label>
        <button className={styles.primary} type="submit" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}</button>
      </form>}
      {notice && <div className={`${styles.notice} ${notice.tone === "error" ? styles.error : notice.tone === "success" ? styles.success : ""}`} role={notice.tone === "error" ? "alert" : "status"}><strong>{notice.title}</strong><p>{notice.detail}</p></div>}
      {done ? <p><Link href="/projects" className={styles.primary}>เปิดโปรเจกต์ของฉัน</Link></p> : !checking && !authenticated ? <p><Link href="/login?mode=reset" className={styles.primary}>ขอลิงก์ตั้งรหัสผ่านใหม่</Link></p> : null}
      <p className={styles.center}><Link href="/login" className={styles.textButton}>กลับไปหน้าบัญชี</Link></p>
    </section>
  </main>;
}
