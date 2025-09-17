const { Web3 } = require('web3');
const HDWalletProvider = require('@truffle/hdwallet-provider');
require('dotenv').config({ path: './.env' });
const { calculateDuration, validateTimestampsMatch } = require('./timestampSync');

// Helper function to safely convert values and avoid BigInt serialization issues
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

// Contract configuration - Updated with the correct ABI from the deployed contract
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const INFURA_URL = process.env.INFURA_URL;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY; // Add this to .env

// Updated ABI to match the actual deployed contract
const CONTRACT_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_goal",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "_duration",
        "type": "uint256"
      }
    ],
    "name": "createCampaign",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_campaignId",
        "type": "uint256"
      }
    ],
    "name": "contribute",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_campaignId",
        "type": "uint256"
      }
    ],
    "name": "withdrawFunds",
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
        "internalType": "uint256",
        "name": "goal",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "amountRaised",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isCompleted",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isWithdrawn",
        "type": "bool"
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
        "name": "campaignId",
        "type": "uint256"
      },
      {
        "indexed": false,
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
  }
];

let web3;
let contract;
let provider;

// Initialize Web3 with admin wallet
const initBlockchain = () => {
  try {
    // Skip initialization in test mode
    if (process.env.TEST_MODE === 'true') {
      console.log('🧪 TEST MODE: Skipping real blockchain initialization');
      return { web3: null, contract: null, provider: null };
    }
    
    // Check if already initialized
    if (web3 && contract && provider) {
      return { web3, contract, provider };
    }
    
    // Validate environment variables
    if (!INFURA_URL || !ADMIN_PRIVATE_KEY || !CONTRACT_ADDRESS) {
      throw new Error('Missing required environment variables: INFURA_URL, ADMIN_PRIVATE_KEY, or CONTRACT_ADDRESS');
    }
    
    // Validate private key format
    if (!ADMIN_PRIVATE_KEY.startsWith('0x') || ADMIN_PRIVATE_KEY.length !== 66) {
      throw new Error('Invalid private key format. Private key must start with 0x and be 64 characters long.');
    }
    
    // Use HDWalletProvider for server-side transactions
    provider = new HDWalletProvider({
      privateKeys: [ADMIN_PRIVATE_KEY],
      providerOrUrl: INFURA_URL
    });
    
    web3 = new Web3(provider);
    contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
    
    console.log('✅ Blockchain initialized successfully');
    return { web3, contract, provider };
  } catch (error) {
    console.error('❌ Error initializing blockchain:', error);
    // Return null objects to prevent further errors
    return { web3: null, contract: null, provider: null };
  }
};

// Create campaign on blockchain (called by admin when approving)
const createCampaignOnBlockchain = async (goal, duration, creatorAddress, dbDeadline) => {
  try {
    console.log('🚀 Starting blockchain campaign creation process...');
    
    // Initialize blockchain if not already done
    const initResult = initBlockchain();
    const { web3: initializedWeb3, contract: initializedContract, provider: initializedProvider } = initResult;
    
    // Check if initialization failed
    if (!initializedWeb3 || !initializedContract) {
      if (process.env.TEST_MODE === 'true') {
        console.log('🧪 TEST MODE: Simulating blockchain campaign creation...');
        console.log(`- Goal: ${goal} ETH`);
        console.log(`- Duration: ${duration} seconds`);
        console.log(`- Creator: ${creatorAddress}`);
        
        // Simulate blockchain transaction
        const mockResult = {
          transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
          campaignId: Math.floor(Math.random() * 1000) + 1, // Random campaign ID
          gasUsed: Math.floor(Math.random() * 100000) + 50000
        };
        
        console.log('✅ TEST MODE: Simulated blockchain campaign created!');
        console.log(`- Mock Transaction Hash: ${mockResult.transactionHash}`);
        console.log(`- Mock Campaign ID: ${mockResult.campaignId}`);
        console.log(`- Mock Gas Used: ${mockResult.gasUsed}`);
        
        return mockResult;
      }
      
      throw new Error('Blockchain initialization failed. Please check your network connection and configuration.');
    }
    
    web3 = initializedWeb3;
    contract = initializedContract;
    provider = initializedProvider;
    
    console.log('🚀 Creating real campaign on Sepolia testnet...');
    console.log(`- Goal: ${goal} ETH (Sepolia testnet)`);
    console.log(`- Duration parameter: ${duration} seconds`);
    console.log(`- Creator: ${creatorAddress}`);
    
    const goalInWei = web3.utils.toWei(goal.toString(), 'ether');
    
    // FIXED: Handle duration as exact seconds value to prevent rounding errors
    let durationInSeconds = 0;
    if (duration && !isNaN(duration) && duration > 0) {
      // Duration is already in seconds, use it directly
      durationInSeconds = Math.floor(duration);
    } else {
      console.log('⚠️ Invalid duration provided, using default 7 days');
      durationInSeconds = 7 * 24 * 60 * 60; // Default to 7 days
    }
    
    // Verify the calculated duration is positive and reasonable
    console.log(`- Current timestamp: ${Math.floor(Date.now() / 1000)}`); 
    console.log(`- Expected deadline timestamp: ${Math.floor(Date.now() / 1000) + durationInSeconds}`);
    
    // Ensure minimum duration of 1 day (86400 seconds) for safety
    if (durationInSeconds < 86400) {
      console.log('⚠️ Duration too short, setting minimum 1 day duration');
      durationInSeconds = 86400; // Minimum 1 day
    }
    
    // Get admin account with better error handling
    let accounts;
    try {
      accounts = await web3.eth.getAccounts();
    } catch (accountError) {
      console.error('Error getting accounts:', accountError.message);
      throw new Error('Failed to get admin account. Please check your Infura connection and private key.');
    }
    
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found. Please check your private key configuration.');
    }
    
    const adminAccount = accounts[0];
    
    console.log(`- Admin Account: ${adminAccount}`);
    console.log(`- Network: Sepolia Testnet (Chain ID: 11155111)`);
    console.log(`- Duration in seconds: ${durationInSeconds}`);
    
    // Log network status
    try {
      const gasPrice = await web3.eth.getGasPrice();
      console.log(`- Current Gas Price: ${gasPrice} wei`);
      
      const blockNumber = await web3.eth.getBlockNumber();
      console.log(`- Current Block Number: ${blockNumber}`);
    } catch (networkError) {
      console.warn('⚠️ Could not get network status:', networkError.message);
    }
    
    // Improved gas estimation with better error handling
    let gasEstimate;
    try {
      console.log('🔄 Estimating gas for createCampaign transaction...');
      gasEstimate = await contract.methods
        .createCampaign(goalInWei, durationInSeconds)
        .estimateGas({ from: adminAccount });
      
      console.log(`- Gas Estimate: ${gasEstimate} (Sepolia testnet)`);
    } catch (gasError) {
      console.warn('⚠️ Gas estimation failed, using default with higher buffer:', gasError.message);
      // Use a conservative default with higher buffer for Sepolia
      gasEstimate = 300000;
    }
    
    // Get current gas price with error handling
    let gasPrice;
    try {
      gasPrice = await web3.eth.getGasPrice();
      console.log(`- Current Gas Price: ${gasPrice.toString()} wei`);
    } catch (gasPriceError) {
      console.warn('⚠️ Could not get gas price, using default:', gasPriceError.message);
      // Use a reasonable default gas price for Sepolia (in wei)
      gasPrice = '1000000000'; // 1 Gwei
    }
    
    // Convert gas price to number for calculations
    const gasPriceNumber = parseInt(gasPrice.toString());
    
    // Use a more conservative gas price approach
    // Just add a small buffer to the current network price
    const gasPriceWithBuffer = Math.floor(gasPriceNumber * 1.2); // Only 20% buffer
    
    console.log(`- Gas Price with 20% Buffer: ${gasPriceWithBuffer} wei (${parseFloat(web3.utils.fromWei(gasPriceWithBuffer.toString(), 'gwei')).toFixed(3)} Gwei)`);
    
    // Safely convert gas estimate to avoid BigInt issues
    const gasEstimateNumber = safeConvertToNumber(gasEstimate);
    // Use standard buffer
    const gasWithBuffer = Math.floor(gasEstimateNumber * 1.25); // 25% buffer
    
    console.log(`- Gas Estimate: ${gasEstimateNumber}`);
    console.log(`- Gas with 25% Buffer: ${gasWithBuffer}`);
    
    // Log transaction details before sending
    console.log('🔄 Sending createCampaign transaction...');
    console.log('- Method: createCampaign');
    console.log('- Parameters:', { goalInWei, durationInSeconds });
    console.log('- Transaction options:', { 
      from: adminAccount,
      gas: gasWithBuffer.toString(),
      gasPrice: gasPriceWithBuffer.toString()
    });
    
    // Add a timeout wrapper for the transaction
    const sendTransaction = () => {
      return contract.methods
        .createCampaign(goalInWei, durationInSeconds)
        .send({ 
          from: adminAccount,
          gas: gasWithBuffer.toString(), // Convert to string to avoid BigInt mixing
          gasPrice: gasPriceWithBuffer.toString() // Convert to string to avoid BigInt mixing
        });
    };
    
    // Wrap the transaction in a promise with timeout
    const transactionWithTimeout = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Transaction timeout after 4 minutes - this does not mean the transaction failed, it may still be processing on the blockchain. Gas price used: ${gasPriceWithBuffer} wei (${parseFloat(web3.utils.fromWei(gasPriceWithBuffer.toString(), 'gwei')).toFixed(3)} Gwei)`));
      }, 240000); // 4 minute timeout for the transaction itself
      
      sendTransaction()
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
    
    // Send transaction with improved parameters
    const result = await transactionWithTimeout;
    
    console.log('✅ Campaign created on Sepolia blockchain!');
    console.log(`- Transaction Hash: ${result.transactionHash}`);
    console.log(`- View on Explorer: https://sepolia.etherscan.io/tx/${result.transactionHash}`);
    
    // Extract campaign ID from events properly
    let campaignId = null;
    console.log('Events in transaction result:', result.events);
    
    // Try multiple ways to get the campaign ID
    if (result.events && result.events.CampaignCreated) {
      campaignId = result.events.CampaignCreated.returnValues.campaignId;
      console.log(`- Blockchain Campaign ID from event: ${campaignId}`);
      
      // Log the deadline from the event for verification
      const deadlineFromEvent = result.events.CampaignCreated.returnValues.deadline;
      console.log(`- Blockchain deadline timestamp: ${deadlineFromEvent}`);
      // Safely convert BigInt to Number for date calculation
      const deadlineNumber = typeof deadlineFromEvent === 'bigint' 
        ? Number(deadlineFromEvent) 
        : parseInt(deadlineFromEvent);
      console.log(`- Blockchain deadline date: ${new Date(deadlineNumber * 1000).toISOString()}`);
      
      // Validate timestamp synchronization
      if (dbDeadline) {
        const timestampsMatch = validateTimestampsMatch(dbDeadline, deadlineNumber);
        console.log(`- Timestamp synchronization: ${timestampsMatch ? '✅ VALID' : '❌ INVALID'}`);
        if (!timestampsMatch) {
          console.warn('⚠️ WARNING: Database and blockchain timestamps do not match!');
        }
      }
    } else if (result.events && Object.keys(result.events).length > 0) {
      // Try to find the CampaignCreated event in any of the events
      console.log('⚠️ CampaignCreated event not found in expected location, checking all events...');
      
      for (const eventName in result.events) {
        const event = result.events[eventName];
        console.log(`- Checking event: ${eventName}`, event);
        if (eventName === 'CampaignCreated' && event.returnValues && event.returnValues.campaignId) {
          campaignId = event.returnValues.campaignId;
          console.log(`- Blockchain Campaign ID from ${eventName} event: ${campaignId}`);
          break;
        }
      }
      
      if (!campaignId) {
        console.log('⚠️ CampaignCreated event not found in transaction events');
      }
    } else {
      console.log('⚠️ No events found in transaction result');
    }
    
    // If we still don't have a campaign ID, try to get it from the contract
    if (!campaignId) {
      console.log('⚠️ Campaign ID not found in events, trying to get from contract...');
      
      try {
        // Try to get the campaign count if available
        if (contract.methods.campaignCount) {
          const count = await contract.methods.campaignCount().call();
          campaignId = count.toString();
          console.log(`- Determined campaign ID from campaignCount: ${campaignId}`);
        } else {
          console.log('⚠️ Contract does not have campaignCount method');
        }
      } catch (counterError) {
        console.log('⚠️ Could not get campaign count from contract:', counterError.message);
      }
    }
    
    // If we still don't have a campaign ID, use a fallback
    if (!campaignId) {
      console.log('⚠️ Using fallback campaign ID');
      campaignId = "1"; // Use a default ID as last resort
      console.log(`- Using fallback campaign ID: ${campaignId}`);
    }
    
    // Safely convert gasUsed to avoid BigInt issues
    const gasUsed = safeConvertValue(result.gasUsed);
    
    // Stop the provider to prevent memory leaks
    if (provider && provider.engine) {
      provider.engine.stop();
    }
    
    console.log('✅ Blockchain campaign creation process completed successfully');
    return {
      transactionHash: result.transactionHash,
      campaignId: campaignId,
      gasUsed: gasUsed
    };
    
  } catch (error) {
    console.error('❌ Error creating campaign on blockchain:', error);
    
    // Log additional debugging information
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // Enhanced error handling with specific cases
    if (error.message.includes('nonce')) {
      throw new Error('Transaction nonce issue. There may be a pending transaction. Please wait a few minutes and try again.');
    } else if (error.message.includes('replacement')) {
      throw new Error('Transaction replacement error. There may be a pending transaction with the same nonce. Please wait for it to complete or cancel it.');
    } else if (error.message.includes('gas')) {
      throw new Error('Gas estimation or transaction failed. This may be due to network congestion on Sepolia. Please try again in a few minutes.');
    } else if (error.message.includes('infura')) {
      throw new Error('Network connection error. Please check your Infura configuration or try again later.');
    } else if (error.message.includes('Invalid JSON RPC response')) {
      throw new Error('Network connection error. The blockchain node may be temporarily unavailable. Please try again later.');
    } else if (error.message.includes('header not found')) {
      throw new Error('Network synchronization issue. Please try again in a few seconds.');
    } else if (error.message.includes('ECONNRESET')) {
      throw new Error('Connection reset by peer. Please check your network connection and try again.');
    } else if (error.message.includes('ETIMEDOUT')) {
      throw new Error('Connection timed out. Please check your network connection and try again.');
    } else if (error.message.includes('underlying network changed')) {
      throw new Error('Network connection changed. Please check your internet connection and try again.');
    } else if (error.message.includes('Returned error:')) {
      // Handle specific RPC errors
      const rpcError = error.message.replace('Returned error:', '').trim();
      throw new Error(`Blockchain RPC error: ${rpcError}`);
    }
    
    throw error;
  } finally {
    // Clean up provider to prevent memory leaks
    if (provider && provider.engine) {
      try {
        provider.engine.stop();
      } catch (cleanupError) {
        console.warn('Warning: Error cleaning up provider:', cleanupError.message);
      }
    }
  }
};

// Get campaign details from blockchain
const getCampaignFromBlockchain = async (campaignId) => {
  try {
    // Initialize blockchain if not already done
    if (!web3 || !contract) {
      const initResult = initBlockchain();
      if (!initResult.web3 || !initResult.contract) {
        throw new Error('Blockchain not initialized');
      }
      web3 = initResult.web3;
      contract = initResult.contract;
    }
    
    const campaign = await contract.methods.campaigns(campaignId).call();
    
    // Safely convert all values to avoid BigInt serialization issues
    const goal = safeConvertValue(campaign.goal);
    const amountRaised = safeConvertValue(campaign.amountRaised);
    const deadline = safeConvertValue(campaign.deadline);
    
    return {
      creator: campaign.creator,
      goal: typeof goal === 'string' ? web3.utils.fromWei(goal, 'ether') : web3.utils.fromWei(goal.toString(), 'ether'),
      // Safely convert BigInt to Number for date calculation
      deadline: typeof deadline === 'string' 
        ? new Date(Number(deadline) * 1000) 
        : new Date((typeof deadline === 'bigint' ? Number(deadline) : deadline) * 1000),
      amountRaised: typeof amountRaised === 'string' ? web3.utils.fromWei(amountRaised, 'ether') : web3.utils.fromWei(amountRaised.toString(), 'ether'),
      isCompleted: campaign.isCompleted,
      isWithdrawn: campaign.isWithdrawn
    };
  } catch (error) {
    console.error('❌ Error getting campaign from blockchain:', error);
    throw error;
  }
};

// Check if campaign goal is reached and deadline passed
const canWithdrawFunds = async (campaignId) => {
  try {
    // Initialize blockchain if not already done
    if (!web3 || !contract) {
      const initResult = initBlockchain();
      if (!initResult.web3 || !initResult.contract) {
        throw new Error('Blockchain not initialized');
      }
      web3 = initResult.web3;
      contract = initResult.contract;
    }
    
    const campaign = await getCampaignFromBlockchain(campaignId);
    const now = new Date();
    
    // Safely convert values for comparison
    const amountRaised = safeConvertToNumber(campaign.amountRaised);
    const goal = safeConvertToNumber(campaign.goal);
    
    return {
      goalReached: amountRaised >= goal,
      deadlinePassed: now >= campaign.deadline,
      isWithdrawn: campaign.isWithdrawn,
      canWithdraw: (amountRaised >= goal) && !campaign.isWithdrawn
    };
  } catch (error) {
    console.error('❌ Error checking withdrawal conditions:', error);
    throw error;
  }
};

module.exports = {
  initBlockchain,
  createCampaignOnBlockchain,
  getCampaignFromBlockchain,
  canWithdrawFunds,
  web3,
  contract
};