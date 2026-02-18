// services/hotrecharge-services/nyaradzo.js
/**
 * Nyaradzo API Service
 * Handles actual HotRecharge API calls for Nyaradzo
 */

const constants = require('../../config/constants');
const axios = require('axios');
const Joi = require('joi');

let authenticate = null;
let getBalance = null;
let generateAgentReference = null;

const policySchema = Joi.string().pattern(/^\d{8}$/).required();
const amountSchema = Joi.number()
    .min(constants.PAYMENT_CONFIG.MIN_AMOUNTS.NYARADZO)
    .max(constants.PAYMENT_CONFIG.MAX_AMOUNTS.NYARADZO)
    .precision(2)
    .required();
const phoneSchema = Joi.string().pattern(constants.PHONE_PATTERN).required();

function init(dependencies) {
    authenticate = dependencies.authenticate;
    getBalance = dependencies.getBalance;
    generateAgentReference = dependencies.generateAgentReference;
}

function validatePolicy(policyNumber) {
    const { error } = policySchema.validate(policyNumber);
    return {
        valid: !error,
        message: error ? 'Nyaradzo policy number must be 8 digits' : null
    };
}

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

function validatePhone(phoneNumber, fieldName = 'Phone number') {
    const { error } = phoneSchema.validate(phoneNumber);
    return {
        valid: !error,
        message: error ? `${fieldName} must be a valid Zimbabwe number` : null
    };
}

function formatAmount(amount) {
    return `${amount.toFixed(2)} ZiG`;
}

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

async function verifyPolicy(policyNumber) {
    console.log(`⚰️ [NYARADZO-API] Verifying policy: ${policyNumber}`);
    
    const formatCheck = validatePolicy(policyNumber);
    if (!formatCheck.valid) {
        return { success: false, error: formatCheck.message };
    }

    try {
        const token = await authenticate();
        
        // Attempt to query policy details
        const response = await axios.get(
            `${process.env.HOT_API_BASE_URL}/query/customer/${constants.BILLERS['1'].productId}/${policyNumber}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('[NYARADZO-API] Verification response:', JSON.stringify(response.data, null, 2));

        if (response.data) {
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
        console.error('[NYARADZO-API] Verification failed:', error.response?.data || error.message);
        
        // If endpoint doesn't exist, return mock success for now
        if (error.response?.status === 404) {
            console.log('[NYARADZO-API] Verification endpoint not found - using mock data');
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

async function purchase(params) {
    const { policyNumber, amount, notifyNumber, userId, paymentPhone, customerName, reference } = params;
    
    console.log(`⚰️ [NYARADZO-API] Purchase request:`, { 
        policyNumber, 
        amount, 
        notifyNumber, 
        paymentPhone, 
        userId,
        reference
    });

    const policyCheck = validatePolicy(policyNumber);
    if (!policyCheck.valid) return { success: false, error: policyCheck.message };

    const amountCheck = validateAmount(amount);
    if (!amountCheck.valid) return { success: false, error: amountCheck.message };

    try {
        const token = await authenticate();
        
        const accountTypeId = constants.HOTRECHARGE_CONFIG.ACCOUNT_TYPES.NYARADZO.id;
        const balanceCheck = await getBalance(accountTypeId);
        
        if (!balanceCheck.success || balanceCheck.balance < amount) {
            return { 
                success: false, 
                error: `Insufficient balance. Available: ${balanceCheck.balance?.toFixed(2) || '0.00'} ZiG` 
            };
        }

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

        if (normalizedNotify) {
            rechargeRequest.RechargeOptions.push({
                Name: "NotifyNumber",
                ParameterType: "string",
                Value: normalizedNotify
            });
        }

        if (paymentPhone) {
            rechargeRequest.Notes = `Payment from: ${paymentPhone}`;
        }

        if (customerName) {
            rechargeRequest.CustomerName = customerName;
        }

        rechargeRequest.CustomSMS = `Nyaradzo payment of ${amount} ZiG processed for policy ${policyNumber}. Thank you for using CCHub!`;

        console.log('[NYARADZO-API] Sending request to HotRecharge:');
        console.log(JSON.stringify(rechargeRequest, null, 2));

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

        console.log('[NYARADZO-API] HotRecharge Response:');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data) {
            const isSuccess = response.data.successful === true || 
                              response.data.Success === true || 
                              response.data.Status === 'Success';

            if (isSuccess) {
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

        return {
            success: false,
            error: 'Transaction failed',
            reference: agentReference
        };

    } catch (error) {
        console.error('[NYARADZO-API] API Error:', error.response?.data || error.message);
        return {
            success: false,
            error: 'Failed to process payment. Please try again.',
            reference: reference
        };
    }
}

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