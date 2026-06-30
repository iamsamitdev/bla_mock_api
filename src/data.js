// ข้อมูลจำลอง (seed) — ตรงกับ model ฝั่ง Flutter (Policy / ClaimRecord / Payment / AuthUser)
// key ทุกตัวเป็น camelCase ให้ตรงกับ fromJson (json_serializable ค่า default)
// หมายเหตุ: ข้อมูลทั้งหมดเป็นข้อมูลสมมติ ไม่เกี่ยวข้องกับลูกค้าจริง

// บัญชีทดสอบ (ฝั่งลูกค้า self-service): username = customer, password = 1234
export const users = [
  {
    username: 'customer',
    password: '1234',
    token: 'mock-token-abc123',
    user: {
      id: 'C001',
      displayName: 'คุณสมชาย ใจดี',
      role: 'customer',
    },
  },
]

// Policy: { id, planName, policyNumber, premium, status }
// status ∈ active | lapsed | pending  (ตรงกับ enum PolicyStatus)
export const policies = [
  {
    id: 'P001',
    planName: 'BLA ตลอดชีพ มั่นคง 99',
    policyNumber: 'BLA-2569-0001',
    premium: 24000,
    status: 'active',
  },
  {
    id: 'P002',
    planName: 'BLA สะสมทรัพย์ 10/5',
    policyNumber: 'BLA-2569-0002',
    premium: 50000,
    status: 'pending',
  },
  {
    id: 'P003',
    planName: 'BLA คุ้มครองสุขภาพ พลัส',
    policyNumber: 'BLA-2569-0003',
    premium: 18500,
    status: 'lapsed',
  },
  {
    id: 'P004',
    planName: 'BLA บำนาญมั่นคง 60',
    policyNumber: 'BLA-2569-0004',
    premium: 36000,
    status: 'active',
  },
]

// ClaimRecord: { claimRef, policyNumber, amount, status, submittedAt }
// status ∈ submitted | reviewing | approved | rejected
// submittedAt เป็น ISO-8601 string (ฝั่งแอปแปลงด้วย DateTime.parse)
const now = Date.now()
const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString()

export const claims = [
  {
    claimRef: 'CLM-100245',
    policyNumber: 'BLA-2569-0003',
    amount: 12000,
    status: 'reviewing',
    submittedAt: daysAgo(2),
  },
  {
    claimRef: 'CLM-100231',
    policyNumber: 'BLA-2569-0001',
    amount: 5400,
    status: 'approved',
    submittedAt: daysAgo(18),
  },
]

// Payment: { id, title, amount, paidAt } — สร้างทั้งหมด 87 รายการ เพื่อสาธิต Pagination / Infinite Scroll
export const PAYMENT_TOTAL = 87

export function buildPayments() {
  const list = []
  for (let index = 0; index < PAYMENT_TOTAL; index++) {
    list.push({
      id: `PMT-${String(index + 1).padStart(4, '0')}`,
      title: `ชำระเบี้ยงวดที่ ${index + 1}`,
      amount: 2000 + (index % 5) * 500,
      paidAt: daysAgo(index * 30),
    })
  }
  return list
}
