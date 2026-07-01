# BLA Mock API (Express + PostgreSQL)

Mock REST API สำหรับ Workshop **Advanced Flutter 2026 — BLA Policy Companion** ใช้ในวันที่ 2
(Advanced API Integration) เพื่อให้แอป Flutter ดึงข้อมูลผ่าน **Dio** จาก endpoint จริง
และทดสอบ **เพิ่ม / ลบ / แก้ไข (CRUD)** บนฐานข้อมูล **PostgreSQL** ได้จริง

> ข้อมูลทั้งหมดเป็นข้อมูลสมมติ ไม่เกี่ยวข้องกับลูกค้าจริง

---

## โครงสร้างโปรเจกต์

```
bla_mock_api/
├── src/
│   ├── server.js     # Express app + ทุก endpoint (CRUD)
│   ├── db.js         # การเชื่อมต่อ PostgreSQL (pg) — รองรับโหมดทดสอบ PGlite
│   ├── migrate.js    # สร้างตาราง + ใส่ข้อมูลเริ่มต้น (seed)
│   └── data.js       # ข้อมูลตั้งต้น ตรงกับ model ฝั่งแอป
├── package.json      # ใช้ pnpm + Express + pg
├── docker-compose.yml# PostgreSQL สำหรับรันในเครื่อง (ทางเลือก)
├── render.yaml       # Blueprint deploy ขึ้น Render (Web + DB)
├── .env.example
└── README.md
```

---

## ตารางข้อมูล (ตรงกับ model ฝั่ง Flutter)

| ตาราง | คอลัมน์ (API ส่งกลับเป็น camelCase) |
|-------|------------------------------------|
| `users`    | username, password, token, user(id, displayName, role) |
| `policies` | id, planName, policyNumber, premium, status (active/lapsed/pending) |
| `claims`   | claimRef, policyNumber, amount, status (submitted/reviewing/approved/rejected), submittedAt |
| `payments` | id, title, amount, paidAt (87 รายการ สาธิต Pagination) |

บัญชีทดสอบ: **username = `customer` / password = `1234`** → token = `mock-token-abc123`

---

## รายการ Endpoint (prefix `/v1`)

| Method | Path | คำอธิบาย |
|--------|------|----------|
| POST   | `/v1/auth/login` | เข้าสู่ระบบ → `{ token, user }` |
| POST   | `/v1/auth/register` | สมัครสมาชิก (email = username) → `{ token, user }` |
| POST   | `/v1/auth/forgot-password` | ขอลิงก์รีเซ็ตรหัสผ่าน (จำลอง) → `{ message }` |
| POST   | `/v1/auth/reset-password` | ตั้งรหัสผ่านใหม่ (อ้างอิงด้วย email) → `{ message }` |
| GET    | `/v1/policies` | รายการกรมธรรม์ (รองรับ `?status=active`) |
| GET    | `/v1/policies/:id` | กรมธรรม์รายตัว |
| POST   | `/v1/policies` | เพิ่มกรมธรรม์ |
| PUT    | `/v1/policies/:id` | แก้ไขกรมธรรม์ |
| DELETE | `/v1/policies/:id` | ลบกรมธรรม์ |
| GET    | `/v1/claims` | ประวัติสินไหมทั้งหมด |
| GET    | `/v1/policies/:id/claims` | สินไหมของกรมธรรม์นั้น |
| POST   | `/v1/policies/:id/claims` | ยื่นคำขอสินไหม (Mutation) → `{ claimRef }` |
| PATCH  | `/v1/claims/:ref` | อัปเดตสถานะสินไหม |
| DELETE | `/v1/claims/:ref` | ลบคำขอสินไหม |
| GET    | `/v1/payments?page=&limit=` | ประวัติชำระเบี้ยแบบแบ่งหน้า |
| POST   | `/v1/payments` | เพิ่มรายการชำระ |
| DELETE | `/v1/payments/:id` | ลบรายการชำระ |

> ทุก endpoint (ยกเว้น `/v1/auth/login` และ health `/v1/`) ต้องแนบ
> `Authorization: Bearer <token>` — ถ้าไม่มีจะได้ **401** (ไว้สาธิต AuthInterceptor ในแอป)

---

## วิธีรันในเครื่อง (Local)

### 1) เตรียม PostgreSQL
ทางเลือก A — ใช้ Docker (ง่ายสุด):
```bash
docker compose up -d
```
ทางเลือก B — ใช้ PostgreSQL ที่ติดตั้งไว้เอง แล้วสร้างฐานข้อมูล `bla_policy`

### 2) ตั้งค่า environment
```bash
cp .env.example .env
# แก้ DATABASE_URL ให้ตรงกับ DB ของคุณ
```

### 3) ติดตั้ง dependency + สร้างตาราง + ใส่ข้อมูล
```bash
pnpm install
pnpm reset        # สร้างตารางใหม่ + ใส่ข้อมูลเริ่มต้น
```

### 4) สตาร์ทเซิร์ฟเวอร์
```bash
pnpm start        # หรือ pnpm dev (auto-reload)
# → http://localhost:3000/v1
```

### ทดสอบเร็ว ๆ
```bash
# login
# Mac / Linux
curl -X POST http://localhost:3000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"customer","password":"1234"}'

# Windows (PowerShell)
Invoke-RestMethod -Uri http://localhost:3000/v1/auth/login -Method Post `
  -ContentType 'application/json' `
  -Body '{"username":"customer","password":"1234"}'

# ดึงกรมธรรม์
# Mac / Linux
curl http://localhost:3000/v1/policies \
  -H 'Authorization: Bearer mock-token-abc123'

# Windows (PowerShell)
Invoke-RestMethod -Uri http://localhost:3000/v1/policies -Method Get `
  -Headers @{ Authorization = 'Bearer mock-token-abc123' }
```

---

## Deploy ขึ้น Render (Hosted)

1. push โปรเจกต์นี้ขึ้น GitHub
2. ที่ Render เลือก **New + → Blueprint** แล้วชี้มาที่ repo (มี `render.yaml` ให้แล้ว)
   - สร้าง PostgreSQL (`bla-policy-db`) + Web Service (`bla-mock-api`) อัตโนมัติ
   - ต่อ `DATABASE_URL` ให้เอง และตั้ง `PGSSL=true`
   - build จะรัน `pnpm migrate -- --seed` ใส่ข้อมูลเริ่มต้นให้
3. หลัง deploy จะได้ URL เช่น `https://bla-mock-api.onrender.com`
   → baseUrl ที่ใช้ในแอปคือ `https://bla-mock-api.onrender.com/v1`

> หมายเหตุ: Render free tier มี cold start (เครื่องหลับเมื่อไม่มีคนเรียก ~15 นาที)
> คำขอแรกหลังหลับอาจช้า 30–60 วิ ถือเป็นโอกาสสาธิต Loading/Timeout/Error State ในแอปได้พอดี

---

## การเชื่อมต่อจากฝั่ง Flutter (Day 2)

แก้ `baseUrl` ใน `lib/core/network/dio_client.dart`:

```dart
// เดิม (โดเมนตัวอย่าง ไม่มีอยู่จริง)
baseUrl: 'https://api.bla-demo.example.com/v1',

// เปลี่ยนเป็น URL จริงจาก Render
baseUrl: 'https://bla-mock-api.onrender.com/v1',
```

ถ้ารัน API ในเครื่อง (localhost) ให้ใช้ค่า baseUrl ตามอุปกรณ์:

| รันแอปบน | baseUrl |
|----------|---------|
| Android Emulator | `http://10.0.2.2:3000/v1` |
| iOS Simulator / Web / Desktop | `http://localhost:3000/v1` |
| มือถือจริง (เครือข่ายเดียวกัน) | `http://<IP เครื่อง>:3000/v1` |

> ระหว่างทดสอบ HTTP (ไม่ใช่ HTTPS) บน Android ต้องเปิด `usesCleartextTraffic`
> และฝั่ง Day 3 ที่เปิด SSL Pinning ให้ปิด/ปรับ pin ตอนต่อ localhost
