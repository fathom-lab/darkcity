/**
 * APEX 3.0 — PostgreSQL Adapter
 * Mimics the Supabase JS client interface (.from().select/insert/update/upsert)
 * backed by the existing node-postgres pool.
 *
 * Usage: replace `supabase` with `pgAdapter(pool)` in SovereignMind constructor.
 * No other code changes needed.
 */

function pgAdapter(pool) {
  return { from: (table) => new QueryBuilder(pool, table) };
}

class QueryBuilder {
  constructor(pool, table) {
    this._pool = pool;
    this._table = table;
    this._conditions = [];
    this._params = [];
    this._limitN = null;
    this._orderCol = null;
    this._orderAsc = true;
    this._selectCols = '*';
    this._returning = null;
  }

  // ── TERMINAL OPERATIONS ──────────────────────────────────────

  async select(cols = '*') {
    this._selectCols = cols;
    return this._exec('SELECT');
  }

  async insert(rows) {
    const arr = Array.isArray(rows) ? rows : [rows];
    if (arr.length === 0) return { data: [], error: null };
    const keys = Object.keys(arr[0]);
    const colList = keys.join(', ');
    const valuePlaceholders = arr.map((row, ri) =>
      '(' + keys.map((_, ki) => `$${ri * keys.length + ki + 1}`).join(', ') + ')'
    ).join(', ');
    const values = arr.flatMap(r => keys.map(k => r[k]));
    const sql = `INSERT INTO ${this._table} (${colList}) VALUES ${valuePlaceholders}` +
      (this._returning ? ` RETURNING ${this._returning}` : '');
    return this._run(sql, values);
  }

  async upsert(rows, opts = {}) {
    const arr = Array.isArray(rows) ? rows : [rows];
    if (arr.length === 0) return { data: [], error: null };
    const keys = Object.keys(arr[0]);
    const colList = keys.join(', ');
    const valuePlaceholders = arr.map((row, ri) =>
      '(' + keys.map((_, ki) => `$${ri * keys.length + ki + 1}`).join(', ') + ')'
    ).join(', ');
    const values = arr.flatMap(r => keys.map(k => r[k]));
    const conflictCol = opts.onConflict || 'id';
    const updateCols = keys.filter(k => k !== conflictCol)
      .map(k => `${k} = EXCLUDED.${k}`).join(', ');
    const sql = `INSERT INTO ${this._table} (${colList}) VALUES ${valuePlaceholders}` +
      ` ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateCols}` +
      (this._returning ? ` RETURNING ${this._returning}` : '');
    return this._run(sql, values);
  }

  async update(patch) {
    const keys = Object.keys(patch);
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const baseParams = keys.map(k => patch[k]);
    const whereClause = this._buildWhere(baseParams.length + 1);
    const sql = `UPDATE ${this._table} SET ${setClauses}` +
      (whereClause ? ` WHERE ${whereClause}` : '') +
      (this._returning ? ` RETURNING ${this._returning}` : '');
    return this._run(sql, [...baseParams, ...this._params]);
  }

  async delete() {
    const whereClause = this._buildWhere(1);
    const sql = `DELETE FROM ${this._table}` +
      (whereClause ? ` WHERE ${whereClause}` : '');
    return this._run(sql, this._params);
  }

  // ── CHAIN MODIFIERS ──────────────────────────────────────────

  eq(col, val) {
    this._conditions.push(`${col} = $${this._params.length + 1}`);
    this._params.push(val);
    return this;
  }

  neq(col, val) {
    this._conditions.push(`${col} != $${this._params.length + 1}`);
    this._params.push(val);
    return this;
  }

  gt(col, val) {
    this._conditions.push(`${col} > $${this._params.length + 1}`);
    this._params.push(val);
    return this;
  }

  gte(col, val) {
    this._conditions.push(`${col} >= $${this._params.length + 1}`);
    this._params.push(val);
    return this;
  }

  lt(col, val) {
    this._conditions.push(`${col} < $${this._params.length + 1}`);
    this._params.push(val);
    return this;
  }

  lte(col, val) {
    this._conditions.push(`${col} <= $${this._params.length + 1}`);
    this._params.push(val);
    return this;
  }

  in(col, vals) {
    const placeholders = vals.map((_, i) => `$${this._params.length + i + 1}`).join(', ');
    this._conditions.push(`${col} IN (${placeholders})`);
    this._params.push(...vals);
    return this;
  }

  order(col, opts = {}) {
    this._orderCol = col;
    this._orderAsc = opts.ascending !== false;
    return this;
  }

  limit(n) {
    this._limitN = n;
    return this;
  }

  single() {
    this._limitN = 1;
    this._single = true;
    return this;
  }

  returning(cols) {
    this._returning = cols;
    return this;
  }

  // ── INTERNALS ────────────────────────────────────────────────

  _buildWhere(startIdx) {
    if (this._conditions.length === 0) return '';
    // Re-index parameters if they were added before where was finalized
    return this._conditions.join(' AND ');
  }

  async _exec(op) {
    const whereClause = this._buildWhere(1);
    let sql = `SELECT ${this._selectCols} FROM ${this._table}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    if (this._orderCol) sql += ` ORDER BY ${this._orderCol} ${this._orderAsc ? 'ASC' : 'DESC'}`;
    if (this._limitN) sql += ` LIMIT ${this._limitN}`;
    return this._run(sql, this._params);
  }

  async _run(sql, params) {
    try {
      const result = await this._pool.query(sql, params);
      const data = this._single
        ? (result.rows[0] || null)
        : result.rows;
      return { data, error: null };
    } catch (err) {
      console.error(`[APEX3 PG] ${sql.slice(0, 80)}... →`, err.message);
      return { data: null, error: err };
    }
  }
}

module.exports = { pgAdapter };
