/**
 * Hours tracking service.
 * Handles time entries and expenses with server-side calculations.
 */

/**
 * Add a time entry. Calculates hours and line total server-side.
 */
function addTimeEntry(data) {
  // Calculate hours from start/end times
  var start = parseTime(data.date, data.time_start);
  var end = parseTime(data.date, data.time_end);

  if (end <= start) {
    throw new Error('End time must be after start time.');
  }

  var hours = (end - start) / (1000 * 60 * 60); // ms to hours
  hours = Math.round(hours * 100) / 100;

  var rate = Number(data.rate);
  var lineTotal = Math.round(hours * rate * 100) / 100;

  return appendRow('TimeEntries', {
    business_id: data.business_id,
    date: data.date,
    time_start: data.time_start,
    time_end: data.time_end,
    hours: hours,
    description: data.description,
    work_code: data.work_code,
    rate: rate,
    line_total: lineTotal,
    invoice_id: ''
  });
}

/**
 * Add an expense entry.
 */
function addExpense(data) {
  return appendRow('Expenses', {
    business_id: data.business_id,
    date: data.date,
    amount: Number(data.amount),
    description: data.description,
    work_code: data.work_code,
    invoice_id: ''
  });
}

/**
 * Get time entries filtered by business and/or date range.
 */
function getTimeEntries(filters) {
  var entries = getAll('TimeEntries');

  if (filters.business_id) {
    entries = entries.filter(function(e) { return e.business_id === filters.business_id; });
  }
  if (filters.dateFrom) {
    var from = new Date(filters.dateFrom);
    entries = entries.filter(function(e) { return new Date(e.date) >= from; });
  }
  if (filters.dateTo) {
    var to = new Date(filters.dateTo);
    to.setHours(23, 59, 59);
    entries = entries.filter(function(e) { return new Date(e.date) <= to; });
  }
  if (filters.uninvoicedOnly) {
    entries = entries.filter(function(e) { return !e.invoice_id || e.invoice_id === ''; });
  }

  return entries;
}

/**
 * Get expenses filtered by business and/or date range.
 */
function getExpenses(filters) {
  var expenses = getAll('Expenses');

  if (filters.business_id) {
    expenses = expenses.filter(function(e) { return e.business_id === filters.business_id; });
  }
  if (filters.dateFrom) {
    var from = new Date(filters.dateFrom);
    expenses = expenses.filter(function(e) { return new Date(e.date) >= from; });
  }
  if (filters.dateTo) {
    var to = new Date(filters.dateTo);
    to.setHours(23, 59, 59);
    expenses = expenses.filter(function(e) { return new Date(e.date) <= to; });
  }

  return expenses;
}

/**
 * Parse a date + time string into a Date object.
 */
function parseTime(dateStr, timeStr) {
  return new Date(dateStr + 'T' + timeStr + ':00');
}
