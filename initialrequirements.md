Goal: Simple rent tracker for 2 units using Google Sheets + minimal UI/Telegram. Fast, low‑maintenance, free deployment.

1. Scope
- 2 units (Ground, First Floor)
- Track: monthly rent (incl. 100 Rs late fee after 3‑day grace), annual increase (max 5% or ₹1000), UTR payment, electricity/water bills auto‑pulled from Gmail PDFs.

2. Core Requirements
Rent Logic
- Base rent per unit
- Annual increase: max(% increase, ₹1000)
- Pre‑compute monthly rent

Payment Flow
- Tenant: enter UTR to mark paid (optional remarks)
- Owner: verify & mark VFD OK (remarks optional)

Bills
- Source: Gmail (KSEB/KWA) PDFs
- Extract amount, type, month; map to unit; insert into sheets

3. Data Model (Sheets)
units: unit_id, start_date, base_rent, escalation_type, escalation_value, last_revision_date
ledger: month, unit_id, rent_due, rent_paid, paid_date, UTR, verified_by_owner, expected_rent, actual_paid
bills: month, unit_id, type, amount, due_date, source, verified

4. UX Options
Option A – Minimal Web UI
- Tenant: view pending rent/electricity/water; mark paid + UTR
- Owner: 2‑row dashboard (Unit A/B) showing Paid/Pending; click to verify
Option B – Telegram Bot (preferred)
- Commands: /status, /markpaid <unit> <UTR>, /verify <unit>

5. Automation
Rent Escalation: monthly Apps Script checks anniversary, updates rent & ledger
Gmail → Bills: label “rent-bills”; daily script parses PDFs, extracts data, inserts into bills

6. Backend
- Sheets = database
- Apps Script API: rent calc, payment updates, Gmail parsing

7. Constraints
- Only 2 tenants
- No auth, payment gateway, accounting
- Must be fast, low‑maintenance, mobile‑friendly

8. Edge Cases
- Tenant marks paid but not paid → owner verifies
- Escalation if unpaid after a week (₹100/day)
- Gmail format change → bills unverified
- Partial payment → track expected vs actual

9. Deliverables
- Validate architecture (Sheets + Apps Script + optional Telegram)
- Suggest simplifications
- Identify failure points (Gmail parsing)
- Recommend Web UI vs Telegram‑only
- Propose clean Apps Script API
- Key: answer “Did each unit pay correct rent this month?” in <5 s

Deployable free on Firebase/Cloudflare/GitHub Pages. Simplicity first.