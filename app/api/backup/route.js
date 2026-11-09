import { NextResponse } from 'next/server';
const googleSheets = require('../../../lib/google-sheets');

export async function GET() {
  try {
    let bills = [];
    if (googleSheets.isGoogleSheetsConfigured()) {
      bills = await googleSheets.fetchBillsFromGoogleSheets();
    }

    const backupPack = {
      application: 'Bluezone Habitat Daily Accounts',
      version: 1,
      exportedAt: new Date().toISOString(),
      bills
    };

    return NextResponse.json(backupPack);
  } catch (error) {
    console.error('Error generating backup:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate backup: ' + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    if (!data || !Array.isArray(data.bills)) {
      return NextResponse.json(
        { success: false, error: 'Invalid backup file format' },
        { status: 400 }
      );
    }

    const currentBills = await googleSheets.fetchBillsFromGoogleSheets();
    const map = new Map(currentBills.map(b => [b.id, b]));

    data.bills.forEach(b => {
      if (b && b.id && b.form && Array.isArray(b.items)) {
        map.set(b.id, b);
      }
    });

    const merged = Array.from(map.values()).sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    );

    await googleSheets.syncBillsToGoogleSheets(merged);

    return NextResponse.json({
      success: true,
      importedCount: data.bills.length,
      totalBills: merged.length,
      bills: merged
    });
  } catch (error) {
    console.error('Error importing backup:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to import backup: ' + error.message },
      { status: 500 }
    );
  }
}
