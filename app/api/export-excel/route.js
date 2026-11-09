import { NextResponse } from 'next/server';
const googleSheets = require('../../../lib/google-sheets');
const db = require('../../../lib/excel-db');

export async function GET() {
  try {
    let bills = [];
    if (googleSheets.isGoogleSheetsConfigured()) {
      try {
        bills = await googleSheets.fetchBillsFromGoogleSheets();
      } catch (err) {
        console.error('Failed to fetch from Google Sheets for Excel export:', err.message);
      }
    }

    const fileBuffer = db.generateExcelBuffer(bills);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Bluezone_Habitat_Daily_Billing_Database.xlsx"'
      }
    });
  } catch (error) {
    console.error('Error exporting Excel file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate Excel download: ' + error.message },
      { status: 500 }
    );
  }
}
