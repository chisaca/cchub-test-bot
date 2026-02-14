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
};
