// ============================================================
//  RENT TRACKER — Google Apps Script Backend
//  Deploy as: Web App → Execute as Me → Access: Anyone
// ============================================================

// ── CONFIG (edit these before deploying) ──────────────────────
const CONFIG = {
  SHEET_ID: '',                  // Leave blank = use bound sheet; or paste Sheet ID
  UNITS: {
    ground:  { name: 'Ground Floor',  consumerKSEB: 'XXXX-XXXX', consumerKWA: 'XXXX-XXXX' },
    first:   { name: 'First Floor',   consumerKSEB: 'YYYY-YYYY', consumerKWA: 'YYYY-YYYY' }
  },
  LATE_FEE_GRACE_DAYS: 3,        // fee starts after this many days
  LATE_FEE_PER_DAY:    100,      // ₹ per day after grace period
  RENT_ESCALATION_MIN_FLAT: 1000,// minimum flat escalation ₹
  RENT_ESCALATION_PCT:  5,       // percentage escalation
  GMAIL_LABEL: 'rent-bills',     // Gmail label to scan
  OWNER_EMAIL: Session.getActiveUser().getEmail()
};
// ─────────────────────────────────────────────────────────────

// ── SHEET HELPERS ─────────────────────────────────────────────
function getSheet(name) {
  const ss = CONFIG.SHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name);
}

function sheetData(name) {
  const sh = getSheet(name);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });
}

function appendRow(sheetName, obj) {
  const sh = getSheet(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(headers.map(h => obj[h] !== undefined ? obj[h] : ''));
}

function updateRow(sheetName, matchCol, matchVal, updates) {
  const sh = getSheet(sheetName);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const colIdx = headers.indexOf(matchCol);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === String(matchVal)) {
      Object.entries(updates).forEach(([k, v]) => {
        const ci = headers.indexOf(k);
        if (ci >= 0) sh.getRange(i + 1, ci + 1).setValue(v);
      });
      return true;
    }
  }
  return false;
}

// ── WEB APP ENTRY POINTS ──────────────────────────────────────
function doGet(e) {
  return handleRequest(e);
}
function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const p = e.parameter || {};
  const action = p.action || '';
  let result;
  try {
    switch (action) {
      case 'status':        result = getStatus(p.unit);            break;
      case 'markPaid':      result = markPaid(p.unit, p.utr, p.remarks); break;
      case 'markBillPaid':  result = markBillPaid(p.unit, p.billId, p.type, p.remarks); break;
      case 'verify':        result = verifyPayment(p.unit, p.month); break;
      case 'ownerDash':     result = getOwnerDash();               break;
      default:              result = { error: 'Unknown action' };
    }
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── STATUS (tenant view) ───────────────────────────────────────
function getStatus(unit) {
  if (!unit) return { error: 'unit required' };
  const month = currentMonth();

  const ledger = sheetData('ledger').filter(r => r.unit_id === unit && r.month === month);
  const bills  = sheetData('bills').filter(r  => r.unit_id === unit && r.month === month);
  const units  = sheetData('units').find(r => r.unit_id === unit);

  const ledgerRow = ledger[0] || {};

  return {
    unit,
    unit_name: CONFIG.UNITS[unit]?.name || unit,
    month,
    rent: {
      due:          ledgerRow.rent_due || 0,
      paid:         ledgerRow.rent_paid === 'yes',
      paid_date:    ledgerRow.paid_date || '',
      utr:          ledgerRow.utr || '',
      remarks:      ledgerRow.tenant_remarks || '',
      verified:     ledgerRow.verified_by_owner === 'yes',
      owner_remarks:ledgerRow.owner_remarks || '',
      late_fee:     ledgerRow.late_fee || 0
    },
    bills: bills.map(b => ({
      id:           b.bill_id,
      type:         b.type,
      amount:       b.amount,
      due_date:     b.due_date,
      paid:         b.paid === 'yes',
      paid_remarks: b.paid_remarks || '',
      verified:     b.verified === 'yes',
      needs_review: b.needs_review === 'yes'
    }))
  };
}

// ── MARK RENT PAID (tenant) ────────────────────────────────────
function markPaid(unit, utr, remarks) {
  if (!unit || !utr) return { error: 'unit and UTR required' };
  const month = currentMonth();

  const updated = updateRow('ledger',
    'month_unit', `${month}_${unit}`,
    {
      rent_paid:      'yes',
      paid_date:      today(),
      utr:            utr,
      tenant_remarks: remarks || ''
    }
  );

  if (!updated) {
    // Row might not exist yet (shouldn't happen post-setup, but guard it)
    return { error: 'Ledger row not found. Contact owner.' };
  }
  return { success: true, message: 'Payment recorded. Awaiting owner verification.' };
}

// ── MARK BILL PAID (tenant) ────────────────────────────────────
function markBillPaid(unit, billId, type, remarks) {
  if (!unit || !billId) return { error: 'unit and billId required' };

  const updated = updateRow('bills', 'bill_id', billId, {
    paid:         'yes',
    paid_remarks: remarks || ''
  });

  return updated
    ? { success: true, message: `${type} bill marked paid.` }
    : { error: 'Bill not found.' };
}

// ── VERIFY PAYMENT (owner) ─────────────────────────────────────
function verifyPayment(unit, month) {
  if (!unit) return { error: 'unit required' };
  const m = month || currentMonth();

  const updated = updateRow('ledger',
    'month_unit', `${m}_${unit}`,
    { verified_by_owner: 'yes', verified_date: today() }
  );

  return updated
    ? { success: true, message: `Verified for ${unit} — ${m}` }
    : { error: 'Ledger row not found.' };
}

// owner reject: just un-verify (tenant marks paid again with correct UTR offline discussion)
function rejectPayment(unit, month, ownerRemarks) {
  const m = month || currentMonth();
  updateRow('ledger', 'month_unit', `${m}_${unit}`, {
    verified_by_owner: 'no',
    rent_paid:         'no',
    utr:               '',
    owner_remarks:     ownerRemarks || ''
  });
  return { success: true };
}

// ── OWNER DASHBOARD ────────────────────────────────────────────
function getOwnerDash() {
  const month = currentMonth();
  const result = {};
  ['ground', 'first'].forEach(unit => {
    result[unit] = getStatus(unit);
  });
  return { month, units: result };
}

// ── NIGHTLY: LATE FEE CALCULATION ─────────────────────────────
function runNightlyLateFee() {
  const month = currentMonth();
  const sh = getSheet('ledger');
  const data = sh.getDataRange().getValues();
  const headers = data[0];

  const get = (row, col) => row[headers.indexOf(col)];
  const set = (rowIdx, col, val) => sh.getRange(rowIdx + 1, headers.indexOf(col) + 1).setValue(val);

  const today_ = new Date();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (get(row, 'month') !== month) continue;
    if (get(row, 'rent_paid') === 'yes') { set(i, 'late_fee', 0); continue; }

    // Due date = 1st of the month
    const dueDate = new Date(month + '-01');
    const diffDays = Math.floor((today_ - dueDate) / (1000 * 60 * 60 * 24));
    const feeDays = Math.max(0, diffDays - CONFIG.LATE_FEE_GRACE_DAYS);
    const fee = feeDays * CONFIG.LATE_FEE_PER_DAY;

    set(i, 'late_fee', fee);
    set(i, 'rent_due', get(row, 'expected_rent') + fee);
  }
}

// ── MONTHLY: RENT ESCALATION ───────────────────────────────────
function runMonthlyEscalation() {
  const unitRows = sheetData('units');
  const today_ = new Date();
  const month = currentMonth();

  unitRows.forEach(u => {
    const start = new Date(u.start_date);
    // Check if today is on or after anniversary month
    const monthsSinceStart =
      (today_.getFullYear() - start.getFullYear()) * 12 +
      (today_.getMonth() - start.getMonth());

    if (monthsSinceStart > 0 && monthsSinceStart % 12 === 0) {
      const pctIncrease = Math.round(u.base_rent * (CONFIG.RENT_ESCALATION_PCT / 100));
      const newRent = u.base_rent + Math.max(pctIncrease, CONFIG.RENT_ESCALATION_MIN_FLAT);

      updateRow('units', 'unit_id', u.unit_id, {
        base_rent:          newRent,
        last_revision_date: today()
      });

      // Log escalation event
      appendRow('ledger', {
        month_unit:      `${month}_${u.unit_id}_escalation`,
        month:           month,
        unit_id:         u.unit_id,
        expected_rent:   newRent,
        rent_due:        newRent,
        rent_paid:       'no',
        verified_by_owner: 'no',
        late_fee:        0,
        utr:             '',
        tenant_remarks:  '',
        owner_remarks:   `Auto-escalated from ₹${u.base_rent} to ₹${newRent}`
      });
    }
  });

  // Always create ledger rows for current month if missing
  createMonthlyLedgerRows(month);
}

function createMonthlyLedgerRows(month) {
  const existing = sheetData('ledger');
  const units = sheetData('units');

  units.forEach(u => {
    const key = `${month}_${u.unit_id}`;
    if (!existing.find(r => r.month_unit === key)) {
      appendRow('ledger', {
        month_unit:        key,
        month:             month,
        unit_id:           u.unit_id,
        expected_rent:     u.base_rent,
        rent_due:          u.base_rent,
        rent_paid:         'no',
        paid_date:         '',
        utr:               '',
        tenant_remarks:    '',
        verified_by_owner: 'no',
        verified_date:     '',
        owner_remarks:     '',
        late_fee:          0
      });
    }
  });
}

// ── GMAIL BILL PARSER ──────────────────────────────────────────
function parseGmailBills() {
  const label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL);
  if (!label) { Logger.log('Gmail label "' + CONFIG.GMAIL_LABEL + '" not found'); return; }

  const threads = label.getThreads(0, 20);
  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      if (msg.isRead()) return; // skip already processed

      const subject = msg.getSubject();
      const body    = msg.getPlainBody();
      const attaches = msg.getAttachments();

      let extracted = null;

      // Try subject-line extraction first (faster)
      extracted = tryExtractFromSubject(subject);

      // Try body extraction
      if (!extracted) extracted = tryExtractFromBody(body);

      // Try PDF attachment
      if (!extracted && attaches.length > 0) {
        attaches.forEach(att => {
          if (!extracted && att.getContentType() === 'application/pdf') {
            extracted = tryExtractFromPdfText(att.getDataAsString());
          }
        });
      }

      const billMonth = extracted ? extracted.month : monthFromDate(msg.getDate());
      const billId = `bill_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

      if (extracted) {
        // Map consumer number to unit
        const unit = mapConsumerToUnit(extracted.consumer);

        appendRow('bills', {
          bill_id:      billId,
          month:        billMonth,
          unit_id:      unit || 'unknown',
          type:         extracted.type,
          amount:       extracted.amount,
          due_date:     extracted.dueDate || '',
          consumer_no:  extracted.consumer || '',
          source:       'gmail',
          paid:         'no',
          paid_remarks: '',
          verified:     'no',
          needs_review: unit ? 'no' : 'yes'
        });
      } else {
        // Could not parse — flag for manual review
        appendRow('bills', {
          bill_id:      billId,
          month:        billMonth,
          unit_id:      'unknown',
          type:         detectBillType(subject),
          amount:       0,
          due_date:     '',
          consumer_no:  '',
          source:       'gmail_unread:' + subject.slice(0, 60),
          paid:         'no',
          paid_remarks: '',
          verified:     'no',
          needs_review: 'yes'
        });
      }

      msg.markRead();
    });
  });
}

// ── BILL PARSING HELPERS ───────────────────────────────────────
function tryExtractFromSubject(subject) {
  // KSEB subject usually: "KSEB Bill for Consumer No. XXXXXXXX Amount Rs.XXXX"
  const ksebMatch = subject.match(/kseb/i);
  const kwaMatch  = subject.match(/kwa|water/i);
  const amtMatch  = subject.match(/(?:rs\.?|₹|inr)\s*([\d,]+(?:\.\d{2})?)/i) ||
                    subject.match(/amount[:\s]+([\d,]+(?:\.\d{2})?)/i);
  const consMatch = subject.match(/consumer[^:\d]*[:\s]*([\d\-]+)/i);

  if ((ksebMatch || kwaMatch) && amtMatch) {
    return {
      type:     ksebMatch ? 'electricity' : 'water',
      amount:   parseFloat(amtMatch[1].replace(/,/g, '')),
      consumer: consMatch ? consMatch[1] : '',
      month:    currentMonth(),
      dueDate:  ''
    };
  }
  return null;
}

function tryExtractFromBody(body) {
  if (!body) return null;
  const ksebMatch = body.match(/kseb/i);
  const kwaMatch  = body.match(/kwa|kerala water/i);

  const amtPatterns = [
    /(?:total amount due|net amount payable|amount payable)[^\d]*([\d,]+(?:\.\d{2})?)/i,
    /(?:rs\.?|₹)\s*([\d,]+(?:\.\d{2})?)/i
  ];
  let amount = null;
  for (const pat of amtPatterns) {
    const m = body.match(pat);
    if (m) { amount = parseFloat(m[1].replace(/,/g, '')); break; }
  }

  const consMatch = body.match(/consumer\s*(?:no\.?|number)[:\s]*([\d\-]+)/i);
  const dueMatch  = body.match(/due date[:\s]*([\d\/\-]+)/i);
  const monMatch  = body.match(/bill(?:ing)?\s*(?:month|period)[:\s]*([A-Za-z]+[\s\-\/]+\d{4})/i);

  if ((ksebMatch || kwaMatch) && amount) {
    return {
      type:     ksebMatch ? 'electricity' : 'water',
      amount,
      consumer: consMatch ? consMatch[1] : '',
      month:    monMatch  ? parseMonthStr(monMatch[1]) : currentMonth(),
      dueDate:  dueMatch  ? dueMatch[1] : ''
    };
  }
  return null;
}

function tryExtractFromPdfText(text) {
  // Same logic as body, just on PDF text content
  return tryExtractFromBody(text);
}

function mapConsumerToUnit(consumerNo) {
  if (!consumerNo) return null;
  const clean = consumerNo.replace(/[\s\-]/g, '');
  for (const [uid, cfg] of Object.entries(CONFIG.UNITS)) {
    if (cfg.consumerKSEB.replace(/[\s\-]/g, '') === clean) return uid;
    if (cfg.consumerKWA.replace(/[\s\-]/g, '')  === clean) return uid;
  }
  return null;
}

function detectBillType(subject) {
  if (/kseb|electricity/i.test(subject)) return 'electricity';
  if (/kwa|water/i.test(subject))        return 'water';
  return 'unknown';
}

function parseMonthStr(str) {
  // "March 2025" or "Mar-2025" → "2025-03"
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const m = str.match(/([a-z]+)[\s\-\/]+(\d{4})/i);
  if (m) {
    const idx = months.indexOf(m[1].toLowerCase().slice(0,3));
    if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
  }
  return currentMonth();
}

// ── DATE UTILITIES ─────────────────────────────────────────────
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function monthFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── ONE-TIME SETUP: creates all sheet tabs + headers ───────────
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schemas = {
    units: ['unit_id','unit_name','start_date','base_rent','escalation_pct','escalation_min_flat','last_revision_date'],
    ledger: ['month_unit','month','unit_id','expected_rent','rent_due','rent_paid','paid_date','utr','tenant_remarks','verified_by_owner','verified_date','owner_remarks','late_fee'],
    bills:  ['bill_id','month','unit_id','type','amount','due_date','consumer_no','source','paid','paid_remarks','verified','needs_review']
  };

  Object.entries(schemas).forEach(([name, headers]) => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clearContents();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  });

  // Seed unit rows
  const unitSheet = ss.getSheetByName('units');
  unitSheet.appendRow(['ground', 'Ground Floor', '', 0, 5, 1000, '']);
  unitSheet.appendRow(['first',  'First Floor',  '', 0, 5, 1000, '']);

  // Create current month ledger rows
  createMonthlyLedgerRows(currentMonth());

  SpreadsheetApp.getUi().alert('✅ Setup complete! Fill in start_date and base_rent in the "units" tab, then fill in your consumer numbers in the CONFIG section of Code.gs.');
}

// ── SETUP TRIGGERS (run once) ──────────────────────────────────
function setupTriggers() {
  // Remove all existing
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Nightly at 11pm: late fee
  ScriptApp.newTrigger('runNightlyLateFee')
    .timeBased().everyDays(1).atHour(23).create();

  // 1st of every month at 6am: ledger creation + escalation check
  ScriptApp.newTrigger('runMonthlyEscalation')
    .timeBased().onMonthDay(1).atHour(6).create();

  // Daily at 8am: parse gmail bills
  ScriptApp.newTrigger('parseGmailBills')
    .timeBased().everyDays(1).atHour(8).create();

  Logger.log('✅ Triggers set: nightly late fee, monthly escalation, daily bill parse');
}
