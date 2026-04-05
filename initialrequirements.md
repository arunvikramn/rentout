Goal: Ultra-simple tenant rent tracking system for 2 units using Google Sheets backend + minimal UI (or Telegram bot). No heavy features.
1. Scope
* Only 2 units (renamable: Ground / First Floor)
* Track:
   * Monthly rent (x as per agreement) (late fee - create a rule - 100Rs every 1day after 3 days)
   * Annual rent increase (rule-based) editable - 5% hike minimum say 1000
   * Tenant payment marking (UTR)
   * Electricity + water bills (auto-pulled from Gmail store in specific google drive share link with tenant) google script for pulling KWA/KSEB standard format pdf bills 
* Tenants pay:
   * Rent → to owner
   * Bills → directly (only shown for reference)
2. Core Requirements
Rent Logic
* Base rent per unit
* Annual increase from start_date:
   * Rule: max(% increase, flat minimum ₹1000)
   * Example: 5% OR ₹1000 whichever higher
* Rent should be precomputed monthly (not dynamic on UI load)
Payment Flow
* Tenant:
* Enters UTR (mandatory)/ Marks rent as paid (only if UTR entered) / Remarks (optional)
* Owner:
   * Verifies payment (final authority) / Marks Vfd OK / Remarks (optional)
Bills
* Source: Gmail (KSEB + KWA)
* Format stable
* Auto-extract:
   * amount
   * bill type
   * month
* Map to unit (consumer number is fixed)
* Insert into sheet
3. Data Model (Google Sheets)
units
* unit_id (ground/upstairs)
* start_date
* base_rent
* escalation_type (% / flat)
* escalation_value
* last_revision_date
ledger (main table)
* month (YYYY-MM)
* unit_id
* rent_due
* rent_paid (yes/no)
* paid_date
* UTR
* verified_by_owner (yes/no)
* expected_rent
* actual_paid
bills
* month
* unit_id
* type (electricity/water)
* amount
* due_date
* source
* verified (yes/no)
4. UX Options (choose one)
Option A - Minimal Web UI
Tenant:
* View: (highlight pending)
   * Rent
   * Electricity - mark paid 
   * Water - mark paid 
* Action:
   * Rent Mark paid + enter UTR 
History not available. Only pending view
Owner:
* 2-row dashboard (Unit A/B)
* Status: Paid / Pending
* Click → verify payment
Option B - Telegram Bot (preferred for simplicity)
Commands:
* /status
* /markpaid <unit> <UTR>
* /verify <unit>
5. Automation
Rent Escalation
* Monthly Apps Script:
   * If anniversary reached:
      * Update rent
      * Write to ledger
Gmail → Bills
* Gmail label: rent-bills
* Apps Script trigger (daily):
   * Parse emails
   * Extract amount/type/date
   * Map to unit
   * Insert into bills
6. Backend
* Google Sheets = database
* Google Apps Script:
   * Acts as API
   * Handles:
      * rent calculation
      * payment updates
      * Gmail parsing
7. Constraints
* Only 2 tenants (no scaling needed)
* No login/auth system
* No payment gateway
* No accounting features
* Must be:
   * fast
   * low-maintenance
   * mobile-friendly
8. Edge Cases
* Tenant marks paid but didn’t actually pay → owner verifies
* Rent escalation if not paid in a week (monthly after commencement) - payable same on bill 100/day 
* Gmail format change → bills marked unverified
* Partial payment → tracked via expected vs actual
9. Deliverables Expected
Claude should:
1. Validate architecture (Sheets + Apps Script + optional Telegram)
2. Suggest simplifications if overbuilt
3. Identify failure points (especially Gmail parsing)
4. Recommend best approach between Web UI vs Telegram-only
5. Propose clean API structure (Apps Script endpoints)
10. Key Principle
System must answer in <5 sec: → “Did each unit pay correct rent this month?”
Everything else is secondary. should be deployable in firebase/or cloudflare/gitthub totally free  - brainstorm no code yet. simplicity one time setup  and headche free maintanance - find any overlooked cases. googlesheets will function as the main accouting dashboard