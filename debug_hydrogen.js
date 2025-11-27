const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'crowdfunding.db');
const db = new sqlite3.Database(dbPath);

const query = `
  SELECT c.title, c.current_amount,
  (
    COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM withdrawal_requests WHERE campaign_id = c.id AND executed = 1), 0) +
    COALESCE((SELECT SUM(CAST(amount AS REAL)) FROM fund_usage_plans WHERE campaign_id = c.id AND withdrawal_status = 'withdrawn'), 0)
  ) as total_withdrawn
  FROM campaigns c
  WHERE c.title = 'hydrogen'
`;

db.serialize(() => {
    db.get(query, (err, row) => {
        if (err) {
            console.error(err);
        } else {
            console.log('Campaign Data:', row);
        }
    });
});

db.close();
