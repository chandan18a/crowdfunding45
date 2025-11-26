const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='fund_usage_plans'", (err, row) => {
    if (err) {
        console.error(err);
    } else {
        console.log(row.sql);
    }
    db.close();
});
