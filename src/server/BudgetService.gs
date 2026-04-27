/**
 * Budget allocation service.
 * Applies budget rules to invoices and tracks money flow.
 *
 * Categories: Tax Withheld, Tax To Pay, ACC Withheld, ACC To Pay,
 *             Donate, Save, Invest, Spend
 *
 * Status model (simplified): 'allocated' -> 'paid'
 *   - 'allocated': money is earmarked but not yet moved
 *   - 'paid': money has been moved (or auto-paid for Withheld categories)
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

var WITHHELD_CATEGORIES = ['Tax Withheld', 'ACC Withheld'];

/**
 * Allocate budget for an invoice using a specific rule.
 * Creates BudgetAllocation rows for each category.
 *
 * @param {string} invoiceId
 * @param {string} ruleId
 */
function allocateBudget(invoiceId, ruleId) {
  var invoice = findById('Invoices', invoiceId);
  if (!invoice) throw new Error('Invoice not found: ' + invoiceId);

  var existing = getAll('BudgetAllocations').filter(function(a) {
    return a.invoice_id === invoiceId;
  });
  if (existing.length > 0) {
    throw new Error('Budget already allocated for this invoice.');
  }

  var rule = findById('BudgetRules', ruleId);
  if (!rule) throw new Error('Budget rule not found: ' + ruleId);

  var total = Number(invoice.total) || 0;
  var today = new Date().toISOString().split('T')[0];

  // Derive withheld amount from rule percentages (applied to gross).
  var withheldFromRule = 0;
  BUDGET_CATEGORIES.forEach(function(cat, i) {
    if (WITHHELD_CATEGORIES.indexOf(cat) !== -1) {
      withheldFromRule += Math.round(total * (Number(rule[BUDGET_PCT_FIELDS[i]]) || 0) * 100) / 100;
    }
  });
  var netToAllocate = total - withheldFromRule;

  var allocations = [];
  BUDGET_CATEGORIES.forEach(function(cat, i) {
    var pct = Number(rule[BUDGET_PCT_FIELDS[i]]) || 0;
    var isWithheld = WITHHELD_CATEGORIES.indexOf(cat) !== -1;
    var amount = isWithheld
      ? Math.round(total * pct * 100) / 100
      : Math.round(netToAllocate * pct * 100) / 100;

    var allocation = appendRow('BudgetAllocations', {
      invoice_id: invoiceId,
      category: cat,
      percentage: pct,
      amount: amount,
      status: isWithheld ? 'paid' : 'allocated',
      transfer_date: isWithheld ? today : '',
      notes: isWithheld ? 'Auto-paid (withheld by payer)' : ''
    });
    allocations.push(allocation);
  });

  invoice.budget_rule_id = ruleId;
  updateRow('Invoices', invoice._rowIndex, invoice);

  return allocations;
}

/**
 * Toggle allocation status between 'allocated' and 'paid'.
 * Simplified model: only two states.
 */
function updateAllocationStatus(allocationId, newStatus, transferDate) {
  var validStatuses = ['allocated', 'paid'];
  if (validStatuses.indexOf(newStatus) === -1) {
    throw new Error('Invalid allocation status: ' + newStatus);
  }

  var allocs = getAll('BudgetAllocations');
  var alloc = allocs.find(function(a) { return a.allocation_id === allocationId; });
  if (!alloc) throw new Error('Allocation not found: ' + allocationId);

  alloc.status = newStatus;
  if (newStatus === 'paid') {
    alloc.transfer_date = transferDate || new Date().toISOString().split('T')[0];
  } else {
    alloc.transfer_date = '';
  }
  updateRow('BudgetAllocations', alloc._rowIndex, alloc);
  return alloc;
}

/**
 * Normalise legacy status values into the two-state model.
 * Old values: pending -> allocated; transferred/reconciled -> paid.
 */
function normaliseAllocationStatus(status) {
  if (status === 'paid' || status === 'transferred' || status === 'reconciled') return 'paid';
  return 'allocated';
}

/**
 * Get budget summary across all invoices.
 *
 * Returns:
 *   {
 *     categories: [
 *       {
 *         category, allocated, paid, outstanding,
 *         isWithheld, items: [{allocation_id, invoice_id, business_name, amount, status, transfer_date}]
 *       },
 *       ...
 *     ],
 *     totals: { allocated, paid, outstanding,
 *               taxWithheld, taxToPay, taxPaidTotal, taxOutstanding,
 *               accWithheld, accToPay }
 *   }
 */
function getBudgetSummary() {
  var allocations = getAll('BudgetAllocations');
  var invoices = getAll('Invoices');
  var businesses = getAll('Businesses');

  var bizMap = {};
  businesses.forEach(function(b) { bizMap[b.business_id] = b.name; });

  var invMap = {};
  invoices.forEach(function(inv) { invMap[inv.invoice_id] = inv; });

  var byCat = {};
  BUDGET_CATEGORIES.forEach(function(cat) {
    byCat[cat] = {
      category: cat,
      isWithheld: WITHHELD_CATEGORIES.indexOf(cat) !== -1,
      allocated: 0,
      paid: 0,
      outstanding: 0,
      items: []
    };
  });

  allocations.forEach(function(a) {
    var cat = a.category;
    if (!byCat[cat]) return;

    var amount = Number(a.amount) || 0;
    var status = normaliseAllocationStatus(a.status);
    var inv = invMap[a.invoice_id] || {};

    byCat[cat].allocated += amount;
    if (status === 'paid') {
      byCat[cat].paid += amount;
    } else {
      byCat[cat].outstanding += amount;
    }

    byCat[cat].items.push({
      allocation_id: a.allocation_id,
      invoice_id: a.invoice_id,
      business_name: bizMap[inv.business_id] || 'Unknown',
      amount: amount,
      status: status,
      transfer_date: a.transfer_date || '',
      notes: a.notes || ''
    });
  });

  // Build ordered array
  var categories = BUDGET_CATEGORIES.map(function(c) { return byCat[c]; });

  // Roll-up totals
  var totals = {
    allocated: 0, paid: 0, outstanding: 0,
    taxWithheld: byCat['Tax Withheld'].paid,
    taxToPayAllocated: byCat['Tax To Pay'].allocated,
    taxToPayPaid: byCat['Tax To Pay'].paid,
    taxToPayOutstanding: byCat['Tax To Pay'].outstanding,
    accWithheld: byCat['ACC Withheld'].paid,
    accToPayAllocated: byCat['ACC To Pay'].allocated,
    accToPayPaid: byCat['ACC To Pay'].paid,
    accToPayOutstanding: byCat['ACC To Pay'].outstanding
  };
  categories.forEach(function(c) {
    totals.allocated += c.allocated;
    totals.paid += c.paid;
    totals.outstanding += c.outstanding;
  });

  return { categories: categories, totals: totals };
}

/**
 * Validate that a budget rule's percentages sum to 1.0 (100%).
 */
function validateBudgetRule(rule) {
  var sum = 0;
  BUDGET_PCT_FIELDS.forEach(function(field) {
    sum += Number(rule[field]) || 0;
  });

  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error('Budget rule percentages must sum to 100%. Current sum: ' + (sum * 100).toFixed(1) + '%');
  }
  return true;
}
