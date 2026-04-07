# Finance Tracker

A personal finance management web app built on Google Apps Script with Google Sheets as the backend. Designed for consultants who work with multiple businesses, need to track hours, generate invoices, allocate budgets, and monitor accounts across US and NZ tax jurisdictions.

## What It Does

### 1. Hours & Expenses (Frontend)
- **Time entry**: Select a business and work code from dropdowns (showing "CODE - Description"), enter start/end times, and the system calculates hours and line totals server-side.
- **Expense tracking**: Log expenses with date, amount, description, and work code.
- **Filtering**: View entries by business, date range, or invoiced status.
- **Auto-fill**: Selecting a business auto-fills the default hourly rate.
- **Currency**: All amounts display in the currency of the associated business (NZD, USD, etc.).

### 2. Invoices (Frontend + Backend)
- **Create**: Select a business and date range to preview all uninvoiced time entries and expenses (shown individually). Confirmation dialog before creating.
- **GST toggle**: Choose whether to include GST, and at what rate (defaults to 15%). US clients can have GST omitted.
- **Tax withheld**: Record tax already withheld by the payer at invoice creation time.
- **Invoice "From"**: Your business details (name, address, tax number, bank account, payment terms) appear on printed invoices. Configured in Settings > My Details.
- **View/Print**: Print-friendly HTML with `@media print` CSS. Services are grouped by work code with descriptions. Expenses listed individually.
- **Status tracking**: Invoices flow through draft -> sent -> paid (or void).
- **Deduplication**: Time entries and expenses are marked with the invoice ID once invoiced, preventing double-billing.

### 3. Budget Allocations (Frontend + Backend)
- **Budget rules**: Define percentage splits across 8 categories: **Tax Withheld, Tax To Pay, ACC Withheld, ACC To Pay, Donate, Save, Invest, Spend**. Percentages must sum to 100%.
- **Withheld categories**: "Tax Withheld" and "ACC Withheld" percentages apply to the gross invoice total. All other categories apply to the net amount (total minus withheld). Withheld allocations are auto-marked as "transferred."
- **Tax already withheld**: When allocating, enter the amount already withheld by the payer. This reduces the pool available for other categories.
- **Only paid invoices**: Budget allocation is restricted to invoices marked as "paid."
- **Track transfers**: Mark allocations as pending -> transferred -> reconciled to track actual money movement.
- **Summary view**: Dashboard cards for each category with totals, pending vs. transferred breakdowns, and detailed per-invoice drill-down.

### 4. Account Summaries (Frontend)
- **Monthly entry**: For each account, enter the month-end balance, realised/unrealised gains, tax paid, and notes. Currency shown per account.
- **Year overview**: View all accounts across 15 months (Jan-Dec + Jan-Mar of the following year) to cover the US/NZ tax overlap period. Month-over-month balance changes are colour-coded (green/red).
- **Upsert logic**: Re-entering data for an existing account+month updates rather than duplicates.

### 5. Settings (Frontend)
- **My Details**: Your name, address, email, phone, tax number, GST number, bank account, and payment terms. These appear on invoices.
- **Businesses**: Name, contact, email, address, default rate, currency (NZD/USD/AUD/GBP/EUR). Soft-delete (deactivate) to preserve historical references.
- **Work Codes**: Short codes (DEV, DESIGN, etc.) with descriptions and billable/non-billable categories. Easily added from the frontend.
- **Accounts**: Bank, investment, hold, crypto, or other accounts with currency and purpose tags.
- **Budget Rules**: Named percentage split configurations across the 8 categories. One can be marked as the default.

## Architecture

### Why Google Apps Script?
- **Zero credential exposure**: The app runs under your Google account. No API keys, OAuth tokens, or secrets in the code.
- **Google Sheets as database**: All data lives in a private Google Spreadsheet.
- **Simple deployment**: Push code with `clasp` or paste manually into the Apps Script editor. No hosting needed.
- **Built-in RPC**: Frontend calls the backend via `google.script.run` -- no CORS, no API endpoints.

### Security Model
| Layer | Protection |
|-------|-----------|
| **Source code** | Public on GitHub. Contains zero credentials or sensitive data. |
| **Script ID** | `.clasp.json` is gitignored. Only `.clasp.json.example` is committed. |
| **Spreadsheet ID** | Stored in Apps Script Properties (`PropertiesService`), never in code. |
| **Spreadsheet data** | Private Google Sheet, not shared. Only the Apps Script web app can access it. |
| **Web app access** | Deployed with "Execute as: Me" and "Who has access: Only myself". |

### Data Integrity
- **Dropdown-driven entry**: Businesses, work codes, and accounts are selected from dropdowns, preventing duplication.
- **Sequential IDs with locking**: `LockService` prevents race conditions across concurrent tabs.
- **Foreign keys by ID**: Renaming a business updates display everywhere automatically.
- **Soft deletes**: Deactivating hides from dropdowns but preserves historical data.
- **Upsert for summaries**: Account summaries for the same account+month are updated, not duplicated.
- **Dynamic column lookups**: Column indices are resolved by header name, not hardcoded positions.

## Google Sheets Structure

The spreadsheet has **10 tabs**:

| Tab | Purpose | Key Fields |
|-----|---------|-----------|
| **MyDetails** | Your invoice details (key/value) | business_name, tax_number, bank_account, etc. |
| **Businesses** | Client/employer reference | name, default_rate, currency |
| **WorkCodes** | Job codes (DEV, DESIGN, etc.) | code_id, description, category |
| **Accounts** | Bank/investment accounts | name, type, currency, purpose |
| **BudgetRules** | Percentage split templates | tax_withheld_pct through spend_pct |
| **TimeEntries** | Logged work hours | business_id, date, start/end, hours, rate, line_total |
| **Expenses** | Reimbursable expenses | business_id, date, amount, description |
| **Invoices** | Generated invoices | business_id, period, include_gst, gst_rate, tax_withheld, total, status |
| **BudgetAllocations** | Per-invoice budget splits | invoice_id, category, amount, status |
| **AccountSummaries** | Monthly account snapshots | account_id, month, balance, gains, tax |

## Setup Instructions

### Option A: Browser Only (No Tools Needed)
1. Create a new Google Spreadsheet
2. Go to **Extensions > Apps Script**
3. For each `.gs` file in `src/server/`, create a new script file and paste the contents
4. For each `.html` file in `src/client/`, create a new HTML file and paste the contents
5. Copy `src/appsscript.json` contents into the manifest (View > Show manifest file)
6. In **Project Settings > Script Properties**, add `SPREADSHEET_ID` = your spreadsheet ID
7. Run the `setupSheets` function to create all tabs
8. **Deploy > New deployment > Web app** (Execute as: Me, Access: Only myself)

### Option B: Using clasp
1. Install clasp: `npm install -g @google/clasp`
2. Login: `clasp login`
3. Create project: `clasp create --title "Finance Tracker" --type webapp`
4. Push code: `cd src && clasp push`
5. Open editor: `clasp open`
6. Set `SPREADSHEET_ID` in Script Properties
7. Run `setupSheets`
8. Deploy as web app

## Project Structure

```
MC/
├── .gitignore
├── .clasp.json.example
├── README.md
└── src/
    ├── appsscript.json
    ├── server/
    │   ├── Main.gs               # doGet() entry point
    │   ├── Setup.gs              # One-time sheet creation
    │   ├── IdService.gs          # Sequential ID generation with locking
    │   ├── SheetService.gs       # Generic CRUD + dynamic column lookup
    │   ├── HoursService.gs       # Time entry and expense logic
    │   ├── InvoiceService.gs     # Invoice generation with GST toggle
    │   ├── BudgetService.gs      # Budget allocation (8 categories)
    │   ├── AccountService.gs     # Monthly account summaries (15-month)
    │   ├── SettingsService.gs    # Reference data + My Details CRUD
    │   └── ClientWrappers.gs     # Adapters for google.script.run
    └── client/
        ├── index.html            # SPA shell
        ├── css/
        │   └── styles.css.html   # App + print styles
        └── js/
            ├── utils.js.html     # Currency formatting, caching, helpers
            ├── app.js.html       # Hash router
            ├── hours.js.html     # Hours & expenses module
            ├── invoices.js.html  # Invoice creation, view, print
            ├── budget.js.html    # Budget allocation module
            ├── accounts.js.html  # Account summaries module
            └── settings.js.html  # My Details, businesses, codes, accounts, rules
```
