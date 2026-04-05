# Rent Tracker — Setup Guide
## Total time: ~45 minutes, one-time

---

## STEP 1 — Google Sheet Setup (5 min)

1. Go to https://sheets.google.com → **Blank spreadsheet**
2. Rename it: `Rent Tracker`
3. Copy the Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/` **`THIS_PART`** `/edit`
   Save it — you'll need it in Step 2.

### Tabs will be auto-created by the script (Step 2).
### After the script runs, fill in the `units` tab:

| unit_id | unit_name    | start_date | base_rent | escalation_pct | escalation_min_flat | last_revision_date |
|---------|--------------|------------|-----------|---------------|---------------------|--------------------|
| ground  | Ground Floor | 2024-06-01 | 8000      | 5             | 1000                | 2024-06-01         |
| first   | First Floor  | 2024-06-01 | 9000      | 5             | 1000                | 2024-06-01         |

- **start_date**: when the tenant moved in (YYYY-MM-DD)
- **base_rent**: current monthly rent in ₹
- **escalation_pct**: 5 means 5% annual hike
- **escalation_min_flat**: minimum hike amount ₹ (1000 = ₹1000 minimum)

---

## STEP 2 — Apps Script Setup (15 min)

1. In your Google Sheet: **Extensions → Apps Script**
2. Delete all default content in `Code.gs`
3. Paste the entire content of `config.gs`
4. Edit the **CONFIG** section at the top:
   ```js
   UNITS: {
     ground: { consumerKSEB: 'YOUR_KSEB_NO_GROUND', consumerKWA: 'YOUR_KWA_NO_GROUND' },
     first:  { consumerKSEB: 'YOUR_KSEB_NO_FIRST',  consumerKWA: 'YOUR_KWA_NO_FIRST'  }
   }
   ```
   Consumer numbers are on your KSEB/KWA bills.

5. **Save** (Ctrl+S)

### Run Setup:
6. In the function dropdown (top bar), select **`setupSheets`** → click **▶ Run**
   - First run asks for permissions → click **Review permissions → Allow**
   - You'll see: `✅ Setup complete!`

7. Select **`setupTriggers`** → click **▶ Run**
   - This sets nightly late fee + monthly escalation + daily bill parser

### Deploy as Web App:
8. Click **Deploy → New deployment**
9. Click the gear icon ⚙ next to "Select type" → choose **Web app**
10. Settings:
    - Description: `Rent Tracker API`
    - Execute as: **Me**
    - Who has access: **Anyone**
11. Click **Deploy**
12. **Copy the Web App URL** — looks like:
    `https://script.google.com/macros/s/XXXXXXXXXX/exec`
    Save this.

---

## STEP 3 — Gmail Label Setup (5 min)

1. In Gmail, click **Create new label** (left sidebar)
2. Name it exactly: `rent-bills`
3. Create a filter:
   - **From:** `*@kseb.in OR *@kwa.kerala.gov.in`  
     *(check your actual bill sender addresses first)*
   - **Action:** Apply label `rent-bills`, Skip inbox (optional)

> ⚠️ **If KSEB/KWA emails have PDFs with scanned images** (not text), auto-parse won't work.
> The bill will be added with `needs_review = yes` and you'll see a warning in the tenant UI.
> In that case: manually open the sheet's `bills` tab and enter the amount.

---

## STEP 4 — Tenant UI Deployment on GitHub Pages (15 min)

### One-time GitHub setup:
1. Create a free account at https://github.com if you don't have one
2. Click **New repository**:
   - Name: `rent-portal` (or anything)
   - Visibility: **Private** (recommended)
   - Initialize with README: yes
3. Click **Create repository**

### Upload files:
4. Click **Add file → Upload files**
5. Upload everything in the `tenant-ui/` folder:
   - `index.html`
6. Also upload `.github/workflows/deploy.yml`
   (create folders by typing the path in the filename field)
7. Commit changes

### Enable Pages:
8. Go to **Settings → Pages**
9. Source: **GitHub Actions**
10. The workflow runs automatically — your URL will be:
    `https://YOUR-USERNAME.github.io/rent-portal/`

### Connect to your Apps Script:
11. Edit `index.html` in GitHub (click the file → pencil icon)
12. Find this line near the bottom:
    ```js
    const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
    ```
13. Replace with your Web App URL from Step 2
14. Commit → Pages rebuilds in ~1 minute

---

## STEP 5 — Share with Tenants (2 min)

Send each tenant their link:
- **Ground floor:** `https://YOUR-USERNAME.github.io/rent-portal/?unit=ground`
- **First floor:**  `https://YOUR-USERNAME.github.io/rent-portal/?unit=first`

They bookmark it. That's their entire interface.

---

## OWNER WORKFLOW (daily/monthly)

**Your main tool is the Google Sheet directly.**

The `ledger` tab shows every month's rent status for both units.
Quick answer to "did they pay?" → look at columns `rent_paid` and `verified_by_owner`.

**To verify a payment:**
Open the `ledger` tab → find the row → set `verified_by_owner` to `yes`.
Or run this from Apps Script console:
```
verifyPayment('ground', '2025-06')
```

**To reject (tenant entered wrong UTR, resolve offline, then):**
In the sheet: clear `utr`, set `rent_paid = no`, add note in `owner_remarks`.
Tenant sees "Unpaid" again + your note. They re-enter once resolved.

---

## LATE FEE RULES

- Rent is due on the 1st of each month
- Grace period: **3 days** (configurable in CONFIG)
- After grace: **₹100/day** until paid
- Late fee is **computed nightly** at 11pm by the Apps Script trigger
- Shows up in tenant UI and in the `late_fee` column in ledger

---

## RENT ESCALATION RULES

Runs on the **1st of every month** (checks if it's an anniversary).
- Anniversary = same month as `start_date` each year
- New rent = old rent + max(5%, ₹1000) — whichever is higher
- E.g., ₹8000 × 5% = ₹400 → below ₹1000 minimum → rent becomes ₹9000
- E.g., ₹25000 × 5% = ₹1250 → above minimum → rent becomes ₹26250
- Logged in `ledger` with a note in `owner_remarks`

---

## TROUBLESHOOTING

| Problem | Fix |
|---------|-----|
| Bills not appearing | Check Gmail label name exactly matches `rent-bills`. Run `parseGmailBills()` manually from Apps Script. |
| `needs_review = yes` on bill | PDF was scanned image or format changed. Enter amount manually in `bills` tab. |
| Tenant gets "Ledger row not found" | Run `createMonthlyLedgerRows('YYYY-MM')` from Apps Script console |
| Web app returns 401 | Re-deploy as Web App with "Anyone" access |
| Late fee not updating | Check triggers are active: Apps Script → Triggers (clock icon) |

---

## FILE REFERENCE

```
rent-tracker/
├── apps-script/
│   └── Code.gs              ← paste into Apps Script editor
├── tenant-ui/
│   └── index.html           ← deploy to GitHub Pages
├── .github/workflows/
│   └── deploy.yml           ← auto-deploys on push
└── SETUP.md                 ← this file
```

---

## TOTAL RUNNING COSTS

| Service | Cost |
|---------|------|
| Google Sheets | Free |
| Google Apps Script | Free (6min/day quota — way more than enough) |
| GitHub Pages | Free (private repo needs paid plan — use public or use Cloudflare Pages free tier instead) |
| Gmail | Free |

**Alternative to GitHub Pages (if you want private):**
Deploy `tenant-ui/` to **Cloudflare Pages** (free):
1. https://pages.cloudflare.com → Connect to Git or upload directly
2. Same result, supports private repos for free.
