const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

db.all(
    `SELECT c.title, c.current_amount, c.status,
       (
         COALESCE((SELECT SUM(amount) FROM withdrawal_requests WHERE campaign_id = c.id AND executed = 1), 0) +
         COALESCE((SELECT SUM(amount) FROM fund_usage_plans WHERE campaign_id = c.id AND withdrawal_status = 'withdrawn'), 0)
       ) as total_withdrawn
     FROM campaigns c
     WHERE c.title IN ('hydrogen', 'water', 'shreyas startup')`,
    [],
    (err, rows) => {
        if (err) {
            console.error(err);
        } else {
            console.log(JSON.stringify(rows, null, 2));
        }
        db.close();
    }
);
