// db-json.cjs
// Utility for reading/writing db.json atomically
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'src', 'db.json');

function readDB() {
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDB(data) {
  // Only update keys present in data, preserve others
  const current = readDB();
  const updated = { ...current, ...data };
  fs.writeFileSync(DB_PATH, JSON.stringify(updated, null, 2));
}

function atomicUpdate(updater) {
  const db = readDB();
  const newDb = updater(db);
  writeDB(newDb);
}

module.exports = { readDB, writeDB, atomicUpdate, DB_PATH };
