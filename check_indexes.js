const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

db.all("SELECT * FROM sqlite_master WHERE type='index' AND tbl_name='fund_usage_plans'", (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(rows);
    }
    db.close();
});
