# Algorithms Used in Crowdfunding Platform

## Overview
This project employs several key algorithms for security, blockchain operations, data management, and user authentication.

---

## 1. Authentication & Security Algorithms

### 1.1 Bcrypt Password Hashing Algorithm
**Purpose:** Secure password storage
**Implementation:** Used for hashing passwords during registration and login
**Location:** `routes/api/auth.js`, `server.js`

**How it works:**
- Uses bcrypt with salt rounds (10 rounds)
- Generates random salt for each password
- One-way hashing
- Includes time cost

**Code snippet:**
```javascript
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(password, salt);
```

**Advantages:**
- Salted hashing reduces rainbow table risk
- Time cost slows brute-force attempts
- Resistance to GPU-based cracking

---

### 1.2 JWT (JSON Web Token) Algorithm
**Purpose:** Stateless authentication
**Implementation:** HS256 (HMAC-SHA256) for signing and verification
**Location:** `middleware/auth.js`, `routes/api/auth.js`

**How it works:**
- Header, payload, and signature
- Secret key signs tokens
- Includes user ID and role
- Clients store and present tokens with requests

**Code snippet:**
```javascript
jwt.sign(payload, secretKey, { expiresIn: '24h' });
jwt.verify(token, secretKey);
```

**Advantages:**
- Stateless
- Self-contained
- Low server overhead

---

### 1.3 ReentrancyGuard Algorithm
**Purpose:** Prevent reentrancy attacks
**Implementation:** OpenZeppelin guard for Solidity
**Location:** `CrowdFunding.sol`

**How it works:**
- Mutex for critical paths
- Blocks calls until current execution finishes
- Applies `nonReentrant` to withdraws and refunds

**Code snippet:**
```solidity
function withdraw(uint256 _id) external nonReentrant campaignExists(_id) {
    // Critical operations here
}
```

**Advantages:**
- Prevents reentry during transfers
- Protects state updates

---

## 2. Smart Contract Algorithms

### 2.1 Campaign Creation Algorithm
**Purpose:** Initialize campaigns
**Implementation:** Incremental ID with validation
**Location:** `CrowdFunding.sol`, `utils/blockchain.js`

**How it works:**
1. Validate goal > 0
2. Validate deadline > current timestamp
3. Increment `campaignCount`
4. Create struct with metadata
5. Emit event

**Algorithm steps:**
```
1. Validate goal is greater than zero
2. Verify deadline is in the future
3. Prevent overflow by checking deadline not zero
4. Increment campaign counter atomically
5. Store campaign structure in mapping
6. Emit campaign creation event
7. Return new campaign ID
```

---

### 2.2 Donation Processing Algorithm
**Purpose:** Process donations with validation
**Implementation:** Checks-Effects-Interactions
**Location:** `CrowdFunding.sol`, `client/src/utils/web3.js`

**How it works:**
1. Validate existence and deadline
2. Check `msg.value > 0`
3. Read, compute `newPledged`, write
4. Update contribution mapping
5. Emit event

**Algorithm steps:**
```
1. Check campaign exists (modifier)
2. Verify current time <= deadline
3. Ensure donation amount > 0
4. Apply reentrancy guard
5. Load current pledged amount
6. Calculate newPledged = pledged + msg.value
7. Update pledged state
8. Increment donor's contribution mapping
9. Emit donation event
```

**Gas optimization:**
- Caches `SLOAD` by computing `newPledged` once

---

### 2.3 Withdrawal Algorithm
**Purpose:** Allow creator to withdraw only if goal reached and deadline passed
**Implementation:** Multi-condition validation with atomic transfer
**Location:** `CrowdFunding.sol`

**How it works:**
1. Check sender is creator
2. Check not withdrawn
3. Check `pledged >= goal`
4. Check `deadline < now`
5. Set withdrawn
6. Transfer with `CALL`
7. Revert on failure

**Algorithm steps:**
```
1. Verify msg.sender is campaign creator
2. Check withdrawn flag is false
3. Ensure pledged >= goal
4. Verify current time > deadline
5. Apply reentrancy protection
6. Set withdrawn = true (checks complete)
7. Store pledged amount
8. Perform low-level transfer to creator
9. If transfer fails, revert state change
10. Emit withdrawal event
```

**Safety:**
- State change before transfer (Checks-Effects-Interactions)
- ReentrancyGuard
- Manual revert if transfer fails

---

### 2.4 Refund Algorithm
**Purpose:** Return funds when goal not met after deadline
**Implementation:** ReentrancyGuard and Checks-Effects-Interactions
**Location:** `CrowdFunding.sol`, `client/src/components/campaigns/RefundsList.js`

**How it works:**
1. Check `deadline < now`
2. Check `pledged < goal`
3. Read contributor’s amount
4. Check `contribution > 0`
5. Zero contribution
6. Decrement pledged
7. Transfer
8. Revert state on failure

**Algorithm steps:**
```
1. Verify deadline has passed
2. Ensure pledged < goal (campaign failed)
3. Check contribution amount > 0
4. Apply reentrancy guard
5. Store contribution amount
6. Zero out contribution mapping (before transfer)
7. Decrement total pledged amount
8. Transfer funds to donor
9. If transfer fails, restore state
10. Emit refund event
```

**Refund eligibility:**
- Expired, goal not met, contribution > 0

---

## 3. Data Validation & Processing Algorithms

### 3.1 Input Validation Algorithm
**Purpose:** Sanitize and validate input
**Implementation:** `express-validator`
**Location:** `routes/api/auth.js`, `routes/api/campaigns.js`

**How it works:**
- Schema validation
- Type checks
- Bounds
- Sanitization
- Structured errors

**Validations:**
- Email
- Non-empty required fields
- Lengths
- Numerics
- SQL injection defenses

---

### 3.2 Campaign Status Determination Algorithm
**Purpose:** Derive status from conditions
**Implementation:** Multi-condition logic
**Location:** `client/src/components/campaigns/RefundsList.js`, `utils/blockchainSync.js`

**How it works:**
```
Status Logic:
- Pending: Awaiting admin approval
- Approved: Admin approved, not on-chain yet
- Active: On-chain, running
- Completed: Deadline passed, goal met
- Failed: Deadline passed, goal unmet
- Rejected: Admin rejected
```

**Algorithm:**
```
if (status === 'pending') return "Pending Approval"
if (status === 'rejected') return "Rejected"
if (status === 'approved' && !blockchainId) return "Approved"
if (status === 'active' && expired && raised >= goal) return "Completed"
if (status === 'active' && expired && raised < goal) return "Failed"
if (status === 'active') return "Active"
```

---

### 3.3 Progress Calculation Algorithm
**Purpose:** Compute funding progress
**Implementation:** Percentage capped at 100%
**Location:** `client/src/utils/campaignFormatter.js`, `CrowdFunding.sol`

**How it works:**
```
Progress = (Raised Amount / Goal Amount) × 100
Capped at 100% even if raised > goal
```

**Algorithm:**
```javascript
const progress = goal > 0 
  ? Math.min((raised / goal) * 100, 100).toFixed(2)
  : 0;
```

---

## 4. Blockchain Integration Algorithms

### 4.1 Wei to Ether Conversion Algorithm
**Purpose:** Convert between Wei and Ether
**Implementation:** Web3
**Location:** `client/src/utils/web3.js`, `utils/blockchain.js`

**How it works:**
```
1 ETH = 10^18 Wei
Conversion: amount × 10^18
Reverse: amount / 10^18
```

**Algorithm:**
```javascript
// Ether to Wei
const amountInWei = web3.utils.toWei(amountEth, 'ether');

// Wei to Ether
const amountInEth = web3.utils.fromWei(amountWei, 'ether');
```

---

### 4.2 Transaction Signature Verification
**Purpose:** Verify sender and integrity
**Implementation:** ECDSA with secp256k1
**Location:** Ethereum

**How it works:**
- Sign with private key
- Broadcast signed txn
- ECDSA on secp256k1
- Recover sender
- Execute if valid

---

### 4.3 Gas Estimation Algorithm
**Purpose:** Estimate gas for txn
**Implementation:** Web3 `estimateGas`
**Location:** `client/src/utils/web3.js`

**How it works:**
- Execute locally with current state
- Return estimated gas
- Add safety margin

---

## 5. Real-time Communication Algorithm

### 5.1 WebSocket Notification Algorithm
**Purpose:** Publish real-time events
**Implementation:** Node.js WebSocket
**Location:** `utils/websocket.js`

**How it works:**
- One server instance
- Broadcast to connected clients
- Filter by role/context

**Algorithm:**
```
1. Client establishes WebSocket connection
2. Server stores connection in clients array
3. On campaign update, iterate clients
4. Send JSON notification
5. Client updates UI
6. Remove on disconnect
```

---

## 6. Database Query Optimization Algorithms

### 6.1 Indexed Primary Key Lookup
**Purpose:** Fast lookups
**Implementation:** SQLite AUTOINCREMENT and indexes
**Location:** `server.js`, `routes/api/*`

**How it works:**
- B-tree on PRIMARY KEY
- Auto-increment

**Complexity:**
- Search: O(log n)

---

## Summary of Algorithm Categories

| Algorithm Category | Algorithms Used | Complexity |
|-------------------|----------------|------------|
| **Security** | Bcrypt, JWT, ReentrancyGuard | Varies |
| **Smart Contracts** | Campaign Creation, Donation, Withdrawal, Refund | O(1) |
| **Validation** | Input validation, Status determination | O(n) |
| **Blockchain** | Wei/Ether conversion, Signature verification, Gas estimation | O(1) |
| **Real-time** | WebSocket broadcasting | O(n) |
| **Database** | Indexed queries, B-tree lookups | O(log n) |

**Total algorithms:** 15+ across security, blockchain, validation, and real-time.

