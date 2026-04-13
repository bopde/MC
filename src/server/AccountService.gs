/**
 * Account summary service.
 * Tracks monthly account balances, gains, and tax info.
 */

/**
 * Normalise a month value to YYYY-MM format.
 * Google Sheets often coerces "2026-04" into a full Date, so when read back
 * it becomes an ISO string like "2026-04-01T00:00:00.000Z". We extract the
 * YYYY-MM portion regardless of source format.
 */
function normaliseMonth(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    var m = val.getMonth() + 1;
    return val.getFullYear() + '-' + (m < 10 ? '0' + m : '' + m);
  }
  var str = String(val).trim();
  var match = str.match(/^(\d{4})-(\d{1,2})/);
  if (match) {
    var mm = parseInt(match[2], 10);
    return match[1] + '-' + (mm < 10 ? '0' + mm : '' + mm);
  }
  return str;
}

/**
 * Add or update a monthly account summary.
 * If a summary already exists for the account+month, updates it.
 */
function saveAccountSummary(data) {
  var month = normaliseMonth(data.month);

  var existing = getAll('AccountSummaries').find(function(s) {
    return s.account_id === data.account_id && normaliseMonth(s.month) === month;
  });

  var payload = {
    account_id: data.account_id,
    month: month,
    ending_balance: Number(data.ending_balance) || 0,
    realised_gains: Number(data.realised_gains) || 0,
    unrealised_gains: Number(data.unrealised_gains) || 0,
    tax_paid: Number(data.tax_paid) || 0,
    notes: data.notes || ''
  };

  // Force the month column to text format so Sheets doesn't coerce "2026-04" to a Date
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('AccountSummaries');
  var monthCol = getColumnIndex(sheet, 'month');

  if (existing) {
    payload._rowIndex = existing._rowIndex;
    updateRow('AccountSummaries', existing._rowIndex, payload);
    sheet.getRange(existing._rowIndex, monthCol).setNumberFormat('@').setValue(month);
    return payload;
  } else {
    var result = appendRow('AccountSummaries', payload);
    sheet.getRange(result._rowIndex, monthCol).setNumberFormat('@').setValue(month);
    return result;
  }
}

/**
 * Get account summaries for a specific month.
 */
function getAccountSummariesForMonth(month) {
  var target = normaliseMonth(month);
  var summaries = getAll('AccountSummaries').filter(function(s) {
    return normaliseMonth(s.month) === target;
  }).map(function(s) {
    s.month = normaliseMonth(s.month);
    return s;
  });

  var accounts = getAll('Accounts');
  var accMap = {};
  accounts.forEach(function(a) { accMap[a.account_id] = a; });

  return summaries.map(function(s) {
    var acc = accMap[s.account_id];
    s.account_name = acc ? acc.name : 'Unknown';
    s.account_type = acc ? acc.type : '';
    s.currency = acc ? acc.currency : 'NZD';
    return s;
  });
}

/**
 * Get a year-to-date overview of all accounts.
 * Returns monthly data for each account for the specified year,
 * INCLUDING Jan-Mar of the following year for tax overlap.
 */
function getYearOverview(year) {
  var yearStr = String(year);
  var nextYear = (parseInt(yearStr, 10) + 1).toString();

  var summaries = getAll('AccountSummaries').map(function(s) {
    s.month = normaliseMonth(s.month);
    return s;
  }).filter(function(s) {
    if (!s.month) return false;
    if (s.month.indexOf(yearStr + '-') === 0) return true;
    if (s.month.indexOf(nextYear + '-') === 0) {
      var mNum = parseInt(s.month.split('-')[1], 10);
      return mNum >= 1 && mNum <= 3;
    }
    return false;
  });

  var accounts = getActive('Accounts');

  return {
    accounts: accounts,
    summaries: summaries
  };
}
