import { NextResponse } from 'next/server';
const googleSheets = require('../../../lib/google-sheets');
const db = require('../../../lib/excel-db');

export async function GET() {
  try {
    if (!googleSheets.isGoogleSheetsConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Sheets is not configured in .env.local' },
        { status: 500 }
      );
    }

    const bills = await googleSheets.fetchBillsFromGoogleSheets();

    const totalAmount = bills.reduce((sum, b) => {
      const totals = db.calculateBillTotals(b);
      return sum + totals.netPayable;
    }, 0);

    return NextResponse.json({
      success: true,
      source: 'google_sheets',
      bills,
      stats: {
        totalBills: bills.length,
        totalAmount: Math.round(totalAmount * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error fetching bills from Google Sheets:', error);
    return NextResponse.json(
      { success: false, error: 'Google Sheets fetch failed: ' + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || !body.form || !Array.isArray(body.items)) {
      return NextResponse.json(
        { success: false, error: 'Invalid bill payload format' },
        { status: 400 }
      );
    }

    if (!googleSheets.isGoogleSheetsConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Sheets is not configured in .env.local' },
        { status: 500 }
      );
    }

    const { savedBill, allBills } = await googleSheets.upsertBillInGoogleSheets(body);

    const totalAmount = allBills.reduce((sum, b) => {
      const totals = db.calculateBillTotals(b);
      return sum + totals.netPayable;
    }, 0);

    return NextResponse.json({
      success: true,
      googleSheetsSynced: true,
      bill: savedBill,
      bills: allBills,
      stats: {
        totalBills: allBills.length,
        totalAmount: Math.round(totalAmount * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error saving bill to Google Sheets:', error);
    return NextResponse.json(
      { success: false, error: 'Google Sheets save failed: ' + error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing bill id' },
        { status: 400 }
      );
    }

    if (!googleSheets.isGoogleSheetsConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Google Sheets is not configured in .env.local' },
        { status: 500 }
      );
    }

    const { deleted, allBills } = await googleSheets.deleteBillFromGoogleSheets(id);

    const totalAmount = allBills.reduce((sum, b) => {
      const totals = db.calculateBillTotals(b);
      return sum + totals.netPayable;
    }, 0);

    return NextResponse.json({
      success: true,
      deleted,
      bills: allBills,
      stats: {
        totalBills: allBills.length,
        totalAmount: Math.round(totalAmount * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error deleting bill from Google Sheets:', error);
    return NextResponse.json(
      { success: false, error: 'Google Sheets delete failed: ' + error.message },
      { status: 500 }
    );
  }
}
