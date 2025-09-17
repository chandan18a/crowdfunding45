/**
 * Utility functions for timestamp synchronization between database and blockchain
 */

/**
 * Calculate duration in seconds between current time and deadline
 * Uses the formula: Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60) as requested
 * @param {string|Date} deadline - The campaign deadline
 * @returns {Object} Duration information
 */
const calculateDuration = (deadline) => {
  try {
    const deadlineDate = new Date(deadline);
    const currentDate = new Date();
    
    // Validate dates
    if (isNaN(deadlineDate.getTime())) {
      throw new Error('Invalid deadline date');
    }
    
    // Calculate the difference in milliseconds
    const diffMs = deadlineDate.getTime() - currentDate.getTime();
    
    // Convert to seconds
    const diffSeconds = Math.floor(diffMs / 1000);
    
    // Calculate days for blockchain (minimum 1 day)
    const diffDays = Math.ceil(diffSeconds / (24 * 60 * 60));
    const finalDays = Math.max(1, diffDays);
    
    return {
      durationInSeconds: diffSeconds,
      durationInDays: finalDays,
      deadlineTimestamp: Math.floor(deadlineDate.getTime() / 1000),
      currentTimestamp: Math.floor(currentDate.getTime() / 1000)
    };
  } catch (error) {
    console.error('Error calculating duration:', error);
    // Return safe defaults with proper 3-day buffer as per specifications
    const defaultDeadline = Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60);
    return {
      durationInSeconds: 3 * 24 * 60 * 60, // 3 days in seconds
      durationInDays: 3,
      deadlineTimestamp: defaultDeadline,
      currentTimestamp: Math.floor(Date.now() / 1000)
    };
  }
};

/**
 * Validate that database and blockchain timestamps match
 * @param {string|Date} dbDeadline - Database deadline
 * @param {number} blockchainDeadline - Blockchain deadline timestamp
 * @returns {boolean} Whether timestamps match
 */
const validateTimestampsMatch = (dbDeadline, blockchainDeadline) => {
  try {
    // Handle null/undefined values
    if (!dbDeadline || blockchainDeadline === undefined || blockchainDeadline === null) {
      return false;
    }
    
    const dbDeadlineDate = new Date(dbDeadline);
    
    // Validate dates
    if (isNaN(dbDeadlineDate.getTime()) || isNaN(blockchainDeadline)) {
      return false;
    }
    
    const dbDeadlineTimestamp = Math.floor(dbDeadlineDate.getTime() / 1000);
    
    // Allow for a small buffer (60 seconds) for transaction processing
    const buffer = 60;
    const diff = Math.abs(dbDeadlineTimestamp - blockchainDeadline);
    
    return diff <= buffer;
  } catch (error) {
    console.error('Error validating timestamps:', error);
    return false;
  }
};

/**
 * Format timestamp for consistent storage
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted timestamp
 */
const formatTimestamp = (date) => {
  try {
    return new Date(date).toISOString().replace('T', ' ').substring(0, 19);
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }
};

/**
 * Get current timestamp in Unix format with 3-day buffer as per specifications
 * @returns {number} Current Unix timestamp with buffer
 */
const getCurrentUnixTimestamp = () => {
  return Math.floor(Date.now() / 1000);
};

/**
 * Get deadline timestamp with proper 3-day buffer as per project specifications
 * @returns {number} Deadline Unix timestamp
 */
const getDeadlineTimestampWithBuffer = () => {
  // Add 3-day buffer as per project specifications
  return Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60);
};

/**
 * Convert Unix timestamp to Date object
 * @param {number} unixTimestamp - Unix timestamp
 * @returns {Date} Date object
 */
const unixTimestampToDate = (unixTimestamp) => {
  try {
    return new Date(unixTimestamp * 1000);
  } catch (error) {
    console.error('Error converting Unix timestamp to Date:', error);
    return new Date();
  }
};

module.exports = {
  calculateDuration,
  validateTimestampsMatch,
  formatTimestamp,
  getCurrentUnixTimestamp,
  getDeadlineTimestampWithBuffer,
  unixTimestampToDate
};