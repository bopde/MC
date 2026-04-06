/**
 * One-time setup: creates all required sheets with headers.
 * Run this function once after creating a new Google Spreadsheet.
 *
 * Before running, set the spreadsheet ID:
 *   1. Open your Google Spreadsheet
 *   2. Copy the ID from the URL (between /d/ and /edit)
 *   3. Run setSpreadsheetId('YOUR_ID') from the Apps Script editor
 */

function setSpreadsheetId(id) {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', id);
  Logger.log('Spreadsheet ID set to: ' + id);
}

function getSpreadsheetId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('Spreadsheet ID not configured. Run setSpreadsheetId() first.');
  }
  return id;
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(getSpreadsheetId());
}

/**
 * Creates all sheets with headers. Safe to run multiple times -
 * skips sheets that already exist.
 */
function setupSheets() {
  var ss = getSpreadsheet();

  var schemas = {
    'Businesses': [
      'business_id', 'name', 'contact_name', 'email', 'address',
      'default_rate', 'currency', 'active'
    ],
    'WorkCodes': [
      'code_id', 'description', 'category', 'active'
    ],
    'Accounts': [
      'account_id', 'name', 'type', 'purpose', 'active'
    ],
    'BudgetRules': [
      'rule_id', 'name', 'tax_pct', 'gst_pct', 'donations_pct',
      'savings_pct', 'investments_pct', 'spending_pct', 'is_default', 'notes'
    ],
    'TimeEntries': [
      'entry_id', 'business_id', 'date', 'time_start', 'time_end',
      'hours', 'description', 'work_code', 'rate', 'line_total', 'invoice_id'
    ],
    'Expenses': [
      'expense_id', 'business_id', 'date', 'amount', 'description',
      'work_code', 'invoice_id'
    ],
    'Invoices': [
      'invoice_id', 'business_id', 'date_from', 'date_to', 'created_date',
      'subtotal', 'gst_amount', 'total', 'status', 'budget_rule_id',
      'description', 'notes'
    ],
    'BudgetAllocations': [
      'allocation_id', 'invoice_id', 'category', 'percentage',
      'amount', 'status', 'transfer_date', 'notes'
    ],
    'AccountSummaries': [
      'summary_id', 'account_id', 'month', 'ending_balance',
      'realised_gains', 'unrealised_gains', 'tax_paid', 'notes'
    ]
  };

  var existingSheets = ss.getSheets().map(function(s) { return s.getName(); });

  Object.keys(schemas).forEach(function(sheetName) {
    if (existingSheets.indexOf(sheetName) === -1) {
      var sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, schemas[sheetName].length).setValues([schemas[sheetName]]);
      sheet.getRange(1, 1, 1, schemas[sheetName].length)
        .setFontWeight('bold')
        .setBackground('#4a86c8')
        .setFontColor('#ffffff');
      sheet.setFrozenRows(1);
      Logger.log('Created sheet: ' + sheetName);
    } else {
      Logger.log('Sheet already exists: ' + sheetName);
    }
  });

  // Remove default "Sheet1" if it exists and is empty
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0) {
    ss.deleteSheet(sheet1);
  }

  Logger.log('Setup complete!');
  return 'Setup complete! Created sheets: ' + Object.keys(schemas).join(', ');
}
