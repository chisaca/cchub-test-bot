// services/hotrecharge.js - ZIG/USD DUAL CURRENCY SUPPORT
// Base URL: https://ssl.hot.co.zw/api/v3
// Auth: POST /identity/login
// Balance: GET /account/balance/{AccountTypeId}
// Products: GET /products/{ProductId}
// Recharge: POST /products/recharge
// Status: GET /query/transaction/{AgentReference}

require('dotenv').config();

const axios = require('axios');
const crypto = require('crypto');

// Cache for bearer token
let tokenCache = {
  token: null,
  refreshToken: null,
  expiresAt: null
};

// Add at top with other caches
let healthCache = {
    isOnline: null,
    lastCheck: null,
    checkInterval: 2000 // 2 seconds
};

/**
 * Check if HotRecharge API is online
 */
async function isOnline() {
    // Return cached result if checked within last minute
    if (healthCache.lastCheck && 
        (Date.now() - healthCache.lastCheck) < healthCache.checkInterval) {
        return healthCache.isOnline;
    }
    
    try {
        await getBalance(2); // Quick endpoint test
        healthCache.isOnline = true;
        healthCache.lastCheck = Date.now();
        return true;
    } catch {
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
        headers: {
          'Content-Type': 'application/json'
        }
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
 * @param {number} accountTypeId - Account type ID (1 = ZiG, 2 = USD)
 * @returns {Promise<Object>} Account balance
 */
async function getBalance(accountTypeId = 1) {
  try {
    const token = await authenticate();
    
    const response = await axios.get(
      `${process.env.HOT_API_BASE_URL}/account/balance/${accountTypeId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[HotRecharge] Balance response:', response.data);

    let balance = 0;
    let currency = accountTypeId === 1 ? 'ZiG' : 'USD';
    
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
 * Get product details by ID
 * @param {number} productId - Product ID
 * @returns {Promise<Object>} Product details
 */
async function getProductDetails(productId) {
  try {
    const token = await authenticate();
    
    const response = await axios.get(
      `${process.env.HOT_API_BASE_URL}/products/${productId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
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
  const maxRetries = parseInt(process.env.HOT_MAX_RETRIES || '3');
  let lastError = null;

  // Set account type based on currency
  const accountTypeId = currency === 'usd' ? 2 : 1;
  const currencySymbol = currency === 'usd' ? '$' : 'ZiG';
  const currencyName = currency === 'usd' ? 'USD' : 'ZiG';

  // Check appropriate balance
  const balanceCheck = await getBalance(accountTypeId);
  if (!balanceCheck.success) {
    console.warn(`[HotRecharge] Could not verify ${currencyName} balance, proceeding anyway`);
  } else if (balanceCheck.balance < amount) {
    return {
      success: false,
      error: `Insufficient ${currencyName} balance. Available: ${currency === 'usd' ? '$' : ''}${balanceCheck.balance.toFixed(2)} ${currency === 'usd' ? '' : 'ZiG'}, Required: ${currency === 'usd' ? '$' : ''}${amount.toFixed(2)} ${currency === 'usd' ? '' : 'ZiG'}`
    };
  }

  // Product ID mapping (fallback if not provided)
  const productMap = {
    usd: {
      'Econet': 101,
      'NetOne': 102,
      'Telecel': 103
    },
    zig: {
      'Econet': 7,
      'NetOne': 102,  // NetOne USD works with ZiG balance
      'Telecel': 6
    }
  };

  // Use provided productId or get from map
  const finalProductId = productId || productMap[currency]?.[network] || productMap.usd.default || 101;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[HotRecharge] ${currencyName} airtime purchase attempt ${attempt}/${maxRetries}`);
      
      const token = await authenticate();
      const agentReference = generateAgentReference(userId);

      // Format recipient: Remove non-digits, ensure local format (077...)
      const formattedRecipient = recipient.replace(/\D/g, '');
      const localRecipient = formattedRecipient.startsWith('263') 
        ? '0' + formattedRecipient.substring(3) 
        : formattedRecipient;
      
      const requestBody = {
        agentReference: agentReference,
        productId: finalProductId,
        target: localRecipient,
        amount: amount
      };

      if (customSms) {
        requestBody.CustomerSMS = customSms;
      } else {
        const amountDisplay = currency === 'usd' 
          ? `$${amount.toFixed(2)} USD` 
          : `${amount.toFixed(2)} ZiG`;
        requestBody.CustomerSMS = `CCHub topped up your ${network} account with ${amountDisplay}. Thank you!`;
      }

      console.log('[HotRecharge] Request:', requestBody);

      const response = await axios.post(
        `${process.env.HOT_API_BASE_URL}/products/recharge`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data;

      if (result.successful) {
        console.log(`[HotRecharge] ${currencyName} airtime purchase successful:`, {
          rechargeId: result.rechargeId,
          amount: result.amount,
          discount: result.discount,
          newBalance: result.balance.balance
        });

        return {
          success: true,
          transactionId: result.rechargeId,
          amount: result.amount,
          discount: result.discount,
          balance: result.balance.balance,
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
        throw new Error('Transaction was not successful');
      }

    } catch (error) {
      lastError = error;
      console.error(`[HotRecharge] Attempt ${attempt} failed:`, error.response?.data || error.message);
      
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

module.exports = {
  authenticate,
  getBalance,
  getProductDetails,
  purchaseAirtime,
  checkTransactionStatus,
  isOnline, 
  _generateAgentReference: generateAgentReference
};