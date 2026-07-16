const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'syncos.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function beginTransaction() {
  return run('BEGIN TRANSACTION');
}

function commitTransaction() {
  return run('COMMIT');
}

function rollbackTransaction() {
  return run('ROLLBACK');
}

module.exports = {
  db,
  run,
  all,
  get,
  beginTransaction,
  commitTransaction,
  rollbackTransaction
};
