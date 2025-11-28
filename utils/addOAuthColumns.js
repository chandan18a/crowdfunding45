// Script to add OAuth columns to users table
// Run once: node utils/addOAuthColumns.js

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crowdfunding.db');

console.log('📊 Adding OAuth columns to users table...\n');

const columns = [
    {
        name: 'oauth_provider',
        type: 'TEXT',
        description: 'OAuth provider (google, microsoft, github, etc.)'
    },
    {
        name: 'oauth_id',
        type: 'TEXT',
        description: 'Unique ID from OAuth provider'
    },
    {
        name: 'profile_picture',
        type: 'TEXT',
        description: 'Profile picture URL from OAuth provider'
    }
];

let completed = 0;
let errors = 0;

db.serialize(() => {
    columns.forEach((column) => {
        const sql = `ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`;

        db.run(sql, (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log(`⏭️  ${column.name} - Already exists (skipping)`);
                } else {
                    console.log(`❌ Error adding ${column.name}:`, err.message);
                    errors++;
                }
            } else {
                console.log(`✅ ${column.name} - ${column.description}`);
                completed++;
            }

            // Check if all columns are processed
            if (completed + errors >= columns.length) {
                console.log(`\n📊 OAuth columns setup complete!`);
                console.log(`   ✅ Successfully added: ${completed}`);
                if (errors > 0) {
                    console.log(`   ⏭️  Already existed: ${errors}`);
                }
                console.log(`\n🚀 Database is ready for Google OAuth!`);
                db.close();
            }
        });
    });
});
