/**
 * Wrapper functions for client-side calls.
 *
 * google.script.run can only pass a single argument per call.
 * These wrappers accept pipe-delimited strings or single objects
 * and forward to the actual service functions.
 */

/**
 * Update invoice status from client.
 * @param {string} params - "invoiceId|newStatus"
 */
function updateInvoiceStatusFromClient(params) {
  var parts = params.split('|');
  return updateInvoiceStatus(parts[0], parts[1]);
}

/**
 * Allocate budget from client.
 * @param {string} params - "invoiceId|ruleId"
 */
function allocateBudgetFromClient(params) {
  var parts = params.split('|');
  return allocateBudget(parts[0], parts[1]);
}

/**
 * Update allocation status from client.
 * @param {string} params - "allocationId|newStatus|transferDate"
 */
function updateAllocationStatusFromClient(params) {
  var parts = params.split('|');
  return updateAllocationStatus(parts[0], parts[1], parts[2] || null);
}

/**
 * Toggle active status of a reference entity (Business, WorkCode, Account).
 * @param {string} params - "sheetName|rowIndex|active"
 */
function toggleEntityFromClient(params) {
  var parts = params.split('|');
  var sheetName = parts[0];
  var rowIndex = parseInt(parts[1], 10);
  var active = parts[2] === 'true';

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  // Find the 'active' column
  var activeCol = headers.indexOf('active');
  if (activeCol === -1) throw new Error('No active column in ' + sheetName);

  row[activeCol] = active;
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  return { success: true };
}

/**
 * Get uninvoiced items - wrapper that accepts an object.
 * (google.script.run passes objects fine, this is just for clarity)
 */
function getUninvoicedItems(params) {
  // params is already an object with { businessId, dateFrom, dateTo }
  // The InvoiceService function signature matches
  var from = new Date(params.dateFrom);
  var to = new Date(params.dateTo);
  to.setHours(23, 59, 59);

  var timeEntries = getAll('TimeEntries').filter(function(te) {
    var d = new Date(te.date);
    return te.business_id === params.businessId &&
           (!te.invoice_id || te.invoice_id === '') &&
           d >= from && d <= to;
  });

  var expenses = getAll('Expenses').filter(function(exp) {
    var d = new Date(exp.date);
    return exp.business_id === params.businessId &&
           (!exp.invoice_id || exp.invoice_id === '') &&
           d >= from && d <= to;
  });

  return { timeEntries: timeEntries, expenses: expenses };
}
