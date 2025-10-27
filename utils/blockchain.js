const { Web3 } = require('web3');
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

// Helper function to safely convert BigInt values
const safeConvertValue = (value) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'string' && value.match(/^\d+$/)) {
    return value;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  return value ? value.toString() : '0';
};

// Helper function to safely convert to number
const safeConvertToNumber = (value) => {
  if (typeof value === 'string') {
    return parseFloat(value) || 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number') {
    return value;
  }
  return value || 0;
};

// Create campaign on blockchain with proper future date handling
async function createCampaign(title, description, goalInEth, deadline) {
  try {
    console.log('Creating campaign on blockchain:', { title, description, goalInEth, deadline });
    
    // Convert ETH to Wei
    const goalInWei = web3.utils.toWei(goalInEth.toString(), 'ether');
    
    // Enhanced deadline handling for future dates
    let deadlineTimestamp;
    if (typeof deadline === 'string') {
      // Parse date string and convert to UNIX timestamp (seconds)
      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        throw new Error('Invalid deadline format');
      }
      deadlineTimestamp = Math.floor(deadlineDate.getTime() / 1000);
    } else if (typeof deadline === 'number') {
      // Already a timestamp
      deadlineTimestamp = deadline;
    } else {
      throw new Error('Invalid deadline type');
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Validate deadline is in the future
    if (deadlineTimestamp <= currentTime) {
      throw new Error(`Invalid deadline - must be in the future. Current time: ${new Date(currentTime * 1000).toISOString()}, Deadline: ${new Date(deadlineTimestamp * 1000).toISOString()}`);
    }
    
    // Additional validation: deadline should not be more than 10 years in the future
    const maxDeadline = currentTime + (10 * 365 * 24 * 60 * 60); // 10 years
    if (deadlineTimestamp > maxDeadline) {
      throw new Error('Deadline too far in the future (max 10 years)');
    }
    
    console.log('Campaign creation details:', {
      title,
      description,
      goalInEth,
      goalInWei,
      deadline: new Date(deadlineTimestamp * 1000).toISOString(),
      deadlineTimestamp,
      currentTime: new Date(currentTime * 1000).toISOString()
    });

    // Get admin account (you'll need to set this up with a private key)
    const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
    if (!adminPrivateKey) {
      throw new Error('Admin private key not configured');
    }
    
    const adminAccount = web3.eth.accounts.privateKeyToAccount(adminPrivateKey);
    web3.eth.accounts.wallet.add(adminAccount);
    
    // Prepare transaction parameters
    const txParams = {
      from: adminAccount.address,
      gas: 500000, // Fixed gas limit
      gasPrice: web3.utils.toWei('20', 'gwei') // 20 gwei gas price
    };
    
    console.log('Transaction parameters:', txParams);
    
    // Send transaction
    const result = await contract.methods
      .createCampaign(title, description, goalInWei, deadlineTimestamp)
      .send(txParams);
    
    console.log('Transaction result:', result);
    
    // Extract campaign ID from events
    let campaignId = null;
    if (result.events && result.events.CampaignCreated) {
      campaignId = safeConvertValue(result.events.CampaignCreated.returnValues.id);
    } else if (result.events && Array.isArray(result.events)) {
      const campaignCreatedEvent = result.events.find(event => event.event === 'CampaignCreated');
      if (campaignCreatedEvent && campaignCreatedEvent.returnValues) {
        campaignId = safeConvertValue(campaignCreatedEvent.returnValues.id);
      }
    }
    
    // Fallback: get campaign count
    if (!campaignId) {
      const count = await contract.methods.campaignCount().call();
      campaignId = safeConvertValue(count);
    }
    
    console.log('Created campaign with ID:', campaignId);
    
    return {
      campaignId: campaignId,
      transactionHash: result.transactionHash
    };
    
  } catch (error) {
    console.error('Error creating campaign on blockchain:', error);
    throw error;
  }
}

// Get campaign details from blockchain
async function getCampaignFromBlockchain(campaignId) {
  try {
    const campaign = await contract.methods.campaigns(campaignId).call();
    
    // Safely convert all values to avoid BigInt serialization issues
    const goal = safeConvertValue(campaign.goal);
    const pledged = safeConvertValue(campaign.pledged);
    const deadline = safeConvertValue(campaign.deadline);
    
    return {
      creator: campaign.creator,
      title: campaign.title,
      description: campaign.description,
      goal: web3.utils.fromWei(goal, 'ether'),
      pledged: web3.utils.fromWei(pledged, 'ether'),
      deadline: new Date(Number(deadline) * 1000),
      exists: campaign.exists,
      withdrawn: campaign.withdrawn,
      blockchain_campaign_id: campaignId
    };
  } catch (error) {
    console.error('Error getting campaign from blockchain:', error);
    throw error;
  }
}

// Check if funds can be withdrawn from a campaign
async function canWithdrawFunds(campaignId) {
  try {
    const campaign = await getCampaignFromBlockchain(campaignId);
    const now = new Date();
    
    // Parse values ensuring they're numbers
    const amountRaised = typeof campaign.pledged === 'string' ? 
      parseFloat(campaign.pledged) : campaign.pledged;
    const goal = typeof campaign.goal === 'string' ? 
      parseFloat(campaign.goal) : campaign.goal;
    
    // For completed campaigns (goal reached), allow withdrawal regardless of deadline
    // For incomplete campaigns, require deadline to pass
    const canWithdraw = (amountRaised >= goal) && !campaign.withdrawn;
    
    return {
      canWithdraw,
      goalReached: amountRaised >= goal,
      deadlinePassed: now >= campaign.deadline,
      isWithdrawn: campaign.withdrawn,
      amountRaised,
      goal
    };
  } catch (error) {
    console.error('Error checking withdrawal eligibility:', error);
    throw error;
  }
}

// Donate to campaign
async function donateToCampaign(campaignId, amountInEth, fromAddress) {
  try {
    console.log('Donating to campaign:', { campaignId, amountInEth, fromAddress });
    
    const amountInWei = web3.utils.toWei(amountInEth.toString(), 'ether');
    
    // Get account from private key (you'll need to implement this)
    const donorPrivateKey = process.env.DONOR_PRIVATE_KEY; // This should be dynamic
    if (!donorPrivateKey) {
      throw new Error('Donor private key not configured');
    }
    
    const donorAccount = web3.eth.accounts.privateKeyToAccount(donorPrivateKey);
    web3.eth.accounts.wallet.add(donorAccount);
    
    const txParams = {
      from: donorAccount.address,
      value: amountInWei,
      gas: 200000,
      gasPrice: web3.utils.toWei('20', 'gwei')
    };
    
    const result = await contract.methods
      .donateToCampaign(campaignId)
      .send(txParams);
    
    return {
      transactionHash: result.transactionHash
    };
    
  } catch (error) {
    console.error('Error donating to campaign:', error);
    throw error;
  }
}

module.exports = {
  createCampaign,
  getCampaignFromBlockchain,
  canWithdrawFunds,
  donateToCampaign,
  contract,
  web3
};