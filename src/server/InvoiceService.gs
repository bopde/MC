/**
 * Invoice generation and management service.
 */

/**
 * Get uninvoiced time entries and expenses for a business within a date range.
 * Called internally by generateInvoice. Client calls go through ClientWrappers.gs.
 */
function getUninvoicedItemsInternal(businessId, dateFrom, dateTo) {
  var from = new Date(dateFrom);
  var to = new Date(dateTo);
  to.setHours(23, 59, 59);

  var timeEntries = getAll('TimeEntries').filter(function(te) {
    var d = new Date(te.date);
    return te.business_id === businessId &&
           (!te.invoice_id || te.invoice_id === '') &&
           d >= from && d <= to;
  });

  var expenses = getAll('Expenses').filter(function(exp) {
    var d = new Date(exp.date);
    return exp.business_id === businessId &&
           (!exp.invoice_id || exp.invoice_id === '') &&
           d >= from && d <= to;
  });

  return { timeEntries: timeEntries, expenses: expenses };
}

/**
 * Generate an invoice from time entries and expenses.
 * Marks all included items as invoiced.
 *
 * @param {Object} params - {
 *   businessId, dateFrom, dateTo, includeGst, gstRate,
 *   description, notes, lineDescriptions: { workCode: "description" }
 * }
 * @returns {Object} The created invoice
 */
function generateInvoice(params) {
  var items = getUninvoicedItemsInternal(params.businessId, params.dateFrom, params.dateTo);

  if (items.timeEntries.length === 0 && items.expenses.length === 0) {
    throw new Error('No uninvoiced items found for the selected period.');
  }

  // Calculate subtotal from time entries
  var timeSubtotal = items.timeEntries.reduce(function(sum, te) {
    return sum + (Number(te.line_total) || 0);
  }, 0);

  // Calculate subtotal from expenses
  var expenseSubtotal = items.expenses.reduce(function(sum, exp) {
    return sum + (Number(exp.amount) || 0);
  }, 0);

  var subtotal = timeSubtotal + expenseSubtotal;

  // GST: optional, configurable rate
  var includeGst = params.includeGst === true || params.includeGst === 'true';
  var gstRate = includeGst ? (Number(params.gstRate) || 0.15) : 0;
  var gstAmount = includeGst ? Math.round(subtotal * gstRate * 100) / 100 : 0;
  var total = subtotal + gstAmount;

  // Create the invoice
  var invoice = appendRow('Invoices', {
    business_id: params.businessId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    created_date: new Date().toISOString().split('T')[0],
    include_gst: includeGst,
    gst_rate: gstRate,
    subtotal: subtotal,
    gst_amount: gstAmount,
    total: total,
    status: 'draft',
    budget_rule_id: '',
    tax_withheld: Number(params.taxWithheld) || 0,
    description: params.description || '',
    notes: params.notes || ''
  });

  // Mark time entries as invoiced (look up column dynamically)
  var ss = getSpreadsheet();
  var teSheet = ss.getSheetByName('TimeEntries');
  var teInvCol = getColumnIndex(teSheet, 'invoice_id');
  items.timeEntries.forEach(function(te) {
    teSheet.getRange(te._rowIndex, teInvCol).setValue(invoice.invoice_id);
  });

  // Mark expenses as invoiced
  var expSheet = ss.getSheetByName('Expenses');
  var expInvCol = getColumnIndex(expSheet, 'invoice_id');
  items.expenses.forEach(function(exp) {
    expSheet.getRange(exp._rowIndex, expInvCol).setValue(invoice.invoice_id);
  });

  return invoice;
}

/**
 * Get full invoice data including line items for display/printing.
 */
function getInvoiceDetails(invoiceId) {
  var invoice = findById('Invoices', invoiceId);
  if (!invoice) throw new Error('Invoice not found: ' + invoiceId);

  var business = findById('Businesses', invoice.business_id);

  var timeEntries = getAll('TimeEntries').filter(function(te) {
    return te.invoice_id === invoiceId;
  });

  var expenses = getAll('Expenses').filter(function(exp) {
    return exp.invoice_id === invoiceId;
  });

  // Group time entries by work code
  var codeGroups = {};
  timeEntries.forEach(function(te) {
    var code = te.work_code;
    if (!codeGroups[code]) {
      codeGroups[code] = { code: code, entries: [], totalHours: 0, totalAmount: 0, rate: 0 };
    }
    codeGroups[code].entries.push(te);
    codeGroups[code].totalHours += Number(te.hours) || 0;
    codeGroups[code].totalAmount += Number(te.line_total) || 0;
    if (te.rate) codeGroups[code].rate = Number(te.rate);
  });

  // Get allocations if they exist
  var allocations = getAll('BudgetAllocations').filter(function(a) {
    return a.invoice_id === invoiceId;
  });

  // Get "my details" for the invoice header
  var myDetails = getMyDetails();

  return {
    invoice: invoice,
    business: business,
    myDetails: myDetails,
    codeGroups: Object.values(codeGroups),
    expenses: expenses,
    allocations: allocations
  };
}

/**
 * Update invoice status (draft -> sent -> paid).
 */
function updateInvoiceStatus(invoiceId, newStatus) {
  var validStatuses = ['draft', 'sent', 'paid', 'void'];
  if (validStatuses.indexOf(newStatus) === -1) {
    throw new Error('Invalid status: ' + newStatus);
  }

  var invoice = findById('Invoices', invoiceId);
  if (!invoice) throw new Error('Invoice not found: ' + invoiceId);

  invoice.status = newStatus;
  updateRow('Invoices', invoice._rowIndex, invoice);
  return invoice;
}

/**
 * Get all invoices with business name and currency attached.
 */
function getInvoicesWithDetails() {
  var invoices = getAll('Invoices');
  var businesses = getAll('Businesses');
  var bizMap = {};
  businesses.forEach(function(b) { bizMap[b.business_id] = b; });

  return invoices.map(function(inv) {
    var biz = bizMap[inv.business_id];
    inv.business_name = biz ? biz.name : 'Unknown';
    inv.currency = biz ? biz.currency : 'NZD';
    return inv;
  });
}
