const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// Delete the old "soft" campaign
db.run(`DELETE FROM campaigns WHERE title = 'soft' AND blockchain_campaign_id IS NOT NULL`, function (err) {
    if (err) {
        console.error('❌ Error deleting campaign:', err.message);
    } else {
        console.log(`✅ Deleted ${this.changes} campaign(s) with title "soft"`);
    }

    // Also delete related donations
    db.run(`DELETE FROM donations WHERE campaign_id IN (SELECT id FROM campaigns WHERE title = 'soft')`, function (err) {
        if (err) {
            console.error('❌ Error deleting donations:', err.message);
        } else {
            console.log(`✅ Deleted ${this.changes} related donation(s)`);
        }
        db.close();
    });
});
