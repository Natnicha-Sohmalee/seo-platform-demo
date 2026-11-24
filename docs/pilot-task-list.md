# Task list: local pilot ภายในสองสัปดาห์

งานสำหรับผู้พัฒนา 3 คนที่ทำได้ทุกฝั่ง เลือกเจ้าของงานแต่ละชิ้นตอนเริ่ม sprint และใช้ PR แยกตามงาน งานในกลุ่มเดียวกันแยกไฟล์/ขอบเขตเพื่อทำพร้อมกันได้ ผู้รวมระบบอาจหมุนเวียนกัน

## ตกลง interface ก่อนแยกงาน (วัน 1)

| ID | งาน | เกณฑ์รับงาน |
| --- | --- | --- |
| C0 | สัญญาข้อมูลและ process | ระบุ schema 5 ตารางเดิม, `project_id` ของงานเนื้อหา, `website_url` nullable, ตาราง AI usage/consent, env และ URL ที่ browser/Next/worker ใช้ใน WSL; มี fixture สองโปรเจกต์ (มี/ไม่มีเว็บ) |

## ชิ้นงานที่เริ่มขนานกันได้ (วัน 1–6)

| ID | งาน | ขึ้นกับ | เกณฑ์รับงาน |
| --- | --- | --- | --- |
| DB1 | ตั้ง Supabase local | C0 | มี config ที่ pin CLI version; clone ใหม่เปิด Auth/PostgREST/Postgres ใน Docker ได้; local URL/key ที่ต้องใช้ระบุในคู่มือ |
| DB2 | Migration ตารางและ RLS | C0 | สร้าง `projects`, `crawl_jobs`, `crawl_pages`, `content_briefs`, `articles`, AI usage/consent พร้อม FK, unique, indexes และ policy จาก repo ได้; บัญชีที่สองอ่าน/แก้งานของบัญชีแรกไม่ได้ |
| UI1 | โปรเจกต์ไม่บังคับเว็บไซต์ | C0 | สร้าง/เปิดโปรเจกต์ไม่มี URL ได้; ซ่อน/ปิด crawl จนมี URL; ไม่มีการสร้าง URL ปลอม |
| UI2 | นำทางในโปรเจกต์ | C0 | เปิดคีย์เวิร์ด แผน และบทความจากหน้าโปรเจกต์ได้ โดยส่ง `project_id` ใน URL/state ตามสัญญา |
| WK1 | Worker เชื่อมฐานข้อมูล local | C0 | ยอมรับ HTTP เฉพาะ Supabase loopback ที่ตั้งค่าไว้; บันทึก job/page ได้; การตรวจ URL เป้าหมาย crawl ยังปฏิเสธ private/localhost |
| AI1 | แจ้งการส่งข้อมูลไป AI | C0 | ก่อนเรียก AI แสดง provider และประเภทข้อมูลที่จะส่ง; ข้อมูลจริงต้องกดยินยอมและมีหลักฐานเวลา/ขอบเขต; ไม่แสดง key ใน browser/log |
| AI2 | เพดานการเรียก AI | C0 | ทุก action (`recommend`, `brief`, `article`) จองสิทธิ์แบบ atomic ใน DB ก่อนเรียก provider; เกินเพดานแล้วไม่มี request ออก; UI แสดงสิทธิ์คงเหลือ |
| AI3 | สอง provider profile | C0 | ตั้ง Gemini หรือ Typhoon ผ่าน server env ได้; smoke test ทั้งสอง profile ใน dev; เอกสารแยก Gemini spend cap กับ Typhoon ที่ใช้ app limit เป็นหลัก |
| OPS1 | เปิด/ปิดระบบบน WSL | C0 | ขั้นตอน/สคริปต์ตรวจ Docker, Node, Python, env, DB, worker, web; เปิดและหยุดซ้ำได้โดยไม่ reset ข้อมูล; ไม่มี secret ใน Git |

## เชื่อมชิ้นงาน (วัน 5–8)

| ID | งาน | ขึ้นกับ | เกณฑ์รับงาน |
| --- | --- | --- | --- |
| DATA1 | ผูกชุดคีย์เวิร์ดและแผนกับโปรเจกต์ | DB2, UI2 | บันทึก/list/filter ตาม `project_id`; ลิงก์จากผล crawl ไปแผนยังอยู่โปรเจกต์เดิม; แผนจากเส้นทางไม่มีเว็บอยู่ในโปรเจกต์ |
| DATA2 | ผูกบทความกับโปรเจกต์ | DB2, UI2 | บันทึก/list/filter/เปิดต่อและส่งออกตาม `project_id`; version conflict ยังกันการเขียนทับข้ามแท็บ |
| WK2 | กู้สถานะงาน crawl หลัง restart | DB2, WK1 | งาน queued/running ที่ไม่มี worker ถืออยู่ถูกแสดงว่า interrupted/failed พร้อมทางเริ่มใหม่; หน้าที่บันทึกแล้วคงอยู่ |
| OPS2 | bootstrap เครื่อง pilot | DB1, DB2, OPS1, AI2, AI3 | ทีมสร้างบัญชีเดียว เลือก provider และตั้ง key เฉพาะ pilot กับ limit ใน config; หากใช้ Gemini ตั้ง spend cap; ลูกค้าเปิดใช้งานเองโดยไม่ต้องตั้ง secret ซ้ำ |

## ตรวจรับบนเครื่องลูกค้า (วัน 8–10)

| ID | งาน | ขึ้นกับ | เกณฑ์รับงาน |
| --- | --- | --- | --- |
| V1 | เส้นทางมีเว็บไซต์ | DATA1, DATA2, WK2, OPS2 | สร้างโปรเจกต์ → crawl → เลือกข้อมูล → แผน → บทความ → แก้/บันทึก/เปิดใหม่/ดาวน์โหลด Markdown ผ่าน |
| V2 | เส้นทางไม่มีเว็บไซต์และ CSV | DATA1, DATA2, OPS2 | สร้างโปรเจกต์ไม่มี URL → รายละเอียดธุรกิจ → แผน/บทความ; นำเข้า CSV และใช้คีย์เวิร์ด; เปิดต่อหลัง restart ผ่าน |
| V3 | ข้อจำกัดและความผิดพลาด | AI1, AI2, WK2, OPS2 | ตรวจ RLS, AI limit, worker ปิด, AI 429/timeout, crawl URL ถูกปฏิเสธ, restart กลางงาน; ทุกกรณีมีข้อความและทางไปต่อ |
| V4 | ส่งมอบ | V1–V3 | ลูกค้าเปิด/ปิด ใช้เอง และนำ Markdown ไปเผยแพร่เองได้; เก็บผลทดสอบและปัญหาคงค้าง; ระบุว่า production ต้องเพิ่ม backup/restore, queue, monitoring และนโยบายข้อมูล |

## วิธีแบ่งให้ 3 คน

1. วัน 1 ทำ C0 ร่วมกัน แล้วให้แต่ละคนเลือกชิ้นงานจาก DB, UI, WK/AI/OPS โดยแยก PR และไฟล์ที่แก้ให้ชัด
2. วัน 2–6 ทำตารางแรกพร้อมกัน; ผู้ที่รอ dependency ช่วย review หรือรับงานในไฟล์คนละส่วน เช่น UI1, AI1, OPS1
3. วัน 5–8 ดึง DATA1, DATA2, WK2, OPS2 เมื่อ dependency ผ่าน; ตรวจเส้นทางสั้นหลัง merge ทุกชิ้น
4. วัน 8–10 ติดตั้งและทำ V1–V4 บนเครื่องลูกค้า; กันวันท้ายสำหรับแก้สิ่งที่พบจากการใช้งานจริง

ไม่เปิด GitHub Issues อัตโนมัติจากรายการนี้; เมื่อ lead ยืนยันรายละเอียดแล้วค่อยแตกเป็น issue ตาม [กติกา tracker](agents/issue-tracker.md)
