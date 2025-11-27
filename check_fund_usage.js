const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

db.all(
    `SELECT * FROM fund_usage_plans 
     WHERE campaign_id IN (SELECT id FROM campaigns WHERE title = 'hydrogen')`,
    [],
    (err, rows) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Fund Usage Plans for Hydrogen:');
            console.log(JSON.stringify(rows, null, 2));
        }
        db.close();
    }
);
