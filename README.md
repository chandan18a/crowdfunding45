# 🚀 Blockchain Crowdfunding Platform

A decentralized crowdfunding platform built on Ethereum blockchain (Sepolia Testnet) with transparent fund management and donor voting system.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Key Features

- **Blockchain-Based**: All campaigns managed through Ethereum smart contracts on Sepolia testnet
- **MetaMask Integration**: Secure wallet connection for donations and transactions
- **Democratic Withdrawals**: Contribution-weighted voting system for fund withdrawal approvals
- **Multi-Role System**: Admin, Fundraiser, and Donor roles with specific permissions
- **Real-time Tracking**: Monitor campaign progress, donations, and fund usage
- **Google OAuth**: Quick sign-up and login option

## 🛠️ Tech Stack

**Frontend**: React 19.1, Redux, Bootstrap 5, Web3.js, Chart.js  
**Backend**: Node.js, Express.js, SQLite3, JWT, Passport.js  
**Blockchain**: Solidity 0.8.11, Web3.js, OpenZeppelin Contracts

## 📦 Prerequisites

- Node.js (v18+)
- MetaMask browser extension
- Sepolia testnet ETH ([Get from faucet](https://sepoliafaucet.com/))

## 🚀 Installation

```bash
# Clone repository
git clone https://github.com/chandan18a/crowdfunding45.git
cd crowdfunding45

# Install backend dependencies
npm install

# Install frontend dependencies
cd client
npm install
cd ..
```

## ⚙️ Configuration

Create a `.env` file in the root directory:

```env
# Server
PORT=5004
JWT_SECRET=your-jwt-secret
ADMIN_SECRET=your-admin-secret
SESSION_SECRET=your-session-secret

# Blockchain (Sepolia Testnet)
INFURA_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
CONTRACT_ADDRESS=YOUR_DEPLOYED_CONTRACT_ADDRESS
ADMIN_PRIVATE_KEY=YOUR_ADMIN_WALLET_PRIVATE_KEY
ADMIN_WALLET_ADDRESS=YOUR_ADMIN_WALLET_ADDRESS
NETWORK_NAME=sepolia
CHAIN_ID=11155111

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:5004/api/auth/google/callback
```

**Get Infura API Key**: Sign up at [Infura](https://infura.io/) and create a project

## 🏃 Running the Application

```bash
# Development mode (runs both frontend and backend)
npm run dev

# Backend only
npm run server

# Frontend only
npm run client

# Production build
npm run build
npm start
```

Access the application at `http://localhost:3004`

## 📜 Smart Contract

The `CrowdFunding.sol` smart contract includes:

- `createCampaign()` - Create new campaign
- `donateToCampaign()` - Donate ETH to campaign
- `requestWithdrawal()` - Request partial withdrawal with usage details
- `approveWithdrawal()` / `rejectWithdrawal()` - Vote on withdrawal requests
- `executeWithdrawal()` - Execute approved withdrawal
- `refund()` - Refund donors if campaign fails

**Security**: ReentrancyGuard, access control, contribution-weighted voting

## 📁 Project Structure

```
crowdfunding45/
├── client/              # React frontend
│   └── src/
│       ├── components/  # UI components
│       ├── redux/       # State management
│       └── utils/       # Utilities
├── routes/api/          # Backend API routes
├── models/              # Database models
├── middleware/          # Express middleware
├── utils/               # Backend utilities
├── uploads/             # User uploads
├── CrowdFunding.sol     # Smart contract
├── server.js            # Express server
└── crowdfunding.db      # SQLite database
```

## 🔌 Main API Endpoints

- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - User login
- `GET /api/campaigns` - Get all campaigns
- `POST /api/campaigns` - Create campaign
- `POST /api/donations` - Record donation
- `POST /api/withdrawal/request` - Request withdrawal
- `POST /api/withdrawal/vote` - Vote on withdrawal

## 📄 License

MIT License

## 🔗 Links

- **Repository**: https://github.com/chandan18a/crowdfunding45

---

**Made with ❤️ for Blockchain-Based Crowdfunding**
