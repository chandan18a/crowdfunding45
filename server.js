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
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'active', 'completed')),
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
});

// Note: Multiple users can now use the same wallet address
// The wallet_address column no longer has a UNIQUE constraint
console.log('✅ Users table configured to allow shared wallet addresses');

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

// Withdrawal routes
app.use('/api/withdrawal', require('./routes/api/withdrawal'));



// Notification routes
const { router: notificationRoutes } = require('./routes/api/notifications');
app.use('/api/notifications', notificationRoutes);

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
