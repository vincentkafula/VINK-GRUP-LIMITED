const crypto = require('crypto');
const { ApiError, rid, now, num, text } = require('./util');

const hashPin = (pin) => { const salt = crypto.randomBytes(16); return salt.toString('hex') + ':' + crypto.scryptSync(pin, salt, 32).toString('hex'); };
const checkPin = (stored, pin) => {
  const [s, h] = stored.split(':');
  return crypto.timingSafeEqual(crypto.scryptSync(pin, Buffer.from(s, 'hex'), 32), Buffer.from(h, 'hex'));
};

// Point-of-sale catalogue: categories, products and staff.
module.exports = function buildCatalog({ db }) {
  const get = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const notFound = (w) => new ApiError(404, `${w}_not_found`, `${w} not found`);

  function createCategory(m, b = {}) {
    const id = rid('cat');
    run('INSERT INTO categories(id,merchant_id,name,created_at) VALUES(?,?,?,?)', id, m.id, text(b.name, 'name', { max: 60 }), now());
    return get('SELECT id,name FROM categories WHERE id=?', id);
  }
  const listCategories = (m) => ({ data: all('SELECT id,name FROM categories WHERE merchant_id=? ORDER BY name', m.id) });
  function deleteCategory(m, id) {
    if (!run('DELETE FROM categories WHERE id=? AND merchant_id=?', id, m.id).changes) throw notFound('category');
    run('UPDATE products SET category_id=NULL WHERE category_id=? AND merchant_id=?', id, m.id);
    return { ok: true };
  }

  const publicProduct = (p) => ({ id: p.id, name: p.name, price: p.price, category_id: p.category_id, active: !!p.active });
  function createProduct(m, b = {}) {
    if (b.categoryId && !get('SELECT 1 FROM categories WHERE id=? AND merchant_id=?', b.categoryId, m.id)) throw notFound('category');
    const id = rid('prd');
    run('INSERT INTO products(id,merchant_id,category_id,name,price,created_at) VALUES(?,?,?,?,?,?)', id, m.id, b.categoryId || null,
      text(b.name, 'name', { max: 80 }), num(b.price, 'price', { min: 100, max: 100000000 }), now());
    return publicProduct(get('SELECT * FROM products WHERE id=?', id));
  }
  const listProducts = (m) => ({ data: all('SELECT * FROM products WHERE merchant_id=? ORDER BY name', m.id).map(publicProduct) });
  function updateProduct(m, id, b = {}) {
    const p = get('SELECT * FROM products WHERE id=? AND merchant_id=?', id, m.id);
    if (!p) throw notFound('product');
    run('UPDATE products SET price=?,active=?,name=? WHERE id=?', b.price === undefined ? p.price : num(b.price, 'price', { min: 100, max: 100000000 }),
      b.active === undefined ? p.active : b.active ? 1 : 0, b.name === undefined ? p.name : text(b.name, 'name', { max: 80 }), id);
    return publicProduct(get('SELECT * FROM products WHERE id=?', id));
  }
  const deleteProduct = (m, id) => { if (!run('UPDATE products SET active=0 WHERE id=? AND merchant_id=?', id, m.id).changes) throw notFound('product'); return { ok: true }; };

  const publicStaff = (s) => ({ id: s.id, name: s.name, role: s.role, status: s.status });
  function createStaff(m, b = {}) {
    if (!/^\d{4,6}$/.test(String(b.pin || ''))) throw new ApiError(400, 'invalid_pin', 'pin must be 4 to 6 digits');
    const id = rid('stf');
    run('INSERT INTO staff(id,merchant_id,name,role,pin_hash,created_at) VALUES(?,?,?,?,?,?)', id, m.id, text(b.name, 'name', { max: 80 }),
      ['cashier', 'supervisor', 'manager'].includes(b.role) ? b.role : 'cashier', hashPin(String(b.pin)), now());
    return publicStaff(get('SELECT * FROM staff WHERE id=?', id));
  }
  const listStaff = (m) => ({ data: all('SELECT * FROM staff WHERE merchant_id=? ORDER BY name', m.id).map(publicStaff) });
  function setStaff(m, id, status) {
    if (!['active', 'suspended'].includes(status)) throw new ApiError(400, 'invalid_status', 'status must be active or suspended');
    if (!run('UPDATE staff SET status=? WHERE id=? AND merchant_id=?', status, id, m.id).changes) throw notFound('staff');
    return { id, status };
  }
  // Cashier sign-in on the card machine. Five wrong PINs lock the profile for 15 minutes.
  function verifyPin(m, id, pin) {
    const s = get("SELECT * FROM staff WHERE id=? AND merchant_id=? AND status='active'", id, m.id);
    if (!s) throw notFound('staff');
    if (s.locked_until && s.locked_until > now()) throw new ApiError(423, 'locked', 'Too many wrong PINs. Try again later.');
    if (!/^\d{4,6}$/.test(String(pin || '')) || !checkPin(s.pin_hash, String(pin))) {
      const failed = s.failed + 1;
      run('UPDATE staff SET failed=?,locked_until=? WHERE id=?', failed >= 5 ? 0 : failed, failed >= 5 ? new Date(Date.now() + 15 * 60e3).toISOString() : null, id);
      throw new ApiError(401, 'wrong_pin', 'Wrong PIN');
    }
    run('UPDATE staff SET failed=0,locked_until=NULL WHERE id=?', id);
    return { ok: true, staff: publicStaff(s) };
  }
  return { createCategory, listCategories, deleteCategory, createProduct, listProducts, updateProduct, deleteProduct, createStaff, listStaff, setStaff, verifyPin };
};
