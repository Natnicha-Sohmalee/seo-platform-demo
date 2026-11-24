# SEO Platform

แพลตฟอร์มช่วยผู้ประกอบการนำข้อมูลเว็บไซต์หรือรายละเอียดธุรกิจมาวางแผนและเขียนบทความ รองรับ Python Crawler, การนำเข้าคีย์เวิร์ดจาก CSV, การเสนอหัวข้อด้วย AI, Content Brief, ตัวแก้ไขบทความ และการบันทึกงานใน Supabase

เส้นทางหลัก: **เพิ่มโปรเจกต์ → อ่านเว็บไซต์ → เลือกหัวข้อ/คีย์เวิร์ด → วางแผนบทความ → สร้างและแก้บทความ → บันทึกและส่งออก** ผู้ใช้ที่ไม่มีเว็บไซต์เริ่มจากรายละเอียดธุรกิจได้

## สถานะและขอบเขต

- เป็น MVP สำหรับพัฒนาและทดลองใช้งาน ยังต้องตรวจระบบจริงก่อนเปิดบริการสาธารณะ
- อ่าน HTML และเลือกอ่านหน้า JavaScript ผ่าน Microsoft Edge ได้ โหมด JavaScript ไม่รับประกันว่าจะอ่านเว็บไซต์ที่ปิดกั้นบอตหรือมี CAPTCHA ได้
- เก็บโปรเจกต์ งาน Crawl ผลหน้าเว็บ Brief และบทความใน Supabase งานเดิมจากรุ่นที่เก็บในเบราว์เซอร์ต้องเลือกนำเข้าเอง
- ตรวจ SEO เบื้องต้นจากหน้าที่อ่านสำเร็จ ไม่ใช่การรับรองอันดับหรือการปรากฏในคำตอบ AI
- Worker รับงานพร้อมกันหนึ่งงาน ไม่มีคิวถาวรหรือระบบทำงานต่ออัตโนมัติหลังรีสตาร์ต
- **ยังไม่มี SQL migration สำหรับสร้างฐานข้อมูลใหม่รวมอยู่ใน repository นี้** ผู้ติดตั้งต้องใช้ฐานข้อมูลที่ทีมเตรียม schema และ RLS ให้ตรงกับแอปก่อน

## เทคโนโลยี

| ส่วน | เครื่องมือ |
| --- | --- |
| เว็บไซต์ | Next.js 16.4.3, React 19.3, TypeScript, CSS Modules/Tailwind |
| สมาชิกและฐานข้อมูล | Supabase Auth, PostgreSQL, Row Level Security (RLS) |
| AI | Typhoon หรือ Gemini เลือกจากค่าตั้งฝั่งเซิร์ฟเวอร์ |
| ตัวแก้ไขบทความ | Tiptap |
| Worker | Python, FastAPI, Uvicorn |
| อ่านเว็บ | urllib, Beautiful Soup, Playwright + Microsoft Edge |

ไลบรารีฝั่งเว็บติดตั้งด้วย `npm ci` ตาม `package-lock.json` ส่วนไลบรารี Python ติดตั้งด้วย `requirements.txt` ทั้งสองส่วนต้องติดตั้งแยกกัน

## สิ่งที่ต้องเตรียม

คู่มือนี้ใช้ **Windows + PowerShell** ตามเครื่องพัฒนาปัจจุบัน

1. Git และสำเนา repository ของทีม
2. Node.js สาย 22 รุ่น **22.13.0 ขึ้นไป** พร้อม npm เพื่อให้ตรงกับข้อกำหนดของ dependency ที่ใช้ในโปรเจกต์
3. Python **3.12 แบบ 64 บิต** พร้อม Python Launcher (`py`)
4. Microsoft Edge สำหรับโหมดอ่าน JavaScript (โค้ดปัจจุบันใช้ `channel="msedge"`)
5. Supabase project พร้อม schema, RLS และบัญชีสมาชิกสำหรับเข้าสู่ระบบ
6. API key ของผู้ให้บริการ AI ที่เลือก เฉพาะเมื่อต้องการใช้ฟังก์ชัน AI

ตรวจเครื่องมือ:

```powershell
node --version
npm --version
py -3.12 --version
```

ตัวอย่างด้านล่างใช้ที่อยู่ `E:\seo-platform` ถ้า clone ไว้ที่อื่นให้เปลี่ยนพาธตามเครื่อง ไม่ต้องสร้าง Next.js app ใหม่ และไม่ต้องใช้โฟลเดอร์ต้นแบบ `E:\crawler` เพื่อเปิดแพลตฟอร์มนี้

## 1. ติดตั้งไลบรารี

เปิด PowerShell ในโฟลเดอร์ repository:

```powershell
cd E:\seo-platform
npm ci
py -3.12 -m venv worker\.venv
.\worker\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

คำสั่งสร้าง `.venv` ใช้เมื่อติดตั้งครั้งแรกเท่านั้น หากมีอยู่แล้วให้ใช้คำสั่งติดตั้งไลบรารีต่อได้ ไม่ต้อง activate virtual environment เพราะคำสั่งระบุ Python ภายใน `.venv` โดยตรง

`requirements.txt` ที่ root อ้างอิง `worker/requirements.txt` อีกที ไฟล์ฝั่ง Worker ระบุเวอร์ชัน dependency โดยตรงตามสภาพแวดล้อมพัฒนาปัจจุบัน ยังไม่ใช่ lockfile ของ dependency ทางอ้อมทั้งหมด

หากไม่มี Microsoft Edge ให้ติดตั้ง Edge ก่อนใช้โหมด JavaScript การติดตั้ง Chromium ของ Playwright อย่างเดียวไม่ตรงกับ browser channel ที่โค้ดปัจจุบันเรียกใช้

## 2. ตั้งค่าตัวแปรแวดล้อม

สำหรับเครื่องใหม่ คัดลอกไฟล์ตัวอย่าง **เฉพาะเมื่อยังไม่มีไฟล์ปลายทาง** เพื่อรักษาคีย์เดิม:

```powershell
cd E:\seo-platform
if (-not (Test-Path -LiteralPath '.env.local')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
if (-not (Test-Path -LiteralPath 'worker\.env')) {
    Copy-Item -LiteralPath 'worker\.env.example' -Destination 'worker\.env'
}
```

เปิดสองไฟล์แล้วแทนค่าตัวอย่างด้วยค่าจริง อย่าส่งคีย์จริงลงแชตหรือ commit เข้า Git

### เว็บไซต์: `.env.local`

| ตัวแปร | ความหมาย |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL ของ Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key ฝั่งเบราว์เซอร์ |
| `SUPABASE_SECRET_KEY` | Secret key ฝั่งเซิร์ฟเวอร์ ไม่ใช่ Project ID |
| `CRAWLER_API_URL` | เครื่องพัฒนาใช้ `http://127.0.0.1:8787` |
| `CRAWLER_API_KEY` | รหัสลับที่กำหนดเอง ต้องตรงกับ Worker |
| `AI_PROVIDER` | `typhoon` หรือ `gemini` ไฟล์ตัวอย่างเลือก `typhoon` |
| `TYPHOON_API_KEY` | Key ของ Typhoon เมื่อเลือกผู้ให้บริการนี้ |
| `TYPHOON_MODEL` | ตัวอย่าง `typhoon-v2.5-30b-a3b-instruct` ต้องมีสิทธิ์ใช้ในบัญชี |
| `GEMINI_API_KEY` | Key ของ Gemini เมื่อเลือกผู้ให้บริการนี้ |
| `GEMINI_MODEL` | Model ID ที่บัญชี Gemini ใช้งานได้ ต้องกำหนดเมื่อเลือก Gemini |

### Worker: `worker/.env`

| ตัวแปร | ความหมาย |
| --- | --- |
| `SUPABASE_URL` | ใช้ URL เดียวกับเว็บไซต์ |
| `SUPABASE_SECRET_KEY` | Secret key ของ Supabase project เดียวกัน |
| `CRAWLER_API_KEY` | ใช้ค่าเดียวกับ `.env.local` |

สร้างค่า `CRAWLER_API_KEY` แบบสุ่มได้ด้วยคำสั่งด้านล่าง แล้วคัดลอกผลไปใส่ให้ตรงกันทั้งสองไฟล์ **อย่ารันใหม่แยกไฟล์**:

```powershell
.\worker\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
```

อย่าเพิ่ม `NEXT_PUBLIC_` ให้ Secret key หรือ AI key เพราะตัวแปรที่มี prefix นี้อาจถูกส่งไปยังเบราว์เซอร์ หลังแก้ env ต้องหยุดและเปิดเซิร์ฟเวอร์ส่วนที่เกี่ยวข้องใหม่

## 3. เตรียม Supabase

ใช้ schema ของทีมที่ตรงกับโค้ดปัจจุบัน มีอย่างน้อย:

| ตาราง | ใช้เก็บ |
| --- | --- |
| `projects` | โปรเจกต์และเจ้าของตามบัญชีสมาชิก |
| `crawl_jobs` | การตั้งค่า สถานะและความคืบหน้าของงาน Crawl |
| `crawl_pages` | ผลอ่านแต่ละ URL รวมข้อความ Markdown และข้อมูล SEO |
| `content_briefs` | แผนบทความ และชุดคีย์เวิร์ดที่แยกด้วย prefix ของ `storage_key` |
| `articles` | บทความ ข้อมูล SEO และบริบทจากแผนบทความ |

ตารางต้องมีคอลัมน์ ความสัมพันธ์ constraint และ RLS ตามที่แอปใช้งาน การสร้างเฉพาะชื่อตารางไม่เพียงพอ ตัวอย่างเช่นผลหน้าเว็บใช้คู่ `crawl_job_id, url` เป็น unique key และข้อมูล Brief/บทความใช้ `storage_key`, JSON `payload`, `version` สำหรับบันทึกงานและตรวจการแก้ไขชนกัน

สำหรับสมาชิก ตั้ง Supabase Auth Site URL เป็น `http://localhost:3000` และอนุญาต Redirect URL `http://localhost:3000/auth/callback` หากเปิดยืนยันอีเมล ผู้ใช้ต้องยืนยันก่อนเข้าสู่ระบบ ใช้บัญชีทดสอบของทีมตามสิทธิ์ที่ได้รับ

**เครื่องใหม่ที่ยังไม่มีฐานข้อมูลของทีมจะยังใช้งานบันทึกงานไม่ได้** ขอ SQL/schema รุ่นที่ตรงกันจากผู้ดูแลก่อน คู่มือนี้ไม่ได้สร้าง schema ให้อัตโนมัติ

## 4. เปิดใช้งาน: สองหน้าต่าง PowerShell

### หน้าต่างที่ 1 — Python Worker

```powershell
cd E:\seo-platform\worker
.\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8787
```

เปิดค้างไว้ ควรเห็นว่า Uvicorn ทำงานบนพอร์ต 8787 ตรวจการเริ่มเซิร์ฟเวอร์ได้ที่ [Worker health](http://127.0.0.1:8787/health) ซึ่งควรตอบ `{"status":"ok","service":"crawler-worker"}` endpoint นี้ตรวจว่า Worker เปิดอยู่ ไม่ได้ยืนยันว่าเขียน Supabase หรืออ่านเว็บไซต์ได้สำเร็จ

### หน้าต่างที่ 2 — เว็บไซต์

```powershell
cd E:\seo-platform
npm run dev
```

เปิด [SEO Platform](http://localhost:3000) ระบบจะไปหน้า Login เว็บไซต์ใช้พอร์ต 3000 ส่วน Worker ใช้พอร์ต 8787 ทั้งสองหน้าต่างต้องเปิดค้างไว้เมื่อต้องการ Crawl กด `Ctrl+C` ในแต่ละหน้าต่างเพื่อหยุด

ใช้ `localhost:3000` ให้เหมือนกันตลอดการใช้งาน การสลับกับ `127.0.0.1:3000` อาจทำให้ cookie/session แยกกัน

## 5. ลองใช้งานด้วยตนเอง

1. เข้าสู่ระบบ แล้วเพิ่มโปรเจกต์เว็บไซต์
2. เปิดโปรเจกต์ กำหนด URL จำนวนหน้าและความลึก แล้วเริ่มอ่านเว็บไซต์ เลือกโหมด JavaScript เมื่อต้องการและมี Edge พร้อมใช้งาน
3. เปิดประวัติงานและดูผลแต่ละหน้า จากนั้นเลือกหัวข้อหรือกรอกรายละเอียดเองเพื่อวางแผนบทความ
4. หากไม่มีเว็บไซต์ ให้เริ่มจากหน้ารายละเอียดธุรกิจ `/content`
5. หากมีไฟล์คีย์เวิร์ด ให้นำเข้าที่ `/keywords` ระบุที่มา/ช่วงข้อมูล เลือกคำหลักและคำประกอบ แล้วนำไปวางแผนบทความ ปริมาณค้นหามาจากไฟล์ที่ผู้ใช้ให้ ไม่ใช่ตัวเลขที่ระบบค้นหามาใหม่
6. สร้าง Brief แล้วสร้างบทความ แก้เนื้อหาและข้อมูล SEO บันทึก และกลับมาเปิดต่อจาก `/articles` หรือดาวน์โหลด Markdown
7. ตรวจการบันทึกข้ามเบราว์เซอร์ด้วยบัญชีเดียวกัน โดยเปิดงานที่บันทึกแล้ว การเปิดงานเดิมไม่ควรเรียก AI ใหม่เอง

การนำเข้า CSV ไม่เรียก AI เอง ปุ่มเสนอหัวข้อ วางแผน และสร้างบทความจะเรียกผู้ให้บริการ AI ที่ตั้งไว้ อาจใช้โควตาหรือมีค่าใช้จ่ายตามบัญชี ไม่มีการสลับไปผู้ให้บริการอื่นอัตโนมัติ

## โครงสร้างที่สำคัญ

```text
seo-platform/
├── src/app/                 หน้าเว็บและ API ของ Next.js
├── src/components/          ส่วนประกอบหน้าจอและตัวแก้ไขบทความ
├── src/lib/                 Supabase, AI, งาน Crawl และการจัดเก็บข้อมูล
├── worker/
│   ├── api.py               FastAPI สำหรับรับงาน Crawl
│   ├── crawler_engine.py    อ่าน HTML/JavaScript และแปลงเนื้อหา
│   ├── supabase_store.py    บันทึกผลจาก Worker เข้า Supabase
│   ├── requirements.txt    dependency โดยตรงของ Python Worker
│   └── .env.example        ตัวอย่างค่าตั้ง Worker
├── .env.example            ตัวอย่างค่าตั้งเว็บไซต์
├── requirements.txt        จุดเริ่มติดตั้ง Python จาก root
├── package.json            คำสั่งและ dependency ของเว็บไซต์
└── package-lock.json       เวอร์ชัน dependency ฝั่ง npm
```

## แก้ปัญหาที่พบบ่อย

| อาการ | สิ่งที่ตรวจ |
| --- | --- |
| ติดต่อ Python Worker ไม่ได้ | เปิดหน้าต่าง Worker ตรวจพอร์ต 8787 และ `CRAWLER_API_URL` |
| Worker ตอบ 401 | `CRAWLER_API_KEY` สองไฟล์ต้องตรงกัน แล้วรีสตาร์ตทั้งสองส่วน |
| พอร์ตถูกใช้แล้ว / WinError 10048 | ตรวจหน้าต่างเดิมก่อน อย่าเปิด Worker ซ้ำ ถ้าเปลี่ยนพอร์ตต้องแก้ URL ใน `.env.local` ด้วย |
| ModuleNotFoundError | ติดตั้ง requirements ด้วย Python ใน `worker/.venv` และใช้ตัวเดียวกันเปิด Uvicorn |
| ไม่พบ Edge เมื่ออ่าน JavaScript | ติดตั้ง Microsoft Edge โหมดนี้เรียก `msedge` โดยเฉพาะ |
| Email not confirmed | ยืนยันอีเมลของบัญชีใน Supabase Auth ก่อน |
| Invalid login credentials | ตรวจอีเมล รหัสผ่าน และว่า env ชี้ Supabase project ที่สมัครไว้ |
| บันทึกข้อมูลไม่ได้ | ตรวจ schema/RLS สิทธิ์บัญชี และ Secret key ฝั่งเซิร์ฟเวอร์/Worker |
| AI ตอบ 429 | ตรวจโควตาหรือความถี่ของผู้ให้บริการ การสร้าง key ใหม่ไม่ได้รับประกันโควตาใหม่ |
| AI ตอบ 401/403 หรือ 404 | ตรวจ key, Model ID และสิทธิ์ของบัญชี อ่าน Terminal พร้อมรหัสตรวจสอบ |
| Turbopack/SWC ใช้งานไม่ได้ | `npm run dev` ตั้ง Webpack ไว้แล้ว ให้ใช้คำสั่งนี้ |
| Node ขึ้น EBADENGINE | ตรวจ Node ให้ตรงกับข้อกำหนด dependency อย่าแก้ด้วย `npm audit fix --force` ทันที |

## คำสั่งตรวจโค้ดและ Build

คำสั่งเหล่านี้สำหรับผู้พัฒนาสั่งเอง แยกจากขั้นตอนเปิดใช้งาน:

```powershell
npm run lint
npx tsc --noEmit --incremental false
```

หากต้องลอง production build บนเครื่อง Windows ที่ใช้ SWC แบบ WASM ให้สั่ง Webpack โดยตรง (คำสั่ง `npm run build` ปัจจุบันยังเป็น `next build`):

```powershell
npx next build --webpack
npm run start
```

ต้อง build สำเร็จก่อน start และหยุด dev server ที่ใช้พอร์ตเดียวกันก่อน การมีคำสั่งนี้ในคู่มือไม่ได้หมายความว่า production build ได้รับการทดสอบผ่านแล้ว

## ก่อน push เข้า GitHub และก่อนเปิดบริการ

- Commit `README.md`, ไฟล์ requirements ทั้งสองไฟล์, `.env.example` ทั้งสองไฟล์ และ `package-lock.json`
- อย่า commit `.env.local`, `worker/.env`, API key, `node_modules`, `.next`, `worker/.venv` หรือข้อมูลลูกค้าจริง `.gitignore` ช่วยกันไฟล์ที่ยังไม่ถูกติดตาม แต่ไม่ได้ถอน secret ที่เคย commit ไปแล้ว
- ใช้ branch ของงานแล้วเปิด Pull Request ตามกระบวนการของทีม
- ตรวจระบบจริงเรื่องสิทธิ์ข้ามบัญชี การจำกัดการใช้ AI/ค่าใช้จ่าย คิวงาน และการติดตั้งก่อนเปิดบริการสาธารณะ
- `127.0.0.1` หมายถึงเครื่องหรือ container ที่รัน Next.js เมื่อย้ายขึ้นเซิร์ฟเวอร์ ต้องวาง Worker ให้เข้าถึงกันได้และตั้ง URL ใหม่ ไม่สามารถเรียก Worker บนเครื่องผู้พัฒนาจากโฮสต์ออนไลน์ด้วย URL เดิมได้
- Worker ปัจจุบันผูกกับ localhost อย่าเปิดออกอินเทอร์เน็ตโดยตรงโดยไม่มีระบบรักษาความปลอดภัยเพิ่มเติม
- เพื่อความสะด้วยในการทำงานเป็นทีมให้เพื่อน ๆ สามารถแจ้ง role และงานที่ทำในแต่ละ sprint ได้ใน https://seo-team-board.seo-team-anchisa-2026.workers.dev/?team=5bd8ca66-a835-4dc8-80fc-a4e08f871c2e

