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

  // Generate MMYY invoice ID
  var invoiceId = generateInvoiceId();

  var invoice = appendRow('Invoices', {
    invoice_id: invoiceId,
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
    tax_withheld: 0,
    description: params.description || '',
    notes: params.notes || '',
    line_descriptions: params.lineDescriptions ? JSON.stringify(params.lineDescriptions) : ''
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

  // Parse stored line descriptions
  var lineDescs = {};
  if (invoice.line_descriptions) {
    try { lineDescs = JSON.parse(invoice.line_descriptions); } catch (e) {}
  }

  // Group time entries by work code
  var codeGroups = {};
  timeEntries.forEach(function(te) {
    var code = te.work_code;
    if (!codeGroups[code]) {
      codeGroups[code] = { code: code, description: lineDescs[code] || '', entries: [], totalHours: 0, totalAmount: 0, rate: 0 };
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
  var validTransitions = {
    draft: ['sent', 'void'],
    sent: ['paid', 'void'],
    paid: ['void'],
    void: []
  };

  var invoice = findById('Invoices', invoiceId);
  if (!invoice) throw new Error('Invoice not found: ' + invoiceId);

  var allowed = validTransitions[invoice.status] || [];
  if (allowed.indexOf(newStatus) === -1) {
    throw new Error('Cannot change status from "' + invoice.status + '" to "' + newStatus + '".');
  }

  if (newStatus === 'void') {
    return voidInvoice(invoice);
  }

  invoice.status = newStatus;
  updateRow('Invoices', invoice._rowIndex, invoice);
  return invoice;
}

/**
 * Void an invoice: block if budget allocations exist, then unlink
 * time entries and expenses so they can be re-invoiced.
 */
function voidInvoice(invoice) {
  var allocations = getAll('BudgetAllocations').filter(function(a) {
    return a.invoice_id === invoice.invoice_id;
  });
  if (allocations.length > 0) {
    throw new Error('Cannot void — this invoice has budget allocations. Remove them first.');
  }

  var ss = getSpreadsheet();

  // Unlink time entries
  var teSheet = ss.getSheetByName('TimeEntries');
  if (teSheet) {
    var teInvCol = getColumnIndex(teSheet, 'invoice_id');
    var teAll = getAll('TimeEntries');
    teAll.forEach(function(te) {
      if (te.invoice_id === invoice.invoice_id) {
        teSheet.getRange(te._rowIndex, teInvCol).setValue('');
      }
    });
  }

  // Unlink expenses
  var expSheet = ss.getSheetByName('Expenses');
  if (expSheet) {
    var expInvCol = getColumnIndex(expSheet, 'invoice_id');
    var expAll = getAll('Expenses');
    expAll.forEach(function(exp) {
      if (exp.invoice_id === invoice.invoice_id) {
        expSheet.getRange(exp._rowIndex, expInvCol).setValue('');
      }
    });
  }

  invoice.status = 'void';
  updateRow('Invoices', invoice._rowIndex, invoice);
  return invoice;
}

/**
 * Update editable invoice fields: description, notes, GST toggle/rate.
 * Recalculates GST and total when include_gst or gst_rate changes.
 *
 * Expects an object with: invoice_id, and any of:
 *   description, notes, include_gst, gst_rate
 */
function updateInvoice(params) {
  var invoice = findById('Invoices', params.invoice_id);
  if (!invoice) throw new Error('Invoice not found: ' + params.invoice_id);

  if (invoice.status === 'paid' || invoice.status === 'void') {
    throw new Error('Cannot edit a ' + invoice.status + ' invoice.');
  }

  if (params.description !== undefined) invoice.description = params.description;
  if (params.notes !== undefined) invoice.notes = params.notes;
  if (params.line_descriptions !== undefined) {
    invoice.line_descriptions = typeof params.line_descriptions === 'string'
      ? params.line_descriptions
      : JSON.stringify(params.line_descriptions);
  }

  var recalc = false;
  if (params.include_gst !== undefined) {
    invoice.include_gst = (params.include_gst === true || params.include_gst === 'true');
    recalc = true;
  }
  if (params.gst_rate !== undefined && params.gst_rate !== '') {
    invoice.gst_rate = Number(params.gst_rate) || 0;
    recalc = true;
  }

  if (recalc) {
    var subtotal = Number(invoice.subtotal) || 0;
    var includeGst = invoice.include_gst === true || invoice.include_gst === 'true' || invoice.include_gst === 'TRUE';
    var rate = includeGst ? (Number(invoice.gst_rate) || 0) : 0;
    var gstAmount = includeGst ? Math.round(subtotal * rate * 100) / 100 : 0;
    var newTotal = subtotal + gstAmount;

    // If the total is changing and the invoice is already allocated,
    // block the edit — the allocations would become inconsistent.
    if (Math.abs(newTotal - (Number(invoice.total) || 0)) > 0.005) {
      var hasAllocations = getAll('BudgetAllocations').some(function(a) {
        return a.invoice_id === invoice.invoice_id;
      });
      if (hasAllocations) {
        throw new Error('This invoice is already allocated. Changing the total would desync the budget. Remove the allocation first, or edit before allocating.');
      }
    }

    invoice.gst_amount = gstAmount;
    invoice.total = newTotal;
  }

  updateRow('Invoices', invoice._rowIndex, invoice);
  return invoice;
}

/**
 * Get invoices with business name and currency. Accepts optional year filter
 * to reduce payload (critical at scale).
 */
function getInvoicesWithDetails(year) {
  var invoices = year
    ? getByYear('Invoices', 'created_date', year)
    : getAll('Invoices');
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

/**
 * Generate invoice ID in MMYY format (e.g. "0426" for April 2026).
 * Subsequent invoices in the same month get a letter suffix: 0426a, 0426b, etc.
 */
function generateInvoiceId() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var now = new Date();
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var yy = String(now.getFullYear()).slice(-2);
    var base = mm + yy;

    var invoices = getAll('Invoices');
    var pattern = new RegExp('^' + base + '[a-z]*$');
    var sameMonth = invoices.filter(function(inv) {
      return pattern.test(String(inv.invoice_id));
    });

    if (sameMonth.length === 0) return base;

    // Generate suffix: a-z, then aa, ab, ... az, ba, ...
    var n = sameMonth.length;
    var suffix = '';
    do {
      suffix = String.fromCharCode(97 + ((n - 1) % 26)) + suffix;
      n = Math.floor((n - 1) / 26);
    } while (n > 0);

    return base + suffix;
  } finally {
    lock.releaseLock();
  }
}
