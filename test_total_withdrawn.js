const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// Test query to check total_withdrawn calculation
db.all(
    `SELECT 
    c.id,
    c.title,
    c.current_amount,
    COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM withdrawal_requests WHERE campaign_id = c.id), 0) as total_withdrawn
   FROM campaigns c 
   WHERE c.title = 'hydrogen'`,
    [],
    (err, rows) => {
        if (err) {
            console.error('Error:', err);
        } else {
            console.log('Results:', JSON.stringify(rows, null, 2));
        }
        db.close();
    }
);
