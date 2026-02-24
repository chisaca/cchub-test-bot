// services/hotrecharge.js - MAIN ORCHESTRATOR (UPDATED WITH NYARADZO AND TELONE)
// Handles authentication, token caching, and common utilities

const constants = require('../config/constants');
require('dotenv').config();

const axios = require('axios');
const crypto = require('crypto');

// Import active service modules
const airtimeUSD = require('./hotrecharge-services/airtimeusd');
const airtimeZIG = require('./hotrecharge-services/airtimezig');
const zesaZIG = require('./hotrecharge-services/zesazig');
const zesaUSD = require('./hotrecharge-services/zesausd');
const nyaradzo = require('./hotrecharge-services/nyaradzo');

// Cache for bearer token - FIXED: Initialize with null values
let tokenCache = {
    token: null,
    refreshToken: null,
    expiresAt: 0
};

// Health check cache
let healthCache = {
    isOnline: null,
    lastCheck: null,
    checkInterval: constants.HOTRECHARGE_CONFIG.HEALTH_CHECK_INTERVAL
};

/**
 * Account Type ID mapping (from constants):
 * ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.AIRTIME_ZIG.id} = ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.AIRTIME_ZIG.name} (${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.AIRTIME_ZIG.apiName})
 * ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.ZESA_ZIG.id} = ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.ZESA_ZIG.name} (${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.ZESA_ZIG.apiName})
 * ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.AIRTIME_USD.id} = ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.AIRTIME_USD.name} (${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.AIRTIME_USD.apiName})
 * ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.ZESA_USD.id} = ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.ZESA_USD.name} (${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.ZESA_USD.apiName})
 * ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.NYARADZO.id} = ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.NYARADZO.name} (${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.NYARADZO.apiName})
 * ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.TELONE.id} = ${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.TELONE.name} (${constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.TELONE.apiName})
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
  
  // Check for cached token (tokens expire in 30 minutes as per the JWT expiry)
  if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > Date.now()) {
    console.log('[HotRecharge] Using cached token');
    return tokenCache.token;
  }

  try {
    console.log('[HotRecharge] Authenticating with AccessCode/Password...');
    
    // IMPORTANT: Use exact field names from working test
    const response = await axios.post(
      `${process.env.HOT_API_BASE_URL}/identity/login`,
      {
        AccessCode: process.env.HOT_ACCESS_CODE,  // Must be capital A, capital C
        Password: process.env.HOT_PASSWORD         // Must be capital P
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: constants.HOTRECHARGE_CONFIG.REQUEST_TIMEOUT
      }
    );

    console.log('[HotRecharge] Login successful');
    
    // Extract token and refresh token from response
    const { token, refreshToken } = response.data;
    
    // Token expires in 30 minutes (1800 seconds) based on JWT expiry
    // The JWT shows exp: 1771317708 - iat: 1771315908 = 1800 seconds
    tokenCache = {
      token,
      refreshToken,
      expiresAt: Date.now() + (30 * 60 * 1000) - 60000 // 29 minutes (buffer)
    };

    console.log('[HotRecharge] Token cached, expires in 29 minutes');
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
        timeout: constants.HOTRECHARGE_CONFIG.REQUEST_TIMEOUT
      }
    );

    // Handle the response format we saw in tests
    let balance = 0;
    let currency = '';
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      balance = response.data[0].balance || 0;
      currency = response.data[0].name || '';
    }

    // Map currency names
    const currencyMap = constants.HOTRECHARGE_CONFIG.CURRENCY_MAP;

    return {
      success: true,
      balance: balance,
      currency: currencyMap[currency] || currency,
      accountTypeId: accountTypeId,
      raw: response.data
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
 * Get all available products
 * @returns {Promise<Array>} List of products
 */
async function getProducts() {
  try {
    const token = await authenticate();
    
    const response = await axios.get(
      `${process.env.HOT_API_BASE_URL}/products/0`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.products || [];
  } catch (error) {
    console.error('[HotRecharge] Failed to fetch products:', error.message);
    return [];
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

/**
 * Format amount helper for consistent display
 * @param {string} currency - 'usd' or 'zig'
 * @param {number} amount - Amount to format
 * @returns {string} Formatted amount with currency symbol
 */
function formatAmount(currency, amount) {
    if (currency === 'usd' || currency === 'USD') {
        return `$${amount.toFixed(2)} USD`;
    } else {
        return `${amount.toFixed(2)} ZiG`;
    }
}

/**
 * Log transaction to WordPress
 * @param {Object} transactionData - Transaction details
 * @param {string} serviceType - Type of service (airtime, zesa, nyaradzo, telone)
 */
async function logToWordPress(transactionData, serviceType) {
    console.log(`📝 [WORDPRESS] Logging ${serviceType} transaction to CCHub`);
    
    // Don't block the main flow - log asynchronously
    setTimeout(async () => {
        try {
            const wpEndpoint = `${process.env.WP_SITE_URL}/wp-json/cchub/v1/transactions`;
            
            // Map service type to WordPress format
            const serviceMap = {
                airtime: 1,
                zesa: 2,
                nyaradzo: 3,
                telone: 4
            };
            
            const payload = {
                transaction_id: transactionData.reference || transactionData.agentReference,
                service: serviceType,
                service_id: serviceMap[serviceType] || 0,
                user_phone: transactionData.customerPhone || transactionData.userId,
                amount: transactionData.amount,
                currency: transactionData.currency === 'ZiG' ? 'ZIG' : 'USD',
                status: transactionData.success ? 'completed' : 'failed',
                payment_method: transactionData.paymentMethod || 'ecocash',
                metadata: {
                    ...transactionData.metadata,
                    hotRechargeResponse: transactionData.rawResponse,
                    agentReference: transactionData.agentReference
                },
                error_message: transactionData.error || null
            };
            
            const response = await axios.post(wpEndpoint, payload, {
                headers: {
                    'X-API-Key': process.env.WP_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 5000 // 5 second timeout so it doesn't hold up the response
            });
            
            console.log(`✅ [WORDPRESS] Logged successfully: ${response.data.id}`);
            
        } catch (error) {
            // Log locally as fallback
            console.error(`❌ [WORDPRESS] Logging failed:`, error.message);
            
            // Store in local queue file for retry later
            const fs = require('fs');
            const queueFile = './logs/wp-queue.json';
            
            try {
                let queue = [];
                if (fs.existsSync(queueFile)) {
                    queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
                }
                
                queue.push({
                    timestamp: Date.now(),
                    transactionData,
                    serviceType,
                    retries: 0
                });
                
                fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
                console.log(`📦 [WORDPRESS] Queued for retry`);
            } catch (queueError) {
                console.error(`❌ [WORDPRESS] Queue failed:`, queueError.message);
            }
        }
    }, 0); // Execute immediately but don't block
}

/**
 * Get TelOne service instance
 * @param {string} currency - 'zig' or 'usd'
 * @returns {Object} TelOne service instance
 */
function getTelOneService(currency = 'zig') {
    if (currency.toLowerCase() === 'usd') {
        return teloneUSDInstance;
    }
    return teloneZigInstance;
}

// Initialize all active service modules with shared dependencies
airtimeUSD.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.AIRTIME_USD),
    logToWordPress: (data) => logToWordPress(data, 'airtime')  // ADD THIS
});

airtimeZIG.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.AIRTIME_ZIG),
    logToWordPress: (data) => logToWordPress(data, 'airtime')  // ADD THIS
});

zesaZIG.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.ZESA_ZIG),
    logToWordPress: (data) => logToWordPress(data, 'zesa')  // ADD THIS
});

zesaUSD.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.ZESA_USD),
    logToWordPress: (data) => logToWordPress(data, 'zesa')  // ADD THIS
});

// Initialize Nyaradzo service
nyaradzo.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.NYARADZO),
    logToWordPress: (data) => logToWordPress(data, 'nyaradzo')  // ADD THIS
});



// ==================== EXPORT ALL SERVICES ====================

module.exports = {
    // Core functions
    authenticate,
    getBalance,
    getProducts,
    isOnline,
    generateAgentReference,
    formatAmount,
    logToWordPress,
    getTelOneService,
    
    // Airtime Services
    airtime: {
        usd: {
            purchase: airtimeUSD.purchaseAirtime,
            validateAmount: airtimeUSD.validateAmount,
            validateRecipient: airtimeUSD.validateRecipient,
            formatAmount: (amount) => `$${amount.toFixed(2)} USD`
        },
        zig: {
            purchase: airtimeZIG.purchaseAirtime,
            validateAmount: airtimeZIG.validateAmount,
            validateRecipient: airtimeZIG.validateRecipient,
            formatAmount: airtimeZIG.formatAmount
        }
    },

    // ZESA Services
    zesa: {
        zig: {
            verifyMeter: zesaZIG.verifyMeter,
            purchaseToken: zesaZIG.purchaseToken,
            validateAmount: zesaZIG.validateAmount,
            validateMeter: zesaZIG.validateMeter,
            formatAmount: zesaZIG.formatAmount
        },
        usd: {
            verifyMeter: zesaUSD.verifyMeter,
            purchaseToken: zesaUSD.purchaseToken,
            validateAmount: zesaUSD.validateAmount,
            validateMeter: zesaUSD.validateMeter,
            formatAmount: zesaUSD.formatAmount
        }
    },
    
    // Nyaradzo Services
    nyaradzo: {
        verifyPolicy: nyaradzo.verifyPolicy,
        purchase: nyaradzo.purchase,
        validatePolicy: nyaradzo.validatePolicy,
        validateAmount: nyaradzo.validateAmount,
        formatAmount: nyaradzo.formatAmount,
        queryTransaction: nyaradzo.queryTransaction
    },
    
    // TELONE SERVICES - ADDED
    telone: {
        zig: {
            purchase: (params) => teloneZigInstance.purchase(params),
            verifyAccount: (accountNumber) => teloneZigInstance.verifyAccount(accountNumber),
            validateAccount: (accountNumber) => teloneZigInstance.validateAccount(accountNumber),
            getProductName: (productId) => teloneZigInstance.getProductName(productId),
            checkBalance: () => teloneZigInstance.checkBalance(),
            checkStatus: (reference) => teloneZigInstance.checkStatus(reference),
            getAvailableProducts: () => teloneZigInstance.getAvailableProducts(),
            healthCheck: () => teloneZigInstance.healthCheck(),
            formatAmount: (amount) => `${amount.toLocaleString()} ZiG`
        },
        usd: {
            purchase: (params) => teloneUSDInstance.purchase(params),
            verifyAccount: (accountNumber) => teloneUSDInstance.verifyAccount(accountNumber),
            validateAccount: (accountNumber) => teloneUSDInstance.validateAccount(accountNumber),
            getProductName: (productId) => teloneUSDInstance.getProductName(productId),
            checkBalance: () => teloneUSDInstance.checkBalance(),
            checkStatus: (reference) => teloneUSDInstance.checkStatus(reference),
            healthCheck: () => teloneUSDInstance.healthCheck(),
            formatAmount: (amount) => `$${amount.toFixed(2)} USD (unsupported)`
        }
    },
    
    // Backward compatibility methods
    purchaseAirtime: async (params) => {
        if (params.currency === 'usd' || params.currency === 'USD') {
            return airtimeUSD.purchaseAirtime(params);
        } else {
            return airtimeZIG.purchaseAirtime(params);
        }
    },
    
    verifyZesaMeter: async (meterNumber, currency) => {
        if (currency === 'ZiG' || currency === 'zig') {
            return zesaZIG.verifyMeter(meterNumber);
        } else {
            return zesaUSD.verifyMeter(meterNumber);
        }
    },
    
    purchaseZesaToken: async (params) => {
        if (params.currency === 'ZiG' || params.currency === 'zig') {
            return zesaZIG.purchaseToken(params);
        } else {
            return zesaUSD.purchaseToken(params);
        }
    },
    
    // Nyaradzo backward compatibility
    purchaseNyaradzo: async (params) => {
        return nyaradzo.purchase(params);
    },
    
    verifyNyaradzoPolicy: async (policyNumber) => {
        return nyaradzo.verifyPolicy(policyNumber);
    },
    
    // TelOne backward compatibility
    purchaseTelOne: async (params) => {
        const service = params.currency === 'usd' ? teloneUSDInstance : teloneZigInstance;
        return service.purchase(params);
    },
    
    verifyTelOneAccount: async (accountNumber) => {
        return teloneZigInstance.verifyAccount(accountNumber);
    }
};
