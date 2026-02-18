// services/hotrecharge-services/nyaradzo.js - Nyaradzo Funeral Payment Service
/**
 * Nyaradzo Funeral Service Module
 * Product ID: 15
 * Amount Range: 10 - 10,000,000 ZiG
 * Account Type: 2 (Same as ZESA ZiG)
 */

const constants = require('../../config/constants');
const axios = require('axios');
const Joi = require('joi');

// Module state
let authenticate = null;
let getBalance = null;
let generateAgentReference = null;

// Validation schemas
const policySchema = Joi.string().pattern(/^\d{8}$/).required();
const amountSchema = Joi.number()
    .min(constants.PAYMENT_CONFIG.MIN_AMOUNTS.NYARADZO)
    .max(constants.PAYMENT_CONFIG.MAX_AMOUNTS.NYARADZO)
    .precision(2)
    .required();
const phoneSchema = Joi.string().pattern(constants.PHONE_PATTERN).required();

/**
 * Initialize the module with shared HotRecharge functions
 */
function init(dependencies) {
    authenticate = dependencies.authenticate;
    getBalance = dependencies.getBalance;
    generateAgentReference = dependencies.generateAgentReference;
}

/**
 * Validate policy number
 */
function validatePolicy(policyNumber) {
    const { error } = policySchema.validate(policyNumber);
    return {
        valid: !error,
        message: error ? 'Nyaradzo policy number must be 8 digits' : null
    };
}

/**
 * Validate amount
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
 * Validate phone number
 */
function validatePhone(phoneNumber, fieldName = 'Phone number') {
    const { error } = phoneSchema.validate(phoneNumber);
    return {
        valid: !error,
        message: error ? `${fieldName} must be a valid Zimbabwe number (e.g., 0771234567 or +263771234567)` : null
    };
}

/**
 * Format amount for display
 */
function formatAmount(amount) {
    return `${amount.toFixed(2)} ZiG`;
}

/**
 * Normalize phone number for API
 */
function normalizePhone(phoneNumber) {
    if (!phoneNumber) return phoneNumber;
    
    const digits = phoneNumber.replace(/\D/g, '');
    
    if (digits.length === 12 && digits.startsWith('263')) {
        return '0' + digits.substring(3);
    }
    if (digits.length === 10 && digits.startsWith('0')) {
        return digits;
    }
    if (digits.length === 9) {
        return '0' + digits;
    }
    return phoneNumber;
}

/**
 * Verify Nyaradzo policy number
 * Note: HotRecharge may not have a dedicated verification endpoint for Nyaradzo
 * This is a placeholder - you may need to adjust based on actual API capabilities
 */
async function verifyPolicy(policyNumber) {
    console.log(`⚰️ [NYARADZO] Verifying policy: ${policyNumber}`);
    
    const formatCheck = validatePolicy(policyNumber);
    if (!formatCheck.valid) {
        return { success: false, error: formatCheck.message };
    }

    try {
        const token = await authenticate();
        
        // Attempt to query policy details
        // Note: This endpoint may need to be adjusted based on HotRecharge's actual API
        // Some billers might not have verification endpoints
        const response = await axios.get(
            `${process.env.HOT_API_BASE_URL}/query/customer/${constants.BILLERS['1'].productId}/${policyNumber}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('[NYARADZO] Verification response:', JSON.stringify(response.data, null, 2));

        if (response.data) {
            // Extract customer name from response
            let customerName = 'Unknown';
            
            if (response.data.details && response.data.details.AccountName) {
                customerName = response.data.details.AccountName.trim();
            } else if (response.data.CustomerName) {
                customerName = response.data.CustomerName;
            } else if (response.data.name) {
                customerName = response.data.name;
            }
            
            return {
                success: true,
                customerName: customerName,
                policyNumber: policyNumber,
                status: response.data.Status || 'Active',
                raw: response.data
            };
        }
        
        // If no verification endpoint, assume policy is valid
        // This is a fallback - remove if verification works
        return {
            success: true,
            customerName: 'Nyaradzo Policy Holder',
            policyNumber: policyNumber,
            status: 'Active',
            note: 'Policy verified (simulated)'
        };

    } catch (error) {
        console.error('[NYARADZO] Verification failed:', error.response?.data || error.message);
        
        // If endpoint doesn't exist, fall back to accepting the policy
        // Remove this fallback once verification is confirmed working
        if (error.response?.status === 404) {
            console.log('[NYARADZO] Verification endpoint not found - accepting policy as valid');
            return {
                success: true,
                customerName: 'Nyaradzo Policy Holder',
                policyNumber: policyNumber,
                status: 'Active',
                note: 'Policy accepted (verification endpoint unavailable)'
            };
        }
        
        return { 
            success: false, 
            error: 'Failed to verify policy. Please try again.' 
        };
    }
}

/**
 * Process Nyaradzo payment
 */
async function purchase(params) {
    const { policyNumber, amount, notifyNumber, userId, paymentPhone, customerName } = params;
    
    console.log(`⚰️ [NYARADZO] Purchase request:`, { 
        policyNumber, 
        amount, 
        notifyNumber, 
        paymentPhone, 
        userId,
        timestamp: new Date().toISOString()
    });

    // Validate all inputs
    const policyCheck = validatePolicy(policyNumber);
    if (!policyCheck.valid) return { success: false, error: policyCheck.message };

    const amountCheck = validateAmount(amount);
    if (!amountCheck.valid) return { success: false, error: amountCheck.message };

    const notifyCheck = validatePhone(notifyNumber, 'Notification number');
    if (!notifyCheck.valid) return { success: false, error: notifyCheck.message };

    if (paymentPhone) {
        const paymentCheck = validatePhone(paymentPhone, 'Payment phone number');
        if (!paymentCheck.valid) return { success: false, error: paymentCheck.message };
    }

    try {
        const token = await authenticate();
        
        // Check balance (using same account type as ZESA ZiG - type 2)
        const accountTypeId = constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.NYARADZO.id;
        const balanceCheck = await getBalance(accountTypeId);
        
        if (!balanceCheck.success || balanceCheck.balance < amount) {
            return { 
                success: false, 
                error: `Insufficient balance. Available: ${balanceCheck.balance?.toFixed(2) || '0.00'} ZiG, Required: ${amount.toFixed(2)} ZiG` 
            };
        }

        // Generate a unique agent reference
        const agentReference = generateAgentReference(userId);
        
        // Normalize phone numbers - API expects local format (077...)
        const normalizedNotify = normalizePhone(notifyNumber);
        const normalizedPayment = paymentPhone ? normalizePhone(paymentPhone) : null;

        console.log(`[NYARADZO] Normalized phone numbers:`, {
            original: notifyNumber,
            normalized: normalizedNotify,
            paymentOriginal: paymentPhone,
            paymentNormalized: normalizedPayment
        });

        // Get product ID from constants
        const productId = constants.BILLERS['1'].productId; // 15

        // Construct the request
        const rechargeRequest = {
            agentReference: agentReference,
            productId: productId,
            target: policyNumber,  // Policy number is the target
            amount: amount,
            RechargeOptions: []
        };

        // Add NotifyNumber if required by API
        if (constants.BILLERS['1'].requiresNotifyNumber) {
            rechargeRequest.RechargeOptions.push({
                Name: "NotifyNumber",
                ParameterType: "string",
                Value: normalizedNotify
            });
        }

        // Add optional fields if provided
        if (paymentPhone) {
            rechargeRequest.Notes = `Payment from: ${paymentPhone}`;
            rechargeRequest.CustomerReference = normalizedPayment;
        }

        // Add customer name if available
        if (customerName) {
            rechargeRequest.CustomerName = customerName;
        }

        // Add custom SMS
        rechargeRequest.CustomSMS = `Nyaradzo payment of ${amount} ZiG processed for policy ${policyNumber}. Thank you for using CCHub!`;

        console.log('[NYARADZO] Sending request to HotRecharge:');
        console.log(JSON.stringify(rechargeRequest, null, 2));

        try {
            const response = await axios.post(
                `${process.env.HOT_API_BASE_URL}/products/recharge`,
                rechargeRequest,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            console.log('[NYARADZO] HotRecharge Response:');
            console.log(JSON.stringify(response.data, null, 2));

            // Check for success
            if (response.data) {
                const isSuccess = response.data.successful === true || 
                                  response.data.Success === true || 
                                  response.data.Status === 'Success' ||
                                  response.data.Code === '0000' ||
                                  response.data.TransactionId;

                if (isSuccess) {
                    // Extract transaction details
                    let transactionId = response.data.rechargeId || 
                                       response.data.TransactionId || 
                                       response.data.Reference;
                    
                    let reference = response.data.Reference || agentReference;

                    return {
                        success: true,
                        transactionId: transactionId,
                        reference: reference,
                        amount: amount,
                        policyNumber: policyNumber,
                        notifyNumber: notifyNumber,
                        paymentPhone: paymentPhone,
                        customerName: customerName,
                        message: `✅ Nyaradzo payment successful!`,
                        raw: response.data
                    };
                }
            }

            console.error('[NYARADZO] Unexpected response structure:', response.data);
            return {
                success: false,
                error: 'Transaction completed but response format unexpected. Please check transaction status.',
                reference: agentReference,
                raw: response.data
            };

        } catch (error) {
            console.error('[NYARADZO] API Error:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: JSON.stringify(error.response?.data, null, 2),
                message: error.message
            });

            if (error.response?.data) {
                const errorData = error.response.data;
                
                if (errorData.errors && Array.isArray(errorData.errors)) {
                    errorData.errors.forEach(err => {
                        console.log(`[NYARADZO] Error field: ${err.name || err.field}, message: ${err.message}`);
                    });
                    
                    // Check for specific errors
                    const notifyError = errorData.errors.find(e => 
                        e.name === 'NotifyNumber' || e.field === 'NotifyNumber'
                    );
                    
                    if (notifyError) {
                        return {
                            success: false,
                            error: `Notification number error: ${notifyError.message || 'Invalid format'}`,
                            reference: agentReference,
                            details: notifyError
                        };
                    }
                }

                return {
                    success: false,
                    error: errorData.Message || errorData.error || 'Transaction failed',
                    reference: agentReference,
                    details: errorData
                };
            }

            return {
                success: false,
                error: 'Failed to connect to HotRecharge. Please try again.',
                reference: agentReference
            };
        }

    } catch (error) {
        console.error('[NYARADZO] Critical error:', error);
        return {
            success: false,
            error: 'An unexpected error occurred. Please try again.'
        };
    }
}

/**
 * Query a transaction by agent reference
 */
async function queryTransaction(agentReference) {
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
        
        console.log(`[NYARADZO] Transaction query for ${agentReference}:`, response.data);
        
        return { 
            success: true, 
            status: response.data.Status,
            transaction: response.data 
        };
    } catch (error) {
        console.error('[NYARADZO] Transaction query failed:', error.message);
        return { 
            success: false, 
            error: 'Failed to query transaction' 
        };
    }
}

module.exports = {
    init,
    validatePolicy,
    validateAmount,
    validatePhone,
    formatAmount,
    normalizePhone,
    verifyPolicy,
    purchase,
    queryTransaction
};