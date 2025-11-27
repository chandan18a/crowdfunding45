const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

db.all("PRAGMA table_info(fund_usage_plans)", (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log("Columns in fund_usage_plans table:");
    rows.forEach(row => {
        console.log(`- ${row.name} (${row.type})`);
    });
});
