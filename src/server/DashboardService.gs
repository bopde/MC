/**
 * Dashboard data service.
 * Bundles all dashboard data into a single RPC to avoid multiple round-trips.
 */
function getDashboardData(params) {
  params = params || {};
  var dateFrom = params.dateFrom || '';
  var dateTo = params.dateTo || '';
  var businessId = params.businessId || '';
  var from = dateFrom ? new Date(dateFrom) : null;
  var to = dateTo ? new Date(dateTo) : null;
  if (to) to.setHours(23, 59, 59);

  var invoicesRaw = getAll('Invoices');
  var businesses = getAll('Businesses');
  var timeEntriesRaw = getAll('TimeEntries');
  var expensesRaw = getAll('Expenses');
  var allocations = getAll('BudgetAllocations');
  var summaries = getAll('AccountSummaries');
  var accounts = getAll('Accounts').filter(function(a) {
    return isTruthy(a.active);
  });

  var bizMap = {};
  businesses.forEach(function(b) { bizMap[String(b.business_id)] = b; });

  var invoices = invoicesRaw.filter(function(inv) {
    if (!inRange(inv.created_date, from, to)) return false;
    if (businessId && !idsMatch(inv.business_id, businessId)) return false;
    return true;
  }).map(function(inv) {
    var biz = bizMap[String(inv.business_id)];
    return {
      invoice_id: inv.invoice_id,
      business_id: inv.business_id,
      business_name: biz ? biz.name : 'Unknown',
      currency: biz ? (biz.currency || 'NZD') : 'NZD',
      created_date: inv.created_date,
      total: Number(inv.total) || 0,
      subtotal: Number(inv.subtotal) || 0,
      status: inv.status
    };
  });

  var timeEntries = timeEntriesRaw.filter(function(te) {
    if (!inRange(te.date, from, to)) return false;
    if (businessId && !idsMatch(te.business_id, businessId)) return false;
    return true;
  }).map(function(te) {
    return {
      date: te.date,
      business_id: te.business_id,
      hours: Number(te.hours) || 0,
      line_total: Number(te.line_total) || 0
    };
  });

  var expenses = expensesRaw.filter(function(exp) {
    if (!inRange(exp.date, from, to)) return false;
    if (businessId && !idsMatch(exp.business_id, businessId)) return false;
    return true;
  }).map(function(exp) {
    return {
      date: exp.date,
      business_id: exp.business_id,
      amount: Number(exp.amount) || 0
    };
  });

  var filteredInvoiceIds = {};
  invoices.forEach(function(inv) { filteredInvoiceIds[String(inv.invoice_id)] = true; });

  var allocByCategory = {};
  allocations.forEach(function(a) {
    if (!filteredInvoiceIds[String(a.invoice_id)]) return;
    var cat = a.category;
    if (!allocByCategory[cat]) allocByCategory[cat] = { allocated: 0, paid: 0, outstanding: 0 };
    var amount = Number(a.amount) || 0;
    var isPaid = a.status === 'paid' || a.status === 'transferred' || a.status === 'reconciled';
    allocByCategory[cat].allocated += amount;
    if (isPaid) allocByCategory[cat].paid += amount;
    else allocByCategory[cat].outstanding += amount;
  });

  var budget = BUDGET_CATEGORIES.map(function(cat) {
    var d = allocByCategory[cat] || { allocated: 0, paid: 0, outstanding: 0 };
    return { category: cat, allocated: d.allocated, paid: d.paid, outstanding: d.outstanding };
  }).filter(function(c) { return c.allocated > 0; });

  var latestByAccount = {};
  summaries.forEach(function(s) {
    var mo = normaliseMonth(s.month);
    if (!mo) return;
    if (to) {
      var moDate = new Date(mo + '-28');
      if (moDate > to) return;
    }
    if (s.ending_balance === '' || s.ending_balance === null || s.ending_balance === undefined) return;
    var key = s.account_id;
    if (!latestByAccount[key] || mo > latestByAccount[key].month) {
      latestByAccount[key] = { month: mo, balance: Number(s.ending_balance) || 0 };
    }
  });

  var accountBalances = [];
  accounts.forEach(function(acc) {
    var latest = latestByAccount[acc.account_id];
    if (latest) {
      accountBalances.push({
        name: acc.name,
        currency: acc.currency || 'NZD',
        balance: latest.balance,
        month: latest.month
      });
    }
  });

  var contracts = getAll('Contracts').filter(function(c) {
    var s = String(c.status || '').trim().toLowerCase();
    if (s === 'complete' || s === 'cancelled' || s === 'void') return false;
    if (businessId && !idsMatch(c.business_id, businessId)) return false;
    return true;
  });

  var contractProgress = contracts.map(function(c) {
    var contractId = c.contract_id;
    var cBizId = c.business_id;
    var cFrom = new Date(c.date_from);
    var cTo = new Date(c.date_to);
    cTo.setHours(23, 59, 59);

    var spent = 0, hrs = 0;
    timeEntriesRaw.forEach(function(te) {
      if (te.contract_id && idsMatch(te.contract_id, contractId)) {
        spent += Number(te.line_total) || 0;
        hrs += Number(te.hours) || 0;
      } else if (idsMatch(te.business_id, cBizId) && !te.contract_id) {
        var d = new Date(te.date);
        if (d >= cFrom && d <= cTo) {
          spent += Number(te.line_total) || 0;
          hrs += Number(te.hours) || 0;
        }
      }
    });

    var value = Number(c.value) || 0;
    var biz = bizMap[String(cBizId)];
    var now = new Date();
    var totalDays = Math.max(1, (cTo - cFrom) / 86400000);
    var elapsedDays = Math.max(0, Math.min((now - cFrom) / 86400000, totalDays));
    var daysRemaining = Math.max(0, Math.ceil((cTo - now) / 86400000));

    return {
      contract_id: c.contract_id,
      business_id: cBizId,
      business_name: biz ? biz.name : 'Unknown',
      name: c.name,
      po_number: c.po_number,
      date_from: c.date_from,
      date_to: c.date_to,
      value: value,
      currency: c.currency || 'NZD',
      spent: spent,
      hours: hrs,
      days_remaining: daysRemaining,
      total_days: Math.ceil(totalDays),
      expected_pct: elapsedDays / totalDays,
      actual_pct: value > 0 ? spent / value : 0
    };
  });

  return {
    invoices: invoices,
    timeEntries: timeEntries,
    expenses: expenses,
    budget: budget,
    accountBalances: accountBalances,
    contractProgress: contractProgress
  };
}

function inRange(dateVal, from, to) {
  if (!dateVal) return false;
  var d = new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
