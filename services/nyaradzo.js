// services/nyaradzo.js
// ============================================================================
// NYARADZO FUNERAL PAYMENT FLOW
// Handles the complete Nyaradzo policy payment flow:
// 1. Policy number entry & verification
// 2. Amount entry with fee calculation
// 3. Payment method selection (ZiG only: EcoCash, Zimswitch, PayGo, OneMoney)
// 4. Payment phone entry (if required)
// 5. Notification phone entry
// 6. Transaction confirmation
// 7. PayNow payment processing
// 8. HotRecharge fulfillment with WordPress logging
// 
// Currency: ZiG only (as per business rules)
// Fee: 5% service fee
// ============================================================================

const paynow = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { createSession, updateSession, getActiveSession, deleteSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const constants = require('../config/constants');
const messaging = require('../utils/messaging');

// ============================================================================
// CONSTANTS FROM CONFIG
// ============================================================================
const STATES = constants.FLOW_STATES.BILL_PAYMENT;
const PHONE_REGEX = constants.PHONE_PATTERN;
const BILLERS = constants.BILLERS;
const NYARADZO = BILLERS['1'];
const { PAYMENT_PROVIDERS, PAYMENT_METHOD_NAMES, PAYMENT_METHOD_CONFIG, PAYMENT_PREFIXES } = constants;

// ============================================================================
// POLLING CONFIGURATION
// ============================================================================
const POLLING_CONFIG = {
    MAX_ATTEMPTS: 30,
    INTERVAL_MS: 3000,
    TOTAL_TIMEOUT_MS: 90000
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate service fee (5%)
 * 
 * @param {number} amount - Base payment amount
 * @returns {Object} Fee details including percentage, amount, and total
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
 * Format amount with currency for display
 * 
 * @param {number} amount - Amount to format
 * @returns {string} Formatted amount with ZiG symbol
 */
function formatAmount(amount) {
    return `${amount.toLocaleString()} ZiG`;
}

/**
 * Mask phone number for privacy (first 5, asterisks, last 3)
 * 
 * @param {string} phone - Phone number to mask
 * @returns {string} Masked phone number
 */
function maskPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 7) return phone;
    return cleaned.slice(0, 5) + '****' + cleaned.slice(-3);
}

/**
 * Validate Nyaradzo policy number (must be 8 digits)
 * 
 * @param {string} policy - Raw policy number input
 * @returns {Object} Validation result with cleaned number or error
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
 * Validate payment phone with provider-specific prefix rules
 * 
 * @param {string} phone - Raw phone input
 * @param {string} provider - Payment provider (ecocash, onemoney, paygo)
 * @returns {Object} Validation result with formatted numbers or error
 */
function validatePaymentPhone(phone, provider) {
    const digits = phone.replace(/\D/g, '');
    let formatted = '';
    let display = '';
    
    // Convert to standard formats
    if (digits.length === 10 && digits.startsWith('0')) {
        formatted = '263' + digits.substring(1);
        display = digits;
    } else if (digits.length === 12 && digits.startsWith('263')) {
        formatted = digits;
        display = '0' + digits.substring(3);
    } else if (digits.length === 9 && !digits.startsWith('0')) {
        formatted = '263' + digits;
        display = '0' + digits;
    } else {
        return {
            valid: false,
            formatted: null,
            display: null,
            error: '❌ Invalid phone number. Use 0771234567 or 263771234567'
        };
    }
    
    // Check against provider-specific prefixes
    let allowedPrefixes = [];
    let providerName = '';
    
    switch(provider) {
        case 'ecocash':
            allowedPrefixes = PAYMENT_PREFIXES.ECOCASH;
            providerName = 'EcoCash';
            break;
        case 'onemoney':
            allowedPrefixes = PAYMENT_PREFIXES.ONEMONEY;
            providerName = 'OneMoney';
            break;
        case 'paygo':
            allowedPrefixes = PAYMENT_PREFIXES.PAYGO;
            providerName = 'PayGo';
            break;
        default:
            return { valid: true, formatted, display, error: null };
    }
    
    const isValidProvider = allowedPrefixes.some(prefix => 
        formatted.startsWith('263' + prefix.substring(1)) || 
        formatted.startsWith(prefix)
    );
    
    if (isValidProvider) {
        return { valid: true, formatted, display, error: null };
    }
    
    return { 
        valid: false, 
        formatted: null, 
        display: null, 
        error: `❌ ${providerName} uses ${allowedPrefixes.join(' or ')} prefixes.` 
    };
}

// ============================================================================
// FLOW INITIATION
// ============================================================================

/**
 * Start the Nyaradzo payment flow
 * Creates session and sends policy number prompt
 * 
 * @param {string} from - WhatsApp user ID
 * @returns {Promise<Object>} Result with message and session
 */
async function startFlow(from) {
    console.log(`🌸 [NYARADZO] ========== START FLOW ==========`);
    console.log(`🌸 [NYARADZO] Starting flow for user: ${from}`);
    
    deleteSession(from);
    
    const session = createSession(from, constants.SERVICE_TYPES.BILL_PAYMENT);
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

    updateSession(from, { 
        state: session.state, 
        data: session.data 
    });
    
    const policyPrompt = constants.UI_MESSAGES.BILLS.NYARADZO.POLICY_PROMPT;
    
    const result = {
        message: policyPrompt,
        session: session
    };
    
    console.log(`🌸 [NYARADZO] ========== END START FLOW ==========`);
    return result;
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

/**
 * Handle user input based on current flow state
 * Routes to appropriate handler method
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} messageText - User's message
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result object for messageHandler
 */
async function handleRequest(userId, messageText, session) {
    console.log(`🌸 [NYARADZO] ========== HANDLE REQUEST ==========`);
    console.log(`🌸 [NYARADZO] User: ${userId}`);
    console.log(`🌸 [NYARADZO] Message: "${messageText}"`);
    console.log(`🌸 [NYARADZO] Current state: ${session.state}`);
    
    const activeSession = getActiveSession(userId);
    if (!activeSession) {
        console.log(`🌸 [NYARADZO] No active session found`);
        return {
            message: constants.RESPONSE_MESSAGES.SESSION_EXPIRED,
            session: null
        };
    }
    
    try {
        let result;
        
        switch (session.state) {
            case STATES.ENTER_ACCOUNT:
                result = await handlePolicyEntry(userId, messageText, session);
                break;
                
            case STATES.VERIFYING_ACCOUNT:
                return {
                    message: null,
                    session: session
                };
                
            case STATES.ENTER_AMOUNT:
                result = await handleAmountEntry(userId, messageText, session);
                break;
                
            case STATES.SELECT_PAYMENT_METHOD:
                result = await handlePaymentMethodSelection(userId, messageText, session);
                break;
                
            case STATES.ENTER_PAYMENT_PHONE:
                result = await handlePaymentPhone(userId, messageText, session);
                break;
                
            case STATES.ENTER_NOTIFY_PHONE:
                result = await handleNotificationPhone(userId, messageText, session);
                break;
                
            case STATES.CONFIRM_PAYMENT:
                result = await handleConfirmation(userId, messageText, session);
                break;
                
            default:
                console.error(`❌ [NYARADZO] Invalid flow state: ${session.state}`);
                deleteSession(userId);
                return {
                    message: constants.MESSAGING_CONFIG.DEFAULT_ERROR,
                    session: null
                };
        }
        
        console.log(`🌸 [NYARADZO] ========== END HANDLE REQUEST ==========`);
        return result;
        
    } catch (error) {
        console.error(`❌ [NYARADZO] Error:`, error);
        deleteSession(userId);
        return {
            message: constants.MESSAGING_CONFIG.DEFAULT_ERROR,
            session: null
        };
    }
}

// ============================================================================
// STEP 1: POLICY NUMBER ENTRY
// ============================================================================

/**
 * Handle policy number entry
 * Validates format and verifies with HotRecharge
 */
async function handlePolicyEntry(userId, message, session) {
    console.log(`🌸 [NYARADZO] >> handlePolicyEntry`);
    
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
    
    await messaging.sendMessage(userId, constants.UI_MESSAGES.BILLS.NYARADZO.VERIFYING);
    
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

// ============================================================================
// STEP 2: AMOUNT ENTRY
// ============================================================================

/**
 * Handle amount entry
 * Validates amount range and calculates fees
 */
async function handleAmountEntry(userId, message, session) {
    console.log(`🌸 [NYARADZO] >> handleAmountEntry`);
    
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
    session.state = STATES.SELECT_PAYMENT_METHOD;
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
        constants.UI_MESSAGES.PAYMENT_METHOD_PROMPT.ZIG;
    
    return {
        message: message_text,
        session: session
    };
}

// ============================================================================
// STEP 3: PAYMENT METHOD SELECTION
// ============================================================================

/**
 * Handle payment method selection
 * Maps selection to ZiG payment methods and routes accordingly
 */
async function handlePaymentMethodSelection(userId, message, session) {
    console.log(`🌸 [NYARADZO] >> handlePaymentMethodSelection`);
    
    const selection = message.trim();
    const validOptions = constants.VALIDATION_CONFIG.PAYMENT_METHOD.ZIG_OPTIONS;
    
    if (!validOptions.includes(selection)) {
        const retriesExceeded = incrementRetries(userId);
        
        if (retriesExceeded) {
            deleteSession(userId);
            return {
                message: constants.RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS,
                session: null
            };
        }
        
        return {
            message: `⚠️ *Invalid Selection*\n\nPlease select 1-4:`,
            session: session
        };
    }
    
    // Map selection to ZiG payment method code
    const methodMap = {
        '1': PAYMENT_PROVIDERS.ZIG.ECOCASH,
        '2': PAYMENT_PROVIDERS.ZIG.ZIMSWITCH,
        '3': PAYMENT_PROVIDERS.ZIG.PAYGO,
        '4': PAYMENT_PROVIDERS.ZIG.ONEMONEY
    };
    
    const paymentMethodCode = methodMap[selection];
    const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
    
    session.data.paymentMethodCode = paymentMethodCode;
    session.data.paymentMethodName = methodConfig.name;
    session.data.paymentProvider = methodConfig.provider;
    session.data.requiresPaymentPhone = methodConfig.requiresPhone;
    
    // If payment method requires phone number, ask for it
    if (methodConfig.requiresPhone) {
        session.state = STATES.ENTER_PAYMENT_PHONE;
        updateSession(userId, { state: session.state, data: session.data });
        
        let phonePrompt;
        switch(methodConfig.provider) {
            case 'ecocash':
                phonePrompt = constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.ECOCASH;
                break;
            case 'onemoney':
                phonePrompt = constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.ONEMONEY;
                break;
            case 'paygo':
                phonePrompt = constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.PAYGO;
                break;
            default:
                phonePrompt = constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.DEFAULT;
        }
        
        return {
            message: phonePrompt,
            session: session
        };
    } else {
        // Skip phone entry, go straight to notification phone
        session.state = STATES.ENTER_NOTIFY_PHONE;
        updateSession(userId, { state: session.state, data: session.data });
        
        return {
            message: constants.UI_MESSAGES.RECIPIENT_PROMPT.ZESA_NOTIFY,
            session: session
        };
    }
}

// ============================================================================
// STEP 4: PAYMENT PHONE ENTRY (if required)
// ============================================================================

/**
 * Handle payment phone number entry
 * Validates number against provider-specific prefixes
 */
async function handlePaymentPhone(userId, message, session) {
    console.log(`🌸 [NYARADZO] >> handlePaymentPhone`);
    
    const { paymentProvider } = session.data;
    
    const validationResult = validatePaymentPhone(message, paymentProvider);
    
    if (!validationResult.valid) {
        const retriesExceeded = incrementRetries(userId);
        
        if (retriesExceeded) {
            deleteSession(userId);
            return {
                message: constants.RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS,
                session: null
            };
        }
        
        return {
            message: validationResult.error,
            session: session
        };
    }
    
    session.data.paymentPhone = validationResult.formatted;
    session.data.paymentPhoneDisplay = validationResult.display;
    session.state = STATES.ENTER_NOTIFY_PHONE;
    updateSession(userId, { state: session.state, data: session.data });
    
    return {
        message: constants.UI_MESSAGES.RECIPIENT_PROMPT.ZESA_NOTIFY,
        session: session
    };
}

// ============================================================================
// STEP 5: NOTIFICATION PHONE ENTRY
// ============================================================================

/**
 * Handle notification phone number entry
 * This number receives SMS confirmation of the payment
 */
async function handleNotificationPhone(userId, message, session) {
    console.log(`🌸 [NYARADZO] >> handleNotificationPhone`);
    
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

// ============================================================================
// STEP 6: CONFIRMATION
// ============================================================================

/**
 * Build confirmation message with all transaction details
 */
function buildConfirmationMessage(data) {
    const {
        policyNumber,
        customerName,
        amount,
        feePercentage,
        feeAmount,
        totalAmount,
        paymentMethodName,
        paymentProvider,
        paymentPhoneDisplay,
        notifyNumberDisplay,
        billerName
    } = data;
    
    const baseFormatted = formatAmount(amount);
    const feeFormatted = formatAmount(feeAmount);
    const totalFormatted = formatAmount(totalAmount);
    
    let message = `🌸 *Confirm ${billerName} Payment*\n\n`;
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
 * Handle user's confirmation response
 */
async function handleConfirmation(userId, message, session) {
    console.log(`🌸 [NYARADZO] >> handleConfirmation`);
    
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

// ============================================================================
// STEP 7: TRANSACTION PROCESSING
// ============================================================================

/**
 * Process the complete transaction
 * Includes PayNow payment, HotRecharge fulfillment, and WordPress logging
 */
async function processTransaction(userId, session) {
    console.log(`🌸 [NYARADZO] >> processTransaction`);
    
    try {
        const { 
            policyNumber,
            amount,
            totalAmount,
            paymentProvider,
            paymentMethodCode,
            paymentMethodName,
            paymentPhone,
            notifyNumber,
            customerName
        } = session.data;
        
        const reference = `NYR${Date.now().toString().slice(-8)}`;
        
        // Map payment provider to what PayNow expects
        let paynowMethod = paymentProvider;
        
        if (paymentProvider === 'ecocash') {
            paynowMethod = 'ecocash';
        } else if (paymentProvider === 'onemoney') {
            paynowMethod = 'onemoney';
        } else if (paymentProvider === 'paygo') {
            paynowMethod = 'paygo';
        } else if (paymentProvider === 'zimswitch') {
            paynowMethod = 'zimswitch';
        }
        
        // Initiate PayNow payment
        const paynowResult = await paynow.initiateQuickPay({
            amount: totalAmount,
            reference: reference,
            phone: paymentPhone,
            method: paynowMethod,
            paymentMethodCode: paymentMethodCode,
            service: 'Nyaradzo Funeral',
            currency: 'ZiG'
        });
        
        if (!paynowResult.success) {
            // ========================================================================
            // LOG PAYMENT INITIATION FAILURE
            // ========================================================================
            const failureData = {
                success: false,
                reference: reference,
                customerPhone: notifyNumber,
                amount: amount,
                totalAmount: totalAmount,
                currency: 'ZiG',
                paymentMethod: paymentProvider,
                paymentMethodName: paymentMethodName,
                userId: userId,
                error: paynowResult.error,
                metadata: {
                    policyNumber: policyNumber,
                    customerName: customerName,
                    feeAmount: session.data.feeAmount,
                    paymentPhone: paymentPhone
                }
            };
            
            if (hotrecharge.logToWordPress) {
                hotrecharge.logToWordPress(failureData, 'nyaradzo');
            }
            
            return {
                message: `❌ *Payment Failed*\n\n${paynowResult.error}`
            };
        }
        
        // For methods that don't require polling (Zimswitch)
        if (paymentProvider === 'zimswitch') {
            return {
                message: paynowResult.instructions + `\n\n⏳ After payment, your Nyaradzo payment confirmation will be sent to ${maskPhone(notifyNumber)}`
            };
        }
        
        // For mobile money methods (EcoCash, OneMoney, PayGo), poll for status
        await messaging.sendMessage(userId, `⏳ Waiting for payment confirmation...\n\nCheck your phone and enter PIN when prompted.`);
        
        let paymentConfirmed = false;
        let attempts = 0;
        let paymentStatus = null;
        
        while (!paymentConfirmed && attempts < POLLING_CONFIG.MAX_ATTEMPTS) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, POLLING_CONFIG.INTERVAL_MS));
            
            paymentStatus = await paynow.checkPaymentStatus(paynowResult.pollUrl);
            
            if (paymentStatus.paid) {
                paymentConfirmed = true;
                break;
            }
        }
        
        if (!paymentConfirmed) {
            // ========================================================================
            // LOG PAYMENT TIMEOUT
            // ========================================================================
            const timeoutData = {
                success: false,
                reference: reference,
                customerPhone: notifyNumber,
                amount: amount,
                totalAmount: totalAmount,
                currency: 'ZiG',
                paymentMethod: paymentProvider,
                paymentMethodName: paymentMethodName,
                userId: userId,
                error: 'Payment timeout after 90 seconds',
                metadata: {
                    policyNumber: policyNumber,
                    customerName: customerName,
                    feeAmount: session.data.feeAmount,
                    paymentPhone: paymentPhone,
                    pollUrl: paynowResult.pollUrl
                }
            };
            
            if (hotrecharge.logToWordPress) {
                hotrecharge.logToWordPress(timeoutData, 'nyaradzo');
            }
            
            return {
                message: `❌ *Payment Timeout*\n\nPayment not confirmed after ${POLLING_CONFIG.TOTAL_TIMEOUT_MS/1000} seconds. Please check your mobile money app and try again.\n\nReference: ${reference}`
            };
        }
        
        await messaging.sendMessage(userId, `✅ Payment confirmed! Now processing Nyaradzo payment...`);
        
        // Process Nyaradzo payment via HotRecharge
        const paymentResult = await hotrecharge.nyaradzo.purchase({
            policyNumber,
            amount,
            notifyNumber,
            paymentPhone,
            userId,
            customerName,
            reference
        });
        
        // ========================================================================
        // LOG FINAL TRANSACTION RESULT TO WORDPRESS
        // ========================================================================
        const transactionData = {
            success: paymentResult.success,
            reference: reference,
            agentReference: paymentResult.transactionId || reference,
            customerPhone: notifyNumber,
            amount: amount,
            totalAmount: totalAmount,
            currency: 'ZiG',
            paymentMethod: paymentProvider,
            paymentMethodName: paymentMethodName,
            userId: userId,
            metadata: {
                policyNumber: policyNumber,
                customerName: customerName,
                feeAmount: session.data.feeAmount,
                paymentPhone: paymentPhone,
                transactionId: paymentResult.transactionId,
                paynowReference: paymentStatus?.reference
            },
            rawResponse: paymentResult
        };
        
        if (hotrecharge.logToWordPress) {
            hotrecharge.logToWordPress(transactionData, 'nyaradzo');
        }
        
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
        console.error('❌ [NYARADZO] Transaction error:', error);
        
        // ========================================================================
        // LOG EXCEPTION
        // ========================================================================
        const exceptionData = {
            success: false,
            reference: session.data?.reference || `NYR${Date.now()}`,
            customerPhone: session.data?.notifyNumber,
            amount: session.data?.amount,
            totalAmount: session.data?.totalAmount,
            currency: 'ZiG',
            paymentMethod: session.data?.paymentProvider,
            paymentMethodName: session.data?.paymentMethodName,
            userId: userId,
            error: error.message,
            metadata: {
                policyNumber: session.data?.policyNumber,
                customerName: session.data?.customerName
            }
        };
        
        if (hotrecharge.logToWordPress) {
            hotrecharge.logToWordPress(exceptionData, 'nyaradzo');
        }
        
        return {
            message: `❌ *Error*\n\nAn error occurred. Please try again.`
        };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    startFlow,
    handleRequest,
    calculateFee,
    formatAmount,
    maskPhone,
    validatePolicy,
    validatePaymentPhone
};
