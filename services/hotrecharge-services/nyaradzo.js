// services/nyaradzo.js - Nyaradzo Funeral Payment Flow
/**
 * Nyaradzo Flow Handler
 * Manages the conversation flow for Nyaradzo funeral policy payments
 */

const currencyGate = require('./currencyGate');
const paynow = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { createSession, updateSession, getActiveSession, deleteSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const constants = require('../config/constants');
const messaging = require('../utils/messaging');

// Flow states from constants
const STATES = constants.FLOW_STATES.BILL_PAYMENT;

// Phone validation from constants
const PHONE_REGEX = constants.PHONE_PATTERN;

// Billers from constants
const BILLERS = constants.BILLERS;
const NYARADZO = BILLERS['1'];

// Polling configuration
const POLLING_CONFIG = {
    MAX_ATTEMPTS: 30,
    INTERVAL_MS: 3000,
    TOTAL_TIMEOUT_MS: 90000
};

/**
 * Calculate service fee
 */
function calculateFee(amount) {
    const feePercentage = constants.PAYMENT_CONFIG.SERVICE_FEES.NYARADZO;
    const feeAmount = amount * feePercentage;
    const totalAmount = amount + feeAmount;
    
    return {
        feePercentage: feePercentage * 100,
        feeAmount: feeAmount,
        totalAmount: totalAmount,
        currency: 'ZiG'
    };
}

/**
 * Format amount with currency
 */
function formatAmount(amount) {
    return `${amount.toLocaleString()} ZiG`;
}

/**
 * Mask phone number for privacy
 */
function maskPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 7) return phone;
    return cleaned.slice(0, 5) + '****' + cleaned.slice(-3);
}

/**
 * Validate policy number
 */
function validatePolicy(policy) {
    const cleaned = policy.replace(/\s/g, '');
    
    if (!/^\d{8}$/.test(cleaned)) {
        return {
            valid: false,
            message: constants.ERROR_MESSAGES.INVALID_POLICY.replace('%s', policy)
        };
    }
    
    return {
        valid: true,
        cleaned: cleaned
    };
}

/**
 * Start Nyaradzo flow
 */
async function startFlow(from) {
    console.log(`⚰️ [NYARADZO] Starting flow for user: ${from}`);
    
    deleteSession(from);
    
    // Create session with correct initial state
    const session = createSession(from, constants.SERVICE_TYPES.BILL_PAYMENT);
    
    // Set the state to ENTER_ACCOUNT (skip biller selection)
    session.state = STATES.ENTER_ACCOUNT;
    session.data = { 
        userId: from,
        biller: NYARADZO.key,
        billerName: NYARADZO.name,
        productId: NYARADZO.productId,
        accountTypeId: NYARADZO.accountTypeId,
        currency: NYARADZO.currency,
        minAmount: NYARADZO.minAmount,
        maxAmount: NYARADZO.maxAmount
    };

    // CRITICAL: Update session in global store
    updateSession(from, { 
        state: session.state, 
        data: session.data 
    });
    
    // Get the updated session to verify
    const updatedSession = getActiveSession(from);
    console.log(`⚰️ [NYARADZO] Session state after update: ${updatedSession?.state}`);
    
    return {
        message: constants.UI_MESSAGES.BILLS.NYARADZO.POLICY_PROMPT,
        session: updatedSession || session
    };
}

/**
 * Handle Nyaradzo flow messages
 */
async function handleRequest(userId, messageText, session) {
    console.log(`⚰️ [NYARADZO] Handling message - State: ${session.state}`);
    
    const activeSession = getActiveSession(userId);
    if (!activeSession) {
        return {
            message: constants.RESPONSE_MESSAGES.SESSION_EXPIRED,
            session: null
        };
    }
    
    try {
        switch (session.state) {
            case STATES.ENTER_ACCOUNT:
                return await handlePolicyEntry(userId, messageText, session);
                
            case STATES.VERIFYING_ACCOUNT:
                console.log('⚠️ [NYARADZO] In VERIFYING_ACCOUNT state, ignoring message');
                return {
                    message: null,
                    session: session
                };
                
            case STATES.ENTER_AMOUNT:
                return await handleAmountEntry(userId, messageText, session);
                
            case STATES.SELECT_PAYMENT:
                return await handlePaymentSelection(userId, messageText, session);
                
            case STATES.ENTER_PAYMENT_PHONE:
                return await handlePaymentPhone(userId, messageText, session);
                
            case STATES.ENTER_NOTIFY_PHONE:
                return await handleNotificationPhone(userId, messageText, session);
                
            case STATES.CONFIRM_PAYMENT:
                return await handleConfirmation(userId, messageText, session);
                
            default:
                console.error(`❌ Invalid flow state: ${session.state}`);
                deleteSession(userId);
                return {
                    message: constants.MESSAGING_CONFIG.DEFAULT_ERROR,
                    session: null
                };
        }
        
    } catch (error) {
        console.error(`⚰️ [NYARADZO] Error:`, error);
        deleteSession(userId);
        return {
            message: constants.MESSAGING_CONFIG.DEFAULT_ERROR,
            session: null
        };
    }
}

/**
 * Handle policy number entry
 */
async function handlePolicyEntry(userId, message, session) {
    const validation = validatePolicy(message);
    
    if (!validation.valid) {
        const retriesExceeded = incrementRetries(userId);
        
        if (retriesExceeded) {
            deleteSession(userId);
            return {
                message: constants.RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS,
                session: null
            };
        }
        
        return {
            message: validation.message,
            session: session
        };
    }
    
    session.data.policyNumber = validation.cleaned;
    session.state = STATES.VERIFYING_ACCOUNT;
    updateSession(userId, { state: session.state, data: session.data });
    
    // Show verification in progress
    await messaging.sendMessage(userId, constants.UI_MESSAGES.BILLS.NYARADZO.VERIFYING);
    
    // Verify policy with HotRecharge
    const verifyResult = await hotrecharge.nyaradzo.verifyPolicy(validation.cleaned);
    
    if (verifyResult.success) {
        session.data.customerName = verifyResult.customerName;
        session.data.policyStatus = verifyResult.status;
        session.state = STATES.ENTER_AMOUNT;
        updateSession(userId, { state: session.state, data: session.data });
        
        const verifiedMessage = constants.UI_MESSAGES.BILLS.NYARADZO.VERIFIED(
            validation.cleaned,
            verifyResult.customerName || 'N/A'
        );
        
        await messaging.sendMessage(userId, verifiedMessage);
        
        return {
            message: constants.UI_MESSAGES.BILLS.NYARADZO.AMOUNT_PROMPT,
            session: session
        };
        
    } else {
        const errorMsg = verifyResult.error === 'Policy not found' 
            ? constants.ERROR_MESSAGES.POLICY_NOT_FOUND(validation.cleaned)
            : constants.ERROR_MESSAGES.VERIFICATION_FAILED;
        
        session.state = STATES.ENTER_ACCOUNT;
        session.retries = 0;
        updateSession(userId, { state: session.state, data: session.data });
        
        return {
            message: errorMsg + '\n\nPlease enter your policy number again:',
            session: session
        };
    }
}

/**
 * Handle amount entry
 */
async function handleAmountEntry(userId, message, session) {
    const amount = parseFloat(message.replace(/,/g, ''));
    
    if (isNaN(amount) || amount <= 0) {
        const retriesExceeded = incrementRetries(userId);
        
        if (retriesExceeded) {
            deleteSession(userId);
            return {
                message: constants.RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS,
                session: null
            };
        }
        
        return {
            message: `⚠️ *Invalid Amount*\n\nPlease enter a valid amount:`,
            session: session
        };
    }
    
    if (amount < session.data.minAmount || amount > session.data.maxAmount) {
        const retriesExceeded = incrementRetries(userId);
        
        if (retriesExceeded) {
            deleteSession(userId);
            return {
                message: constants.RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS,
                session: null
            };
        }
        
        return {
            message: `⚠️ Amount must be between ${session.data.minAmount.toLocaleString()} and ${session.data.maxAmount.toLocaleString()} ZiG.`,
            session: session
        };
    }
    
    const feeDetails = calculateFee(amount);
    
    session.data.amount = amount;
    session.data.feePercentage = feeDetails.feePercentage;
    session.data.feeAmount = feeDetails.feeAmount;
    session.data.totalAmount = feeDetails.totalAmount;
    session.state = STATES.SELECT_PAYMENT;
    updateSession(userId, { state: session.state, data: session.data });
    
    const baseFormatted = formatAmount(amount);
    const feeFormatted = formatAmount(feeDetails.feeAmount);
    const totalFormatted = formatAmount(feeDetails.totalAmount);
    
    const message_text = `💰 *Amount Breakdown*\n\n` +
        `Payment Amount: ${baseFormatted}\n` +
        `Service Fee (${feeDetails.feePercentage}%): ${feeFormatted}\n` +
        `────────────────\n` +
        `*Total to Pay:* ${totalFormatted}\n` +
        `────────────────\n\n` +
        `Select payment method:\n\n` +
        `1️⃣ EcoCash\n` +
        `2️⃣ InnBucks\n\n` +
        `────────────────\n` +
        `Reply with *1* or *2*`;
    
    return {
        message: message_text,
        session: session
    };
}

/**
 * Handle payment method selection
 */
async function handlePaymentSelection(userId, message, session) {
    let paymentMethod;
    
    if (message === '1' || message.toLowerCase().includes('ecocash')) {
        paymentMethod = 'ecocash';
        session.state = STATES.ENTER_PAYMENT_PHONE;
    } else if (message === '2' || message.toLowerCase().includes('innbucks')) {
        paymentMethod = 'innbucks';
        session.state = STATES.ENTER_NOTIFY_PHONE;
    } else {
        const retriesExceeded = incrementRetries(userId);
        
        if (retriesExceeded) {
            deleteSession(userId);
            return {
                message: constants.RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS,
                session: null
            };
        }
        
        return {
            message: `⚠️ *Invalid Selection*\n\nPlease select 1 for EcoCash or 2 for InnBucks:`,
            session: session
        };
    }
    
    session.data.paymentMethod = paymentMethod;
    updateSession(userId, { state: session.state, data: session.data });
    
    if (paymentMethod === 'ecocash') {
        return {
            message: constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.ECOCASH,
            session: session
        };
    } else {
        return {
            message: constants.UI_MESSAGES.RECIPIENT_PROMPT.ZESA_NOTIFY,
            session: session
        };
    }
}

/**
 * Handle payment phone number entry
 */
async function handlePaymentPhone(userId, message, session) {
    if (!PHONE_REGEX.test(message)) {
        const retriesExceeded = incrementRetries(userId);
        
        if (retriesExceeded) {
            deleteSession(userId);
            return {
                message: constants.RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS,
                session: null
            };
        }
        
        return {
            message: `⚠️ *Invalid Number*\n\nPlease enter a valid Zimbabwe phone number (e.g., 0771234567):`,
            session: session
        };
    }
    
    const digits = message.replace(/\D/g, '');
    const formattedPhone = digits.startsWith('0') ? '263' + digits.substring(1) : digits;
    
    session.data.paymentPhone = formattedPhone;
    session.data.paymentPhoneDisplay = message;
    session.state = STATES.ENTER_NOTIFY_PHONE;
    updateSession(userId, { state: session.state, data: session.data });
    
    return {
        message: constants.UI_MESSAGES.RECIPIENT_PROMPT.ZESA_NOTIFY,
        session: session
    };
}

/**
 * Handle notification phone number entry
 */
async function handleNotificationPhone(userId, message, session) {
    if (!PHONE_REGEX.test(message)) {
        const retriesExceeded = incrementRetries(userId);
        
        if (retriesExceeded) {
            deleteSession(userId);
            return {
                message: constants.RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS,
                session: null
            };
        }
        
        return {
            message: `⚠️ *Invalid Number*\n\nPlease enter a valid Zimbabwe phone number (e.g., 0771234567):`,
            session: session
        };
    }
    
    const digits = message.replace(/\D/g, '');
    const formattedPhone = digits.startsWith('0') ? '263' + digits.substring(1) : digits;
    
    session.data.notifyNumber = formattedPhone;
    session.data.notifyNumberDisplay = message;
    session.state = STATES.CONFIRM_PAYMENT;
    updateSession(userId, { state: session.state, data: session.data });
    
    const confirmMessage = buildConfirmationMessage(session.data);
    
    return {
        message: confirmMessage,
        session: session
    };
}

/**
 * Build confirmation message
 */
function buildConfirmationMessage(data) {
    const {
        policyNumber,
        customerName,
        amount,
        feePercentage,
        feeAmount,
        totalAmount,
        paymentMethod,
        paymentPhoneDisplay,
        notifyNumberDisplay,
        billerName
    } = data;
    
    const baseFormatted = formatAmount(amount);
    const feeFormatted = formatAmount(feeAmount);
    const totalFormatted = formatAmount(totalAmount);
    
    const paymentMethodName = paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
    
    let message = `⚰️ *Confirm ${billerName} Payment*\n\n`;
    message += `Policy: *${policyNumber}*\n`;
    message += `Customer: *${customerName || 'N/A'}*\n`;
    message += `────────────────\n`;
    message += `Payment: *${baseFormatted}*\n`;
    message += `Fee (${feePercentage}%): *${feeFormatted}*\n`;
    message += `────────────────\n`;
    message += `*Total: ${totalFormatted}*\n`;
    message += `────────────────\n`;
    message += `Payment: *${paymentMethodName}*\n`;
    
    if (paymentPhoneDisplay) {
        message += `📱 Paid with: *${maskPhone(paymentPhoneDisplay)}*\n`;
    }
    
    message += `📲 SMS to: *${maskPhone(notifyNumberDisplay)}*\n`;
    message += `────────────────\n\n`;
    message += constants.UI_MESSAGES.CONFIRMATION.PROMPT;
    
    return message;
}

/**
 * Handle confirmation
 */
async function handleConfirmation(userId, message, session) {
    if (message === '1') {
        session.state = STATES.PROCESSING;
        updateSession(userId, { state: session.state });
        
        await messaging.sendMessage(userId, constants.UI_MESSAGES.BILLS.NYARADZO.PROCESSING);
        
        const result = await processTransaction(userId, session);
        deleteSession(userId);
        
        return {
            message: result.message,
            session: null
        };
        
    } else if (message === '2') {
        deleteSession(userId);
        return {
            message: `❌ *Cancelled*\n\nNyaradzo payment cancelled. Type *hi* for main menu.`,
            session: null
        };
        
    } else {
        const retriesExceeded = incrementRetries(userId);
        
        if (retriesExceeded) {
            deleteSession(userId);
            return {
                message: constants.RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS,
                session: null
            };
        }
        
        const confirmMessage = buildConfirmationMessage(session.data);
        
        return {
            message: constants.UI_MESSAGES.CONFIRMATION.INVALID + '\n\n' + confirmMessage,
            session: session
        };
    }
}

/**
 * Process transaction
 */
async function processTransaction(userId, session) {
    try {
        const { 
            policyNumber,
            amount,
            totalAmount,
            paymentMethod,
            paymentPhone,
            notifyNumber,
            customerName
        } = session.data;
        
        const reference = `NYR${Date.now().toString().slice(-8)}`;
        
        const paynowResult = await paynow.initiateQuickPay({
            amount: totalAmount,
            reference: reference,
            phone: paymentPhone,
            method: paymentMethod,
            service: 'Nyaradzo Funeral',
            currency: 'ZiG'
        });
        
        if (!paynowResult.success) {
            return {
                message: `❌ *Payment Failed*\n\n${paynowResult.error}`
            };
        }
        
        if (paymentMethod === 'innbucks') {
            return {
                message: paynowResult.instructions + `\n\n⏳ After payment, your Nyaradzo payment confirmation will be sent to ${maskPhone(notifyNumber)}`
            };
        }
        
        await messaging.sendMessage(userId, `⏳ Waiting for EcoCash payment confirmation...\n\nCheck your phone and enter PIN when prompted.`);
        
        let paymentConfirmed = false;
        let attempts = 0;
        
        while (!paymentConfirmed && attempts < POLLING_CONFIG.MAX_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, POLLING_CONFIG.INTERVAL_MS));
            
            const status = await paynow.checkPaymentStatus(paynowResult.pollUrl);
            if (status.paid) {
                paymentConfirmed = true;
                break;
            }
            attempts++;
        }
        
        if (!paymentConfirmed) {
            return {
                message: `❌ *Payment Timeout*\n\nPayment not confirmed after ${POLLING_CONFIG.TOTAL_TIMEOUT_MS/1000} seconds. Please check your EcoCash app and try again.\n\nReference: ${reference}`
            };
        }
        
        await messaging.sendMessage(userId, `✅ Payment confirmed! Now processing Nyaradzo payment...`);
        
        const paymentResult = await hotrecharge.nyaradzo.purchase({
            policyNumber,
            amount,
            notifyNumber,
            paymentPhone,
            userId,
            customerName,
            reference
        });
        
        if (paymentResult.success) {
            return {
                message: constants.UI_MESSAGES.BILLS.NYARADZO.SUCCESS(
                    policyNumber,
                    customerName || 'N/A',
                    amount,
                    totalAmount,
                    paymentResult.transactionId || reference,
                    notifyNumber
                )
            };
        } else {
            return {
                message: `⚠️ *Payment Successful*\n\n` +
                    `But Nyaradzo payment processing failed.\n` +
                    `Reference: ${paymentResult.reference || reference}\n\n` +
                    `Please contact support with this reference.`
            };
        }
        
    } catch (error) {
        console.error('[NYARADZO] Transaction error:', error);
        return {
            message: `❌ *Error*\n\nAn error occurred. Please try again.`
        };
    }
}

module.exports = {
    startFlow,
    handleRequest,
    calculateFee,
    formatAmount,
    maskPhone,
    validatePolicy
};