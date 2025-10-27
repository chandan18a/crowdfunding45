const { Web3 } = require('web3');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Initialize Web3 with Infura provider
const infuraUrl = process.env.INFURA_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID';
const web3 = new Web3(infuraUrl);

// Contract ABI and address
const contractABI = [
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "_title",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "_description",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "_goal",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_deadline",
        "type": "uint256"
      }
    ],
    "name": "createCampaign",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_id",
        "type": "uint256"
      }
    ],
    "name": "donateToCampaign",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_id",
        "type": "uint256"
      }
    ],
    "name": "withdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_id",
        "type": "uint256"
      }
    ],
    "name": "refund",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "campaigns",
    "outputs": [
      {
        "internalType": "address payable",
        "name": "creator",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "title",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "description",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "goal",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "pledged",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "withdrawn",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "campaignCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "goal",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "name": "CampaignCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "donor",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "DonationReceived",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Withdraw",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "id",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "donor",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Refund",
    "type": "event"
  }
];

const contractAddress = process.env.CONTRACT_ADDRESS || "0x9141bf2d3ab4e5bd44d89c83f3745902a7648fd7";
const contract = new web3.eth.Contract(contractABI, contractAddress);

// Database connection
const db = new sqlite3.Database('./crowdfunding.db');

// Function to sync campaign statuses from blockchain
async function syncCampaignStatuses() {
  try {
    console.log('🔄 Syncing campaign statuses from blockchain...');
    
    // Get all campaigns with blockchain_id from database
    const campaigns = await new Promise((resolve, reject) => {
      db.all(
        'SELECT id, blockchain_campaign_id FROM campaigns WHERE blockchain_campaign_id IS NOT NULL AND blockchain_campaign_id != "" AND blockchain_campaign_id != "0"',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });

    console.log(`Found ${campaigns.length} blockchain campaigns to sync`);

    for (const campaign of campaigns) {
      try {
        // Get campaign details from blockchain
        const blockchainCampaign = await contract.methods.campaigns(campaign.blockchain_campaign_id).call();
        
        if (blockchainCampaign.exists) {
          // Safely convert BigInt values to avoid mixing BigInt and other types
          const goalWei = typeof blockchainCampaign.goal === 'bigint' ? blockchainCampaign.goal.toString() : blockchainCampaign.goal;
          const pledgedWei = typeof blockchainCampaign.pledged === 'bigint' ? blockchainCampaign.pledged.toString() : blockchainCampaign.pledged;
          const deadlineTimestamp = typeof blockchainCampaign.deadline === 'bigint' ? Number(blockchainCampaign.deadline) : Number(blockchainCampaign.deadline);
          
          // Convert values from wei to ETH
               SET blockchain_goal = ?, current_amount = ?, deadline = ?, status = ?, is_withdrawn = ? 
               WHERE id = ?`,
              [goal, pledged, deadline.toISOString(), status, blockchainCampaign.withdrawn ? 1 : 0, campaign.id],
              function(err) {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              }
            );
          });
          
          console.log(`✅ Synced Campaign #${campaign.id} (Blockchain ID: ${campaign.blockchain_campaign_id}) | Pledged: ${pledged} ETH | Status: ${status}`);
        }
      } catch (err) {
        console.error(`❌ Error syncing campaign #${campaign.id}:`, err.message);
      }
    }
    
    console.log('✅ Campaign sync completed');
  } catch (err) {
    console.error('❌ Campaign sync error:', err);
  }
}

// Run sync every minute
setInterval(syncCampaignStatuses, 60 * 1000);

// Export for manual triggering
module.exports = { syncCampaignStatuses };