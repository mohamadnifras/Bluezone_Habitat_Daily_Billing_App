const crypto = require('crypto');

/**
 * High-Performance Native Google Sheets API v4 Client
 * - Memory-cached OAuth2 JWT tokens (valid 60 mins)
 * - Single-roundtrip batchGet & batchUpdate
 * - Google Sheets is the direct and authoritative database
 */

let cachedToken = null;
let tokenExpiresAt = 0;
let sheetsVerified = false;

function isGoogleSheetsConfigured() {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY?.trim();

  return Boolean(sheetId && email && key && sheetId !== 'your_google_sheet_id_here');
}

function getCleanPrivateKey() {
  let key = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!key) return '';

  key = key.trim();
  while (key.endsWith(',') || key.endsWith(';') || key.endsWith('"') || key.endsWith("'")) {
    key = key.slice(0, -1).trim();
  }
  while (key.startsWith('"') || key.startsWith("'")) {
    key = key.slice(1).trim();
  }

  key = key.replace(/\\n/g, '\n');

  const beginTag = '-----BEGIN PRIVATE KEY-----';
  const endTag = '-----END PRIVATE KEY-----';

  const beginIndex = key.indexOf(beginTag);
  const endIndex = key.indexOf(endTag);

  if (beginIndex !== -1 && endIndex !== -1) {
    const rawContent = key.slice(beginIndex + beginTag.length, endIndex).trim();
    const base64Only = rawContent.split(/\s+/).filter(Boolean).join('');
    const chunks = base64Only.match(/.{1,64}/g) || [];
    return `${beginTag}\n${chunks.join('\n')}\n${endTag}\n`;
  }

  return key;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < (tokenExpiresAt - 300)) {
    return cachedToken;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = getCleanPrivateKey();

  if (!email || !privateKey) {
    throw new Error('Google Service Account email or private key is missing.');
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsignedToken = `${b64Header}.${b64Payload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  const jwt = `${unsignedToken}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Google OAuth2 Error (${tokenRes.status}): ${errText}`);
  }

  const tokenData = await tokenRes.json();
  cachedToken = tokenData.access_token;
  tokenExpiresAt = now + (tokenData.expires_in || 3600);
  return cachedToken;
}

/**
 * Check Google Sheet metadata and ensure required sheets (Bills_Master & Expense_Items) exist
 * Cached in memory so it runs only once per server lifetime
 */
async function ensureSheetsExist(accessToken, spreadsheetId) {
  if (sheetsVerified) return;

  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
  const res = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 404) {
      throw new Error(`Google Spreadsheet not found. Check your GOOGLE_SHEET_ID: "${spreadsheetId}"`);
    } else if (res.status === 403) {
      throw new Error(`Permission Denied. Please open your Google Sheet, click "Share", and invite ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} with "Editor" access.`);
    }
    throw new Error(`Google Sheets API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const existingSheetTitles = (data.sheets || []).map(s => s.properties?.title);

  const requests = [];
  if (!existingSheetTitles.includes('Bills_Master')) {
    requests.push({
      addSheet: { properties: { title: 'Bills_Master' } }
    });
  }
  if (!existingSheetTitles.includes('Expense_Items')) {
    requests.push({
      addSheet: { properties: { title: 'Expense_Items' } }
    });
  }

  if (requests.length > 0) {
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    await fetch(batchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    });
  }

  // Ensure Headers for Bills_Master
  const checkBillsHeader = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Bills_Master!A1:Z1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const billsHeaderData = await checkBillsHeader.json();
  if (!billsHeaderData.values || billsHeaderData.values.length === 0) {
    const billsHeaders = [
      'Bill ID', 'Request No', 'Request Date', 'Payment Date', 'Requested By', 'Work Area / Dept',
      'Urgency', 'Subtotal (INR)', 'GST / Tax (INR)', 'Other Charges (INR)', 'Less Advance / TDS (INR)',
      'Net Payable (INR)', 'Budget Status', 'Remarks / Justification', 'Accounts Verified By',
      'Accounts Verification Date', 'Project Head Name', 'Project Head Status', 'Project Head Date',
      'Chairman Name', 'Chairman Status', 'Chairman Date', 'Items Count', 'Created At', 'Last Updated',
      'JSON_Payload'
    ];
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Bills_Master!A1:Z1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [billsHeaders] })
    });
  }

  // Ensure Headers for Expense_Items
  const checkItemsHeader = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Expense_Items!A1:K1`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const itemsHeaderData = await checkItemsHeader.json();
  if (!itemsHeaderData.values || itemsHeaderData.values.length === 0) {
    const itemHeaders = [
      'Bill ID', 'Request No', 'Request Date', 'Requested By', 'Item Sl No',
      'Description', 'Bill Date', 'Quantity', 'Unit', 'Rate (INR)', 'Amount (INR)'
    ];
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Expense_Items!A1:K1?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [itemHeaders] })
    });
  }

  sheetsVerified = true;
}

/**
 * Fetch all bills directly from Google Sheets using single fast batchGet
 */
async function fetchBillsFromGoogleSheets() {
  if (!isGoogleSheetsConfigured()) {
    return [];
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID.trim();
  const accessToken = await getAccessToken();
  await ensureSheetsExist(accessToken, spreadsheetId);

  // Single batchGet for both Bills_Master and Expense_Items (~500ms)
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=Bills_Master!A2:Z&ranges=Expense_Items!A2:K`;
  const res = await fetch(batchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Sheets batchGet failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const masterRows = (data.valueRanges && data.valueRanges[0] && data.valueRanges[0].values) || [];
  const itemsRows = (data.valueRanges && data.valueRanges[1] && data.valueRanges[1].values) || [];

  // Group items by bill ID
  const itemsByBillId = new Map();
  itemsRows.forEach(row => {
    if (!row || !row[0]) return;
    const bId = String(row[0]).trim();
    if (!itemsByBillId.has(bId)) {
      itemsByBillId.set(bId, []);
    }
    itemsByBillId.get(bId).push({
      desc: String(row[5] || ''),
      date: String(row[6] || ''),
      amount: Math.max(0, Number(row[10]) || 0),
      qty: row[7] !== undefined && row[7] !== null ? String(row[7]) : '',
      unit: String(row[8] || ''),
      rate: row[9] !== undefined && row[9] !== null ? String(row[9]) : ''
    });
  });

  const bills = [];
  for (const row of masterRows) {
    if (!row || !row[0]) continue;
    const billId = String(row[0]).trim();

    // Check if JSON payload column exists
    const jsonStr = row[25];
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.id && parsed.form) {
          if (!parsed.items || parsed.items.length === 0) {
            parsed.items = itemsByBillId.get(billId) || [];
          }
          // Sanitize form fields
          parsed.form = sanitizeForm(parsed.form);
          bills.push(parsed);
          continue;
        }
      } catch {
        // Fallback to row columns
      }
    }

    // Reconstruct bill from row columns
    const billItems = itemsByBillId.get(billId) || [];
    bills.push({
      id: billId,
      form: sanitizeForm({
        requestNumber: String(row[1] || ''),
        requestDate: String(row[2] || ''),
        paymentDate: String(row[3] || ''),
        requestedBy: String(row[4] || 'AMAL'),
        workArea: String(row[5] || ''),
        urgency: String(row[6] || 'Normal'),
        taxAmount: String(row[8] || '0'),
        otherCharges: String(row[9] || '0'),
        advanceAmount: String(row[10] || '0'),
        budgetStatus: String(row[12] || ''),
        remarks: String(row[13] || ''),
        accountsName: String(row[14] || ''),
        accountsDate: String(row[15] || ''),
        projectHeadName: String(row[16] || ''),
        projectStatus: String(row[17] || ''),
        chairmanName: String(row[19] || ''),
        chairmanStatus: String(row[20] || ''),
        projectDate: String(row[18] || ''),
        chairmanDate: String(row[21] || '')
      }),
      items: billItems,
      createdAt: String(row[23] || new Date().toISOString()),
      updatedAt: String(row[24] || new Date().toISOString())
    });
  }

  // Sort latest updated first
  return bills.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function sanitizeForm(f = {}) {
  return {
    requestNumber: String(f.requestNumber || ''),
    requestDate: String(f.requestDate || ''),
    paymentDate: String(f.paymentDate || ''),
    requestedBy: String(f.requestedBy || 'AMAL'),
    workArea: String(f.workArea || ''),
    urgency: String(f.urgency || 'Normal'),
    taxAmount: String(f.taxAmount || '0'),
    otherCharges: String(f.otherCharges || '0'),
    advanceAmount: String(f.advanceAmount || '0'),
    budgetStatus: String(f.budgetStatus || ''),
    remarks: String(f.remarks || ''),
    accountsName: String(f.accountsName || ''),
    accountsDate: String(f.accountsDate || ''),
    projectHeadName: String(f.projectHeadName || ''),
    projectStatus: String(f.projectStatus || 'Pending'),
    chairmanName: String(f.chairmanName || ''),
    chairmanStatus: String(f.chairmanStatus || 'Pending'),
    projectDate: String(f.projectDate || ''),
    chairmanDate: String(f.chairmanDate || '')
  };
}

/**
 * Write/Sync entire bills array to Google Sheets using batchClear and batchUpdate
 */
async function syncBillsToGoogleSheets(bills) {
  if (!isGoogleSheetsConfigured()) {
    throw new Error('Google Sheets is not configured');
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID.trim();
  const accessToken = await getAccessToken();
  await ensureSheetsExist(accessToken, spreadsheetId);

  // 1. Prepare Bills_Master rows
  const billsRows = bills.map((b) => {
    const f = sanitizeForm(b.form);
    const items = Array.isArray(b.items) ? b.items : [];
    const subtotal = items.reduce((sum, it) => sum + (Math.max(0, Number(it.amount) || 0)), 0);
    const tax = Math.max(0, Number(f.taxAmount) || 0);
    const other = Math.max(0, Number(f.otherCharges) || 0);
    const advance = Math.max(0, Number(f.advanceAmount) || 0);
    const netPayable = Math.max(0, Math.round((subtotal + tax + other - advance) * 100) / 100);

    const fullObj = {
      id: b.id,
      form: f,
      items,
      createdAt: b.createdAt || new Date().toISOString(),
      updatedAt: b.updatedAt || new Date().toISOString()
    };

    return [
      b.id,
      f.requestNumber || '',
      f.requestDate || '',
      f.paymentDate || '',
      f.requestedBy || '',
      f.workArea || '',
      f.urgency || 'Normal',
      subtotal,
      tax,
      other,
      advance,
      netPayable,
      f.budgetStatus || '',
      f.remarks || '',
      f.accountsName || '',
      f.accountsDate || '',
      f.projectHeadName || '',
      f.projectStatus || 'Pending',
      f.projectDate || '',
      f.chairmanName || '',
      f.chairmanStatus || 'Pending',
      f.chairmanDate || '',
      items.length,
      b.createdAt || '',
      b.updatedAt || '',
      JSON.stringify(fullObj)
    ];
  });

  // 2. Prepare Expense_Items rows
  const itemsRows = [];
  bills.forEach((b) => {
    const f = b.form || {};
    const items = Array.isArray(b.items) ? b.items : [];
    items.forEach((item, itemIdx) => {
      itemsRows.push([
        b.id,
        f.requestNumber || '',
        f.requestDate || '',
        f.requestedBy || '',
        itemIdx + 1,
        item.desc || '',
        item.date || '',
        item.qty !== undefined && item.qty !== '' ? Number(item.qty) : '',
        item.unit || '',
        item.rate !== undefined && item.rate !== '' ? Number(item.rate) : '',
        Math.max(0, Number(item.amount) || 0)
      ]);
    });
  });

  // Clear existing data rows using batchClear (~500ms)
  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`;
  const clearRes = await fetch(clearUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ranges: ['Bills_Master!A2:Z', 'Expense_Items!A2:K']
    })
  });

  if (!clearRes.ok) {
    const errText = await clearRes.text();
    throw new Error(`Google Sheets batchClear failed (${clearRes.status}): ${errText}`);
  }

  // Write both sheets in a single batchUpdate (~1000ms)
  const updateData = [];
  if (billsRows.length > 0) {
    updateData.push({
      range: `Bills_Master!A2:Z${billsRows.length + 1}`,
      values: billsRows
    });
  }
  if (itemsRows.length > 0) {
    updateData.push({
      range: `Expense_Items!A2:K${itemsRows.length + 1}`,
      values: itemsRows
    });
  }

  if (updateData.length > 0) {
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    const updateRes = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: updateData
      })
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Google Sheets batchUpdate failed (${updateRes.status}): ${errText}`);
    }
  }

  return { success: true, count: bills.length };
}

/**
 * Save or Update a single bill directly in Google Sheets
 */
async function upsertBillInGoogleSheets(billPayload) {
  const currentBills = await fetchBillsFromGoogleSheets();
  const now = new Date().toISOString();

  let targetId = billPayload.id;
  if (!targetId) {
    // If requestNumber matches an existing bill, update that bill
    const existingByReq = currentBills.find(b => b.form && b.form.requestNumber && String(b.form.requestNumber).trim() === String(billPayload.form?.requestNumber || '').trim());
    targetId = existingByReq ? existingByReq.id : `bzh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  const existingIdx = currentBills.findIndex(b => b.id === targetId);

  const cleanedBill = {
    id: targetId,
    form: sanitizeForm(billPayload.form),
    items: Array.isArray(billPayload.items) ? billPayload.items : [],
    createdAt: existingIdx >= 0 ? currentBills[existingIdx].createdAt : (billPayload.createdAt || now),
    updatedAt: now
  };

  if (existingIdx >= 0) {
    currentBills[existingIdx] = cleanedBill;
  } else {
    currentBills.unshift(cleanedBill);
  }

  await syncBillsToGoogleSheets(currentBills);
  return { savedBill: cleanedBill, allBills: currentBills };
}

/**
 * Delete a bill directly from Google Sheets
 */
async function deleteBillFromGoogleSheets(id) {
  const currentBills = await fetchBillsFromGoogleSheets();
  const filtered = currentBills.filter(b => b.id !== id);

  if (filtered.length !== currentBills.length) {
    await syncBillsToGoogleSheets(filtered);
  }

  return { deleted: true, allBills: filtered };
}

/**
 * Diagnostic test for verifying Google Sheets connection
 */
async function testGoogleSheetsConnection() {
  if (!isGoogleSheetsConfigured()) {
    return {
      configured: false,
      message: 'Google Sheets is not configured in .env.local'
    };
  }

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID.trim();
    const accessToken = await getAccessToken();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      if (res.status === 403) {
        return {
          configured: true,
          connected: false,
          error: `Permission Denied. Please open your Google Sheet, click 'Share', and invite '${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}' with 'Editor' permissions.`
        };
      }
      const errText = await res.text();
      return {
        configured: true,
        connected: false,
        error: `Google Sheets API Error (${res.status}): ${errText}`
      };
    }

    const data = await res.json();
    return {
      configured: true,
      connected: true,
      sheetTitle: data.properties?.title || 'Google Sheet',
      spreadsheetId,
      message: 'Connected successfully to Google Sheets!'
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      error: err.message
    };
  }
}

module.exports = {
  isGoogleSheetsConfigured,
  getAccessToken,
  ensureSheetsExist,
  fetchBillsFromGoogleSheets,
  syncBillsToGoogleSheets,
  upsertBillInGoogleSheets,
  deleteBillFromGoogleSheets,
  testGoogleSheetsConnection,
  sanitizeForm
};
