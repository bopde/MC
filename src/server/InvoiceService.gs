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
  to.setHours(23, 59, 59); // Include the full end date

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
 * @param {Object} params - { businessId, dateFrom, dateTo, description, notes, lineDescriptions }
 *   lineDescriptions: { workCode: "description for this code" }
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
  var gstAmount = Math.round(subtotal * 0.15 * 100) / 100; // 15% NZ GST
  var total = subtotal + gstAmount;

  // Create the invoice
  var invoice = appendRow('Invoices', {
    business_id: params.businessId,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    created_date: new Date().toISOString().split('T')[0],
    subtotal: subtotal,
    gst_amount: gstAmount,
    total: total,
    status: 'draft',
    budget_rule_id: '',
    description: params.description || '',
    notes: params.notes || ''
  });

  // Mark time entries as invoiced
  var ss = getSpreadsheet();
  var teSheet = ss.getSheetByName('TimeEntries');
  items.timeEntries.forEach(function(te) {
    teSheet.getRange(te._rowIndex, 11).setValue(invoice.invoice_id); // invoice_id column
  });

  // Mark expenses as invoiced
  var expSheet = ss.getSheetByName('Expenses');
  items.expenses.forEach(function(exp) {
    expSheet.getRange(exp._rowIndex, 7).setValue(invoice.invoice_id); // invoice_id column
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
      codeGroups[code] = { code: code, entries: [], totalHours: 0, totalAmount: 0 };
    }
    codeGroups[code].entries.push(te);
    codeGroups[code].totalHours += Number(te.hours) || 0;
    codeGroups[code].totalAmount += Number(te.line_total) || 0;
  });

  // Get allocations if they exist
  var allocations = getAll('BudgetAllocations').filter(function(a) {
    return a.invoice_id === invoiceId;
  });

  return {
    invoice: invoice,
    business: business,
    codeGroups: Object.values(codeGroups),
    expenses: expenses,
    allocations: allocations
  };
}

/**
 * Update invoice status (draft -> sent -> paid).
 */
function updateInvoiceStatus(invoiceId, newStatus) {
  var validStatuses = ['draft', 'sent', 'paid'];
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
 * Get all invoices with business name attached.
 */
function getInvoicesWithDetails() {
  var invoices = getAll('Invoices');
  var businesses = getAll('Businesses');
  var bizMap = {};
  businesses.forEach(function(b) { bizMap[b.business_id] = b; });

  return invoices.map(function(inv) {
    inv.business_name = bizMap[inv.business_id] ? bizMap[inv.business_id].name : 'Unknown';
    return inv;
  });
}
