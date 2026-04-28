/**
 * Settings service for managing reference data:
 * Businesses, WorkCodes, Accounts, BudgetRules, MyDetails
 */

/**
 * Bootstrap: load all reference data in a single RPC.
 */
function bootstrap() {
  var result = {
    businesses: [],
    workCodes: [],
    accounts: [],
    budgetRules: [],
    myDetails: {}
  };
  try { result.businesses = getActive('Businesses'); } catch (e) {}
  try { result.workCodes = getActive('WorkCodes'); } catch (e) {}
  try { result.accounts = getActive('Accounts'); } catch (e) {}
  try { result.budgetRules = getAll('BudgetRules'); } catch (e) {}
  try { result.myDetails = getMyDetails(); } catch (e) { result.myDetails = {}; }
  return result;
}

// --- Businesses ---

function addBusiness(data) {
  if (valueExists('Businesses', 'name', data.name)) {
    throw new Error('A business with this name already exists.');
  }
  data.active = true;
  if (!data.currency) data.currency = 'NZD';
  return appendRow('Businesses', data);
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

// --- Accounts ---

function addAccount(data) {
  if (valueExists('Accounts', 'name', data.name)) {
    throw new Error('An account with this name already exists.');
  }
  data.active = true;
  if (!data.currency) data.currency = 'NZD';
  return appendRow('Accounts', data);
}

// --- Budget Rules ---

function addBudgetRule(data) {
  validateBudgetRule(data);

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

function getBudgetRules() {
  return getAll('BudgetRules');
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
    return {};
  }
}

function saveMyDetails(data) {
  var ALLOWED_KEYS = [
    'business_name', 'contact_name', 'email', 'phone', 'address',
    'tax_number', 'gst_number', 'bank_account', 'payment_terms'
  ];

  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('MyDetails');
  if (!sheet) throw new Error('MyDetails sheet not found. Run setupSheets() first.');

  var existing = sheet.getDataRange().getValues();

  Object.keys(data).forEach(function(key) {
    if (ALLOWED_KEYS.indexOf(key) === -1) return;
    var val = sanitiseCell(data[key]);
    var found = false;
    for (var i = 1; i < existing.length; i++) {
      if (existing[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(val);
        found = true;
        break;
      }
    }
    if (!found) {
      sheet.appendRow([key, val]);
    }
  });

  return getMyDetails();
}
