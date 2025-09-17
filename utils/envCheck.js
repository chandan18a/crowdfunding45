/**
 * Utility to check environment variables for blockchain configuration
 */

const checkEnvVariables = () => {
  const requiredVars = [
    'INFURA_URL',
    'CONTRACT_ADDRESS',
    'ADMIN_PRIVATE_KEY'
  ];
  
  const missingVars = [];
  
  for (const envVar of requiredVars) {
    if (!process.env[envVar]) {
      missingVars.push(envVar);
    }
  }
  
  if (missingVars.length > 0) {
    console.warn('⚠️ Missing environment variables:', missingVars);
    console.warn('Please check your .env file and ensure all required variables are set.');
    return false;
  }
  
  // Validate private key format
  if (process.env.ADMIN_PRIVATE_KEY) {
    if (!process.env.ADMIN_PRIVATE_KEY.startsWith('0x') || process.env.ADMIN_PRIVATE_KEY.length !== 66) {
      console.warn('⚠️ Invalid private key format. Private key must start with 0x and be 64 characters long.');
      return false;
    }
  }
  
  // Validate Infura URL
  if (process.env.INFURA_URL) {
    try {
      new URL(process.env.INFURA_URL);
    } catch (error) {
      console.warn('⚠️ Invalid Infura URL format:', process.env.INFURA_URL);
      return false;
    }
  }
  
  console.log('✅ All environment variables are properly configured');
  return true;
};

module.exports = {
  checkEnvVariables
};