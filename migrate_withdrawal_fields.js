const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

console.log('Adding withdrawal tracking columns to fund_usage_plans table...');

db.serialize(() => {
    // Add withdrawal_status column
    db.run(`ALTER TABLE fund_usage_plans ADD COLUMN withdrawal_status TEXT DEFAULT 'pending'`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding withdrawal_status:', err.message);
        } else {
            console.log('✓ withdrawal_status column added (or already exists)');
        }
    });

    // Add withdrawn_at column
    db.run(`ALTER TABLE fund_usage_plans ADD COLUMN withdrawn_at DATETIME`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding withdrawn_at:', err.message);
        } else {
            console.log('✓ withdrawn_at column added (or already exists)');
        }
    });

    // Add withdrawal_tx_hash column
    db.run(`ALTER TABLE fund_usage_plans ADD COLUMN withdrawal_tx_hash TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding withdrawal_tx_hash:', err.message);
        } else {
            console.log('✓ withdrawal_tx_hash column added (or already exists)');
        }

        console.log('Migration complete! Restart your server.');
        db.close();
    });
});
