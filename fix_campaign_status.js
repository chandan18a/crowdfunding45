const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

db.serialize(() => {
    // 1. Fix hydrogen's old usage plan
    db.run(
        `UPDATE fund_usage_plans 
     SET withdrawal_status = 'withdrawn' 
     WHERE campaign_id IN (SELECT id FROM campaigns WHERE title = 'hydrogen') 
     AND amount = 0.001`,
        function (err) {
            if (err) console.error('Error updating hydrogen plan:', err);
            else console.log(`Updated ${this.changes} fund usage plans for hydrogen to 'withdrawn'`);
        }
    );

    // 2. Update campaign status to 'completed' if fully withdrawn
    // We use a temporary table or complex query to find them first
    db.all(
        `SELECT c.id, c.title, c.current_amount,
       (
         COALESCE((SELECT SUM(amount) FROM withdrawal_requests WHERE campaign_id = c.id AND executed = 1), 0) +
         COALESCE((SELECT SUM(amount) FROM fund_usage_plans WHERE campaign_id = c.id AND withdrawal_status = 'withdrawn'), 0)
       ) as total_withdrawn
     FROM campaigns c
     WHERE c.status = 'active'`,
        [],
        (err, rows) => {
            if (err) {
                console.error('Error fetching campaigns:', err);
                return;
            }

            rows.forEach(row => {
                // Use epsilon for float comparison
                if ((row.total_withdrawn + 0.000001) >= row.current_amount && row.current_amount > 0) {
                    console.log(`Marking campaign '${row.title}' as completed (Raised: ${row.current_amount}, Withdrawn: ${row.total_withdrawn})`);
                    db.run(
                        `UPDATE campaigns SET status = 'completed' WHERE id = ?`,
                        [row.id],
                        (updateErr) => {
                            if (updateErr) console.error(`Failed to update ${row.title}:`, updateErr);
                        }
                    );
                }
            });
        }
    );
});

// Wait a bit for async operations
setTimeout(() => {
    db.close((err) => {
        if (err) console.error(err);
        else console.log('Database connection closed.');
    });
}, 2000);
