# Bluezone Habitat — Daily Accounts Approval Application

A complete Next.js 16 application with REST API endpoints, real-time live preview, print-to-PDF formatting, and direct **Google Sheets & Excel Database Integration**.

---

## 🌟 Google Sheets Integration Features

- **Direct Cloud Database**: Directly stores and reads bills from your designated **Google Sheet** (sole authoritative database).
- **Self-Initializing Sheets**: Automatically creates two tabs in your Google Sheet:
  1. `Bills_Master`: Master records of every approval sheet, approval names, dates, statuses, and net payable.
  2. `Expense_Items`: Itemized rows of individual expenses with description, date, quantity, unit, rate, and amount.
- **Fast Batch Operations**: Optimized with Google Sheets v4 `batchGet` and `batchUpdate` with memory-cached OAuth2 authentication.
- **Dynamic In-Memory Excel Export**: Generates `.xlsx` downloads directly from live Google Sheets data with zero disk database files.

---

## 📋 Step-by-Step Google Sheets Setup Guide

Follow these 4 simple steps to connect your Google Sheet:

### Step 1: Create a Google Sheet & Copy the ID
1. Go to [Google Sheets](https://sheets.new) and create a new blank spreadsheet.
2. Name it **"Bluezone Habitat Accounts"** (or any name you prefer).
3. Look at your browser address bar URL. It will look like this:
   ```
   https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
   ```
4. Copy the long ID between `/d/` and `/edit`.  
   In this example, the ID is: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`.

---

### Step 2: Create a Google Cloud Service Account
1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project** at the top $\rightarrow$ **New Project** (e.g. name it `Bluezone-Accounts`).
3. In the search bar at the top, search for **Google Sheets API** and click **Enable**.
4. In the left navigation menu, go to **IAM & Admin** $\rightarrow$ **Service Accounts**.
5. Click **＋ CREATE SERVICE ACCOUNT**:
   - Service account name: `bluezone-sheets`
   - Click **Create and Continue**, then click **Done**.
6. You will see your new service account in the table with an email address like:
   ```
   bluezone-sheets@your-project-12345.iam.gserviceaccount.com
   ```
7. Click on this email address $\rightarrow$ select the **Keys** tab $\rightarrow$ click **Add Key** $\rightarrow$ **Create new key**.
8. Select **JSON** and click **Create**.  
   A `.json` credentials file will download to your computer.

---

### Step 3: Share the Google Sheet with your Service Account Email
1. Open your Google Sheet from **Step 1**.
2. Click the green **Share** button in the top right.
3. In the "Add people and groups" box, paste your Service Account Email:
   ```
   bluezone-sheets@your-project-12345.iam.gserviceaccount.com
   ```
4. Set the role to **Editor** and uncheck "Notify people" (service accounts don't receive emails).
5. Click **Share** (or **Save**).

---

### Step 4: Configure `.env.local`
In the root of `Bluezone_Habitat_Daily_Billing_App`, open or create `.env.local`.

Open the JSON file you downloaded in Step 2. You will see:
- `"client_email"`
- `"private_key"`

Fill in `.env.local` like this:
```env
GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms
GOOGLE_SERVICE_ACCOUNT_EMAIL=bluezone-sheets@your-project-12345.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```
*(Make sure to keep the double quotes around `GOOGLE_PRIVATE_KEY` and keep the `\n` line breaks).*

---

### Step 5: Start the App & Verify Connection
```bash
npm run dev
```

You can verify your connection anytime by opening:
[http://localhost:3000/api/sheets-status](http://localhost:3000/api/sheets-status)

It will respond with:
```json
{
  "configured": true,
  "connected": true,
  "sheetTitle": "Bluezone Habitat Accounts",
  "message": "Connected successfully to Google Sheets!"
}
```

Now, every time you click **✓ Save bill** in the app, it will instantly write to your Google Sheet! When you open the app, it fetches live bills from your Google Sheet!

---

## 🚀 Running the App

### Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### Production Build
```bash
npm run build
npm start
```
