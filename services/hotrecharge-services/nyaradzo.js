// services/hotrecharge-services/nyaradzo.js
// ============================================================================
// HOTRECHARGE NYARADZO SERVICE
// Handles actual HotRecharge API calls for Nyaradzo funeral policy payments
// Product ID: 15, AccountTypeId: 2 (ZiG)
// Amount range: 10 - 10,000,000 ZiG
// 
// Dependencies: Requires initialization with shared HotRecharge functions
// ============================================================================

const constants = require('../../config/constants');
const axios = require('axios');
const Joi = require('joi');

// ============================================================================
// DEPENDENCY INJECTION
// Shared functions from main hotrecharge.js - set via init()
// ============================================================================
let authenticate = null;           // Token authentication function
let getBalance = null;             // Balance check function
let generateAgentReference = null; // Reference generator function

// ============================================================================
// VALIDATION SCHEMAS
// Using Joi for robust input validation
// ============================================================================
const policySchema = Joi.string().pattern(/^\d{8}$/).required();
const amountSchema = Joi.number()
    .min(constants.PAYMENT_CONFIG.MIN_AMOUNTS.NYARADZO)
    .max(constants.PAYMENT_CONFIG.MAX_AMOUNTS.NYARADZO)
    .precision(2)
    .required();
const phoneSchema = Joi.string().pattern(constants.PHONE_PATTERN).required();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the module with shared HotRecharge functions
 * Must be called before using verifyPolicy() or purchase()
 * 
 * @param {Object} dependencies - Dependencies from main hotrecharge.js
 * @param {Function} dependencies.authenticate - Token authentication function
 * @param {Function} dependencies.getBalance - Balance check function
 * @param {Function} dependencies.generateAgentReference - Reference generator
 */
function init(dependencies) {
    authenticate = dependencies.authenticate;
    getBalance = dependencies.getBalance;
    generateAgentReference = dependencies.generateAgentReference;
    
    console.log('🔧 [NYARADZO-API] Module initialized');
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate Nyaradzo policy number format (must be exactly 8 digits)
 * 
 * @param {string} policyNumber - Policy number to validate
 * @returns {Object} Validation result with valid flag and optional message
 */
function validatePolicy(policyNumber) {
    const { error } = policySchema.validate(policyNumber);
    return {
        valid: !error,
        message: error ? 'Nyaradzo policy number must be 8 digits' : null
    };
}

/**
 * Validate amount against configured min/max
 * 
 * @param {number} amount - Amount in ZiG to validate
 * @returns {Object} Validation result with valid flag and optional message
 */
function validateAmount(amount) {
    const min = constants.PAYMENT_CONFIG.MIN_AMOUNTS.NYARADZO;
    const max = constants.PAYMENT_CONFIG.MAX_AMOUNTS.NYARADZO;
    
    const { error } = amountSchema.validate(amount);
    if (error) {
        return { 
            valid: false, 
            message: `Amount must be between ${min.toLocaleString()} ZiG and ${max.toLocaleString()} ZiG` 
        };
    }
    return { valid: true };
}

/**
 * Validate Zimbabwean phone number
 * 
 * @param {string} phoneNumber - Phone number to validate
 * @param {string} fieldName - Field name for error message
 * @returns {Object} Validation result with valid flag and optional message
 */
function validatePhone(phoneNumber, fieldName = 'Phone number') {
    const { error } = phoneSchema.validate(phoneNumber);
    return {
        valid: !error,
        message: error ? `${fieldName} must be a valid Zimbabwe number` : null
    };
}

/**
 * Format amount for display
 * 
 * @param {number} amount - Amount to format
 * @returns {string} Formatted amount with ZiG symbol
 */
function formatAmount(amount) {
    return `${amount.toFixed(2)} ZiG`;
}

/**
 * Normalize phone number to local format (0xx...)
 * Handles various input formats: 077..., 26377..., 77...
 * 
 * @param {string} phoneNumber - Phone number to normalize
 * @returns {string} Normalized phone number in local format
 */
function normalizePhone(phoneNumber) {
    if (!phoneNumber) return phoneNumber;
    
    const digits = phoneNumber.replace(/\D/g, '');
    
    // International format: 263771234567 → 0771234567
    if (digits.length === 12 && digits.startsWith('263')) {
        return '0' + digits.substring(3);
    }
    
    // Local format already: 0771234567
    if (digits.length === 10 && digits.startsWith('0')) {
        return digits;
    }
    
    // Short format: 771234567 → 0771234567
    if (digits.length === 9) {
        return '0' + digits;
    }
    
    return phoneNumber;
}

// ============================================================================
// POLICY VERIFICATION
// ============================================================================

/**
 * Verify Nyaradzo policy number with HotRecharge
 * Falls back to mock verification if endpoint is unavailable
 * 
 * @param {string} policyNumber - Policy number to verify
 * @returns {Promise<Object>} Verification result with customer details
 */
async function verifyPolicy(policyNumber) {
    console.log(`🌸 [NYARADZO-API] Verifying policy: ${policyNumber}`);
    
    const formatCheck = validatePolicy(policyNumber);
    if (!formatCheck.valid) {
        return { success: false, error: formatCheck.message };
    }

    try {
        const token = await authenticate();
        
        // Query policy details from HotRecharge
        const response = await axios.get(
            `${process.env.HOT_API_BASE_URL}/query/customer/${constants.BILLERS['1'].productId}/${policyNumber}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('🌸 [NYARADZO-API] Verification response received');

        if (response.data) {
            // Extract customer name from various possible response formats
            let customerName = 'Unknown';
            
            if (response.data.details && response.data.details.AccountName) {
                customerName = response.data.details.AccountName.trim();
            } else if (response.data.CustomerName) {
                customerName = response.data.CustomerName;
            }
            
            return {
                success: true,
                customerName: customerName,
                policyNumber: policyNumber,
                status: response.data.Status || 'Active',
                raw: response.data
            };
        }
        
        return { success: false, error: 'Policy number not found' };

    } catch (error) {
        console.error('🌸 [NYARADZO-API] Verification failed:', error.response?.data || error.message);
        
        // If endpoint doesn't exist (404), provide mock data for development
        if (error.response?.status === 404) {
            console.log('🌸 [NYARADZO-API] Verification endpoint not found - using mock data');
            return {
                success: true,
                customerName: 'Nyaradzo Policy Holder',
                policyNumber: policyNumber,
                status: 'Active',
                note: 'Mock verification'
            };
        }
        
        return { 
            success: false, 
            error: 'Failed to verify policy. Please try again.' 
        };
    }
}

// ============================================================================
// CORE PURCHASE FUNCTION
// ============================================================================

/**
 * Process Nyaradzo payment through HotRecharge
 * 
 * @param {Object} params - Transaction parameters
 * @param {string} params.policyNumber - Nyaradzo policy number
 * @param {number} params.amount - Amount in ZiG
 * @param {string} params.notifyNumber - Phone number to receive SMS notification
 * @param {string} params.userId - User identifier for tracking
 * @param {string} params.paymentPhone - Phone number used for payment
 * @param {string} params.customerName - Verified customer name
 * @param {string} params.reference - Optional pre-generated reference
 * @returns {Promise<Object>} Transaction result with success flag and details
 */
async function purchase(params) {
    const { policyNumber, amount, notifyNumber, userId, paymentPhone, customerName, reference } = params;
    
    console.log(`🌸 [NYARADZO-API] ==================== START ====================`);
    console.log(`📋 [NYARADZO-API] Policy: ${policyNumber}`);
    console.log(`💰 [NYARADZO-API] Amount: ${formatAmount(amount)}`);
    console.log(`📱 [NYARADZO-API] Notify: ${notifyNumber.slice(0,5)}****${notifyNumber.slice(-3)}`);

    // ========================================================================
    // STEP 1: Validate inputs
    // ========================================================================
    const policyCheck = validatePolicy(policyNumber);
    if (!policyCheck.valid) {
        console.error(`❌ [NYARADZO-API] Policy validation failed: ${policyCheck.message}`);
        return { success: false, error: policyCheck.message };
    }

    const amountCheck = validateAmount(amount);
    if (!amountCheck.valid) {
        console.error(`❌ [NYARADZO-API] Amount validation failed: ${amountCheck.message}`);
        return { success: false, error: amountCheck.message };
    }

    try {
        // ========================================================================
        // STEP 2: Get authentication token
        // ========================================================================
        const token = await authenticate();
        
        // ========================================================================
        // STEP 3: Check Nyaradzo balance (AccountTypeId 2)
        // ========================================================================
        const accountTypeId = constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.NYARADZO.id;
        const balanceCheck = await getBalance(accountTypeId);
        
        if (!balanceCheck.success) {
            console.warn('⚠️ [NYARADZO-API] Could not verify balance, proceeding anyway');
        } else if (balanceCheck.balance < amount) {
            console.error(`❌ [NYARADZO-API] Insufficient balance: Need ${formatAmount(amount)}, have ${formatAmount(balanceCheck.balance)}`);
            return { 
                success: false, 
                error: `Insufficient balance. Available: ${formatAmount(balanceCheck.balance)}` 
            };
        } else {
            console.log(`💰 [NYARADZO-API] Balance OK: ${formatAmount(balanceCheck.balance)}`);
        }

        // ========================================================================
        // STEP 4: Prepare request
        // ========================================================================
        const agentReference = reference || generateAgentReference(userId);
        const normalizedNotify = notifyNumber ? normalizePhone(notifyNumber) : null;
        const productId = constants.BILLERS['1'].productId;

        const rechargeRequest = {
            agentReference: agentReference,
            productId: productId,
            target: policyNumber,
            amount: amount,
            RechargeOptions: []
        };

        // Add notification number if provided
        if (normalizedNotify) {
            rechargeRequest.RechargeOptions.push({
                Name: "NotifyNumber",
                ParameterType: "string",
                Value: normalizedNotify
            });
        }

        // Add payment phone as notes
        if (paymentPhone) {
            rechargeRequest.Notes = `Payment from: ${paymentPhone}`;
        }

        // Add customer name if available
        if (customerName) {
            rechargeRequest.CustomerName = customerName;
        }

        // Add custom SMS
        rechargeRequest.CustomSMS = `Nyaradzo payment of ${formatAmount(amount)} processed for policy ${policyNumber}. Thank you for using CCHub!`;

        console.log('🌸 [NYARADZO-API] Request prepared:', {
            agentReference,
            productId,
            target: policyNumber,
            amount,
            hasNotifyNumber: !!normalizedNotify
        });

        // ========================================================================
        // STEP 5: Execute purchase
        // ========================================================================
        const response = await axios.post(
            `${process.env.HOT_API_BASE_URL}/products/recharge`,
            rechargeRequest,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            }
        );

        console.log('🌸 [NYARADZO-API] Response received');

        // ========================================================================
        // STEP 6: Parse response
        // ========================================================================
        if (response.data) {
            const isSuccess = response.data.successful === true || 
                              response.data.Success === true || 
                              response.data.Status === 'Success';

            if (isSuccess) {
                console.log(`✅ [NYARADZO-API] Purchase successful!`);
                console.log(`   ├─ Transaction ID: ${response.data.rechargeId || response.data.TransactionId}`);
                console.log(`   ├─ Amount: ${formatAmount(amount)}`);
                console.log(`   └─ Reference: ${agentReference}`);

                return {
                    success: true,
                    transactionId: response.data.rechargeId || response.data.TransactionId,
                    reference: agentReference,
                    amount: amount,
                    policyNumber: policyNumber,
                    raw: response.data
                };
            }
        }

        console.error(`❌ [NYARADZO-API] Transaction failed`);
        return {
            success: false,
            error: 'Transaction failed',
            reference: agentReference
        };

    } catch (error) {
        console.error('❌ [NYARADZO-API] API Error:', error.response?.data || error.message);
        
        if (error.response) {
            console.error('📡 [NYARADZO-API] Response status:', error.response.status);
            console.error('📡 [NYARADZO-API] Response data:', JSON.stringify(error.response.data, null, 2));
        }
        
        return {
            success: false,
            error: 'Failed to process payment. Please try again.',
            reference: reference
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    init,
    verifyPolicy,
    purchase,
    validatePolicy,
    validateAmount,
    validatePhone,
    formatAmount,
    normalizePhone
};
