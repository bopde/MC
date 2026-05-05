/**
 * Dashboard data service.
 * Bundles all dashboard data into a single RPC to avoid multiple round-trips.
 */
function getDashboardData(year) {
  var yearStr = String(year);

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
    return String(inv.created_date).indexOf(yearStr + '-') === 0;
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
    return String(te.date).indexOf(yearStr + '-') === 0;
  }).map(function(te) {
    return {
      date: te.date,
      business_id: te.business_id,
      hours: Number(te.hours) || 0,
      line_total: Number(te.line_total) || 0
    };
  });

  var expenses = expensesRaw.filter(function(exp) {
    return String(exp.date).indexOf(yearStr + '-') === 0;
  }).map(function(exp) {
    return {
      date: exp.date,
      business_id: exp.business_id,
      amount: Number(exp.amount) || 0
    };
  });

  var yearInvoiceIds = {};
  invoices.forEach(function(inv) { yearInvoiceIds[inv.invoice_id] = true; });

  var budget = BUDGET_CATEGORIES.map(function(cat) {
    var allocated = 0, paid = 0, outstanding = 0;
    allocations.forEach(function(a) {
      if (a.category !== cat || !yearInvoiceIds[a.invoice_id]) return;
      var amount = Number(a.amount) || 0;
      var isPaid = a.status === 'paid' || a.status === 'transferred' || a.status === 'reconciled';
      allocated += amount;
      if (isPaid) paid += amount;
      else outstanding += amount;
    });
    return { category: cat, allocated: allocated, paid: paid, outstanding: outstanding };
  }).filter(function(c) { return c.allocated > 0; });

  var accountBalances = [];
  accounts.forEach(function(acc) {
    var latest = null;
    summaries.forEach(function(s) {
      if (s.account_id !== acc.account_id) return;
      var mo = normaliseMonth(s.month);
      if (!mo || mo.indexOf(yearStr + '-') !== 0) return;
      if (s.ending_balance === '' || s.ending_balance === null || s.ending_balance === undefined) return;
      if (!latest || mo > latest.month) {
        latest = { month: mo, balance: Number(s.ending_balance) || 0 };
      }
    });
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
