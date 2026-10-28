import fs from 'node:fs';
import path from 'node:path';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261027);
const pick = <T>(a: T[]): T => a[Math.floor(rand() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const date = (daysBack: number) => {
  const d = new Date(Date.UTC(2026, 9, 27, 12, 0, 0) - int(0, daysBack) * 86400000 - int(0, 86399) * 1000);
  return d.toISOString();
};
const first = ['Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Ethan', 'Isla', 'Leo', 'Nora', 'Kai', 'Ruby', 'Omar', 'Lina', 'Jonas', 'Mei', 'Theo', 'Sara', 'Ivan', 'Elif', 'Hugo'];
const last = ['Martin', 'Okafor', 'Chen', 'Novak', 'Silva', 'Patel', 'Bauer', 'Rossi', 'Kim', 'Dubois', 'Haddad', 'Larsen', 'Moreno', 'Tanaka', 'Walsh', 'Ibrahim'];
const countries = ['US', 'GB', 'DE', 'FR', 'NL', 'SG', 'CA', 'BR', 'IN', 'AU'];
const reviewers = ['Priya Shah', 'Lena Park', 'Daniel Ortiz', 'unassigned'];

const customers = Array.from({ length: 80 }, (_, i) => {
  const name = `${pick(first)} ${pick(last)}`;
  return {
    customer_id: `C-${1001 + i}`,
    name,
    email: `${name.toLowerCase().replace(' ', '.')}${i}@example.com`,
    country: pick(countries),
    segment: pick(['retail', 'retail', 'smb', 'enterprise']),
    created_at: date(900),
  };
});
const kyc = Array.from({ length: 120 }, (_, i) => {
  const c = pick(customers);
  const status = pick(['pending', 'pending', 'pending', 'approved', 'approved', 'rejected', 'escalated']);
  return {
    case_id: `KYC-${2001 + i}`,
    customer_id: c.customer_id,
    customer_name: c.name,
    country: c.country,
    risk_score: int(1, 100),
    document_type: pick(['passport', 'drivers_license', 'national_id', 'residence_permit']),
    status,
    assigned_to: status === 'pending' ? pick(reviewers) : pick(reviewers.slice(0, 3)),
    submitted_at: date(45),
    notes: pick(['', '', 'Document photo blurry, re-requested.', 'Address mismatch with bank statement.', 'PEP screening clear.', 'High-risk jurisdiction, manual review.']),
    updated_at: '',
    updated_by: '',
  };
});
const refunds = Array.from({ length: 150 }, (_, i) => {
  const c = pick(customers);
  const status = pick(['requested', 'requested', 'approved', 'paid', 'paid', 'denied']);
  return {
    refund_id: `RF-${3001 + i}`,
    customer_id: c.customer_id,
    customer_name: c.name,
    amount: int(500, 250000) / 100,
    currency: pick(['USD', 'USD', 'EUR', 'GBP']),
    reason: pick(['duplicate_charge', 'service_issue', 'fraud_claim', 'cancelled_order', 'goodwill']),
    status,
    requested_at: date(60),
    processed_by: status === 'requested' ? '' : pick(['Sam Okafor', 'Jules Barre', 'Ana Costa']),
    updated_at: '',
    updated_by: '',
  };
});
const flagNames = ['new_onboarding_flow', 'instant_refunds', 'kyc_auto_approve_low_risk', 'dark_mode', 'card_controls_v2', 'savings_pots', 'fx_fee_waiver', 'merchant_insights', 'open_banking_sync', 'biometric_login', 'bill_split', 'virtual_cards', 'statement_export_v2', 'chat_support_beta', 'crypto_tab', 'spend_limits', 'push_receipts', 'referral_program', 'joint_accounts', 'subscription_tracker', 'atm_locator', 'travel_mode', 'cashback_boost', 'budget_alerts', 'tax_summary'];
const flags = flagNames.map((k) => ({
  flag_key: k,
  description: `Controls the ${k.replace(/_/g, ' ')} feature.`,
  enabled: rand() > 0.4,
  rollout_percent: pick([0, 5, 10, 25, 50, 100, 100]),
  owner_team: pick(['Engineering', 'Risk', 'Support', 'Compliance']),
  updated_at: date(120),
  updated_by: pick(['Ava Chen', 'Marco Rossi', 'Lena Park']),
}));

function csv(rows: Record<string, unknown>[]): string {
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
const out = path.resolve('data');
fs.mkdirSync(out, { recursive: true });
for (const [name, rows] of Object.entries({ customers, kyc_cases: kyc, refunds, feature_flags: flags })) {
  fs.writeFileSync(path.join(out, `${name}.csv`), csv(rows));
}
process.stdout.write('generated data/*.csv\n');
