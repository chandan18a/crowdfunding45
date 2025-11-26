const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

db.serialize(() => {
    db.all("SELECT wallet_address FROM campaigns WHERE title LIKE '%redmi%'", (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log(rows[0].wallet_address);
    });
});

db.close();
