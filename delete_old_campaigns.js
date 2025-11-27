const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

// Delete all campaigns with blockchain IDs that are NOT from the new contract
// The new contract starts fresh, so only blockchain_campaign_id = 1 should exist
// All other blockchain IDs are from the old contract
db.run(`DELETE FROM campaigns WHERE blockchain_campaign_id IS NOT NULL AND blockchain_campaign_id != '1'`, function (err) {
    if (err) {
        console.error('❌ Error deleting old campaigns:', err.message);
    } else {
        console.log(`✅ Deleted ${this.changes} old campaign(s) from previous contract`);
    }
    db.close();
});
