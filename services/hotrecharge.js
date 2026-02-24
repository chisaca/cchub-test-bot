// services/hotrecharge.js - MAIN ORCHESTRATOR
// Handles authentication, token caching, and common utilities

const constants = require('../config/constants');
require('dotenv').config();

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Import active service modules
const airtimeUSD = require('./hotrecharge-services/airtimeusd');
const airtimeZIG = require('./hotrecharge-services/airtimezig');
const zesaZIG = require('./hotrecharge-services/zesazig');
const zesaUSD = require('./hotrecharge-services/zesausd');
const nyaradzo = require('./hotrecharge-services/nyaradzo');

// Cache for bearer token
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
  
  // Check for cached token
  if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > Date.now()) {
    console.log('[HotRecharge] Using cached token');
    return tokenCache.token;
  }

  try {
    console.log('[HotRecharge] Authenticating with AccessCode/Password...');
    
    const response = await axios.post(
      `${process.env.HOT_API_BASE_URL}/identity/login`,
      {
        AccessCode: process.env.HOT_ACCESS_CODE,
        Password: process.env.HOT_PASSWORD
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: constants.HOTRECHARGE_CONFIG.REQUEST_TIMEOUT
      }
    );

    console.log('[HotRecharge] Login successful');
    
    const { token, refreshToken } = response.data;
    
    tokenCache = {
      token,
      refreshToken,
      expiresAt: Date.now() + (30 * 60 * 1000) - 60000 // 29 minutes
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

    let balance = 0;
    let currency = '';
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      balance = response.data[0].balance || 0;
      currency = response.data[0].name || '';
    }

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
 * @param {string} serviceType - Type of service (airtime, zesa, nyaradzo)
 */
async function logToWordPress(transactionData, serviceType) {
    console.log(`📝 [WORDPRESS] Logging ${serviceType} transaction to CCHub`);
    
    // Debug: Print the exact data being sent
    console.log(`📤 [WORDPRESS] FULL DATA BEING SENT:`, JSON.stringify(transactionData, null, 2));
    
    // Check if all required fields are present
    const requiredFields = ['reference', 'customerPhone', 'amount', 'currency', 'paymentMethod'];
    const missingFields = [];
    
    requiredFields.forEach(field => {
        if (!transactionData[field] && transactionData[field] !== 0) {
            missingFields.push(field);
        }
    });
    
    if (missingFields.length > 0) {
        console.log(`❌ [WORDPRESS] MISSING REQUIRED FIELDS:`, missingFields);
    } else {
        console.log(`✅ [WORDPRESS] All required fields present`);
    }
    
    // Don't block the main flow - log asynchronously
    setTimeout(async () => {
        try {
            const wpEndpoint = `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/transactions`;
            
            // Map service type to WordPress format
            const serviceMap = {
                airtime: 'airtime',
                zesa: 'zesa',
                nyaradzo: 'nyaradzo'
            };
            
            // Ensure currency is in correct format (USD or ZiG)
            let currency = transactionData.currency;
            if (currency === 'usd' || currency === 'USD') {
                currency = 'USD';
            } else if (currency === 'zig' || currency === 'ZiG') {
                currency = 'ZiG';
            }
            
            const payload = {
                transaction_id: transactionData.reference || transactionData.agentReference || `MANUAL-${Date.now()}`,
                service: serviceType,
                user_phone: transactionData.customerPhone || transactionData.userId || '263775000000',
                amount: parseFloat(transactionData.amount) || 0,
                currency: currency,
                status: transactionData.success ? 'completed' : 'failed',
                payment_method: transactionData.paymentMethod || transactionData.paymentProvider || 'ecocash',
                metadata: {
                    ...transactionData.metadata,
                    hotRechargeResponse: transactionData.rawResponse,
                    agentReference: transactionData.agentReference,
                    network: transactionData.metadata?.network,
                    recipient: transactionData.metadata?.recipient
                }
            };
            
            console.log(`📤 [WORDPRESS] Sending payload:`, JSON.stringify(payload, null, 2));
            
            const response = await axios.post(wpEndpoint, payload, {
                headers: {
                    'X-API-Key': process.env.WP_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });
            
            console.log(`✅ [WORDPRESS] Response status: ${response.status}`);
            console.log(`✅ [WORDPRESS] Response data:`, response.data);
            console.log(`✅ [WORDPRESS] Logged successfully: ${response.data.id || 'unknown'}`);
            
        } catch (error) {
            console.error(`❌ [WORDPRESS] Logging failed:`, error.message);
            if (error.response) {
                console.error(`❌ [WORDPRESS] Response status: ${error.response.status}`);
                console.error(`❌ [WORDPRESS] Response data:`, error.response.data);
            }
            
            // Store in local queue file for retry later
            const logsDir = path.join(__dirname, '../logs');
            const queueFile = path.join(logsDir, 'wp-queue.json');
            
            try {
                // Ensure logs directory exists
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true, mode: 0o755 });
                }
                
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
                console.log(`📦 [WORDPRESS] Queued for retry in ${queueFile}`);
            } catch (queueError) {
                console.error(`❌ [WORDPRESS] Queue failed:`, queueError.message);
            }
        }
    }, 0);
}

// Initialize all active service modules with shared dependencies
airtimeUSD.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.AIRTIME_USD),
    logToWordPress: (data) => logToWordPress(data, 'airtime')
});

airtimeZIG.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.AIRTIME_ZIG),
    logToWordPress: (data) => logToWordPress(data, 'airtime')
});

zesaZIG.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.ZESA_ZIG),
    logToWordPress: (data) => logToWordPress(data, 'zesa')
});

zesaUSD.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.ZESA_USD),
    logToWordPress: (data) => logToWordPress(data, 'zesa')
});

// Initialize Nyaradzo service
nyaradzo.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.NYARADZO),
    logToWordPress: (data) => logToWordPress(data, 'nyaradzo')
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
    }
};
