/**
 * Budget allocation service.
 * Applies budget rules to invoices and tracks money flow.
 *
 * Categories: Tax Withheld, Tax To Pay, ACC Withheld, ACC To Pay,
 *             Donate, Save, Invest, Spend
 */

var BUDGET_CATEGORIES = [
  'Tax Withheld', 'Tax To Pay', 'ACC Withheld', 'ACC To Pay',
  'Donate', 'Save', 'Invest', 'Spend'
];

var BUDGET_PCT_FIELDS = [
  'tax_withheld_pct', 'tax_to_pay_pct',
  'acc_withheld_pct', 'acc_to_pay_pct',
  'donate_pct', 'save_pct', 'invest_pct', 'spend_pct'
];

/**
 * Allocate budget for an invoice using a specific rule.
 * Creates BudgetAllocation rows for each category.
 *
 * @param {string} invoiceId
 * @param {string} ruleId
 * @param {number} taxAlreadyWithheld - amount of tax already withheld by payer
 */
function allocateBudget(invoiceId, ruleId, taxAlreadyWithheld) {
  var invoice = findById('Invoices', invoiceId);
  if (!invoice) throw new Error('Invoice not found: ' + invoiceId);

  // Check for existing allocations
  var existing = getAll('BudgetAllocations').filter(function(a) {
    return a.invoice_id === invoiceId;
  });
  if (existing.length > 0) {
    throw new Error('Budget already allocated for this invoice. Delete existing allocations first.');
  }

  var rule = findById('BudgetRules', ruleId);
  if (!rule) throw new Error('Budget rule not found: ' + ruleId);

  var total = Number(invoice.total);
  var withheld = Number(taxAlreadyWithheld) || Number(invoice.tax_withheld) || 0;

  // The net amount to allocate is total minus already-withheld tax
  var netToAllocate = total - withheld;

  var allocations = [];
  BUDGET_CATEGORIES.forEach(function(cat, i) {
    var pct = Number(rule[BUDGET_PCT_FIELDS[i]]) || 0;
    var amount;

    if (cat === 'Tax Withheld' || cat === 'ACC Withheld') {
      // Withheld categories: apply percentage to gross total (this is what was withheld)
      amount = Math.round(total * pct * 100) / 100;
    } else {
      // All other categories: apply percentage to net amount (total - withheld)
      amount = Math.round(netToAllocate * pct * 100) / 100;
    }

    var allocation = appendRow('BudgetAllocations', {
      invoice_id: invoiceId,
      category: cat,
      percentage: pct,
      amount: amount,
      status: cat === 'Tax Withheld' || cat === 'ACC Withheld' ? 'transferred' : 'pending',
      transfer_date: (cat === 'Tax Withheld' || cat === 'ACC Withheld') ? new Date().toISOString().split('T')[0] : '',
      notes: ''
    });
    allocations.push(allocation);
  });

  // Update invoice with the budget rule used and withheld amount
  invoice.budget_rule_id = ruleId;
  invoice.tax_withheld = withheld;
  updateRow('Invoices', invoice._rowIndex, invoice);

  return allocations;
}

/**
 * Update allocation status (pending -> transferred -> reconciled).
 */
function updateAllocationStatus(allocationId, newStatus, transferDate) {
  var allocs = getAll('BudgetAllocations');
  var alloc = allocs.find(function(a) { return a.allocation_id === allocationId; });
  if (!alloc) throw new Error('Allocation not found: ' + allocationId);

  alloc.status = newStatus;
  if (transferDate) alloc.transfer_date = transferDate;
  updateRow('BudgetAllocations', alloc._rowIndex, alloc);
  return alloc;
}

/**
 * Get budget summary across all invoices: how much is allocated to each category.
 */
function getBudgetSummary() {
  var allocations = getAll('BudgetAllocations');
  var invoices = getAll('Invoices');
  var businesses = getAll('Businesses');

  var bizMap = {};
  businesses.forEach(function(b) { bizMap[b.business_id] = b.name; });

  var invMap = {};
  invoices.forEach(function(inv) { invMap[inv.invoice_id] = inv; });

  // Group by category
  var summary = {};
  allocations.forEach(function(a) {
    if (!summary[a.category]) {
      summary[a.category] = { total: 0, pending: 0, transferred: 0, reconciled: 0, items: [] };
    }
    var amount = Number(a.amount) || 0;
    summary[a.category].total += amount;
    summary[a.category][a.status] = (summary[a.category][a.status] || 0) + amount;

    var inv = invMap[a.invoice_id] || {};
    summary[a.category].items.push({
      allocation_id: a.allocation_id,
      invoice_id: a.invoice_id,
      business_name: bizMap[inv.business_id] || 'Unknown',
      amount: amount,
      status: a.status,
      transfer_date: a.transfer_date
    });
  });

  return summary;
}

/**
 * Validate that a budget rule's percentages sum to 1.0 (100%).
 * Note: "withheld" percentages are part of the gross split,
 * remaining categories split the net. For validation we check
 * that all percentages sum to 1.0.
 */
function validateBudgetRule(rule) {
  var sum = 0;
  BUDGET_PCT_FIELDS.forEach(function(field) {
    sum += Number(rule[field]) || 0;
  });

  // Allow small floating point tolerance
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error('Budget rule percentages must sum to 100%. Current sum: ' + (sum * 100).toFixed(1) + '%');
  }
  return true;
}
