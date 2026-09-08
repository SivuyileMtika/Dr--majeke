'use strict';

// A minimal in-memory stand-in for the slice of the Firestore Admin SDK this
// codebase actually uses (collection/doc/get/set/update/delete/add, where +
// orderBy + limit queries, and runTransaction). Every helper module in
// server/ takes `db` as its first argument, so passing one of these instead
// of a real `admin.firestore()` makes them unit-testable without network
// access or real credentials.
//
// Not a Firestore emulator — no real transaction isolation, no compound
// index requirements, no server timestamps resolving asynchronously. Good
// enough to test business logic; not a substitute for testing against the
// real thing before a production migration.

function matches(data, [field, op, value]) {
  const actual = field.split('.').reduce((o, k) => (o == null ? o : o[k]), data);
  switch (op) {
    case '==': return actual === value;
    case '!=': return actual !== value;
    case '>':  return actual > value;
    case '>=': return actual >= value;
    case '<':  return actual < value;
    case '<=': return actual <= value;
    case 'in': return Array.isArray(value) && value.includes(actual);
    case 'not-in': return Array.isArray(value) && !value.includes(actual);
    case 'array-contains': return Array.isArray(actual) && actual.includes(value);
    default: throw new Error(`fakeFirestore: unsupported operator "${op}"`);
  }
}

class FakeDocSnapshot {
  constructor(id, data) {
    this.id = id;
    this._data = data;
    this.exists = data !== undefined;
  }
  data() { return this._data; }
}

class FakeDocRef {
  constructor(store, collectionName, id) {
    this._store = store;
    this._collectionName = collectionName;
    this.id = id;
  }
  _collection() {
    if (!this._store.has(this._collectionName)) this._store.set(this._collectionName, new Map());
    return this._store.get(this._collectionName);
  }
  async get() {
    const raw = this._collection().get(this.id);
    return new FakeDocSnapshot(this.id, raw ? { ...raw } : undefined);
  }
  async set(data) {
    this._collection().set(this.id, { ...data });
  }
  async update(patch) {
    const col = this._collection();
    if (!col.has(this.id)) throw new Error(`fakeFirestore: update() on missing doc ${this._collectionName}/${this.id}`);
    col.set(this.id, { ...col.get(this.id), ...patch });
  }
  async delete() {
    this._collection().delete(this.id);
  }
}

class FakeQuery {
  constructor(store, collectionName, filters = [], order = null, limitN = null) {
    this._store = store;
    this._collectionName = collectionName;
    this._filters = filters;
    this._order = order;
    this._limit = limitN;
  }
  where(field, op, value) {
    return new FakeQuery(this._store, this._collectionName, [...this._filters, [field, op, value]], this._order, this._limit);
  }
  orderBy(field, direction = 'asc') {
    return new FakeQuery(this._store, this._collectionName, this._filters, { field, direction }, this._limit);
  }
  limit(n) {
    return new FakeQuery(this._store, this._collectionName, this._filters, this._order, n);
  }
  async get() {
    const col = this._store.get(this._collectionName) || new Map();
    let docs = [...col.entries()]
      .filter(([, data]) => this._filters.every(f => matches(data, f)))
      .map(([id, data]) => new FakeDocSnapshot(id, { ...data }));

    if (this._order) {
      const { field, direction } = this._order;
      docs.sort((a, b) => {
        const av = a.data()[field], bv = b.data()[field];
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return direction === 'desc' ? -cmp : cmp;
      });
    }
    if (this._limit != null) docs = docs.slice(0, this._limit);

    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeCollectionRef extends FakeQuery {
  constructor(store, collectionName) {
    super(store, collectionName);
  }
  doc(id) {
    const docId = id || `auto_${Math.random().toString(36).slice(2, 10)}`;
    return new FakeDocRef(this._store, this._collectionName, docId);
  }
  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class FakeFirestore {
  constructor() {
    this._store = new Map();
  }
  collection(name) {
    return new FakeCollectionRef(this._store, name);
  }
  // Not a real transaction (no isolation/retry) — runs the callback with a
  // txn object whose get/set/update proxy straight to the store. Sufficient
  // for testing the *outcome* of transactional code, not its concurrency
  // guarantees.
  async runTransaction(fn) {
    const store = this._store;
    const txn = {
      async get(ref) { return ref.get(); },
      set(ref, data) { store.get(ref._collectionName) || store.set(ref._collectionName, new Map()); store.get(ref._collectionName).set(ref.id, { ...data }); },
      update(ref, patch) {
        const col = store.get(ref._collectionName);
        if (!col || !col.has(ref.id)) throw new Error(`fakeFirestore: transaction update() on missing doc ${ref._collectionName}/${ref.id}`);
        col.set(ref.id, { ...col.get(ref.id), ...patch });
      },
    };
    return fn(txn);
  }
}

function createFakeFirestore() {
  return new FakeFirestore();
}

module.exports = { createFakeFirestore };
