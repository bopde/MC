/**
 * Settings service for managing reference data:
 * Businesses, WorkCodes, Accounts, BudgetRules, MyDetails
 */

// --- Businesses ---

function addBusiness(data) {
  if (valueExists('Businesses', 'name', data.name)) {
    throw new Error('A business with this name already exists.');
  }
  data.active = true;
  if (!data.currency) data.currency = 'NZD';
  return appendRow('Businesses', data);
}

function updateBusiness(data) {
  return updateRow('Businesses', data._rowIndex, data);
}

function getBusinesses() {
  return getActive('Businesses');
}

function getAllBusinesses() {
  return getAll('Businesses');
}

// --- Work Codes ---

function addWorkCode(data) {
  if (valueExists('WorkCodes', 'code_id', data.code_id)) {
    throw new Error('A work code with this ID already exists.');
  }
  data.active = true;
  if (!data.category) data.category = 'billable';
  return appendRow('WorkCodes', data);
}

function updateWorkCode(data) {
  return updateRow('WorkCodes', data._rowIndex, data);
}

function getWorkCodes() {
  return getActive('WorkCodes');
}

// --- Accounts ---

function addAccount(data) {
  if (valueExists('Accounts', 'name', data.name)) {
    throw new Error('An account with this name already exists.');
  }
  data.active = true;
  if (!data.currency) data.currency = 'NZD';
  return appendRow('Accounts', data);
}

function updateAccount(data) {
  return updateRow('Accounts', data._rowIndex, data);
}

function getAccounts() {
  return getActive('Accounts');
}

// --- Budget Rules ---

function addBudgetRule(data) {
  validateBudgetRule(data);

  // If this is marked as default, unmark others
  if (data.is_default) {
    var existing = getAll('BudgetRules');
    existing.forEach(function(r) {
      if (r.is_default) {
        r.is_default = false;
        updateRow('BudgetRules', r._rowIndex, r);
      }
    });
  }

  return appendRow('BudgetRules', data);
}

function updateBudgetRule(data) {
  validateBudgetRule(data);

  if (data.is_default) {
    var existing = getAll('BudgetRules');
    existing.forEach(function(r) {
      if (r.is_default && r.rule_id !== data.rule_id) {
        r.is_default = false;
        updateRow('BudgetRules', r._rowIndex, r);
      }
    });
  }

  return updateRow('BudgetRules', data._rowIndex, data);
}

function getBudgetRules() {
  return getAll('BudgetRules');
}

function getDefaultBudgetRule() {
  var rules = getAll('BudgetRules');
  return rules.find(function(r) {
    return r.is_default === true || r.is_default === 'TRUE' || r.is_default === 'true';
  }) || null;
}

// --- My Details (Invoice From) ---

function getMyDetails() {
  try {
    var rows = getAll('MyDetails');
    var details = {};
    rows.forEach(function(r) {
      details[r.key] = r.value;
    });
    return details;
  } catch (e) {
    // MyDetails sheet may not exist yet — return empty
    return {};
  }
}

function saveMyDetails(data) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('MyDetails');
  if (!sheet) throw new Error('MyDetails sheet not found. Run setupSheets() first.');

  var existing = sheet.getDataRange().getValues();
  var headers = existing[0];

  // For each key in data, find the row and update, or append
  Object.keys(data).forEach(function(key) {
    var found = false;
    for (var i = 1; i < existing.length; i++) {
      if (existing[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(data[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, data[key]]);
    }
  });

  return getMyDetails();
}
