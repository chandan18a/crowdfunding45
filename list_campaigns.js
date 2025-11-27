const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// List all campaigns with blockchain IDs
db.all(`SELECT id, title, blockchain_campaign_id, current_amount, goal, status FROM campaigns WHERE blockchain_campaign_id IS NOT NULL ORDER BY id DESC LIMIT 10`, (err, rows) => {
    if (err) {
        console.error('❌ Error:', err.message);
    } else {
        console.log('\n📋 Recent campaigns with blockchain IDs:\n');
        rows.forEach(row => {
            console.log(`ID: ${row.id} | Title: "${row.title}" | Blockchain ID: ${row.blockchain_campaign_id} | Raised: ${row.current_amount}/${row.goal} ETH | Status: ${row.status}`);
        });
    }
    db.close();
});
