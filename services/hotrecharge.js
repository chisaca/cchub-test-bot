// services/hotrecharge.js
// ============================================================================
// HOTRECHARGE MAIN ORCHESTRATOR
// Central hub for all HotRecharge API interactions
// 
// Responsibilities:
// - Authentication & token caching
// - Balance checking
// - Health monitoring
// - Transaction logging to WordPress
// - Orchestrates all service-specific modules (airtime, zesa, nyaradzo)
// 
// Architecture:
// This file acts as a facade, delegating service-specific logic to
// individual modules in ./hotrecharge-services/ while providing common
// utilities and shared dependencies to all modules.
// ============================================================================

const constants = require('../config/constants');
require('dotenv').config();

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ============================================================================
// SERVICE MODULE IMPORTS
// Each module handles specific service logic and is initialized with
// shared dependencies from this orchestrator
// ============================================================================
const airtimeUSD = require('./hotrecharge-services/airtimeusd');
const airtimeZIG = require('./hotrecharge-services/airtimezig');
const zesaZIG = require('./hotrecharge-services/zesazig');
const zesaUSD = require('./hotrecharge-services/zesausd');
const nyaradzo = require('./hotrecharge-services/nyaradzo');

// ============================================================================
// TOKEN CACHE
// Stores Bearer tokens to avoid repeated authentication
// Tokens expire after 30 minutes, cached for 29 minutes with buffer
// ============================================================================
let tokenCache = {
    token: null,
    refreshToken: null,
    expiresAt: 0
};

// ============================================================================
// HEALTH CACHE
// Prevents repeated health checks within the configured interval
// ============================================================================
let healthCache = {
    isOnline: null,
    lastCheck: null,
    checkInterval: constants.HOTRECHARGE_CONFIG.HEALTH_CHECK_INTERVAL
};

/**
 * Account Type ID mapping (from constants):
 * 1 = ZiG Airtime (ZWG)
 * 2 = ZiG ZESA / Nyaradzo (Utility ZWG)
 * 3 = USD Airtime (USD)
 * 4 = USD ZESA (Utility USD)
 */

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check if HotRecharge API is online and responsive
 * Uses cached result within checkInterval to reduce API calls
 * 
 * @returns {Promise<boolean>} True if API is online
 */
async function isOnline() {
    console.log('🩺 [HOTRECHARGE] Health check initiated');
    
    // Return cached result if still fresh
    if (healthCache.lastCheck && 
        (Date.now() - healthCache.lastCheck) < healthCache.checkInterval) {
        return healthCache.isOnline;
    }
    
    try {
        // Test by checking USD Airtime balance (account type 3)
        await getBalance(3);
        healthCache.isOnline = true;
        healthCache.lastCheck = Date.now();
        return true;
    } catch (error) {
        healthCache.isOnline = false;
        healthCache.lastCheck = Date.now();
        return false;
    }
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Authenticate with HotRecharge API and get Bearer token
 * Caches token for 29 minutes (30 minute expiry - 1 minute buffer)
 * 
 * @returns {Promise<string>} Bearer token for API requests
 * @throws {Error} If authentication fails
 */
async function authenticate() {
    console.log('🔐 [HOTRECHARGE] Authentication requested');
    
    // Return cached token if still valid
    if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > Date.now()) {
        console.log('🔐 [HOTRECHARGE] Using cached token');
        return tokenCache.token;
    }

    try {
        console.log('🔐 [HOTRECHARGE] Requesting new token from API');
        
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

        console.log('✅ [HOTRECHARGE] Authentication successful');
        
        const { token, refreshToken } = response.data;
        
        // Cache token with buffer (29 minutes)
        tokenCache = {
            token,
            refreshToken,
            expiresAt: Date.now() + (30 * 60 * 1000) - 60000 // 29 minutes
        };

        console.log('🔐 [HOTRECHARGE] Token cached, expires in 29 minutes');
        return token;
        
    } catch (error) {
        console.error('❌ [HOTRECHARGE] Authentication failed:', error.response?.data || error.message);
        throw new Error(`HotRecharge authentication failed: ${error.response?.data?.title || error.message}`);
    }
}

// ============================================================================
// BALANCE CHECKING
// ============================================================================

/**
 * Get account balance for specific account type
 * 
 * @param {number} accountTypeId - Account type ID (1-4)
 * @returns {Promise<Object>} Balance information
 * @returns {boolean} success - Whether balance fetch succeeded
 * @returns {number} balance - Current balance amount
 * @returns {string} currency - Currency type (ZiG or USD)
 * @returns {number} accountTypeId - Account type requested
 * @returns {Object} raw - Raw API response
 */
async function getBalance(accountTypeId = 1) {
    console.log(`💰 [HOTRECHARGE] Fetching balance for account type: ${accountTypeId}`);
    
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
        console.error('❌ [HOTRECHARGE] Balance fetch failed:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.title || error.message
        };
    }
}

// ============================================================================
// PRODUCT QUERY
// ============================================================================

/**
 * Get all available products from HotRecharge
 * 
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

        console.log(`📦 [HOTRECHARGE] Fetched ${response.data.products?.length || 0} products`);
        return response.data.products || [];
    } catch (error) {
        console.error('❌ [HOTRECHARGE] Product fetch failed:', error.message);
        return [];
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate unique agent reference for transaction tracking
 * Format: CCHUB-{service}-{userId}-{timestamp}-{random}
 * 
 * @param {string} userId - User identifier (usually last 4 digits)
 * @param {string} service - Service prefix (from HOTRECHARGE_CONFIG.SERVICE_PREFIXES)
 * @returns {string} Unique agent reference
 */
function generateAgentReference(userId = 'USER', service = 'MAIN') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    const reference = `CCHUB-${service}-${userId}-${timestamp}-${random}`;
    
    console.log(`🔖 [HOTRECHARGE] Generated reference: ${reference}`);
    return reference;
}

/**
 * Format amount with currency symbol for display
 * 
 * @param {string} currency - 'usd' or 'zig' (case insensitive)
 * @param {number} amount - Amount to format
 * @returns {string} Formatted amount with currency symbol
 */
function formatAmount(currency, amount) {
    if (currency.toUpperCase() === 'USD') {
        return `$${amount.toFixed(2)} USD`;
    } else {
        return `${amount.toFixed(2)} ZiG`;
    }
}

// ============================================================================
// WORDPRESS TRANSACTION LOGGING
// ============================================================================

/**
 * Log transaction to WordPress with local queue fallback
 * Non-blocking - executes asynchronously without awaiting
 * 
 * @param {Object} transactionData - Complete transaction details
 * @param {string} serviceType - Type of service (airtime, zesa, nyaradzo)
 */
async function logToWordPress(transactionData, serviceType) {
    console.log(`📝 [WORDPRESS] Logging ${serviceType} transaction`);
    
    // Validate required fields for debugging
    const requiredFields = ['reference', 'customerPhone', 'amount', 'currency', 'paymentMethod'];
    const missingFields = requiredFields.filter(field => !transactionData[field] && transactionData[field] !== 0);
    
    if (missingFields.length > 0) {
        console.log(`⚠️ [WORDPRESS] Missing required fields:`, missingFields);
    }
    
    // Don't block the main flow - log asynchronously
    setTimeout(async () => {
        try {
            const wpEndpoint = `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/transactions`;
            
            // Normalize currency to WordPress format (USD or ZiG)
            let currency = transactionData.currency;
            if (currency === 'usd' || currency === 'USD') {
                currency = 'USD';
            } else if (currency === 'zig' || currency === 'ZiG') {
                currency = 'ZiG';
            }
            
            // Build payload for WordPress
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
            
            console.log(`📤 [WORDPRESS] Sending payload to ${wpEndpoint}`);
            
            const response = await axios.post(wpEndpoint, payload, {
                headers: {
                    'X-API-Key': process.env.WP_API_KEY,
                    'Content-Type': 'application/json',
                    'User-Agent': 'CCHub-WhatsApp-Bot/1.0' 
                },
                timeout: 5000
            });
            
            console.log(`✅ [WORDPRESS] Logged successfully: ${response.data.id || 'unknown'}`);
            
        } catch (error) {
            console.error(`❌ [WORDPRESS] Logging failed:`, error.message);
            
            if (error.response) {
                console.error(`❌ [WORDPRESS] Status: ${error.response.status}`);
                console.error(`❌ [WORDPRESS] Response:`, error.response.data);
            }
            
            // ========================================================================
            // LOCAL QUEUE FALLBACK
            // Store failed logs in local file for retry later
            // ========================================================================
            const logsDir = path.join(__dirname, '../logs');
            const queueFile = path.join(logsDir, 'wp-queue.json');
            
            try {
                // Ensure logs directory exists
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true, mode: 0o755 });
                }
                
                // Read existing queue
                let queue = [];
                if (fs.existsSync(queueFile)) {
                    queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
                }
                
                // Add failed transaction to queue
                queue.push({
                    timestamp: Date.now(),
                    transactionData,
                    serviceType,
                    retries: 0
                });
                
                // Write queue back to file
                fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
                console.log(`📦 [WORDPRESS] Queued for retry in ${queueFile}`);
            } catch (queueError) {
                console.error(`❌ [WORDPRESS] Queue failed:`, queueError.message);
            }
        }
    }, 0); // Execute immediately but asynchronously
}

// ============================================================================
// SERVICE MODULE INITIALIZATION
// Inject shared dependencies into each service module
// ============================================================================

// Initialize USD Airtime service
airtimeUSD.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.AIRTIME_USD),
    logToWordPress: (data) => logToWordPress(data, 'airtime')
});

// Initialize ZiG Airtime service
airtimeZIG.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.AIRTIME_ZIG),
    logToWordPress: (data) => logToWordPress(data, 'airtime')
});

// Initialize ZiG ZESA service
zesaZIG.init({
    authenticate,
    getBalance,
    generateAgentReference: (userId) => generateAgentReference(userId, constants.HOTRECHARGE_CONFIG.SERVICE_PREFIXES.ZESA_ZIG),
    logToWordPress: (data) => logToWordPress(data, 'zesa')
});

// Initialize USD ZESA service
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

// ============================================================================
// EXPORTS
// Provide both modern modular API and backward compatibility
// ============================================================================

module.exports = {
    // Core functions
    authenticate,
    getBalance,
    getProducts,
    isOnline,
    generateAgentReference,
    formatAmount,
    logToWordPress,
    
    // ========================================================================
    // MODERN MODULAR API
    // Organized by service and currency
    // ========================================================================
    
    // Airtime Services (USD and ZiG)
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

    // ZESA Services (USD and ZiG)
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
        formatAmount: nyaradzo.formatAmount
    },
    
    // ========================================================================
    // BACKWARD COMPATIBILITY METHODS
    // For older code that expects the previous API
    // ========================================================================
    
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
    
    purchaseNyaradzo: async (params) => {
        return nyaradzo.purchase(params);
    },
    
    verifyNyaradzoPolicy: async (policyNumber) => {
        return nyaradzo.verifyPolicy(policyNumber);
    }
};
