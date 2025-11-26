const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

console.log('Adding missing columns to fund_usage_plans table...');

db.serialize(() => {
    // Try to add approval_status column
    db.run(`ALTER TABLE fund_usage_plans ADD COLUMN approval_status TEXT DEFAULT 'pending'`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding approval_status:', err.message);
        } else {
            console.log('✓ approval_status column added (or already exists)');
        }
    });

    // Try to add approved_by_count column
    db.run(`ALTER TABLE fund_usage_plans ADD COLUMN approved_by_count INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding approved_by_count:', err.message);
        } else {
            console.log('✓ approved_by_count column added (or already exists)');
        }

        console.log('Migration complete! Restart your server.');
        db.close();
    });
});
