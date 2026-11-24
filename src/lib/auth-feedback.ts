export type AuthFeedback = {
  tone: "error" | "success" | "info";
  title: string;
  detail: string;
  confirmEmail?: boolean;
};

export function authFeedback(error: unknown): AuthFeedback {
  const value = typeof error === "object" && error !== null ? error : {};
  const code = "code" in value ? String(value.code) : "";
  const status = "status" in value ? Number(value.status) : 0;
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return { tone: "error", title: "อีเมลหรือรหัสผ่านไม่ตรงกัน", detail: "ตรวจอีเมล ภาษาคีย์บอร์ด และ Caps Lock อีกครั้ง หากจำรหัสผ่านไม่ได้ให้กดลืมรหัสผ่าน หรือสมัครสมาชิกหากยังไม่มีบัญชี" };
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return { tone: "info", title: "กรุณายืนยันอีเมลก่อน", detail: "เปิดอีเมลยืนยันจากระบบแล้วกดลิงก์ในเบราว์เซอร์ที่ใช้สมัคร หากไม่พบให้ตรวจ Spam หรือขอส่งอีเมลอีกครั้งด้านล่าง", confirmEmail: true };
  }
  if (status === 429 || code.startsWith("over_") || message.includes("rate limit")) {
    return { tone: "info", title: "ระบบจำกัดความถี่ชั่วคราว", detail: "พักการส่งคำขอก่อน โดยเฉพาะอีเมลยืนยันและอีเมลตั้งรหัสผ่านใหม่ การกดซ้ำไม่ได้เพิ่มโควตา หากยังติดข้อจำกัดให้ตรวจการตั้งค่าระบบอีเมลใน Supabase" };
  }
  if (["otp_expired", "flow_state_expired", "flow_state_not_found", "bad_code_verifier"].includes(code)) {
    return { tone: "error", title: "ลิงก์ใช้ไม่ได้หรือหมดอายุ", detail: "ขอลิงก์ใหม่แล้วเปิดในเบราว์เซอร์ที่ใช้เริ่มคำขอ ลิงก์ที่ใช้ไปแล้วอาจไม่สามารถเปิดซ้ำได้" };
  }
  if (code === "weak_password") {
    return { tone: "error", title: "รหัสผ่านยังไม่ผ่านเงื่อนไข", detail: "ใช้รหัสผ่านอย่างน้อย 8 ตัวอักษร เลือกข้อความที่เดายากขึ้น และทำตามเงื่อนไขรหัสผ่านของโปรเจกต์" };
  }
  if (code === "same_password") {
    return { tone: "info", title: "กรุณาเลือกรหัสผ่านใหม่", detail: "รหัสผ่านใหม่นี้เหมือนกับรหัสผ่านปัจจุบัน" };
  }
  if (["email_address_invalid", "validation_failed"].includes(code)) {
    return { tone: "error", title: "กรุณาตรวจข้อมูลอีกครั้ง", detail: "ตรวจรูปแบบอีเมลและข้อมูลที่กรอกก่อนลองใหม่" };
  }
  if (code === "email_address_not_authorized") {
    return { tone: "error", title: "ระบบยังส่งอีเมลไปยังผู้รับนี้ไม่ได้", detail: "โปรดให้ผู้ดูแลตรวจการตั้งค่าผู้รับที่อนุญาตและบริการส่งอีเมลใน Supabase" };
  }
  if (["user_already_exists", "email_exists"].includes(code)) {
    return { tone: "info", title: "ลองเข้าสู่ระบบด้วยบัญชีเดิม", detail: "หากเคยสมัครด้วยอีเมลนี้แล้ว ให้เข้าสู่ระบบหรือใช้ลืมรหัสผ่าน" };
  }
  if (message.includes("fetch") || message.includes("network")) {
    return { tone: "error", title: "ติดต่อระบบสมาชิกไม่ได้", detail: "ตรวจการเชื่อมต่ออินเทอร์เน็ต แล้วลองอีกครั้ง" };
  }
  return { tone: "error", title: "ดำเนินการไม่สำเร็จ", detail: code ? `ระบบสมาชิกตอบกลับรหัส ${code} กรุณาตรวจการตั้งค่าหรือติดต่อผู้ดูแล` : "กรุณาลองอีกครั้ง หากยังพบปัญหาให้ตรวจบันทึก Authentication ใน Supabase" };
}
