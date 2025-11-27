const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

const campaignsToFix = ['hydrogen', 'water', 'shreyas startup'];

db.serialize(() => {
    campaignsToFix.forEach(title => {
        db.run(
            `UPDATE withdrawal_requests 
       SET executed = 1 
       WHERE campaign_id IN (SELECT id FROM campaigns WHERE title = ?)`,
            [title],
            function (err) {
                if (err) {
                    console.error(`Error updating ${title}:`, err);
                } else {
                    console.log(`Updated ${this.changes} withdrawal requests for campaign '${title}' to executed=1`);
                }
            }
        );
    });
});

db.close((err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Database connection closed.');
});
