/**
 * Forma Apparels Backend — Type & Database Sanitization Utility
 * Guards against PostgreSQL type mismatch exceptions (e.g. bigint vs UUID).
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a value is a valid UUID string.
 */
function isUuid(val) {
  if (!val || typeof val !== 'string') return false;
  return UUID_REGEX.test(val.trim());
}

/**
 * Safely parse a value as an integer for PostgreSQL BIGINT/INT columns.
 * Returns fallback (default null) if value is non-numeric (e.g. UUID, object, empty string).
 */
function toSafeInt(val, fallback = null) {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val : Math.floor(val);
  }
  const str = String(val).trim();
  if (/^-?\d+$/.test(str)) {
    const parsed = parseInt(str, 10);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

/**
 * Safely parse a value as a float for PostgreSQL NUMERIC/DECIMAL columns.
 */
function toSafeFloat(val, fallback = 0.0) {
  if (val === null || val === undefined || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim());
  return isNaN(num) ? fallback : num;
}

module.exports = {
  isUuid,
  toSafeInt,
  toSafeFloat
};
