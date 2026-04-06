/**
 * Budget allocation service.
 * Applies budget rules to invoices and tracks money flow.
 */

/**
 * Allocate budget for an invoice using a specific rule.
 * Creates BudgetAllocation rows for each category.
 */
function allocateBudget(invoiceId, ruleId) {
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
  var categories = ['tax', 'gst', 'donations', 'savings', 'investments', 'spending'];
  var pctFields = ['tax_pct', 'gst_pct', 'donations_pct', 'savings_pct', 'investments_pct', 'spending_pct'];

  var allocations = [];
  categories.forEach(function(cat, i) {
    var pct = Number(rule[pctFields[i]]) || 0;
    var amount = Math.round(total * pct * 100) / 100;

    var allocation = appendRow('BudgetAllocations', {
      invoice_id: invoiceId,
      category: cat,
      percentage: pct,
      amount: amount,
      status: 'pending',
      transfer_date: '',
      notes: ''
    });
    allocations.push(allocation);
  });

  // Update invoice with the budget rule used
  invoice.budget_rule_id = ruleId;
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
    summary[a.category][a.status] += amount;

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
 */
function validateBudgetRule(rule) {
  var sum = (Number(rule.tax_pct) || 0) +
            (Number(rule.gst_pct) || 0) +
            (Number(rule.donations_pct) || 0) +
            (Number(rule.savings_pct) || 0) +
            (Number(rule.investments_pct) || 0) +
            (Number(rule.spending_pct) || 0);

  // Allow small floating point tolerance
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error('Budget rule percentages must sum to 100%. Current sum: ' + (sum * 100).toFixed(1) + '%');
  }
  return true;
}
