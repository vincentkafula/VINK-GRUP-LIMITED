const crypto = require('crypto');

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const rid = (p) => p + '_' + crypto.randomBytes(9).toString('hex');
const now = () => new Date().toISOString();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Validators. Money is always an integer number of cents.
const num = (v, name, { min = 1, max = 1e10 } = {}) => {
  if (!Number.isInteger(v) || v < min || v > max)
    throw new ApiError(400, 'invalid_' + name, `${name} must be a whole number between ${min} and ${max}`);
  return v;
};
const text = (v, name, { max = 120, optional = false } = {}) => {
  if (v == null || v === '') {
    if (optional) return null;
    throw new ApiError(400, 'invalid_' + name, `${name} is required`);
  }
  if (typeof v !== 'string' || v.length > max)
    throw new ApiError(400, 'invalid_' + name, `${name} must be text up to ${max} characters`);
  return v.trim();
};
const oneOf = (v, name, list) => {
  if (!list.includes(v)) throw new ApiError(400, 'invalid_' + name, `${name} must be one of: ${list.join(', ')}`);
  return v;
};

module.exports = { ApiError, rid, now, sha256, num, text, oneOf };

// South African ID number: 13 digits, a real birth date, and a valid Luhn check digit.
module.exports.validSaId = (id) => {
  if (!/^\d{13}$/.test(id)) return false;
  const mm = +id.slice(2, 4), dd = +id.slice(4, 6);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) { let d = +id[12 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
};
