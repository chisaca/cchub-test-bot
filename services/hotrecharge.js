// services/hotrecharge.js - MAIN ORCHESTRATOR
// Imports and initializes all HotRecharge service modules
// Handles authentication, token caching, and common utilities

require('dotenv').config();

const axios = require('axios');
const crypto = require('crypto');

// Import service modules
const airtimeUSD = require('./hotrecharge-services/airtimeusd');
// Future imports:
// const airtimeZIG = require('./hotrecharge-services/airtimezig');
// const zesaUSD = require('./hotrecharge-services/zesausd');
// const zesaZIG = require('./hotrecharge-services/zesazig');
// const telone = require('./hotrecharge-services/telone');
// const nyaradzo = require('./hotrecharge-services/nyaradzo');

// Cache for bearer token
let tokenCache = {
  token: null,
  refreshToken: null,
  expiresAt: null
};

// Health check cache
let healthCache = {
    isOnline: null,
    lastCheck: null,
    checkInterval: 60000 // 1 minute
};

/**
 * Account Type ID mapping:
 * 1 = ZiG Airtime
 * 2 = ZiG ZESA
 * 3 = USD Airtime
 * 4 = USD ZESA
 */

/**
 * Check if HotRecharge API is online
 */
async function isOnline() {
    console.log('🩺 [HOTRECHARGE] isOnline() called');
    
    if (healthCache.lastCheck && 
        (Date.now() - healthCache.lastCheck) < healthCache.checkInterval) {
        return healthCache.isOnline;
    }
    
    try {
        await getBalance(3); // Check USD Airtime balance
        healthCache.isOnline = true;
        healthCache.lastCheck = Date.now();
        return true;
    } catch (error) {
        healthCache.isOnline = false;
        healthCache.lastCheck = Date.now();
        return false;
    }
}

/**
 * Authenticate with HotRecharge API
 * @returns {Promise<string>} Bearer token
 */
async function authenticate() {
  console.log('🔐 [HOTRECHARGE] authenticate() called');
  
  if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > Date.now()) {
    console.log('[HotRecharge] Using cached token');
    return tokenCache.token;
  }

  try {
    console.log('[HotRecharge] Authenticating...');
    
    const response = await axios.post(
      `${process.env.HOT_API_BASE_URL}/identity/login`,
      {
        AccessCode: process.env.HOT_ACCESS_CODE,
        Password: process.env.HOT_PASSWORD
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    const { token, refreshToken } = response.data;
    
    tokenCache = {
      token,
      refreshToken,
      expiresAt: Date.now() + (parseInt(process.env.HOT_TOKEN_EXPIRY || '300') * 1000)
    };

    console.log('[HotRecharge] Authentication successful');
    return token;
    
  } catch (error) {
    console.error('[HotRecharge] Authentication failed:', error.response?.data || error.message);
    throw new Error(`HotRecharge authentication failed: ${error.response?.data?.title || error.message}`);
  }
}

/**
 * Get account balance
 * @param {number} accountTypeId - Account type ID (1-4)
 * @returns {Promise<Object>} Account balance
 */
async function getBalance(accountTypeId = 1) {
  console.log(`💰 [HOTRECHARGE] getBalance() for accountTypeId: ${accountTypeId}`);
  
  try {
    const token = await authenticate();
    
    const response = await axios.get(
      `${process.env.HOT_API_BASE_URL}/account/balance/${accountTypeId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    let balance = 0;
    let currency = [1, 2].includes(accountTypeId) ? 'ZiG' : 'USD';
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      balance = response.data[0].balance || 0;
      currency = response.data[0].name || currency;
    } else if (typeof response.data === 'number') {
      balance = response.data;
    } else if (response.data.balance) {
      balance = response.data.balance;
    }

    return {
      success: true,
      balance: balance,
      currency: currency,
      accountTypeId: accountTypeId
    };
  } catch (error) {
    console.error('[HotRecharge] Failed to fetch balance:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.title || error.message
    };
  }
}

/**
 * Generate agent reference for transaction tracking
 * Format: CCHUB-{service}-{userId}-{timestamp}-{random}
 */
function generateAgentReference(userId = 'USER', service = 'MAIN') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CCHUB-${service}-${userId}-${timestamp}-${random}`;
}

// Initialize all service modules with shared dependencies
airtimeUSD.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, 'AIRTIME')
});

// Future initializations:
// airtimeZIG.init({ authenticate, getBalance, generateAgentReference: (userId) => generateAgentReference(userId, 'AIRTIME-ZIG') });
// zesaUSD.init({ authenticate, getBalance, generateAgentReference: (userId) => generateAgentReference(userId, 'ZESA-USD') });
// zesaZIG.init({ authenticate, getBalance, generateAgentReference: (userId) => generateAgentReference(userId, 'ZESA-ZIG') });
// telone.init({ authenticate, getBalance, generateAgentReference: (userId) => generateAgentReference(userId, 'TELONE') });
// nyaradzo.init({ authenticate, getBalance, generateAgentReference: (userId) => generateAgentReference(userId, 'NYARADZO') });

// ==================== EXPORT ALL SERVICES ====================

module.exports = {
    // Core functions
    authenticate,
    getBalance,
    isOnline,
    generateAgentReference,
    
    // USD Airtime Service
    airtime: {
        usd: {
            purchase: airtimeUSD.purchaseAirtime,
            validateAmount: airtimeUSD.validateAmount,
            validateRecipient: airtimeUSD.validateRecipient
        }
    },
    
    // Future services will be added here
    // airtime: {
    //     zig: airtimeZIG,
    //     usd: airtimeUSD
    // },
    // zesa: {
    //     zig: zesaZIG,
    //     usd: zesaUSD
    // },
    // telone: telone,
    // nyaradzo: nyaradzo,
    
    // For backward compatibility - will be phased out
    purchaseAirtime: airtimeUSD.purchaseAirtime,
    verifyZesaMeter: () => { throw new Error('Use zesa.usd.verifyMeter() or zesa.zig.verifyMeter() instead'); },
    purchaseZesaToken: () => { throw new Error('Use zesa.usd.purchase() or zesa.zig.purchase() instead'); }
};