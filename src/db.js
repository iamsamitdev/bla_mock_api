// ชั้นเชื่อมต่อฐานข้อมูล
// - ปกติ: PostgreSQL ผ่าน node-postgres (pg)
// - โหมดทดสอบ: ตั้ง USE_PGLITE=1 เพื่อใช้ PGlite (PostgreSQL ใน WASM) โดยไม่ต้องมีเซิร์ฟเวอร์
import 'dotenv/config'

let query
let pool

if (process.env.USE_PGLITE === '1') {
  // ใช้สำหรับทดสอบ/เดโมเท่านั้น (ต้องติดตั้ง @electric-sql/pglite แยก)
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite(process.env.PGLITE_DIR || undefined) // ไม่ระบุ = in-memory
  query = (text, params) => db.query(text, params)
  pool = { end: async () => db.close?.() }
} else {
  const pg = (await import('pg')).default
  const { Pool } = pg

  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/bla_policy'

  // Render / Cloud Postgres มักบังคับ SSL — ตั้ง PGSSL=true ใน environment
  const useSsl = String(process.env.PGSSL).toLowerCase() === 'true'

  const _pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  })
  query = (text, params) => _pool.query(text, params)
  pool = _pool
}

export { query, pool }
