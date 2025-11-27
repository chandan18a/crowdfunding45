const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const multer = require('multer');
require('dotenv').config({ path: './.env' });
const { checkEnvVariables } = require('./utils/envCheck');
const WebSocketServer = require('./utils/websocket');

// Initialize express app
const app = express();

// Configure CORS with specific options
const corsOptions = {
  origin: ['http://localhost:3004', 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3004'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('static'));
app.use('/uploads', express.static('uploads'));

// Compatibility fallback: if a request comes to "/<filename>" (missing /uploads),
// try to serve the file from the uploads directory. This covers legacy URLs like
// "/1758896808377-cricket.jpg" that were saved without the "/uploads" prefix.
app.get('/:maybeFile', (req, res, next) => {
  try {
    let candidate = req.params.maybeFile || '';
    if (!candidate || candidate.includes('/')) return next();
    // Decode URL encoding so filenames with spaces work
    try {
      candidate = decodeURIComponent(candidate);
    } catch (e) {
      // ignore decode errors, use raw candidate
    }
    const fullPath = path.join(process.cwd(), 'uploads', candidate);
    if (require('fs').existsSync(fullPath)) {
      return res.sendFile(fullPath);
    }
    return next();
  } catch (e) {
    return next();
  }
});

// Add logging middleware to see all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
  next();
});

// Database setup
const db = new sqlite3.Database('./crowdfunding.db');

function ensureCampaignStatusConstraint() {
  db.get(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='campaigns'",
    (err, row) => {
      if (err) {
        console.error('❌ Failed to inspect campaigns table definition:', err.message);
        return;
      }

      const createSql = row?.sql || '';
      if (!createSql) {
        console.warn('⚠️ Campaigns table definition missing; skipping status constraint validation');
        return;
      }

      if (createSql.includes("'failed'")) {
        console.log('✅ Campaign status constraint already includes failed state');
        return;
      }

      console.log('⚠️ Updating campaigns table to allow failed status...');
      const migrationSQL = `
PRAGMA foreign_keys=off;
BEGIN TRANSACTION;
DROP TABLE IF EXISTS campaigns_new;
CREATE TABLE campaigns_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    goal REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    creator_id INTEGER,
    wallet_address TEXT,
    image_url TEXT,
    document_url TEXT,
    deadline DATETIME,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'active', 'completed', 'failed')),
    approved_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    blockchain_campaign_id TEXT,
    transaction_hash TEXT,
    is_withdrawn INTEGER DEFAULT 0,
    category TEXT DEFAULT 'general',
    confirmed_at DATETIME,
    blockchain_goal REAL,
    FOREIGN KEY (creator_id) REFERENCES users (id),
    FOREIGN KEY (approved_by) REFERENCES users (id)
);
INSERT INTO campaigns_new (id, title, description, goal, current_amount, creator_id, wallet_address, image_url, document_url, deadline, status, approved_by, created_at, blockchain_campaign_id, transaction_hash, is_withdrawn, category, confirmed_at, blockchain_goal)
SELECT id, title, description, goal, current_amount, creator_id, wallet_address, image_url, document_url, deadline, status, approved_by, created_at, blockchain_campaign_id, transaction_hash, is_withdrawn, category, confirmed_at, blockchain_goal
FROM campaigns;
DROP TABLE campaigns;
ALTER TABLE campaigns_new RENAME TO campaigns;
COMMIT;
PRAGMA foreign_keys=on;
`;

      db.exec(migrationSQL, (migrationErr) => {
        if (migrationErr) {
          console.error('❌ Failed to update campaigns status constraint:', migrationErr.message);
          db.exec('ROLLBACK;', () => { });
        } else {
          console.log('✅ Campaigns table updated to include failed status');
        }
      });
    }
  );
}

// Check environment variables
console.log('🔍 Checking environment variables for blockchain configuration...');
checkEnvVariables();

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'donor', 'fundraiser')),
        wallet_address TEXT,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        emergency_contact TEXT,
        emergency_phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        goal REAL NOT NULL,
        current_amount REAL DEFAULT 0,
        creator_id INTEGER,
        wallet_address TEXT,
        image_url TEXT,
        document_url TEXT,
        deadline DATETIME,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'active', 'completed', 'failed')),
        approved_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        blockchain_campaign_id TEXT,
        transaction_hash TEXT,
        category TEXT DEFAULT 'general',
        is_withdrawn INTEGER DEFAULT 0,
        FOREIGN KEY (creator_id) REFERENCES users (id),
        FOREIGN KEY (approved_by) REFERENCES users (id)
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER,
        donor_id INTEGER,
        amount REAL NOT NULL,
        transaction_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        donor_address TEXT,
        FOREIGN KEY (campaign_id) REFERENCES campaigns (id),
        FOREIGN KEY (donor_id) REFERENCES users (id)
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS usage_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'OTHER',
        requested_amount REAL NOT NULL,
        actual_amount REAL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','SPENT')),
        onchain_tx_hash TEXT,
        supporting_docs_url TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns (id),
        FOREIGN KEY (created_by) REFERENCES users (id)
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER NOT NULL,
        request_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        usage_details TEXT NOT NULL,
        transaction_hash TEXT,
        executed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS usage_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usage_request_id INTEGER NOT NULL,
        donor_id INTEGER NOT NULL,
        donor_wallet_address TEXT,
        vote INTEGER NOT NULL CHECK(vote IN (0,1)),
        donated_amount REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usage_request_id, donor_id),
        FOREIGN KEY (usage_request_id) REFERENCES usage_requests (id),
        FOREIGN KEY (donor_id) REFERENCES users (id)
    )`);

  db.run(`CREATE TABLE IF NOT EXISTS fund_usage_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    bill_url TEXT,
    approval_status TEXT DEFAULT 'pending',
    approved_by_count INTEGER DEFAULT 0,
    withdrawal_status TEXT DEFAULT 'pending',
    withdrawn_at DATETIME,
    withdrawal_tx_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS fund_plan_approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    donor_id INTEGER NOT NULL,
    approved INTEGER NOT NULL CHECK(approved IN (0,1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, donor_id),
    FOREIGN KEY (campaign_id) REFERENCES campaigns (id),
    FOREIGN KEY (donor_id) REFERENCES users (id)
  )`);

  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_requests_campaign ON usage_requests (campaign_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_usage_votes_request ON usage_votes (usage_request_id)`);

  // Create default admin user
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, email, password, role, name, wallet_address) 
            VALUES ('admin', 'admin@crowdfunding.com', ?, 'admin', 'System Administrator', '')`,
    [adminPassword]);

  // Create demo accounts
  const donorPassword = bcrypt.hashSync('donor123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, email, password, role, name, wallet_address) 
            VALUES ('donor1', 'donor1@example.com', ?, 'donor', 'Demo Donor', '')`,
    [donorPassword]);

  const fundraiserPassword = bcrypt.hashSync('fundraiser123', 10);
  db.run(`INSERT OR IGNORE INTO users (username, email, password, role, name, wallet_address) 
            VALUES ('fundraiser1', 'fundraiser1@example.com', ?, 'fundraiser', 'Demo Fundraiser', '')`,
    [fundraiserPassword]);

  ensureCampaignStatusConstraint();
});

// Note: Multiple users can now use the same wallet address
// The wallet_address column no longer has a UNIQUE constraint
console.log('✅ Users table configured to allow shared wallet addresses');

// Add emergency contact columns to existing users table
db.run(`ALTER TABLE users ADD COLUMN phone TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding phone column:', err.message);
  }
});

db.run(`ALTER TABLE users ADD COLUMN address TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding address column:', err.message);
  }
});

db.run(`ALTER TABLE users ADD COLUMN emergency_contact TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding emergency_contact column:', err.message);
  }
});

db.run(`ALTER TABLE users ADD COLUMN emergency_phone TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding emergency_phone column:', err.message);
  }
});

console.log('✅ Emergency contact fields added to users table');

// Add blockchain-related columns to campaigns table if they don't exist
// This is for backward compatibility with existing databases
db.run(`ALTER TABLE campaigns ADD COLUMN blockchain_campaign_id TEXT`, (err) => {
  // Silently ignore if column already exists
});

db.run(`ALTER TABLE campaigns ADD COLUMN transaction_hash TEXT`, (err) => {
  // Silently ignore if column already exists
});

db.run(`ALTER TABLE campaigns ADD COLUMN category TEXT DEFAULT 'general'`, (err) => {
  // Silently ignore if column already exists
});

db.run(`ALTER TABLE campaigns ADD COLUMN is_withdrawn INTEGER DEFAULT 0`, (err) => {
  // Silently ignore if column already exists
});

db.run(`ALTER TABLE campaigns ADD COLUMN confirmed_at DATETIME`, (err) => {
  // Silently ignore if column already exists
});

// Add donor_address column to donations table
db.run(`ALTER TABLE donations ADD COLUMN donor_address TEXT`, (err) => {
  // Silently ignore if column already exists
});

// Add blockchain_goal column to campaigns table to store blockchain goal values separately
db.run(`ALTER TABLE campaigns ADD COLUMN blockchain_goal REAL`, (err) => {
  // Silently ignore if column already exists
});

// Add document_url column to withdrawal_requests table for bill uploads
db.run(`ALTER TABLE withdrawal_requests ADD COLUMN document_url TEXT`, (err) => {
  // Silently ignore if column already exists
});

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Initialize database and create admin user
function initializeDatabase() {
  db.all("PRAGMA table_info(users)", (err, columns) => {
    if (err) {
      console.error('Error checking users table schema:', err.message);
      return;
    }

    // Check if the table has the expected columns
    const columnNames = columns.map(col => col.name);
    console.log('Users table columns:', columnNames);

    if (columnNames.includes('name') && columnNames.includes('email')) {
      // Check if any user exists already
      db.get('SELECT COUNT(*) as count FROM users', [], (err, result) => {
        if (err) {
          console.error('Error checking users table:', err.message);
          return;
        }

        if (result.count > 0) {
          console.log('Users already exist in the database, skipping admin creation');
          return;
        }

        // Generate a unique wallet address for admin
        const adminUser = {
          name: 'admin',
          email: 'admin@example.com',
          password: 'admin123',
          walletAddress: '0x' + Math.random().toString(16).substr(2, 40), // Random wallet address
          role: 'admin'
        };

        // Hash password and create admin
        bcrypt.genSalt(10, (err, salt) => {
          if (err) {
            console.error('Error generating salt:', err.message);
            return;
          }

          bcrypt.hash(adminUser.password, salt, (err, hash) => {
            if (err) {
              console.error('Error hashing password:', err.message);
              return;
            }

            adminUser.password = hash;

            // Insert admin user
            db.run(
              'INSERT INTO users (name, email, password, wallet_address, role) VALUES (?, ?, ?, ?, ?)',
              [adminUser.name, adminUser.email, adminUser.password, adminUser.walletAddress, adminUser.role],
              (err) => {
                if (err) {
                  console.error('Error creating admin user:', err.message);
                } else {
                  console.log('Default admin user created successfully');
                }
              }
            );
          });
        });
      });
    } else {
      console.error('Users table does not have the expected columns');
    }
  });
}

// Call initialize function
initializeDatabase();

// Define routes
// Auth routes
app.use('/api/auth', require('./routes/api/auth'));

// Admin routes
app.use('/api/admin', require('./routes/api/admin'));

// File routes (preview/download uploads safely)
const filesRouter = require('./routes/api/files');
app.use('/api/files', filesRouter);
// Compatibility: also support non-API prefix so /files/preview works
app.use('/files', filesRouter);

// Campaign routes
app.use('/api/campaigns', require('./routes/api/campaigns'));

// Comment routes
app.use('/api/comments', require('./routes/api/comments'));

// Donation routes
app.use('/api/donations', require('./routes/api/donations'));

// Usage request routes (off-chain governance layer)
app.use('/api/usage-requests', require('./routes/api/usageRequests'));

// Fund Usage Plan routes
app.use('/api/fund-usage-plans', require('./routes/api/fundUsagePlans'));

// Withdrawal routes
app.use('/api/withdrawal', require('./routes/api/withdrawal'));



// Notification routes
const { router: notificationRoutes } = require('./routes/api/notifications');
app.use('/api/notifications', notificationRoutes);

// Withdrawal request routes
const withdrawalRequestRoutes = require('./routes/api/withdrawalRequests');
app.use('/api/withdrawal-requests', withdrawalRequestRoutes);

// Test mode check endpoint
app.get('/api/test-mode', (req, res) => {
  res.json({ testMode: process.env.TEST_MODE === 'true' });
});

// Manual campaign sync endpoint
app.post('/api/sync-campaigns', async (req, res) => {
  try {
    const { syncCampaignStatuses } = require('./utils/blockchainSync');
    await syncCampaignStatuses();
    res.json({ message: 'Campaigns synced successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error syncing campaigns', error: error.message });
  }
});

// Serve the React app in development mode
if (process.env.NODE_ENV === 'production') {
  // Serve the built React app in production
  app.use(express.static(path.join(__dirname, 'client/build')));

  // Catch-all route to serve React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
} else {
  // In development, serve the templates/index.html for the root route
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'templates', 'index.html'));
  });
}

// Start server
const PORT = process.env.PORT || 5006; // Changed from 5005 to 5006 to avoid conflicts
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Blockchain Crowdfunding Server started successfully!`);
  console.log(`📡 Backend API: http://localhost:${PORT}`);
  console.log(`🌐 Frontend URL: http://localhost:3004`);
  console.log(`💎 Blockchain Integration: ENABLED`);
  console.log(`🔐 Smart Contract: ${process.env.CONTRACT_ADDRESS}`);
  console.log(`\n✅ Server is ready for blockchain operations!\n`);
});

// Initialize WebSocket server
const wsServer = new WebSocketServer(server);
console.log('🔌 WebSocket server initialized for real-time notifications');

// Initialize blockchain sync
console.log('🔄 Initializing blockchain sync...');
try {
  require('./utils/blockchainSync');
  console.log('✅ Blockchain sync initialized');
} catch (err) {
  console.error('❌ Failed to initialize blockchain sync:', err.message);
}
