const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

console.log('Migrating fund_plan_approvals table to support per-plan approvals...');

db.serialize(() => {
    db.run("PRAGMA foreign_keys=off;");
    db.run("BEGIN TRANSACTION;");

    // Drop the old table
    db.run("DROP TABLE IF EXISTS fund_plan_approvals;");

    // Create the new table with plan_id
    db.run(`CREATE TABLE fund_plan_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER NOT NULL,
        donor_id INTEGER NOT NULL,
        approved INTEGER NOT NULL CHECK(approved IN (0,1)),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plan_id, donor_id),
        FOREIGN KEY (plan_id) REFERENCES fund_usage_plans (id),
        FOREIGN KEY (donor_id) REFERENCES users (id)
    )`);

    db.run("COMMIT;", (err) => {
        if (err) {
            console.error('Migration failed:', err.message);
            db.run("ROLLBACK;");
        } else {
            console.log('Migration successful! fund_plan_approvals table recreated.');
        }
        db.close();
    });
});
