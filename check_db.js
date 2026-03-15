import Database from "better-sqlite3";
const db = new Database("zpay.db");
const info = db.pragma("table_info(transactions)");
console.log(info);
