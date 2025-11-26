const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

db.serialize(() => {
    db.all("SELECT id, title, blockchain_campaign_id, wallet_address, created_at FROM campaigns WHERE title LIKE '%redmi%'", (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log(JSON.stringify(rows, null, 2));
    });
});

db.close();
