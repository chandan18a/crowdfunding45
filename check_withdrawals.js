const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// Check all withdrawal requests for hydrogen campaign
db.all(
    `SELECT 
    wr.id,
    wr.campaign_id,
    wr.request_id,
    wr.amount,
    wr.usage_details,
    wr.executed,
    c.title
   FROM withdrawal_requests wr
   JOIN campaigns c ON wr.campaign_id = c.id
   WHERE c.title = 'hydrogen'
   ORDER BY wr.request_id`,
    [],
    (err, rows) => {
        if (err) {
            console.error('Error:', err);
        } else {
            console.log('Withdrawal Requests for Hydrogen:');
            console.log(JSON.stringify(rows, null, 2));
            console.log('\nTotal Amount:', rows.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0));
        }
        db.close();
    }
);
