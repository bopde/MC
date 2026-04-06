/**
 * Account summary service.
 * Tracks monthly account balances, gains, and tax info.
 */

/**
 * Add or update a monthly account summary.
 * If a summary already exists for the account+month, updates it.
 */
function saveAccountSummary(data) {
  var existing = getAll('AccountSummaries').find(function(s) {
    return s.account_id === data.account_id && s.month === data.month;
  });

  if (existing) {
    existing.ending_balance = Number(data.ending_balance) || 0;
    existing.realised_gains = Number(data.realised_gains) || 0;
    existing.unrealised_gains = Number(data.unrealised_gains) || 0;
    existing.tax_paid = Number(data.tax_paid) || 0;
    existing.notes = data.notes || '';
    updateRow('AccountSummaries', existing._rowIndex, existing);
    return existing;
  } else {
    return appendRow('AccountSummaries', {
      account_id: data.account_id,
      month: data.month,
      ending_balance: Number(data.ending_balance) || 0,
      realised_gains: Number(data.realised_gains) || 0,
      unrealised_gains: Number(data.unrealised_gains) || 0,
      tax_paid: Number(data.tax_paid) || 0,
      notes: data.notes || ''
    });
  }
}

/**
 * Get account summaries for a specific month.
 */
function getAccountSummariesForMonth(month) {
  var summaries = getAll('AccountSummaries').filter(function(s) {
    return s.month === month;
  });

  var accounts = getAll('Accounts');
  var accMap = {};
  accounts.forEach(function(a) { accMap[a.account_id] = a; });

  return summaries.map(function(s) {
    s.account_name = accMap[s.account_id] ? accMap[s.account_id].name : 'Unknown';
    s.account_type = accMap[s.account_id] ? accMap[s.account_id].type : '';
    return s;
  });
}

/**
 * Get a year-to-date overview of all accounts.
 * Returns monthly data for each account for the specified year.
 */
function getYearOverview(year) {
  var summaries = getAll('AccountSummaries').filter(function(s) {
    return s.month && s.month.startsWith(year);
  });

  var accounts = getActive('Accounts');

  return {
    accounts: accounts,
    summaries: summaries
  };
}
