// Creating a route owner. Shared by the app's admin (routes/users.js) and the Kangodrop website's admin (routes/website.js).
const bcrypt = require('bcryptjs');
const { queries } = require('../database');

// Phone numbers are stored in international form: "+<country code><number>" (e.g. +358401234567).
// Spaces, dashes and brackets are stripped. Returns '' for empty, or null if the value is not valid.
const PHONE_ERROR = 'Enter the phone number with a country code, e.g. +358 40 123 4567';
const normalizePhone = p => {
  const s = String(p ?? '').replace(/[\s\-().]/g, '');
  if (s === '') return '';
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
};

// Resolves to { status, body }: 201 with the new owner, or 400/409 with { error }.
async function createOwner({ name, email, password, city = '', phone = '', can_ride = false }) {
  const ph = normalizePhone(phone);
  if (ph === null) return { status: 400, body: { error: PHONE_ERROR } };
  if (!name || !email || !password) return { status: 400, body: { error: 'Name, email and password required' } };
  try {
    const hash = bcrypt.hashSync(password, 10);
    const user = await queries.createUser(name, email.toLowerCase().trim(), hash, 'route_owner', { city, phone: ph, owner_id: null, can_ride });
    return { status: 201, body: { id: user.id, name, email, role: 'route_owner', city, phone: ph, can_ride } };
  } catch (e) {
    if (e.message === 'EMAIL_EXISTS') return { status: 409, body: { error: 'Email already exists' } };
    throw e;
  }
}

module.exports = { PHONE_ERROR, normalizePhone, createOwner };
