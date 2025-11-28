// Script to add database indexes for better performance
// Run once: node utils/addIndexes.js

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

console.log('📊 Adding database indexes for better performance...\n');

const indexes = [
    {
        name: 'idx_campaigns_status',
        table: 'campaigns',
        column: 'status',
        description: 'Speed up filtering campaigns by status'
    },
    {
        name: 'idx_campaigns_creator',
        table: 'campaigns',
        column: 'creator_id',
        description: 'Speed up finding campaigns by creator'
    },
    {
        name: 'idx_campaigns_blockchain',
        table: 'campaigns',
        column: 'blockchain_campaign_id',
        description: 'Speed up blockchain sync queries'
    },
    {
        name: 'idx_donations_campaign',
        table: 'donations',
        column: 'campaign_id',
        description: 'Speed up finding donations for a campaign'
    },
    {
        name: 'idx_donations_donor',
        table: 'donations',
        column: 'donor_id',
        description: 'Speed up finding donations by donor'
    },
    {
        name: 'idx_users_email',
        table: 'users',
        column: 'email',
        description: 'Speed up login queries'
    },
    {
        name: 'idx_users_wallet',
        table: 'users',
        column: 'wallet_address',
        description: 'Speed up wallet lookups'
    },
    {
        name: 'idx_withdrawal_requests_campaign',
        table: 'withdrawal_requests',
        column: 'campaign_id',
        description: 'Speed up withdrawal request queries'
    },
    {
        name: 'idx_usage_requests_campaign',
        table: 'usage_requests',
        column: 'campaign_id',
        description: 'Speed up usage request queries'
    }
];

let completed = 0;
let errors = 0;

db.serialize(() => {
    indexes.forEach((index) => {
        const sql = `CREATE INDEX IF NOT EXISTS ${index.name} ON ${index.table}(${index.column})`;

        db.run(sql, (err) => {
            if (err) {
                console.log(`❌ Error creating ${index.name}:`, err.message);
                errors++;
            } else {
                console.log(`✅ ${index.name} - ${index.description}`);
                completed++;
            }

            // Check if all indexes are processed
            if (completed + errors === indexes.length) {
                console.log(`\n📊 Index creation complete!`);
                console.log(`   ✅ Successfully created: ${completed}`);
                if (errors > 0) {
                    console.log(`   ❌ Errors: ${errors}`);
                }
                console.log(`\n🚀 Database is now optimized for better performance!`);
                db.close();
            }
        });
    });
});
