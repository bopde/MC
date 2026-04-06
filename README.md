# Finance Tracker

A personal finance management web app built on Google Apps Script with Google Sheets as the backend. Designed for consultants who work with multiple businesses, need to track hours, generate invoices, allocate budgets, and monitor accounts across US and NZ tax jurisdictions.

## What It Does

### 1. Hours & Expenses (Frontend)
- **Time entry**: Select a business and work code from dropdowns, enter start/end times, and the system calculates hours and line totals server-side.
- **Expense tracking**: Log expenses with date, amount, description, and work code.
- **Filtering**: View entries by business, date range, or invoiced status.
- **Auto-fill**: Selecting a business auto-fills the default hourly rate.

### 2. Invoices (Frontend + Backend)
- **Create**: Select a business and date range to preview all uninvoiced time entries and expenses. One click creates the invoice.
- **View/Print**: Each invoice renders as a print-friendly HTML page with `@media print` CSS. Use browser print (Ctrl+P) for PDF/paper.
- **Status tracking**: Invoices flow through draft -> sent -> paid.
- **GST**: 15% NZ GST is automatically calculated on the subtotal.
- **Deduplication**: Time entries and expenses are marked with the invoice ID once invoiced, preventing double-billing.

### 3. Budget Allocations (Frontend + Backend)
- **Budget rules**: Define percentage splits for: tax, GST, donations, savings, investments, and spending. Percentages must sum to 100%.
- **Allocate**: Select a paid invoice and a budget rule. The system calculates the dollar amount for each category.
- **Track transfers**: Mark allocations as pending -> transferred -> reconciled to track actual money movement.
- **Summary view**: See totals per category across all invoices, with pending vs. transferred breakdowns.

### 4. Account Summaries (Frontend)
- **Monthly entry**: For each account, enter the month-end balance, realised/unrealised gains, tax paid, and notes.
- **Year overview**: View all accounts across 15 months (Jan-Dec + Jan-Mar of the following year) to cover the US/NZ tax overlap period. Month-over-month balance changes are highlighted.
- **Upsert logic**: Re-entering data for an existing account+month updates rather than duplicates.

### 5. Settings (Frontend)
- **Businesses**: Name, contact, email, address, default rate, currency. Soft-delete (deactivate) to preserve historical references.
- **Work Codes**: Short codes (DEV, DESIGN, etc.) with descriptions and billable/non-billable categories.
- **Accounts**: Bank, investment, hold, crypto, or other accounts with purpose tags.
- **Budget Rules**: Named percentage split configurations. One can be marked as the default.

## Architecture Decisions

### Why Google Apps Script?
- **Zero credential exposure**: The app runs under your Google account. No API keys, OAuth tokens, or secrets are stored in the code. The public GitHub repo contains only source code.
- **Google Sheets as database**: All data lives in a private Google Spreadsheet that only you can access. The Apps Script web app reads/writes via server-side `SpreadsheetApp` calls.
- **Simple deployment**: Push code with `clasp`, deploy as a web app. No hosting, no infrastructure.
- **Built-in RPC**: Frontend calls the backend via `google.script.run` -- no CORS, no API endpoints, no fetch calls.

### Security Model
| Layer | Protection |
|-------|-----------|
| **Source code** | Public on GitHub. Contains zero credentials or sensitive data. |
| **Script ID** | `.clasp.json` is gitignored. Only `.clasp.json.example` (with a placeholder) is committed. |
| **Spreadsheet ID** | Stored in Apps Script Properties (`PropertiesService`), never in code. |
| **Spreadsheet data** | Private Google Sheet. Not shared with anyone. Only the Apps Script web app can access it. |
| **Web app access** | Deployed with "Execute as: Me" and "Who has access: Only myself". |

### Data Integrity
- **Dropdown-driven entry**: Users select businesses, work codes, and accounts from dropdowns populated from reference tables. No free-text entry for these fields, preventing "Acme" vs "ACME" duplication.
- **Sequential IDs with locking**: `LockService.getScriptLock()` prevents race conditions when generating IDs across concurrent tabs.
- **Foreign keys**: All transactional data references entities by ID, not name. Renaming a business updates the display everywhere automatically.
- **Soft deletes**: Deactivating a business/code/account hides it from dropdowns but preserves all historical data.
- **Upsert for summaries**: Account summaries for the same account+month are updated, not duplicated.

### Frontend vs Backend Split
| Task | Where | Why |
|------|-------|-----|
| Form rendering, navigation, filtering | Frontend (JS) | Fast, responsive UI |
| Calculating hours, line totals, GST | Backend (Apps Script) | Single source of truth |
| ID generation | Backend | Atomic, locked |
| Invoice generation | Backend | Aggregation + marking entries as invoiced in one transaction |
| Budget allocation math | Backend | Validated percentages, atomic writes |
| Print formatting | Frontend | `@media print` CSS, browser-native |

## Google Sheets Structure

The spreadsheet has **9 tabs**:

| Tab | Purpose | Key Fields |
|-----|---------|-----------|
| **Businesses** | Client/employer reference | name, default_rate, currency |
| **WorkCodes** | Job codes (DEV, DESIGN, etc.) | code_id, description, category |
| **Accounts** | Bank/investment accounts | name, type, purpose |
| **BudgetRules** | Percentage split templates | tax_pct through spending_pct |
| **TimeEntries** | Logged work hours | business_id, date, start/end, hours, rate, line_total |
| **Expenses** | Reimbursable expenses | business_id, date, amount, description |
| **Invoices** | Generated invoices | business_id, period, subtotal, GST, total, status |
| **BudgetAllocations** | Per-invoice budget splits | invoice_id, category, amount, status |
| **AccountSummaries** | Monthly account snapshots | account_id, month, balance, gains, tax |

## Setup Instructions

### Prerequisites
- A Google account
- [Node.js](https://nodejs.org/) installed
- [clasp](https://github.com/google/clasp) installed: `npm install -g @google/clasp`

### Step 1: Create the Google Spreadsheet
1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Copy the spreadsheet ID from the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

### Step 2: Create the Apps Script Project
1. Login to clasp: `clasp login`
2. Create a new Apps Script project: `clasp create --title "Finance Tracker" --type webapp`
3. This creates a `.clasp.json` file with your script ID. Keep it private (it's gitignored).

### Step 3: Push the Code
```bash
cd src
clasp push
```

### Step 4: Configure the Spreadsheet
1. Open the Apps Script editor: `clasp open`
2. In the Script editor, go to **Project Settings** (gear icon) > **Script Properties**
3. Add a new property:
   - Property: `SPREADSHEET_ID`
   - Value: your spreadsheet ID from Step 1
4. In the editor, select `setupSheets` from the function dropdown and click **Run**
5. Authorize when prompted. This creates all 9 tabs with headers.

### Step 5: Deploy
1. In the Apps Script editor, click **Deploy > New deployment**
2. Select type: **Web app**
3. Set:
   - Execute as: **Me**
   - Who has access: **Only myself**
4. Click **Deploy** and authorize when prompted.
5. Copy the web app URL -- this is your Finance Tracker.

### Updating
After making code changes:
```bash
cd src
clasp push
```
Then in Apps Script editor: **Deploy > Manage deployments > Edit > Version: New version > Deploy**

## Project Structure

```
MC/
├── .gitignore                    # Keeps .clasp.json and secrets out of git
├── .clasp.json.example           # Template for clasp config
├── README.md                     # This file
└── src/
    ├── appsscript.json           # Apps Script manifest (scopes, timezone)
    ├── server/
    │   ├── Main.gs               # doGet() entry point, HTML include helper
    │   ├── Setup.gs              # One-time sheet creation and config
    │   ├── IdService.gs          # Sequential ID generation with locking
    │   ├── SheetService.gs       # Generic CRUD for all sheets
    │   ├── HoursService.gs       # Time entry and expense logic
    │   ├── InvoiceService.gs     # Invoice generation and management
    │   ├── BudgetService.gs      # Budget allocation and tracking
    │   ├── AccountService.gs     # Monthly account summaries
    │   ├── SettingsService.gs    # Reference data CRUD (businesses, codes, etc.)
    │   └── ClientWrappers.gs     # Adapters for google.script.run (single-arg)
    └── client/
        ├── index.html            # SPA shell with nav and module includes
        ├── css/
        │   └── styles.css.html   # App styles + print styles
        └── js/
            ├── utils.js.html     # Shared utilities, caching, server call wrapper
            ├── app.js.html       # Hash router and page lifecycle
            ├── hours.js.html     # Hours & expenses module
            ├── invoices.js.html  # Invoice creation and viewing
            ├── budget.js.html    # Budget allocation module
            ├── accounts.js.html  # Account summaries module
            └── settings.js.html  # Reference data management
```

## Design Rationale

### Why not a React/Vue SPA with a separate backend?
Google Apps Script's `HtmlService` doesn't support modern JS module systems or build tools. Vanilla JS with hash routing is the simplest approach that actually works within the Apps Script sandbox. It keeps the prototype at zero dependencies beyond Pico CSS (loaded via CDN for clean form styling).

### Why pipe-delimited strings for multi-arg functions?
`google.script.run` only passes one argument to server functions. Rather than wrapping everything in objects (which works for new data but is awkward for simple status updates), pipe-delimited strings are used for action-oriented calls (status changes, toggles). Object parameters are used for data-heavy calls (adding entries, generating invoices).

### Why 15-month year overview?
The user files taxes in both the US (Jan-Dec) and NZ (Apr-Mar). Showing Jan through March of the following year in the year overview covers the overlap period and makes tax prep straightforward.

### Why soft deletes?
Hard-deleting a business would break all historical time entries and invoices that reference it. Soft deletes (setting `active = false`) hide entities from dropdowns while preserving data integrity.

## Future Improvements
- **Invoice PDF generation**: Use Apps Script to create a formatted Google Doc or Sheet as a polished invoice.
- **Dashboard**: Summary page with YTD income, outstanding invoices, and budget adherence.
- **Multi-currency support**: Exchange rate tracking for NZD/USD conversions.
- **Recurring entries**: Templates for regular weekly/monthly time entries.
- **Data export**: CSV/JSON export for tax accountant handoff.
- **Automated GST toggle**: Option to make invoices GST-inclusive or exclusive per business.
