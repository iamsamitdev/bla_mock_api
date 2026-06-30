// Mock REST API (Express + PostgreSQL) สำหรับ BLA Policy Companion
// รองรับ CRUD จริงบนฐานข้อมูล PostgreSQL — ทดสอบ เพิ่ม/ลบ/แก้ไข ได้
//
// ทุก route อยู่ใต้ prefix /v1 ให้ตรงกับ baseUrl ฝั่งแอป:
//   https://<host>/v1
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { query } from './db.js'

const app = express()
app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

const router = express.Router()

// ---------- helper ----------
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next)

// จำนวนแถวที่ถูกกระทบ — รองรับทั้ง node-postgres (rowCount) และ PGlite (affectedRows)
const affected = (r) => r.rowCount ?? r.affectedRows ?? 0

// ตรวจ Bearer token แบบเบา ๆ (ไว้สาธิต 401 / AuthInterceptor)
// - ไม่มี token  → 401 (ใช้สาธิตการดักจับ 401 ในแอป)
// - มี token ใด ๆ ที่ไม่ว่าง → ผ่าน
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) {
    return res.status(401).json({ message: 'ไม่ได้รับอนุญาต (ต้องมี token)' })
  }
  next()
}

// ---------- Health ----------
router.get('/', (_req, res) =>
  res.json({ name: 'BLA Mock API', status: 'ok', time: new Date().toISOString() }),
)

// ---------- Auth ----------
// POST /v1/auth/login → { token, user }
router.post(
  '/auth/login',
  wrap(async (req, res) => {
    const { username, password } = req.body ?? {}
    const { rows } = await query(
      `SELECT token,
              user_id      AS id,
              display_name AS "displayName",
              role
         FROM users
        WHERE username = $1 AND password = $2`,
      [username, password],
    )
    if (rows.length === 0) {
      return res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' })
    }
    const { token, id, displayName, role } = rows[0]
    res.json({ token, user: { id, displayName, role } })
  }),
)

// GET /v1/auth/me → คืนข้อมูลผู้ใช้จาก Bearer token (กู้ session ตอนเปิดแอป)
router.get(
  '/auth/me',
  requireAuth,
  wrap(async (req, res) => {
    const token = req.headers.authorization.slice(7).trim()
    const { rows } = await query(
      `SELECT user_id AS id, display_name AS "displayName", role
         FROM users WHERE token = $1`,
      [token],
    )
    if (rows.length === 0)
      return res.status(401).json({ message: 'token ไม่ถูกต้อง' })
    res.json(rows[0])
  }),
)

// ---------- Policies (CRUD) ----------
const policySelect = `
  SELECT id,
         plan_name      AS "planName",
         policy_number  AS "policyNumber",
         premium::float8 AS premium,
         status
    FROM policies`

// GET /v1/policies  (?status=active|lapsed|pending)
router.get(
  '/policies',
  requireAuth,
  wrap(async (req, res) => {
    const { status } = req.query
    if (status) {
      const { rows } = await query(`${policySelect} WHERE status = $1 ORDER BY id`, [
        status,
      ])
      return res.json(rows)
    }
    const { rows } = await query(`${policySelect} ORDER BY id`)
    res.json(rows)
  }),
)

// GET /v1/policies/:id
router.get(
  '/policies/:id',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query(`${policySelect} WHERE id = $1`, [req.params.id])
    if (rows.length === 0)
      return res.status(404).json({ message: 'ไม่พบกรมธรรม์' })
    res.json(rows[0])
  }),
)

// POST /v1/policies  → สร้างใหม่
router.post(
  '/policies',
  requireAuth,
  wrap(async (req, res) => {
    const { id, planName, policyNumber, premium, status } = req.body ?? {}
    if (!id || !planName || !policyNumber || premium == null || !status) {
      return res.status(400).json({ message: 'ข้อมูลไม่ครบ' })
    }
    const { rows } = await query(
      `INSERT INTO policies (id, plan_name, policy_number, premium, status)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id,
                 plan_name      AS "planName",
                 policy_number  AS "policyNumber",
                 premium::float8 AS premium,
                 status`,
      [id, planName, policyNumber, premium, status],
    )
    res.status(201).json(rows[0])
  }),
)

// PUT /v1/policies/:id  → แก้ไข
router.put(
  '/policies/:id',
  requireAuth,
  wrap(async (req, res) => {
    const { planName, policyNumber, premium, status } = req.body ?? {}
    const { rows } = await query(
      `UPDATE policies SET
         plan_name     = COALESCE($2, plan_name),
         policy_number = COALESCE($3, policy_number),
         premium       = COALESCE($4, premium),
         status        = COALESCE($5, status)
       WHERE id = $1
       RETURNING id,
                 plan_name      AS "planName",
                 policy_number  AS "policyNumber",
                 premium::float8 AS premium,
                 status`,
      [req.params.id, planName, policyNumber, premium, status],
    )
    if (rows.length === 0)
      return res.status(404).json({ message: 'ไม่พบกรมธรรม์' })
    res.json(rows[0])
  }),
)

// DELETE /v1/policies/:id
router.delete(
  '/policies/:id',
  requireAuth,
  wrap(async (req, res) => {
    const result = await query(`DELETE FROM policies WHERE id = $1`, [
      req.params.id,
    ])
    if (affected(result) === 0)
      return res.status(404).json({ message: 'ไม่พบกรมธรรม์' })
    res.status(204).end()
  }),
)

// ---------- Claims ----------
const claimSelect = `
  SELECT claim_ref      AS "claimRef",
         policy_number  AS "policyNumber",
         amount::float8 AS amount,
         status,
         submitted_at   AS "submittedAt"
    FROM claims`

// GET /v1/claims  → ประวัติสินไหมทั้งหมด (ใหม่สุดก่อน)
router.get(
  '/claims',
  requireAuth,
  wrap(async (_req, res) => {
    const { rows } = await query(`${claimSelect} ORDER BY submitted_at DESC`)
    res.json(rows)
  }),
)

// GET /v1/policies/:id/claims  → สินไหมของกรมธรรม์นั้น
router.get(
  '/policies/:id/claims',
  requireAuth,
  wrap(async (req, res) => {
    const pol = await query(`SELECT policy_number FROM policies WHERE id = $1`, [
      req.params.id,
    ])
    if (pol.rows.length === 0)
      return res.status(404).json({ message: 'ไม่พบกรมธรรม์' })
    const { rows } = await query(
      `${claimSelect} WHERE policy_number = $1 ORDER BY submitted_at DESC`,
      [pol.rows[0].policy_number],
    )
    res.json(rows)
  }),
)

// POST /v1/policies/:id/claims  → ยื่นคำขอสินไหม (Mutation) → { claimRef }
router.post(
  '/policies/:id/claims',
  requireAuth,
  wrap(async (req, res) => {
    const { amount, reason } = req.body ?? {}
    if (amount == null || Number(amount) <= 0) {
      return res.status(400).json({ message: 'จำนวนเงินต้องมากกว่า 0' })
    }
    const pol = await query(`SELECT policy_number FROM policies WHERE id = $1`, [
      req.params.id,
    ])
    if (pol.rows.length === 0)
      return res.status(404).json({ message: 'ไม่พบกรมธรรม์' })

    const claimRef = `CLM-${Date.now() % 1000000}`
    await query(
      `INSERT INTO claims (claim_ref, policy_number, amount, status, submitted_at)
       VALUES ($1,$2,$3,'submitted', now())`,
      [claimRef, pol.rows[0].policy_number, amount],
    )
    res.status(201).json({ claimRef, reason: reason ?? null })
  }),
)

// PATCH /v1/claims/:ref  → อัปเดตสถานะสินไหม
router.patch(
  '/claims/:ref',
  requireAuth,
  wrap(async (req, res) => {
    const { status } = req.body ?? {}
    const { rows } = await query(
      `UPDATE claims SET status = COALESCE($2, status)
       WHERE claim_ref = $1
       RETURNING claim_ref      AS "claimRef",
                 policy_number  AS "policyNumber",
                 amount::float8 AS amount,
                 status,
                 submitted_at   AS "submittedAt"`,
      [req.params.ref, status],
    )
    if (rows.length === 0)
      return res.status(404).json({ message: 'ไม่พบคำขอสินไหม' })
    res.json(rows[0])
  }),
)

// DELETE /v1/claims/:ref
router.delete(
  '/claims/:ref',
  requireAuth,
  wrap(async (req, res) => {
    const result = await query(`DELETE FROM claims WHERE claim_ref = $1`, [
      req.params.ref,
    ])
    if (affected(result) === 0)
      return res.status(404).json({ message: 'ไม่พบคำขอสินไหม' })
    res.status(204).end()
  }),
)

// ---------- Payments (Pagination) ----------
// GET /v1/payments?page=1&limit=20  → แบ่งหน้า (สาธิต Infinite Scroll)
router.get(
  '/payments',
  requireAuth,
  wrap(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '20', 10) || 20))
    const offset = (page - 1) * limit
    const { rows } = await query(
      `SELECT id, title, amount::float8 AS amount, paid_at AS "paidAt"
         FROM payments
        ORDER BY paid_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    res.json(rows)
  }),
)

// POST /v1/payments  → สร้างรายการชำระเบี้ย
router.post(
  '/payments',
  requireAuth,
  wrap(async (req, res) => {
    const { id, title, amount, paidAt } = req.body ?? {}
    if (!id || !title || amount == null) {
      return res.status(400).json({ message: 'ข้อมูลไม่ครบ' })
    }
    const { rows } = await query(
      `INSERT INTO payments (id, title, amount, paid_at)
       VALUES ($1,$2,$3, COALESCE($4, now()))
       RETURNING id, title, amount::float8 AS amount, paid_at AS "paidAt"`,
      [id, title, amount, paidAt ?? null],
    )
    res.status(201).json(rows[0])
  }),
)

// DELETE /v1/payments/:id
router.delete(
  '/payments/:id',
  requireAuth,
  wrap(async (req, res) => {
    const result = await query(`DELETE FROM payments WHERE id = $1`, [
      req.params.id,
    ])
    if (affected(result) === 0)
      return res.status(404).json({ message: 'ไม่พบรายการชำระ' })
    res.status(204).end()
  }),
)

app.use('/v1', router)

// 404
app.use((_req, res) => res.status(404).json({ message: 'ไม่พบ endpoint นี้' }))

// error handler รวมศูนย์
app.use((err, _req, res, _next) => {
  console.error(err)
  // กัน id ซ้ำ (unique violation)
  if (err.code === '23505') {
    return res.status(409).json({ message: 'ข้อมูลซ้ำ (id/policyNumber มีอยู่แล้ว)' })
  }
  res.status(500).json({ message: 'เซิร์ฟเวอร์ผิดพลาด', detail: err.message })
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`🚀 BLA Mock API ทำงานที่ http://localhost:${port}/v1`)
})
