import { NextResponse } from 'next/server';
const googleSheets = require('../../../lib/google-sheets');

export async function GET() {
  try {
    const status = await googleSheets.testGoogleSheetsConnection();
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      {
        configured: false,
        connected: false,
        error: err.message
      },
      { status: 500 }
    );
  }
}

