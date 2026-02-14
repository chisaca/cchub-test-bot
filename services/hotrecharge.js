// services/hotrecharge.js - COMPLETE UPDATED VERSION
// FIXED: Using Product ID 100 for all USD airtime (any amount $0.10-$300)
// AccountTypeId mapping: 1=ZiG Airtime, 2=ZiG ZESA, 3=USD Airtime, 4=USD ZESA

require('dotenv').config();

const axios = require('axios');
const crypto = require('crypto');

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
 * Check if HotRecharge API is online
 */
async function isOnline() {
    console.log('🩺 [HOTRECHARGE DEBUG] isOnline() called');
    
    // Return cached result if checked within last minute
    if (healthCache.lastCheck && 
        (Date.now() - healthCache.lastCheck) < healthCache.checkInterval) {
        console.log('🔄 [HOTRECHARGE DEBUG] Using cached health result:', healthCache.isOnline);
        return healthCache.isOnline;
    }
    
    try {
        console.log('🩺 [HOTRECHARGE DEBUG] Checking health via getBalance(3)...');
        await getBalance(3); // Check USD Airtime balance
        healthCache.isOnline = true;
        healthCache.lastCheck = Date.now();
        console.log('✅ [HOTRECHARGE DEBUG] Health check PASSED, API is ONLINE');
        return true;
    } catch (error) {
        console.log('❌ [HOTRECHARGE DEBUG] Health check FAILED, API is OFFLINE');
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
  console.log('🔐 [HOTRECHARGE DEBUG] authenticate() called');
  
  // Check if we have a valid cached token
  if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > Date.now()) {
    console.log('[HotRecharge] Using cached token');
    console.log('⏰ [HOTRECHARGE DEBUG] Token expires at:', new Date(tokenCache.expiresAt).toISOString());
    return tokenCache.token;
  }

  try {
    console.log('[HotRecharge] Authenticating...');
    console.log('🌐 [HOTRECHARGE DEBUG] API URL:', `${process.env.HOT_API_BASE_URL}/identity/login`);
    
    const response = await axios.post(
      `${process.env.HOT_API_BASE_URL}/identity/login`,
      {
        AccessCode: process.env.HOT_ACCESS_CODE,
        Password: process.env.HOT_PASSWORD
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('📡 [HOTRECHARGE DEBUG] Auth response status:', response.status);

    const { token, refreshToken } = response.data;
    
    tokenCache = {
      token,
      refreshToken,
      expiresAt: Date.now() + (parseInt(process.env.HOT_TOKEN_EXPIRY || '300') * 1000)
    };

    console.log('[HotRecharge] Authentication successful');
    console.log('⏰ [HOTRECHARGE DEBUG] Token expires at:', new Date(tokenCache.expiresAt).toISOString());
    return token;
    
  } catch (error) {
    console.log('❌ [HOTRECHARGE DEBUG] ========== AUTH ERROR ==========');
    console.log('❌ [HOTRECHARGE DEBUG] Error message:', error.message);
    
    if (error.response) {
      console.log('❌ [HOTRECHARGE DEBUG] Response status:', error.response.status);
      console.log('❌ [HOTRECHARGE DEBUG] Response data:', JSON.stringify(error.response.data, null, 2));
    }
    console.log('❌ [HOTRECHARGE DEBUG] ================================');
    
    throw new Error(`HotRecharge authentication failed: ${error.response?.data?.title || error.message}`);
  }
}

/**
 * Get account balance
 * @param {number} accountTypeId - Account type ID 
 *   1 = ZiG Airtime, 2 = ZiG ZESA, 3 = USD Airtime, 4 = USD ZESA
 * @returns {Promise<Object>} Account balance
 */
async function getBalance(accountTypeId = 1) {
  console.log(`💰 [HOTRECHARGE DEBUG] getBalance() called for accountTypeId: ${accountTypeId}`);
  
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
    let currency = accountTypeId === 1 || accountTypeId === 2 ? 'ZiG' : 'USD';
    
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
 * Format: CCHUB-MAIN-01-01-{userId}-{timestamp}-{random}
 */
function generateAgentReference(userId = 'USER') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CCHUB-MAIN-01-01-${userId}-${timestamp}-${random}`;
}

/**
 * Purchase airtime via HotRecharge - SUPPORTS BOTH ZIG AND USD
 * @param {Object} params - Transaction parameters
 * @param {string} params.recipient - Recipient phone number
 * @param {number} params.amount - Amount in selected currency
 * @param {string} params.network - Network name (Econet/NetOne/Telecel)
 * @param {string} params.currency - Currency ('zig' or 'usd')
 * @param {number} params.productId - Product ID (overrides network mapping)
 * @param {string} params.userId - User identifier
 * @param {string} params.customSms - Optional custom SMS
 * @returns {Promise<Object>} Transaction result
 */
async function purchaseAirtime({ 
  recipient, 
  amount, 
  network, 
  currency = 'usd', 
  productId = null,
  userId = 'USER', 
  customSms = null 
}) {
  console.log('🎯 [HOTRECHARGE DEBUG] ==================== START purchaseAirtime ====================');
  
  const maxRetries = parseInt(process.env.HOT_MAX_RETRIES || '3');
  let lastError = null;

  // Set account type based on currency
  const accountTypeId = currency === 'usd' ? 3 : 1;
  const currencySymbol = currency === 'usd' ? '$' : 'ZiG';
  const currencyName = currency === 'usd' ? 'USD' : 'ZiG';

  console.log(`💰 [HOTRECHARGE DEBUG] AccountTypeId: ${accountTypeId}, Currency: ${currencyName}`);

  // Check appropriate balance
  const balanceCheck = await getBalance(accountTypeId);
  
  if (!balanceCheck.success) {
    console.warn(`[HotRecharge] Could not verify ${currencyName} balance, proceeding anyway`);
  } else if (balanceCheck.balance < amount) {
    return {
      success: false,
      error: `Insufficient ${currencyName} balance. Available: ${currency === 'usd' ? '$' : ''}${balanceCheck.balance.toFixed(2)} ${currency === 'usd' ? '' : 'ZiG'}`
    };
  }

  // ? DETERMINE PRODUCT ID
  let finalProductId = productId;
  
  // Product ID mapping - USD now uses 100 for all networks!
  const productMap = {
    usd: {
      'Econet': 100,  // Product ID 100 works for all networks
      'NetOne': 100,   // Any amount $0.10-$300
      'Telecel': 100   // No ProductCode needed!
    },
    zig: {
      'Econet': 7,
      'NetOne': 102,
      'Telecel': 6
    }
  };

  // Get base product ID
  finalProductId = productId || productMap[currency]?.[network];
  console.log(`📦 [HOTRECHARGE DEBUG] Selected productId: ${finalProductId}`);
  
  if (!finalProductId) {
    return {
      success: false,
      error: `No product ID found for ${network} in ${currencyName}`
    };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔄 [HOTRECHARGE DEBUG] ========== ATTEMPT ${attempt}/${maxRetries} ==========`);
    
    try {
      console.log(`[HotRecharge] ${currencyName} airtime purchase attempt ${attempt}/${maxRetries}`);
      
      const token = await authenticate();
      const agentReference = generateAgentReference(userId);
      console.log('📋 [HOTRECHARGE DEBUG] Agent Reference:', agentReference);

      // Format recipient: Remove non-digits, ensure local format (077...)
      const formattedRecipient = recipient.replace(/\D/g, '');
      const localRecipient = formattedRecipient.startsWith('263') 
        ? '0' + formattedRecipient.substring(3) 
        : formattedRecipient;
      
      // ? SIMPLE REQUEST BODY - No ProductCode needed for USD (Product ID 100)!
      const requestBody = {
        agentReference: agentReference,
        productId: finalProductId,
        target: localRecipient,
        amount: amount
      };

      // Add custom SMS if provided
      if (customSms) {
        requestBody.CustomerSMS = customSms;
      } else {
        const amountDisplay = currency === 'usd' 
          ? `$${amount.toFixed(2)} USD` 
          : `${amount.toFixed(2)} ZiG`;
        requestBody.CustomerSMS = `CCHub topped up your ${network} account with ${amountDisplay}. Thank you!`;
      }

      console.log('[HotRecharge] Request:', JSON.stringify({
        ...requestBody,
        target: '***' + requestBody.target.slice(-4)
      }, null, 2));

      const response = await axios.post(
        `${process.env.HOT_API_BASE_URL}/products/recharge`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const result = response.data;

      if (result.successful) {
        console.log(`✅ [HotRecharge] ${currencyName} airtime purchase successful:`, {
          rechargeId: result.rechargeId,
          amount: result.amount,
          newBalance: result.balance?.balance || 'N/A'
        });

        return {
          success: true,
          transactionId: result.rechargeId,
          amount: result.amount,
          discount: result.discount,
          balance: result.balance?.balance,
          currency: currencyName,
          currencySymbol: currencySymbol,
          message: result.message,
          recipient: localRecipient,
          network: network,
          productId: finalProductId,
          agentReference: agentReference,
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error(result.message || 'Transaction was not successful');
      }

    } catch (error) {
      console.log('❌ [HOTRECHARGE DEBUG] Attempt error:', error.message);
      
      if (error.response) {
        console.log('📡 [HOTRECHARGE DEBUG] Response data:', JSON.stringify(error.response.data, null, 2));
      }
      
      lastError = error;
      
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.log(`[HotRecharge] Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  return {
    success: false,
    error: `${currencyName} airtime purchase failed after ${maxRetries} attempts. Last error: ${lastError?.response?.data?.title || lastError?.message}`,
    agentReference: generateAgentReference(userId)
  };
}

// ==================== ZESA METHODS ====================

/**
 * Verify ZESA meter number and retrieve customer details
 * @param {string} meterNumber - ZESA prepaid meter number
 * @param {string} currency - 'ZiG' or 'USD'
 * @returns {Promise<Object>} Meter owner details
 */
async function verifyZesaMeter(meterNumber, currency = 'ZiG') {
    try {
        const token = await authenticate();
        
        // Use productId 24 for ZiG, 41 for USD
        const productId = currency === 'USD' ? 41 : 24;
        
        const response = await axios.get(
            `${process.env.HOT_API_BASE_URL}/query/customer/${productId}/${meterNumber}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return {
            success: true,
            customerName: response.data.customerName || response.data.accountName,
            address: response.data.address,
            status: 'Active',
            meterNumber: meterNumber
        };
    } catch (error) {
        console.error('ZESA verification failed:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Purchase ZESA prepaid token
 * @param {Object} params - Transaction parameters
 * @param {string} params.meterNumber - ZESA prepaid meter number
 * @param {number} params.amount - Amount in selected currency
 * @param {string} params.currency - 'ZiG' or 'USD'
 * @param {string} params.agentReference - Unique transaction reference
 * @param {string} params.userId - User identifier
 * @param {string} params.notifyNumber - Mobile number to notify
 * @returns {Promise<Object>} Token purchase result
 */
async function purchaseZesaToken({ 
    meterNumber, 
    amount, 
    currency = 'USD', 
    agentReference = null,
    userId = 'USER',
    notifyNumber = null
}) {
    const maxRetries = parseInt(process.env.HOT_MAX_RETRIES || '3');
    let lastError = null;

    const accountTypeId = currency.toUpperCase() === 'USD' ? 4 : 2;
    const productId = currency.toUpperCase() === 'USD' ? 41 : 24;
    const currencyName = currency.toUpperCase() === 'USD' ? 'USD' : 'ZiG';

    // Check balance
    const balanceCheck = await getBalance(accountTypeId);
    if (!balanceCheck.success) {
        console.warn(`[HotRecharge] Could not verify ${currencyName} balance`);
    } else if (balanceCheck.balance < amount) {
        return {
            success: false,
            error: `Insufficient ${currencyName} balance. Available: ${currencyName === 'USD' ? '$' : ''}${balanceCheck.balance.toFixed(2)}`
        };
    }

    const finalAgentReference = agentReference || generateAgentReference(userId);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[HotRecharge] Purchasing ZESA token (${currencyName}) attempt ${attempt}/${maxRetries}`);
            
            const token = await authenticate();
            const cleanMeter = meterNumber.replace(/\D/g, '');
            
            const requestBody = {
                agentReference: finalAgentReference,
                productId: productId,
                target: cleanMeter,
                amount: amount
            };

            if (notifyNumber) {
                const formattedNotify = notifyNumber.replace(/\D/g, '');
                const localNotify = formattedNotify.startsWith('263') 
                    ? '0' + formattedNotify.substring(3) 
                    : formattedNotify;
                requestBody.NotifyNumber = localNotify;
            }

            requestBody.CustomerSMS = `Your ZESA token purchase of ${currencyName === 'USD' ? '$' : ''}${amount.toFixed(2)} was successful. Thank you for using CCHub!`;

            const response = await axios.post(
                `${process.env.HOT_API_BASE_URL}/products/recharge`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const result = response.data;

            if (result.successful) {
                const token = result.token || result.voucher || result.voucherNumber || result.rechargeData;
                
                return {
                    success: true,
                    token: token,
                    units: result.units || Math.floor(amount * (currencyName === 'USD' ? 10 : 0.8)),
                    amount: amount,
                    currency: currencyName,
                    meterNumber: cleanMeter,
                    transactionId: result.rechargeId,
                    reference: result.agentReference || finalAgentReference,
                    balance: result.balance?.balance,
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new Error(result.message || 'Token purchase failed');
            }

        } catch (error) {
            lastError = error;
            console.error(`[HotRecharge] ZESA purchase attempt ${attempt} failed:`, error.message);
            
            if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt - 1) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    return {
        success: false,
        error: `ZESA token purchase failed after ${maxRetries} attempts.`,
        agentReference: finalAgentReference
    };
}

module.exports = {
  authenticate,
  getBalance,
  purchaseAirtime,
  isOnline,
  verifyZesaMeter,
  purchaseZesaToken,
  _generateAgentReference: generateAgentReference
};    try {
        console.log('🩺 [HOTRECHARGE DEBUG] Checking health via getBalance(3)...');
        await getBalance(3); // Check USD Airtime balance
        healthCache.isOnline = true;
        healthCache.lastCheck = Date.now();
        console.log('✅ [HOTRECHARGE DEBUG] Health check PASSED, API is ONLINE');
        return true;
    } catch (error) {
        console.log('❌ [HOTRECHARGE DEBUG] Health check FAILED, API is OFFLINE');
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
  console.log('🔐 [HOTRECHARGE DEBUG] authenticate() called');
  
  // Check if we have a valid cached token
  if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > Date.now()) {
    console.log('[HotRecharge] Using cached token');
    console.log('⏰ [HOTRECHARGE DEBUG] Token expires at:', new Date(tokenCache.expiresAt).toISOString());
    return tokenCache.token;
  }

  try {
    console.log('[HotRecharge] Authenticating...');
    console.log('🌐 [HOTRECHARGE DEBUG] API URL:', `${process.env.HOT_API_BASE_URL}/identity/login`);
    
    const response = await axios.post(
      `${process.env.HOT_API_BASE_URL}/identity/login`,
      {
        AccessCode: process.env.HOT_ACCESS_CODE,
        Password: process.env.HOT_PASSWORD
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout for auth
      }
    );

    console.log('📡 [HOTRECHARGE DEBUG] Auth response status:', response.status);
    console.log('📡 [HOTRECHARGE DEBUG] Auth response headers:', response.headers);

    const { token, refreshToken } = response.data;
    
    tokenCache = {
      token,
      refreshToken,
      expiresAt: Date.now() + (parseInt(process.env.HOT_TOKEN_EXPIRY || '300') * 1000)
    };

    console.log('[HotRecharge] Authentication successful');
    console.log('⏰ [HOTRECHARGE DEBUG] Token expires at:', new Date(tokenCache.expiresAt).toISOString());
    return token;
    
  } catch (error) {
    console.log('❌ [HOTRECHARGE DEBUG] ========== AUTH ERROR ==========');
    console.log('❌ [HOTRECHARGE DEBUG] Error type:', error.constructor.name);
    console.log('❌ [HOTRECHARGE DEBUG] Error message:', error.message);
    console.log('❌ [HOTRECHARGE DEBUG] Error code:', error.code);
    
    if (error.response) {
      console.log('❌ [HOTRECHARGE DEBUG] Response status:', error.response.status);
      console.log('❌ [HOTRECHARGE DEBUG] Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('❌ [HOTRECHARGE DEBUG] No response received from server');
      console.log('❌ [HOTRECHARGE DEBUG] Request details:', error.request._currentUrl || error.request.path);
    }
    console.log('❌ [HOTRECHARGE DEBUG] ================================');
    
    console.error('[HotRecharge] Authentication failed:', error.response?.data || error.message);
    throw new Error(`HotRecharge authentication failed: ${error.response?.data?.title || error.message}`);
  }
}

/**
 * Get account balance
 * @param {number} accountTypeId - Account type ID 
 *   1 = ZiG Airtime
 *   2 = ZiG ZESA (Utility ZWG)
 *   3 = USD Airtime
 *   4 = USD ZESA
 * @returns {Promise<Object>} Account balance
 */
async function getBalance(accountTypeId = 1) {
  console.log(`💰 [HOTRECHARGE DEBUG] getBalance() called for accountTypeId: ${accountTypeId}`);
  
  try {
    const token = await authenticate();
    console.log('🔄 [HOTRECHARGE DEBUG] Got token, fetching balance...');
    
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

    console.log('📡 [HOTRECHARGE DEBUG] Balance response status:', response.status);
    console.log('[HotRecharge] Balance response:', response.data);

    let balance = 0;
    let currency = accountTypeId === 1 || accountTypeId === 2 ? 'ZiG' : 'USD';
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      balance = response.data[0].balance || 0;
      currency = response.data[0].name || currency;
    } else if (typeof response.data === 'number') {
      balance = response.data;
    } else if (response.data.balance) {
      balance = response.data.balance;
    }

    console.log(`💵 [HOTRECHARGE DEBUG] Parsed balance: ${balance} ${currency}`);

    return {
      success: true,
      balance: balance,
      currency: currency,
      accountTypeId: accountTypeId
    };
  } catch (error) {
    console.log('❌ [HOTRECHARGE DEBUG] ========== BALANCE ERROR ==========');
    console.log('❌ [HOTRECHARGE DEBUG] Error type:', error.constructor.name);
    console.log('❌ [HOTRECHARGE DEBUG] Error message:', error.message);
    
    if (error.response) {
      console.log('❌ [HOTRECHARGE DEBUG] Response status:', error.response.status);
      console.log('❌ [HOTRECHARGE DEBUG] Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('❌ [HOTRECHARGE DEBUG] No response received from server');
    }
    console.log('❌ [HOTRECHARGE DEBUG] ====================================');
    
    console.error('[HotRecharge] Failed to fetch balance:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.title || error.message
    };
  }
}

/**
 * Get product details by ID
 * @param {number} productId - Product ID
 * @returns {Promise<Object>} Product details
 */
async function getProductDetails(productId) {
  console.log(`📦 [HOTRECHARGE DEBUG] getProductDetails() called for productId: ${productId}`);
  
  try {
    const token = await authenticate();
    
    const response = await axios.get(
      `${process.env.HOT_API_BASE_URL}/products/${productId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return {
      success: true,
      product: response.data
    };
  } catch (error) {
    console.error('[HotRecharge] Failed to fetch product:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.title || error.message
    };
  }
}

/**
 * Get available NetOne USD denominations from HotRecharge
 * @param {number} productId - 35 for bundles, 102 for simple airtime
 * @returns {Promise<Object>} Available denominations with their ProductCodes
 */
    async function getNetOneDenominations(productId = 35) { // Default to 35 now
        console.log(`📦 [HOTRECHARGE DEBUG] Fetching NetOne USD denominations for productId: ${productId}`);
        
        try {
            const token = await authenticate();
            
            const response = await axios.get(
                `${process.env.HOT_API_BASE_URL}/products/${productId}/stock`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            console.log(`📡 [HOTRECHARGE DEBUG] Stock response status: ${response.status}`);
            console.log(`📦 [HOTRECHARGE DEBUG] Stock data:`, JSON.stringify(response.data, null, 2));
            
            // Parse available denominations
            const denominations = {};
            response.data.forEach(item => {
                // Extract amount from price
                const amount = parseFloat(item.price);
                denominations[amount] = item.productCode;
                console.log(`📦 [HOTRECHARGE DEBUG] Found: $${amount} -> ${item.productCode}`);
            });

            return {
                success: true,
                denominations: denominations,
                rawData: response.data
            };
            
        } catch (error) {
            console.error(`❌ Failed to fetch NetOne denominations for product ${productId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

/**
 * Get available NetOne USD bundles (alternative product)
 * @param {number} productId - 35 for bundles
 * @returns {Promise<Object>} Available product codes
 */
async function getNetOneBundles(productId = 35) {
    console.log(`📦 [HOTRECHARGE DEBUG] getNetOneBundles() called for productId: ${productId}`);
    
    try {
        const token = await authenticate();
        
        const response = await axios.get(
            `${process.env.HOT_API_BASE_URL}/products/${productId}/stock`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        // Parse available bundles from response
        const bundles = response.data.map(item => ({
            code: item.productCode,
            name: item.name,
            price: item.price,
            description: item.description
        }));

        return {
            success: true,
            bundles: bundles
        };
    } catch (error) {
        console.error('[HotRecharge] Failed to fetch NetOne bundles:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.title || error.message
        };
    }
}

/**
 * Generate agent reference for transaction tracking
 * Format: CCHUB-MAIN-01-01-{userId}-{timestamp}-{random}
 */
function generateAgentReference(userId = 'USER') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CCHUB-MAIN-01-01-${userId}-${timestamp}-${random}`;
}

/**
 * Purchase airtime via HotRecharge - SUPPORTS BOTH ZIG AND USD
 * @param {Object} params - Transaction parameters
 * @param {string} params.recipient - Recipient phone number
 * @param {number} params.amount - Amount in selected currency
 * @param {string} params.network - Network name (Econet/NetOne/Telecel)
 * @param {string} params.currency - Currency ('zig' or 'usd')
 * @param {number} params.productId - Product ID (overrides network mapping)
 * @param {string} params.userId - User identifier
 * @param {string} params.customSms - Optional custom SMS
 * @returns {Promise<Object>} Transaction result
 */
async function purchaseAirtime({ 
  recipient, 
  amount, 
  network, 
  currency = 'usd', 
  productId = null,
  userId = 'USER', 
  customSms = null 
}) {
  console.log('🎯 [HOTRECHARGE DEBUG] ==================== START purchaseAirtime ====================');
  console.log('📝 [HOTRECHARGE DEBUG] Parameters:', JSON.stringify({
    recipient: recipient ? '***' + recipient.slice(-4) : 'N/A',
    amount,
    network,
    currency,
    productId,
    userId,
    customSms: customSms ? 'provided' : 'none'
  }, null, 2));

  const maxRetries = parseInt(process.env.HOT_MAX_RETRIES || '3');
  let lastError = null;

  // Set account type based on currency
  const accountTypeId = currency === 'usd' ? 3 : 1;
  const currencySymbol = currency === 'usd' ? '$' : 'ZiG';
  const currencyName = currency === 'usd' ? 'USD' : 'ZiG';

  console.log(`💰 [HOTRECHARGE DEBUG] AccountTypeId: ${accountTypeId}, Currency: ${currencyName}`);

  // Check appropriate balance
  console.log('💰 [HOTRECHARGE DEBUG] Checking balance...');
  const balanceCheck = await getBalance(accountTypeId);
  console.log('💰 [HOTRECHARGE DEBUG] Balance check result:', balanceCheck);
  
  if (!balanceCheck.success) {
    console.warn(`[HotRecharge] Could not verify ${currencyName} balance, proceeding anyway`);
  } else if (balanceCheck.balance < amount) {
    console.log(`❌ [HOTRECHARGE DEBUG] INSUFFICIENT BALANCE: Available ${balanceCheck.balance}, Required ${amount}`);
    return {
      success: false,
      error: `Insufficient ${currencyName} balance. Available: ${currency === 'usd' ? '$' : ''}${balanceCheck.balance.toFixed(2)} ${currency === 'usd' ? '' : 'ZiG'}, Required: ${currency === 'usd' ? '$' : ''}${amount.toFixed(2)} ${currency === 'usd' ? '' : 'ZiG'}`
    };
  }

  // ? DETERMINE PRODUCT ID
  let finalProductId = productId;
  
  // Product ID mapping
  const productMap = {
    usd: {
      'Econet': 3,
      'NetOne': 102,     // Simple airtime - REQUIRES ProductCode!
      'Telecel': 11
    },
    zig: {
      'Econet': 7,
      'NetOne': 102,     // Simple airtime - REQUIRES ProductCode for NetOne!
      'Telecel': 6
    }
  };

  // Get base product ID
  finalProductId = productId || productMap[currency]?.[network];
  console.log(`📦 [HOTRECHARGE DEBUG] Product ID mapping:`, productMap[currency]);
  console.log(`📦 [HOTRECHARGE DEBUG] Selected productId: ${finalProductId}`);
  
  if (!finalProductId) {
    console.log(`❌ [HOTRECHARGE DEBUG] ERROR: No product ID found for ${network} in ${currencyName}`);
    return {
      success: false,
      error: `No product ID found for ${network} in ${currencyName}`
    };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔄 [HOTRECHARGE DEBUG] ========== ATTEMPT ${attempt}/${maxRetries} ==========`);
    
    try {
      console.log(`[HotRecharge] ${currencyName} airtime purchase attempt ${attempt}/${maxRetries}`);
      
      console.log('🔐 [HOTRECHARGE DEBUG] Getting auth token...');
      const token = await authenticate();
      console.log('✅ [HOTRECHARGE DEBUG] Got token, generating agent reference...');
      
      const agentReference = generateAgentReference(userId);
      console.log('📋 [HOTRECHARGE DEBUG] Agent Reference:', agentReference);

      // Format recipient: Remove non-digits, ensure local format (077...)
      const formattedRecipient = recipient.replace(/\D/g, '');
      const localRecipient = formattedRecipient.startsWith('263') 
        ? '0' + formattedRecipient.substring(3) 
        : formattedRecipient;
      
      console.log('📞 [HOTRECHARGE DEBUG] Formatted recipient:', '***' + localRecipient.slice(-4));
      
      // ? BUILD REQUEST BODY
      const requestBody = {
        agentReference: agentReference,
        productId: finalProductId,
        target: localRecipient,
        amount: amount
      };

      // ? ADD PRODUCT CODE FOR NETONE USD - USING HARDCODED DENOMINATIONS
      if (network === 'NetOne' && currency === 'usd') {
          // Hardcoded denominations that we know work
          const netoneDenominations = {
              0.5: "NET_AIRTIME_050",
              1: "NET_AIRTIME_100",
              2: "NET_AIRTIME_200",
              5: "NET_AIRTIME_500",
              10: "NET_AIRTIME_1000"
          };
          
          // Convert amount to number (handle both string and number inputs)
          const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
          
          // Check if the amount is supported (with tolerance for floating point)
          let matchedAmount = null;
          for (const [denom, code] of Object.entries(netoneDenominations)) {
              if (Math.abs(numericAmount - parseFloat(denom)) < 0.01) {
                  matchedAmount = denom;
                  requestBody.productCode = code;
                  break;
              }
          }
          
          if (requestBody.productCode) {
              console.log(`✅ [HOTRECHARGE DEBUG] Using hardcoded product code: ${requestBody.productCode} for amount $${numericAmount}`);
          } else {
              console.log(`❌ [HOTRECHARGE DEBUG] Amount $${numericAmount} not supported for NetOne USD`);
              return {
                  success: false,
                  error: `Amount $${numericAmount.toFixed(2)} not supported for NetOne USD. Supported amounts: 0.5, 1, 2, 5, 10`
              };
          }
      }

      // Add custom SMS if provided
      if (customSms) {
        requestBody.CustomerSMS = customSms;
        console.log('📱 [HOTRECHARGE DEBUG] Using custom SMS');
      } else {
        const amountDisplay = currency === 'usd' 
          ? `$${amount.toFixed(2)} USD` 
          : `${amount.toFixed(2)} ZiG`;
        requestBody.CustomerSMS = `CCHub topped up your ${network} account with ${amountDisplay}. Thank you!`;
        console.log('📱 [HOTRECHARGE DEBUG] Using default SMS');
      }

      console.log('[HotRecharge] Request:', JSON.stringify({
        ...requestBody,
        target: '***' + requestBody.target.slice(-4),
        ProductCode: requestBody.ProductCode ? '***' : undefined
      }, null, 2));
      console.log('🌐 [HOTRECHARGE DEBUG] Making API call to:', `${process.env.HOT_API_BASE_URL}/products/recharge`);
      console.log('⏰ [HOTRECHARGE DEBUG] Request timestamp:', new Date().toISOString());

      const response = await axios.post(
        `${process.env.HOT_API_BASE_URL}/products/recharge`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      console.log('📡 [HOTRECHARGE DEBUG] Response received at:', new Date().toISOString());
      console.log('📡 [HOTRECHARGE DEBUG] Response status:', response.status);
      console.log('📡 [HOTRECHARGE DEBUG] Response headers:', response.headers);

      const result = response.data;
      console.log('[HotRecharge] Response:', JSON.stringify(result, null, 2));

      if (result.successful) {
        console.log(`✅ [HotRecharge] ${currencyName} airtime purchase successful:`, {
          rechargeId: result.rechargeId,
          amount: result.amount,
          discount: result.discount,
          newBalance: result.balance?.balance || 'N/A'
        });

        console.log('✅ [HOTRECHARGE DEBUG] ==================== SUCCESS ====================');
        
        return {
          success: true,
          transactionId: result.rechargeId,
          amount: result.amount,
          discount: result.discount,
          balance: result.balance?.balance,
          currency: currencyName,
          currencySymbol: currencySymbol,
          message: result.message,
          recipient: localRecipient,
          network: network,
          productId: finalProductId,
          productCode: requestBody.ProductCode,
          agentReference: agentReference,
          timestamp: new Date().toISOString()
        };
      } else {
        console.log('❌ [HOTRECHARGE DEBUG] Transaction not successful according to result.successful flag');
        throw new Error(result.message || 'Transaction was not successful');
      }

    } catch (error) {
      console.log('❌ [HOTRECHARGE DEBUG] ========== ATTEMPT ERROR ==========');
      console.log('❌ [HOTRECHARGE DEBUG] Error type:', error.constructor.name);
      console.log('❌ [HOTRECHARGE DEBUG] Error message:', error.message);
      console.log('❌ [HOTRECHARGE DEBUG] Error code:', error.code);
      
      if (error.code === 'ECONNABORTED') {
        console.log('⏰ [HOTRECHARGE DEBUG] Request timed out after 30 seconds');
      } else if (error.response) {
        console.log('📡 [HOTRECHARGE DEBUG] Response status:', error.response.status);
        console.log('📡 [HOTRECHARGE DEBUG] Response data:', JSON.stringify(error.response.data, null, 2));
        console.log('📡 [HOTRECHARGE DEBUG] Response headers:', error.response.headers);
      } else if (error.request) {
        console.log('📡 [HOTRECHARGE DEBUG] No response received from server');
        console.log('📡 [HOTRECHARGE DEBUG] Request details:', error.request._currentUrl || error.request.path);
      }
      
      console.log('❌ [HOTRECHARGE DEBUG] ====================================');
      
      lastError = error;
      console.error(`[HotRecharge] Attempt ${attempt} failed:`, error.response?.data || error.message);
      
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.log(`[HotRecharge] Retrying in ${waitTime}ms...`);
        console.log(`⏰ [HOTRECHARGE DEBUG] Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  console.log('❌ [HOTRECHARGE DEBUG] ========== ALL ATTEMPTS FAILED ==========');
  console.log('❌ [HOTRECHARGE DEBUG] Final error:', lastError?.response?.data?.title || lastError?.message);
  
  return {
    success: false,
    error: `${currencyName} airtime purchase failed after ${maxRetries} attempts. Last error: ${lastError?.response?.data?.title || lastError?.message}`,
    agentReference: generateAgentReference(userId)
  };
}

/**
 * Check transaction status by Agent Reference
 * @param {string} agentReference - The agent reference used in the transaction
 * @returns {Promise<Object>} Transaction status
 */
async function checkTransactionStatus(agentReference) {
  try {
    const token = await authenticate();
    
    const response = await axios.get(
      `${process.env.HOT_API_BASE_URL}/query/transaction/${agentReference}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      transaction: response.data
    };
  } catch (error) {
    console.error('[HotRecharge] Failed to check transaction:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.title || error.message
    };
  }
}

// ==================== ZESA METHODS ====================

/**
 * Verify ZESA meter number and retrieve customer details
 * @param {string} meterNumber - ZESA prepaid meter number
 * @param {string} currency - 'ZiG' or 'USD'
 * @returns {Promise<Object>} Meter owner details
 */
async function verifyZesaMeter(meterNumber, currency = 'ZiG') {
    try {
        const token = await authenticate();
        
        // Use productId 24 for ZiG, 41 for USD
        const productId = currency === 'USD' ? 41 : 24;
        
        const response = await axios.get(
            `${process.env.HOT_API_BASE_URL}/query/customer/${productId}/${meterNumber}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return {
            success: true,
            customerName: response.data.customerName || response.data.accountName,
            address: response.data.address,
            status: 'Active',
            meterNumber: meterNumber
        };
    } catch (error) {
        console.error('ZESA verification failed:', error.response?.data || error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Purchase ZESA prepaid token
 * @param {Object} params - Transaction parameters
 * @param {string} params.meterNumber - ZESA prepaid meter number
 * @param {number} params.amount - Amount in selected currency
 * @param {string} params.currency - 'ZiG' or 'USD'
 * @param {string} params.agentReference - Unique transaction reference
 * @param {string} params.userId - User identifier for reconciliation
 * @param {string} params.notifyNumber - Mobile number to notify
 * @returns {Promise<Object>} Token purchase result
 */
async function purchaseZesaToken({ 
    meterNumber, 
    amount, 
    currency = 'USD', 
    agentReference = null,
    userId = 'USER',
    notifyNumber = null
}) {
    const maxRetries = parseInt(process.env.HOT_MAX_RETRIES || '3');
    let lastError = null;

    // Set account type and product ID based on currency
    const accountTypeId = currency.toUpperCase() === 'USD' ? 4 : 2;  // USD = 4, ZiG = 2
    const productId = currency.toUpperCase() === 'USD' ? 41 : 24;    // USD = 41, ZiG = 24
    const currencyName = currency.toUpperCase() === 'USD' ? 'USD' : 'ZiG';

    // Check balance before purchase
    const balanceCheck = await getBalance(accountTypeId);
    if (!balanceCheck.success) {
        console.warn(`[HotRecharge] Could not verify ${currencyName} balance, proceeding anyway`);
    } else if (balanceCheck.balance < amount) {
        return {
            success: false,
            error: `Insufficient ${currencyName} balance. Available: ${currencyName === 'USD' ? '$' : ''}${balanceCheck.balance.toFixed(2)} ${currencyName === 'USD' ? '' : 'ZiG'}, Required: ${currencyName === 'USD' ? '$' : ''}${amount.toFixed(2)} ${currencyName === 'USD' ? '' : 'ZiG'}`
        };
    }

    // Generate agent reference if not provided
    const finalAgentReference = agentReference || generateAgentReference(userId);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[HotRecharge] Purchasing ZESA token (${currencyName}) attempt ${attempt}/${maxRetries}`);
            
            const token = await authenticate();
            
            // Clean meter number - remove spaces, ensure digits only
            const cleanMeter = meterNumber.replace(/\D/g, '');
            
            // Build request body
            const requestBody = {
                agentReference: finalAgentReference,
                productId: productId,
                target: cleanMeter,
                amount: amount
            };

            // Add NotifyNumber if provided (required for ZESA)
            if (notifyNumber) {
                const formattedNotify = notifyNumber.replace(/\D/g, '');
                const localNotify = formattedNotify.startsWith('263') 
                    ? '0' + formattedNotify.substring(3) 
                    : formattedNotify;
                requestBody.NotifyNumber = localNotify;
            }

            // Add customer SMS
            requestBody.CustomerSMS = `Your ZESA token purchase of ${currencyName === 'USD' ? '$' : ''}${amount.toFixed(2)} ${currencyName === 'USD' ? '' : 'ZiG'} was successful. Thank you for using CCHub!`;

            console.log('[HotRecharge] ZESA purchase request:', {
                ...requestBody,
                target: '***' + requestBody.target.slice(-4),
                NotifyNumber: requestBody.NotifyNumber ? '***' + requestBody.NotifyNumber.slice(-4) : undefined
            });

            const response = await axios.post(
                `${process.env.HOT_API_BASE_URL}/products/recharge`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const result = response.data;

            if (result.successful) {
                // Extract token from response
                const token = result.token || result.voucher || result.voucherNumber || result.rechargeData;
                
                console.log(`✅ [HotRecharge] ZESA token purchase successful:`, {
                    meter: '***' + cleanMeter.slice(-4),
                    token: token ? token.substring(0, 5) + '...' : 'N/A',
                    newBalance: result.balance?.balance || 'N/A'
                });

                return {
                    success: true,
                    token: token,
                    units: result.units || Math.floor(amount * (currencyName === 'USD' ? 10 : 0.8)),
                    amount: amount,
                    currency: currencyName,
                    meterNumber: cleanMeter,
                    transactionId: result.rechargeId,
                    reference: result.agentReference || finalAgentReference,
                    balance: result.balance?.balance,
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new Error(result.message || 'Token purchase failed');
            }

        } catch (error) {
            lastError = error;
            console.error(`[HotRecharge] ZESA purchase attempt ${attempt} failed:`, 
                error.response?.data || error.message);
            
            if (attempt < maxRetries) {
                const waitTime = Math.pow(2, attempt - 1) * 1000;
                console.log(`[HotRecharge] Retrying in ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    return {
        success: false,
        error: `ZESA token purchase failed after ${maxRetries} attempts. Last error: ${lastError?.response?.data?.title || lastError?.message}`,
        agentReference: finalAgentReference
    };
}

/**
 * Check ZESA token purchase status
 * @param {string} agentReference - The agent reference used in the transaction
 * @returns {Promise<Object>} Transaction status
 */
async function checkZesaTransactionStatus(agentReference) {
    try {
        const token = await authenticate();
        
        const response = await axios.get(
            `${process.env.HOT_API_BASE_URL}/query/transaction/${agentReference}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return {
            success: true,
            transaction: response.data
        };
    } catch (error) {
        console.error('[HotRecharge] Failed to check ZESA transaction:', error.response?.data || error.message);
        return {
            success: false,
            error: error.response?.data?.title || error.message
        };
    }
}

/**
 * Get all available products (for debugging)
 * @returns {Promise<Object>} All products from HotRecharge
 */
async function getAllProducts() {
    console.log('📋 [HOTRECHARGE DEBUG] ========== FETCHING ALL PRODUCTS ==========');
    
    try {
        const token = await authenticate();
        
        const response = await axios.get(
            `${process.env.HOT_API_BASE_URL}/products/0`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        console.log('📡 [HOTRECHARGE DEBUG] Products response status:', response.status);
        
        const products = response.data.products || [];
        console.log(`📋 [HOTRECHARGE DEBUG] Total products: ${products.length}`);
        
        // Filter for NetOne USD products only
        const netoneUsdProducts = products.filter(p => 
            p.name && p.name.toLowerCase().includes('netone') && 
            p.name.toLowerCase().includes('usd')
        );
        
        console.log('\n🎯 [HOTRECHARGE DEBUG] ===== NETONE USD PRODUCTS =====');
        netoneUsdProducts.forEach(product => {
            console.log(JSON.stringify({
                productId: product.productId,
                name: product.name.trim(),
                accountTypeId: product.accountTypeId,
                requiredOptions: product.requiredOptions || [],
                minimumRecharge: product.metaData?.MinimumRecharge || 'N/A',
                maxRecharge: product.metaData?.MaxRecharge || 'N/A',
                currency: product.metaData?.Currency || 'N/A',
                network: product.metaData?.Network || 'N/A'
            }, null, 2));
        });
        
        console.log('📋 [HOTRECHARGE DEBUG] ========== PRODUCT FETCH COMPLETE ==========\n');
        
        return {
            success: true,
            products: products,
            netoneUsd: netoneUsdProducts
        };
        
    } catch (error) {
        console.log('❌ [HOTRECHARGE DEBUG] ========== PRODUCT FETCH ERROR ==========');
        console.log('❌ Error type:', error.constructor.name);
        console.log('❌ Error message:', error.message);
        
        if (error.response) {
            console.log('📡 Response status:', error.response.status);
            console.log('📡 Response data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.log('📡 No response received from server');
        }
        console.log('❌ ================================================\n');
        
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
  authenticate,
  getBalance,
  getProductDetails,
  getNetOneDenominations,
  getNetOneBundles,
  purchaseAirtime,
  checkTransactionStatus,
  isOnline,
  verifyZesaMeter,
  purchaseZesaToken,
  checkZesaTransactionStatus,
  getAllProducts,
  _generateAgentReference: generateAgentReference
};
