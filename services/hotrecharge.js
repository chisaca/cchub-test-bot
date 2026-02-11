// services/hotrecharge.js
// HotRecharge V3 API Integration
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

/**
 * Authenticate with HotRecharge API
 * @returns {Promise<string>} Bearer token
 */
async function authenticate() {
  // Check if we have a valid cached token
  if (tokenCache.token && tokenCache.expiresAt && tokenCache.expiresAt > Date.now()) {
    console.log('[HotRecharge] Using cached token');
    return tokenCache.token;
  }

  try {
    console.log('[HotRecharge] Authenticating...');
    
    // ✅ CORRECT: /identity/login endpoint
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
/**
 * Get account balance
 * @param {number} accountTypeId - Account type ID (1 = ZiG, 2 = USD)
 * @returns {Promise<Object>} Account balance
 */
async function getBalance(accountTypeId = 1) {
  try {
    const token = await authenticate();
    
    // ✅ CORRECT: /account/balance/{AccountTypeId}
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

    // Handle different response structures
    let balance = 0;
    let currency = 'ZiG';
    
    if (typeof response.data === 'number') {
      balance = response.data;
    } else if (response.data.balance) {
      balance = response.data.balance;
    } else if (response.data.amount) {
      balance = response.data.amount;
    }

    return {
      success: true,
      balance: balance,
      currency: response.data.currency || currency,
      accountTypeId: accountTypeId,
      accountType: response.data.accountType,
      raw: response.data // For debugging
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
 * @param {number} productId - Product ID (100 = Econet, 101 = NetOne, 102 = Telecel)
 * @returns {Promise<Object>} Product details
 */
async function getProductDetails(productId) {
  try {
    const token = await authenticate();
    
    // ✅ CORRECT: /products/{ProductId}
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
 * Format: CCHUB-DIV1-SHOP1-TILL1-USER-{timestamp}-{random}
 */
function generateAgentReference(userId = 'USER') {
  const timestamp = Date.now();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CCHUB-MAIN-01-01-${userId}-${timestamp}-${random}`;
}

/**
 * Get product ID for network
 * @param {string} network - Econet, NetOne, Telecel
 * @returns {number} Product ID
 */
function getProductIdForNetwork(network) {
  const productMap = {
    'Econet': 101,
    'NetOne': 102,
    'Telecel': 103,
    'default': 101
  };
  return productMap[network] || productMap.default;
}

/**
 * Purchase airtime via HotRecharge
 * @param {Object} params - Transaction parameters
 * @param {string} params.recipient - Recipient phone number (Zim format: 077...)
 * @param {number} params.amount - Amount in ZiG
 * @param {string} params.network - Network name (Econet/NetOne/Telecel)
 * @param {string} params.userId - User identifier for agent reference
 * @param {string} params.customSms - Optional custom SMS template
 * @returns {Promise<Object>} Transaction result
 */
/**
 * Purchase airtime via HotRecharge (USD)
 * @param {Object} params - Transaction parameters
 * @param {string} params.recipient - Recipient phone number (Zim format: 077...)
 * @param {number} params.amount - Amount in USD (e.g., 1.00 for $1)
 * @param {string} params.network - Network name (Econet/NetOne/Telecel)
 * @param {string} params.userId - User identifier for agent reference
 * @param {string} params.customSms - Optional custom SMS template
 * @returns {Promise<Object>} Transaction result
 */
async function purchaseAirtime({ recipient, amount, network, userId = 'USER', customSms = null }) {
  const maxRetries = parseInt(process.env.HOT_MAX_RETRIES || '3');
  let lastError = null;

  // Check USD balance (AccountTypeId = 2 for USD)
  const balanceCheck = await getBalance(2);
  if (!balanceCheck.success) {
    console.warn('[HotRecharge] Could not verify USD balance, proceeding anyway');
  } else if (balanceCheck.balance < amount) {
    return {
      success: false,
      error: `Insufficient USD balance. Available: $${balanceCheck.balance.toFixed(2)}, Required: $${amount.toFixed(2)}`
    };
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[HotRecharge] Airtime purchase attempt ${attempt}/${maxRetries}`);
      
      const token = await authenticate();
      const agentReference = generateAgentReference(userId);
      
      // ✅ USD PRODUCT IDS
      const productMap = {
        'Econet': 101,   // Econet USD Airtime
        'NetOne': 102,   // NetOne USD Airtime
        'Telecel': 103,  // Telecel USD Airtime
        'default': 101
      };
      const productId = productMap[network] || productMap.default;

      // Format recipient: Remove non-digits, ensure local format (077...)
      const formattedRecipient = recipient.replace(/\D/g, '');
      const localRecipient = formattedRecipient.startsWith('263') 
        ? '0' + formattedRecipient.substring(3) 
        : formattedRecipient;
      
      const requestBody = {
        agentReference: agentReference,
        productId: productId,
        target: localRecipient,
        amount: amount
      };

      if (customSms) {
        requestBody.CustomerSMS = customSms;
      } else {
        requestBody.CustomerSMS = `CCHub topped up your ${network} account with $${amount.toFixed(2)} USD. Thank you!`;
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
        console.log(`[HotRecharge] Airtime purchase successful:`, {
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
          currency: 'USD',
          message: result.message,
          recipient: localRecipient,
          network: network,
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
    error: `USD airtime purchase failed after ${maxRetries} attempts. Last error: ${lastError?.response?.data?.title || lastError?.message}`,
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
    
    // ✅ CORRECT: /query/transaction/{AgentReference}
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
  _generateAgentReference: generateAgentReference,
  _getProductIdForNetwork: getProductIdForNetwork
};