const crypto = require('crypto');

/*
 * Gateway adapter contract (implement one per provider, e.g. PayFast, Peach, Ozow):
 *   createCharge({ paymentId, amount, currency, method, channel, reference, customer, paymentToken })
 *       -> { gatewayRef, status: 'paid' | 'pending' | 'failed', reason?, redirectUrl? }
 *   refund({ gatewayRef, amount, currency }) -> { status: 'ok' }        (throw on failure)
 *   verifyWebhook(rawBody: Buffer, headers) -> { gatewayRef, status: 'paid'|'failed', amount?, reason? }
 *       (throw if the signature is invalid)
 * Card data must never reach this server: adapters receive gateway-issued tokens only.
 */
function mockGateway({ secret = 'dev-mock-secret' } = {}) {
  return {
    name: 'mock',
    secret,
    async createCharge(o) {
      const gatewayRef = 'mock_' + crypto.randomBytes(6).toString('hex');
      if (o.paymentToken === 'tok_decline') return { gatewayRef, status: 'failed', reason: 'card_declined' };
      if (o.method === 'eft' && o.channel === 'online')
        return { gatewayRef, status: 'pending', redirectUrl: `https://mock-gateway.invalid/pay/${gatewayRef}` };
      return { gatewayRef, status: 'paid' };
    },
    async refund() { return { status: 'ok' }; },
    verifyWebhook(raw, headers) {
      const given = String(headers['x-mock-signature'] || '');
      const want = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      const a = Buffer.from(given), b = Buffer.from(want);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('bad signature');
      return JSON.parse(raw.toString('utf8'));
    },
  };
}

// Bank rail adapter (EFT / RTC / PayShap). Replace with your sponsor bank's API.
function mockRails({ secret = 'dev-rail-secret' } = {}) {
  const ref = () => 'rail_' + crypto.randomBytes(6).toString('hex');
  return {
    secret,
    async send() { return { railRef: ref(), status: 'completed' }; },             // EFT / RTC / PayShap (instant)
    async sendInternational() { return { railRef: ref(), status: 'processing' }; },   // SWIFT or a correspondent bank
    // Verifies an inbound credit notification from the bank rail (same HMAC pattern as gateway webhooks).
    verifyInbound(raw, headers) {
      const given = String(headers['x-rail-signature'] || ''), want = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      const a = Buffer.from(given), b = Buffer.from(want);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('bad signature');
      return JSON.parse(raw.toString('utf8'));
    },
  };
}

// Email adapter. Replace with your provider (SES, SendGrid...). `attachments` is [{ filename, content: Buffer }].
function mockMailer() { return { async send() { return { id: 'mail_' + crypto.randomBytes(5).toString('hex') }; } }; }

// Identity check adapter (ID number, name and selfie against a bureau). The mock refers anyone whose name contains "refer".
function mockIdentity() { return { async check({ fullName }) { return { status: /refer/i.test(fullName || '') ? 'refer' : 'verified', ref: 'idv_' + crypto.randomBytes(5).toString('hex') }; } }; }

// Vehicle licence renewal adapter (a licensing authority or aggregator). Deterministic mock.
function mockVehicle() {
  const h = (p) => [...p].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);
  return {
    async lookup(plate) { const n = h(plate); return { plate, make: ['Toyota', 'VW', 'Ford', 'Nissan'][n % 4], model: ['Hilux', 'Polo', 'Ranger', 'NP200'][n % 4], expires: new Date(Date.now() + ((n % 40) - 10) * 864e5).toISOString().slice(0, 10), fee: 48000 + (n % 5) * 1500, delivery_fee: 9000 }; },
    async renew({ plate }) { return { reference: 'LIC' + h(plate) + crypto.randomBytes(3).toString('hex').toUpperCase() }; },
  };
}

module.exports = { mockGateway, mockRails };

// Prepaid and bill-payment provider adapter (airtime, electricity, vouchers...). Replace with your aggregator.
const CATALOGUE = [
  { id: 'airtime', category: 'Airtime', name: 'Airtime', recipient: 'phone', min: 200, max: 99900 },
  { id: 'data-1gb', category: 'Data', name: '1 GB data bundle', recipient: 'phone', price: 9900 },
  { id: 'data-5gb', category: 'Data', name: '5 GB data bundle', recipient: 'phone', price: 34900 },
  { id: 'sms-100', category: 'SMS', name: '100 SMS bundle', recipient: 'phone', price: 1500 },
  { id: 'electricity', category: 'Electricity', name: 'Prepaid electricity', recipient: 'meter', min: 2000, max: 200000 },
  { id: 'water', category: 'Water', name: 'Prepaid water', recipient: 'meter', min: 2000, max: 100000 },
  { id: 'voucher-100', category: 'Vouchers', name: 'Voucher R100', recipient: 'phone', price: 10000 },
  { id: 'tv', category: 'TV', name: 'Pay-TV subscription', recipient: 'smartcard', min: 5000, max: 150000 },
  { id: 'municipal', category: 'Municipal', name: 'Municipal account', recipient: 'account', min: 1000, max: 5000000 },
];
const RECIPIENT = { phone: /^0\d{9}$/, meter: /^\d{11}$/, smartcard: /^\d{10}$/, account: /^[A-Za-z0-9-]{4,20}$/ };
function mockBills() {
  return {
    catalogue: () => CATALOGUE,
    recipientPattern: (kind) => RECIPIENT[kind],
    async purchase({ product, recipient }) {
      const needsToken = ['electricity', 'water', 'voucher-100'].includes(product.id);
      const token = needsToken ? Array.from({ length: 5 }, () => String(crypto.randomInt(0, 10000)).padStart(4, '0')).join(' ') : null;
      return { reference: 'bill_' + crypto.randomBytes(6).toString('hex'), token };
    },
  };
}
module.exports.mockBills = mockBills;

module.exports.mockMailer = mockMailer;
module.exports.mockVehicle = mockVehicle;
module.exports.mockIdentity = mockIdentity;
