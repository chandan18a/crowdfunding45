const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

db.all("PRAGMA table_info(campaigns)", (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    console.log("Columns in campaigns table:");
    rows.forEach(row => {
        console.log(`- ${row.name} (${row.type})`);
    });
});
