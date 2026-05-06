/**
 * Dashboard data service.
 * Bundles all dashboard data into a single RPC to avoid multiple round-trips.
 */
function getDashboardData(params) {
  params = params || {};
  var dateFrom = params.dateFrom || '';
  var dateTo = params.dateTo || '';
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
    return a.active === true || a.active === 'TRUE' || a.active === 'true';
  });

  var bizMap = {};
  businesses.forEach(function(b) { bizMap[b.business_id] = b; });

  var invoices = invoicesRaw.filter(function(inv) {
    return inRange(inv.created_date, from, to);
  }).map(function(inv) {
    var biz = bizMap[inv.business_id];
    return {
      invoice_id: inv.invoice_id,
      business_name: biz ? biz.name : 'Unknown',
      currency: biz ? (biz.currency || 'NZD') : 'NZD',
      created_date: inv.created_date,
      total: Number(inv.total) || 0,
      subtotal: Number(inv.subtotal) || 0,
      status: inv.status
    };
  });

  var timeEntries = timeEntriesRaw.filter(function(te) {
    return inRange(te.date, from, to);
  }).map(function(te) {
    return {
      date: te.date,
      business_id: te.business_id,
      hours: Number(te.hours) || 0,
      line_total: Number(te.line_total) || 0
    };
  });

  var expenses = expensesRaw.filter(function(exp) {
    return inRange(exp.date, from, to);
  }).map(function(exp) {
    return {
      date: exp.date,
      business_id: exp.business_id,
      amount: Number(exp.amount) || 0
    };
  });

  var filteredInvoiceIds = {};
  invoices.forEach(function(inv) { filteredInvoiceIds[inv.invoice_id] = true; });

  var allocByCategory = {};
  allocations.forEach(function(a) {
    if (!filteredInvoiceIds[a.invoice_id]) return;
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

  return {
    invoices: invoices,
    timeEntries: timeEntries,
    expenses: expenses,
    budget: budget,
    accountBalances: accountBalances
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
