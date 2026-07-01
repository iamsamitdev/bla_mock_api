// สคริปต์สร้างตาราง + ใส่ข้อมูลเริ่มต้น (idempotent)
//
//   pnpm migrate        → สร้างตาราง (ถ้ายังไม่มี)
//   pnpm seed           → สร้างตาราง + ใส่ข้อมูลเริ่มต้น
//   pnpm reset          → ลบตารางทั้งหมด แล้วสร้างใหม่ + ใส่ข้อมูล
import 'dotenv/config'
import { query, pool } from './db.js'
import { users, policies, claims, buildPayments } from './data.js'

const args = process.argv.slice(2)
const doReset = args.includes('--reset')
const doSeed = args.includes('--seed')

// รันทีละคำสั่ง เพื่อให้พกพาได้ทั้ง pg และ PGlite
const DROP_STATEMENTS = [
  'DROP TABLE IF EXISTS claims CASCADE',
  'DROP TABLE IF EXISTS payments CASCADE',
  'DROP TABLE IF EXISTS policies CASCADE',
  'DROP TABLE IF EXISTS users CASCADE',
]

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
      username     TEXT PRIMARY KEY,
      password     TEXT NOT NULL,
      token        TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role         TEXT NOT NULL,
      phone        TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS policies (
      id            TEXT PRIMARY KEY,
      plan_name     TEXT NOT NULL,
      policy_number TEXT NOT NULL UNIQUE,
      premium       NUMERIC NOT NULL,
      status        TEXT NOT NULL CHECK (status IN ('active','lapsed','pending'))
   )`,
  `CREATE TABLE IF NOT EXISTS claims (
      claim_ref     TEXT PRIMARY KEY,
      policy_number TEXT NOT NULL,
      amount        NUMERIC NOT NULL,
      status        TEXT NOT NULL CHECK (status IN ('submitted','reviewing','approved','rejected')),
      submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS payments (
      id      TEXT PRIMARY KEY,
      title   TEXT NOT NULL,
      amount  NUMERIC NOT NULL,
      paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
]

// เผื่อกรณีตาราง users ถูกสร้างไว้ก่อนหน้านี้โดยไม่มีคอลัมน์ phone
// (CREATE TABLE IF NOT EXISTS จะไม่เพิ่มคอลัมน์ให้ตารางที่มีอยู่แล้ว)
const ALTER_STATEMENTS = [
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT',
]

async function seed() {
  for (const u of users) {
    await query(
      `INSERT INTO users (username, password, token, user_id, display_name, role, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (username) DO UPDATE
         SET password = EXCLUDED.password, token = EXCLUDED.token,
             user_id = EXCLUDED.user_id, display_name = EXCLUDED.display_name,
             role = EXCLUDED.role, phone = EXCLUDED.phone`,
      [u.username, u.password, u.token, u.user.id, u.user.displayName, u.user.role, u.user.phone ?? null],
    )
  }

  for (const p of policies) {
    await query(
      `INSERT INTO policies (id, plan_name, policy_number, premium, status)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE
         SET plan_name = EXCLUDED.plan_name, policy_number = EXCLUDED.policy_number,
             premium = EXCLUDED.premium, status = EXCLUDED.status`,
      [p.id, p.planName, p.policyNumber, p.premium, p.status],
    )
  }

  for (const c of claims) {
    await query(
      `INSERT INTO claims (claim_ref, policy_number, amount, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (claim_ref) DO NOTHING`,
      [c.claimRef, c.policyNumber, c.amount, c.status, c.submittedAt],
    )
  }

  for (const pay of buildPayments()) {
    await query(
      `INSERT INTO payments (id, title, amount, paid_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO NOTHING`,
      [pay.id, pay.title, pay.amount, pay.paidAt],
    )
  }
  console.log('🌱 ใส่ข้อมูลเริ่มต้นเรียบร้อย')
}

async function main() {
  if (doReset) {
    for (const sql of DROP_STATEMENTS) await query(sql)
    console.log('🗑️  ลบตารางเดิมแล้ว')
  }
  for (const sql of CREATE_STATEMENTS) await query(sql)
  console.log('✅ สร้างตารางเรียบร้อย')
  for (const sql of ALTER_STATEMENTS) await query(sql)
  console.log('✅ ปรับโครงสร้างตารางเรียบร้อย')
  if (doSeed) await seed()
  await pool.end()
  console.log('🎉 เสร็จสิ้น')
}

main().catch((err) => {
  console.error('❌ migration ล้มเหลว:', err)
  process.exit(1)
})
