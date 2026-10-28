---
name: ITP — demo dataset schemas
trigger: When an Internal Tools Platform app uses the kyc_cases, refunds, customers, or feature_flags datasets
---
All data is fake demo data. Primary keys in parentheses. The build request also includes the exact columns and sample rows; that is authoritative if it differs from this note.

- `kyc_cases` (case_id): KYC review queue — customer_id, customer_name, country, risk_score (0–100), status (pending | in_review | approved | rejected | escalated), assigned_to, submitted_at, updated_at, updated_by, notes.
- `refunds` (refund_id): customer refund requests — customer_id, customer_name, amount, currency, reason, status (requested | approved | rejected | paid), requested_at, updated_at, updated_by.
- `customers` (customer_id): name, email, country, tier, created_at.
- `feature_flags` (flag_key): description, enabled (boolean), rollout_percent (0–100), owner_team, updated_at, updated_by.

Join refunds/kyc_cases to customers on `customer_id` client-side when both are granted.
