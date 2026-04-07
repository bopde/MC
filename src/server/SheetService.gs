/**
 * Generic CRUD operations for Google Sheets.
 * All reads use batch operations (getDataRange) for performance.
 */

/**
 * Get all rows from a sheet as an array of objects.
 * Keys are taken from the header row.
 */
function getAll(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      // Convert Date objects to ISO strings for JSON transport
      if (val instanceof Date) {
        obj[headers[j]] = val.toISOString();
      } else {
        obj[headers[j]] = val;
      }
    }
    obj._rowIndex = i + 1; // 1-based sheet row number
    rows.push(obj);
  }
  return rows;
}

/**
 * Get active (non-deleted) rows from a reference table.
 */
function getActive(sheetName) {
  return getAll(sheetName).filter(function(row) {
    return row.active === true || row.active === 'TRUE' || row.active === 'true';
  });
}

/**
 * Append a row to a sheet. Returns the new row data with generated ID.
 */
function appendRow(sheetName, data) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Generate ID if the first column is an ID field and not provided
  var idField = headers[0];
  if (idField.indexOf('_id') !== -1 && !data[idField]) {
    data[idField] = generateId(sheetName);
  }

  var row = headers.map(function(h) {
    return data[h] !== undefined ? data[h] : '';
  });

  sheet.appendRow(row);
  data._rowIndex = sheet.getLastRow();
  return data;
}

/**
 * Update a row by its row index (1-based sheet row number).
 */
function updateRow(sheetName, rowIndex, data) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = headers.map(function(h) {
    return data[h] !== undefined ? data[h] : '';
  });

  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  return data;
}

/**
 * Find a row by ID (first column match).
 */
function findById(sheetName, id) {
  var rows = getAll(sheetName);
  if (rows.length === 0) return null;

  // Get the ID field name from the first key (excluding _rowIndex)
  var keys = Object.keys(rows[0]).filter(function(k) { return k !== '_rowIndex'; });
  var idField = keys[0];

  for (var i = 0; i < rows.length; i++) {
    if (rows[i][idField] === id) return rows[i];
  }
  return null;
}

/**
 * Check if a value exists in a specific column of a sheet (case-insensitive).
 * Used for uniqueness validation.
 */
function valueExists(sheetName, column, value) {
  var rows = getAll(sheetName);
  var lower = value.toString().toLowerCase();
  return rows.some(function(row) {
    return row[column] && row[column].toString().toLowerCase() === lower;
  });
}

/**
 * Find the column index (1-based) for a given header name in a sheet.
 */
function getColumnIndex(sheet, headerName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headers.indexOf(headerName);
  if (idx === -1) throw new Error('Column not found: ' + headerName + ' in sheet ' + sheet.getName());
  return idx + 1; // 1-based
}
