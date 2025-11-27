const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'crowdfunding.db');
const db = new sqlite3.Database(dbPath);

const campaignTitle = 'shreyas startup';

db.serialize(() => {
    db.get("SELECT * FROM campaigns WHERE title = ?", [campaignTitle], (err, campaign) => {
        if (err) {
            console.error('Error fetching campaign:', err);
            return;
        }
        if (!campaign) {
            console.log('Campaign not found');
            return;
        }

        console.log('Campaign:', campaign);

        // Calculate total withdrawn using the same logic as the API
        const query = `
            SELECT 
                (
                    COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM withdrawal_requests WHERE campaign_id = ?), 0) +
                    COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM fund_usage_plans WHERE campaign_id = ? AND withdrawal_status IN ('pending', 'withdrawn')), 0)
                ) as total_withdrawn
        `;

        db.get(query, [campaign.id, campaign.id], (err, result) => {
            if (err) {
                console.error('Error calculating totals:', err);
                return;
            }
            console.log('Calculated Total Withdrawn:', result.total_withdrawn);
            console.log('Calculated Total Pending:', result.total_pending);
            console.log('Current Amount:', campaign.current_amount);
            console.log('Effective Available:', campaign.current_amount - result.total_withdrawn - result.total_pending);
        });
    });
});
