// ============================================================
//  RENT TRACKER — Google Apps Script Backend
//  Deploy as: Web App → Execute as Me → Access: Anyone
//  deployed as https://script.google.com/macros/s/AKfycbyiP4CI68H9H97ROtdjTPGCiwlrnYLcIy7e2Mo7xO6o0-lulqS8AMSMC-9z3GALwNcXqw/exec
// ============================================================

// ── CONFIG (edit these before deploying) ──────────────────────
const CONFIG = {
  SHEET_ID: '1DX7AXCFs0-MjLcAImLxWP_Nau936Ry5dMDDgPrrZVkU',                  // Leave blank = use bound sheet; or paste Sheet ID
  UNITS: {
    ground:  { name: 'Ground Floor',  consumerKSEB: '1155436010771', consumerKWA: '' },
    first:   { name: 'First Floor',   consumerKSEB: '1155437032089', consumerKWA: '' }
    // KWA has no per-unit consumer number — identified by Account Name "Sreevalsam"
    // and split equally between both units
  },
  LATE_FEE_GRACE_DAYS: 3,
  LATE_FEE_PER_DAY:    100,
  RENT_ESCALATION_MIN_FLAT: 1000,
  RENT_ESCALATION_PCT:  5,
  GMAIL_LABEL: 'rent-bills',
  KWA_ACCOUNT_NAME: 'Sreevalsam',    // Only process KWA bills matching this account name
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
      due:           ledgerRow.rent_due || 0,
      paid:          ledgerRow.rent_paid === 'yes',
      paid_date:     ledgerRow.paid_date || '',
      utr:           ledgerRow.utr || '',
      remarks:       ledgerRow.tenant_remarks || '',
      verified:      ledgerRow.verified_by_owner === 'yes',
      owner_remarks: ledgerRow.owner_remarks || '',
      late_fee:      ledgerRow.late_fee || 0
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

  if (!updated) return { error: 'Ledger row not found. Contact owner.' };
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

      appendRow('ledger', {
        month_unit:        `${month}_${u.unit_id}_escalation`,
        month:             month,
        unit_id:           u.unit_id,
        expected_rent:     newRent,
        rent_due:          newRent,
        rent_paid:         'no',
        verified_by_owner: 'no',
        late_fee:          0,
        utr:               '',
        tenant_remarks:    '',
        owner_remarks:     `Auto-escalated from ₹${u.base_rent} to ₹${newRent}`
      });
    }
  });

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

// ═══════════════════════════════════════════════════════════════
//  GMAIL BILL PARSER — updated for actual KWA + KSEB formats
// ═══════════════════════════════════════════════════════════════

function parseGmailBills() {
  const label = GmailApp.getUserLabelByName(CONFIG.GMAIL_LABEL);
  if (!label) { Logger.log('Gmail label "' + CONFIG.GMAIL_LABEL + '" not found'); return; }

  const threads = label.getThreads(0, 20);
  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      if (msg.isRead()) return;

      const from    = msg.getFrom();
      const subject = msg.getSubject();
      const date    = msg.getDate();

      // ── Route by sender ──────────────────────────────────────
      if (isKWAEmail(from, subject)) {
        parseKWAEmail(msg, subject, date);
      } else if (isKSEBEmail(from, subject)) {
        parseKSEBEmail(msg, subject, date);
      }
      // Emails from other senders are ignored even if labelled

      msg.markRead();
    });
  });
}

// ── KWA: Google Pay notification emails ───────────────────────
// From: google-pay-noreply@google.com
// Subject: "New bill from Kerala Water Authority (KWA). Pay now on Google Pay"
// Body (plain text, base64): contains "Account Name:\n\nSreevalsam"
//                             "Bill Amount:\n\nRs. 3446.00"
//                             "Due Date:\n\nMar 9, 2026"

function isKWAEmail(from, subject) {
  return /google-pay-noreply@google\.com/i.test(from) &&
         /Kerala Water Authority|KWA/i.test(subject);
}

function parseKWAEmail(msg, subject, date) {
  const body = getPlainBody(msg);

  // Must match our property's account name — ignore other KWA bills
  const accountMatch = body.match(/Account\s+Name:\s*\n+\s*(\S[^\r\n]*)/i);
  const accountName  = accountMatch ? accountMatch[1].trim() : '';

  if (!accountName || accountName.toLowerCase() !== CONFIG.KWA_ACCOUNT_NAME.toLowerCase()) {
    Logger.log('KWA email skipped — Account Name "' + accountName + '" does not match "' + CONFIG.KWA_ACCOUNT_NAME + '"');
    return;
  }

  // Amount: "Rs. 3446.00"
  const amtMatch = body.match(/Bill\s+Amount:\s*\n+\s*Rs\.\s*([\d,]+(?:\.\d+)?)/i);
  const totalAmount = amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : 0;

  // Due date: "Mar 9, 2026"
  const dueMatch = body.match(/Due\s+Date:\s*\n+\s*([A-Za-z]+\s+\d+,\s*\d{4})/i);
  const dueDate  = dueMatch ? formatDueDate(dueMatch[1]) : '';

  // Bill month derived from due date (or email date as fallback)
  const billMonth = dueDate ? dueDate.slice(0, 7) : monthFromDate(date);

  // Split equally between both units
  const halfAmount = Math.round(totalAmount / 2);
  const billId     = `kwa_${billMonth}`;

  ['ground', 'first'].forEach(unit => {
    const existing = sheetData('bills').find(r => r.bill_id === `${billId}_${unit}`);
    if (existing) return; // already inserted this month

    appendRow('bills', {
      bill_id:      `${billId}_${unit}`,
      month:        billMonth,
      unit_id:      unit,
      type:         'water',
      amount:       halfAmount,
      due_date:     dueDate,
      consumer_no:  '',
      source:       'gmail-googlepay',
      paid:         'no',
      paid_remarks: '',
      verified:     'no',
      needs_review: totalAmount === 0 ? 'yes' : 'no'
    });
  });

  Logger.log('KWA bill inserted: ₹' + totalAmount + ' → ₹' + halfAmount + '/unit for ' + billMonth);
}

// ── KSEB: orumanetmail@kseb.in with PDF attachment ────────────
// From: orumanetmail@kseb.in
// Subject: "KSEBL - Oorja Souhrida- Bill Information - Mar-2026"
// Attachment: KsebBill_<ConsumerNumber>_<BillNumber>.pdf
// PDF contains:
//   "Consumer# 1155436010771"
//   "Payable amt.(excluding ACD) as on ...:Rs.1304/-"
//   "Due Date 18-03-2026"
//   "Billing Period    3/2026[Bi-Monthly]"

function isKSEBEmail(from, subject) {
  return /orumanetmail@kseb\.in/i.test(from);
}

function parseKSEBEmail(msg, subject, date) {
  const attachments = msg.getAttachments();

  attachments.forEach(att => {
    const filename = att.getName();
    if (!filename.toLowerCase().endsWith('.pdf')) return;

    // Extract consumer number from filename: KsebBill_1155436010771_5543260304219.pdf
    const consumerMatch = filename.match(/KsebBill_(\d+)_/i);
    if (!consumerMatch) {
      Logger.log('KSEB: could not extract consumer number from filename: ' + filename);
      insertKSEBUnreviewed(msg, subject, date, filename, 'filename_parse_failed');
      return;
    }

    const consumerNo = consumerMatch[1];
    const unit = mapKSEBConsumer(consumerNo);

    if (!unit) {
      Logger.log('KSEB: consumer ' + consumerNo + ' not mapped to any unit — skipping');
      return;
    }

    // Extract text from PDF
    let pdfText = '';
    try {
      pdfText = att.getDataAsString();
    } catch (e) {
      // PDF is binary — use Drive to convert
      pdfText = extractKSEBPdfText(att);
    }

    const extracted = parseKSEBPdfText(pdfText);

    if (!extracted) {
      insertKSEBUnreviewed(msg, subject, date, filename, 'pdf_parse_failed', unit, consumerNo);
      return;
    }

    const billId = `kseb_${extracted.billMonth}_${unit}`;
    const existing = sheetData('bills').find(r => r.bill_id === billId);
    if (existing) { Logger.log('KSEB bill already exists: ' + billId); return; }

    appendRow('bills', {
      bill_id:      billId,
      month:        extracted.billMonth,
      unit_id:      unit,
      type:         'electricity',
      amount:       extracted.amount,
      due_date:     extracted.dueDate,
      consumer_no:  consumerNo,
      source:       'gmail-kseb',
      paid:         'no',
      paid_remarks: '',
      verified:     'no',
      needs_review: 'no'
    });

    Logger.log('KSEB bill inserted: unit=' + unit + ' consumer=' + consumerNo + ' amount=₹' + extracted.amount + ' month=' + extracted.billMonth);
  });
}

// Parse KSEB PDF text — matches exact format from real bills
function parseKSEBPdfText(text) {
  if (!text || text.length < 50) return null;

  // "Payable amt.(excluding ACD) as on 2026-03-10 17:53:35:Rs.1304/-"
  const amtMatch = text.match(/Payable amt[^:]*:Rs\.(\d+)\/-/i);
  if (!amtMatch) return null;
  const amount = parseInt(amtMatch[1], 10);

  // "Due Date 18-03-2026"
  const dueMatch = text.match(/Due Date\s+([\d]{2}-[\d]{2}-[\d]{4})/);
  const dueDate  = dueMatch ? formatKSEBDate(dueMatch[1]) : '';

  // "Billing Period    3/2026[Bi-Monthly]" → month = 3, year = 2026
  const periodMatch = text.match(/Billing Period\s+(\d+)\/(\d{4})/);
  let billMonth = '';
  if (periodMatch) {
    billMonth = `${periodMatch[2]}-${String(periodMatch[1]).padStart(2, '0')}`;
  } else {
    // fallback: derive from due date (due date is ~10 days after bill date)
    billMonth = dueDate ? dueDate.slice(0, 7) : currentMonth();
  }

  return { amount, dueDate, billMonth };
}

// Map consumer number to unit_id
function mapKSEBConsumer(consumerNo) {
  const clean = consumerNo.replace(/\D/g, '');
  for (const [uid, cfg] of Object.entries(CONFIG.UNITS)) {
    if (cfg.consumerKSEB.replace(/\D/g, '') === clean) return uid;
  }
  return null;
}

// Insert a needs_review row when parsing fails
function insertKSEBUnreviewed(msg, subject, date, filename, reason, unit, consumerNo) {
  const billId = `kseb_unreviewed_${Date.now()}`;
  appendRow('bills', {
    bill_id:      billId,
    month:        monthFromDate(date),
    unit_id:      unit || 'unknown',
    type:         'electricity',
    amount:       0,
    due_date:     '',
    consumer_no:  consumerNo || '',
    source:       `gmail-kseb:${reason}:${filename}`,
    paid:         'no',
    paid_remarks: '',
    verified:     'no',
    needs_review: 'yes'
  });
  Logger.log('KSEB unreviewed row inserted: ' + reason + ' | ' + filename);
}

// Fallback: save PDF to Drive, convert via Google Docs, extract text
function extractKSEBPdfText(att) {
  try {
    const blob = att.copyBlob();
    const file = DriveApp.createFile(blob);
    const doc  = Drive.Files.copy(
      { title: 'kseb_temp', mimeType: 'application/vnd.google-apps.document' },
      file.getId()
    );
    const text = DocumentApp.openById(doc.getId()).getBody().getText();
    // Cleanup temp files
    Drive.Files.remove(file.getId());
    Drive.Files.remove(doc.getId());
    return text;
  } catch(e) {
    Logger.log('KSEB PDF Drive conversion failed: ' + e.message);
    return '';
  }
}

// Get plain text body from a message (handles base64 and non-base64)
function getPlainBody(msg) {
  // GmailMessage.getPlainBody() decodes automatically
  return msg.getPlainBody() || '';
}

// ── DATE HELPERS ───────────────────────────────────────────────

// "Mar 9, 2026" → "2026-03-09"
function formatDueDate(str) {
  const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
                   jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  const m = str.match(/([A-Za-z]+)\s+(\d+),\s*(\d{4})/);
  if (!m) return '';
  const mo = months[m[1].toLowerCase().slice(0,3)] || '01';
  return `${m[3]}-${mo}-${String(m[2]).padStart(2,'0')}`;
}

// "18-03-2026" → "2026-03-18"
function formatKSEBDate(str) {
  const parts = str.split('-');
  if (parts.length !== 3) return str;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

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

// ── ONE-TIME SETUP ─────────────────────────────────────────────
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const schemas = {
    units:  ['unit_id','unit_name','start_date','base_rent','escalation_pct','escalation_min_flat','last_revision_date'],
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

  const unitSheet = ss.getSheetByName('units');
  unitSheet.appendRow(['ground', 'Ground Floor', '', 0, 5, 1000, '']);
  unitSheet.appendRow(['first',  'First Floor',  '', 0, 5, 1000, '']);

  createMonthlyLedgerRows(currentMonth());

  SpreadsheetApp.getUi().alert('✅ Setup complete!\n\nNext steps:\n1. Fill in start_date and base_rent in the "units" tab\n2. Confirm consumer numbers in the CONFIG section match your bills:\n   ground = 1155436010771\n   first  = 1155437032089\n3. Run setupTriggers()');
}

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('runNightlyLateFee')
    .timeBased().everyDays(1).atHour(23).create();

  ScriptApp.newTrigger('runMonthlyEscalation')
    .timeBased().onMonthDay(1).atHour(6).create();

  ScriptApp.newTrigger('parseGmailBills')
    .timeBased().everyDays(1).atHour(8).create();

  Logger.log('✅ Triggers set: nightly late fee, monthly escalation, daily bill parse');
}