const XLSX = require('xlsx');

/**
 * In-memory Excel calculations and workbook generator
 * (Zero disk database dependencies)
 */

function calculateBillTotals(bill) {
  const form = bill?.form || {};
  const items = Array.isArray(bill?.items) ? bill.items : [];
  const subtotal = items.reduce((acc, item) => acc + (Math.max(0, Number(item.amount) || 0)), 0);
  const tax = Math.max(0, Number(form.taxAmount) || 0);
  const otherCharges = Math.max(0, Number(form.otherCharges) || 0);
  const advance = Math.max(0, Number(form.advanceAmount) || 0);
  const netPayable = Math.max(0, Math.round((subtotal + tax + otherCharges - advance) * 100) / 100);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax,
    otherCharges,
    advance,
    netPayable
  };
}

/**
 * Generate binary XLSX buffer dynamically from bills array in memory
 */
function generateExcelBuffer(bills = []) {
  // 1. Bills Master rows
  const billsRows = bills.map((b, idx) => {
    const f = b.form || {};
    const t = calculateBillTotals(b);
    return {
      'Sl No': idx + 1,
      'Bill ID': b.id,
      'Request No': f.requestNumber || '',
      'Request Date': f.requestDate || '',
      'Required Payment Date': f.paymentDate || '',
      'Requested By': f.requestedBy || '',
      'Work Area / Dept': f.workArea || '',
      'Urgency': f.urgency || 'Normal',
      'Subtotal (INR)': t.subtotal,
      'GST / Tax (INR)': t.tax,
      'Other Charges (INR)': t.otherCharges,
      'Less Advance / TDS (INR)': t.advance,
      'Net Payable (INR)': t.netPayable,
      'Budget Status': f.budgetStatus || '',
      'Remarks / Justification': f.remarks || '',
      'Accounts Verified By': f.accountsName || '',
      'Accounts Verification Date': f.accountsDate || '',
      'Project Head Name': f.projectHeadName || '',
      'Project Head Status': f.projectStatus || 'Pending',
      'Project Head Date': f.projectDate || '',
      'Chairman Name': f.chairmanName || '',
      'Chairman Status': f.chairmanStatus || 'Pending',
      'Chairman Date': f.chairmanDate || '',
      'Expense Items Count': (b.items || []).length,
      'Created At': b.createdAt || '',
      'Last Updated': b.updatedAt || ''
    };
  });

  // 2. Expense Items rows
  const itemsRows = [];
  bills.forEach((b) => {
    const f = b.form || {};
    const items = Array.isArray(b.items) ? b.items : [];
    items.forEach((item, itemIdx) => {
      itemsRows.push({
        'Bill ID': b.id,
        'Request No': f.requestNumber || '',
        'Request Date': f.requestDate || '',
        'Requested By': f.requestedBy || '',
        'Item Sl No': itemIdx + 1,
        'Description': item.desc || '',
        'Bill Date': item.date || '',
        'Quantity': item.qty !== undefined && item.qty !== null && item.qty !== '' ? Number(item.qty) : '',
        'Unit': item.unit || '',
        'Rate (INR)': item.rate !== undefined && item.rate !== null && item.rate !== '' ? Number(item.rate) : '',
        'Amount (INR)': Math.max(0, Number(item.amount) || 0)
      });
    });
  });

  // 3. Summary rows
  const totalBills = bills.length;
  const totalAmount = bills.reduce((sum, b) => sum + calculateBillTotals(b).netPayable, 0);
  const totalItems = itemsRows.length;
  const summaryRows = [
    { 'Metric': 'Bluezone Habitat Daily Accounts Approval Database', 'Value': 'Google Sheets Connected' },
    { 'Metric': 'Total Approved / Saved Bills', 'Value': totalBills },
    { 'Metric': 'Total Net Payable (INR)', 'Value': Math.round(totalAmount * 100) / 100 },
    { 'Metric': 'Total Individual Expense Items', 'Value': totalItems },
    { 'Metric': 'Generated Export Timestamp', 'Value': new Date().toISOString() }
  ];

  const workbook = XLSX.utils.book_new();

  const wsBills = XLSX.utils.json_to_sheet(billsRows.length ? billsRows : [{
    'Sl No': '', 'Bill ID': '', 'Request No': '', 'Request Date': '', 'Required Payment Date': '',
    'Requested By': '', 'Work Area / Dept': '', 'Urgency': '', 'Subtotal (INR)': 0,
    'GST / Tax (INR)': 0, 'Other Charges (INR)': 0, 'Less Advance / TDS (INR)': 0,
    'Net Payable (INR)': 0, 'Budget Status': '', 'Remarks / Justification': '',
    'Accounts Verified By': '', 'Accounts Verification Date': '',
    'Project Head Name': '', 'Project Head Status': '', 'Project Head Date': '',
    'Chairman Name': '', 'Chairman Status': '', 'Chairman Date': '',
    'Expense Items Count': 0, 'Created At': '', 'Last Updated': ''
  }]);
  const wsItems = XLSX.utils.json_to_sheet(itemsRows.length ? itemsRows : [{
    'Bill ID': '', 'Request No': '', 'Request Date': '', 'Requested By': '',
    'Item Sl No': '', 'Description': '', 'Bill Date': '', 'Quantity': '', 'Unit': '',
    'Rate (INR)': '', 'Amount (INR)': 0
  }]);
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

  XLSX.utils.book_append_sheet(workbook, wsBills, 'Bills_Master');
  XLSX.utils.book_append_sheet(workbook, wsItems, 'Expense_Items');
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Summary');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  calculateBillTotals,
  generateExcelBuffer
};
