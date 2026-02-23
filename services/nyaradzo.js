// services/nyaradzo.js - Nyaradzo Funeral Payment Flow
/**
 * Nyaradzo Flow Handler
 * Manages the conversation flow for Nyaradzo funeral policy payments
 * Supports: ZiG payments via EcoCash, Zimswitch, PayGo, OneMoney
 */

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

// Payment method constants for ZiG
const { PAYMENT_PROVIDERS, PAYMENT_METHOD_NAMES, PAYMENT_METHOD_CONFIG, PAYMENT_PREFIXES } = constants;

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
 * Validate payment phone with provider-specific rules
 */
function validatePaymentPhone(phone, provider) {
    const digits = phone.replace(/\D/g, '');
    let formatted = '';
    let display = '';
    
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
    
    // Check if formatted number starts with any allowed prefix
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

/**
 * Start Nyaradzo flow
 */
async function startFlow(from) {
    console.log(`⚰️ [NYARADZO] ========== START FLOW ==========`);
    console.log(`⚰️ [NYARADZO] Starting flow for user: ${from}`);
    
    console.log(`⚰️ [NYARADZO] Step 1: Deleting existing session for ${from}`);
    deleteSession(from);
    
    console.log(`⚰️ [NYARADZO] Step 2: Creating new session for ${from}`);
    const session = createSession(from, constants.SERVICE_TYPES.BILL_PAYMENT);
    console.log(`⚰️ [NYARADZO] Session created:`, {
        service: session.service,
        flow: session.flow,
        state: session.state
    });
    
    console.log(`⚰️ [NYARADZO] Step 3: Setting session state to ENTER_ACCOUNT`);
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
    console.log(`⚰️ [NYARADZO] Session data set:`, session.data);

    console.log(`⚰️ [NYARADZO] Step 4: Updating session in global store`);
    updateSession(from, { 
        state: session.state, 
        data: session.data 
    });
    
    console.log(`⚰️ [NYARADZO] Step 5: Verifying session was updated`);
    const verifySession = getActiveSession(from);
    console.log(`⚰️ [NYARADZO] Verified session state: ${verifySession?.state}`);
    
    const policyPrompt = constants.UI_MESSAGES.BILLS.NYARADZO.POLICY_PROMPT;
    console.log(`⚰️ [NYARADZO] Step 6: Returning policy prompt message`);
    console.log(`⚰️ [NYARADZO] Message to send: "${policyPrompt.substring(0, 50)}..."`);
    
    const result = {
        message: policyPrompt,
        session: verifySession || session
    };
    console.log(`⚰️ [NYARADZO] Return result object:`, {
        hasMessage: !!result.message,
        hasSession: !!result.session,
        sessionState: result.session?.state
    });
    console.log(`⚰️ [NYARADZO] ========== END START FLOW ==========`);
    
    return result;
}

/**
 * Handle Nyaradzo flow messages
 */
async function handleRequest(userId, messageText, session) {
    console.log(`⚰️ [NYARADZO] ========== HANDLE REQUEST ==========`);
    console.log(`⚰️ [NYARADZO] User: ${userId}`);
    console.log(`⚰️ [NYARADZO] Message: "${messageText}"`);
    console.log(`⚰️ [NYARADZO] Current state: ${session.state}`);
    console.log(`⚰️ [NYARADZO] Session data:`, session.data);
    
    const activeSession = getActiveSession(userId);
    if (!activeSession) {
        console.log(`⚰️ [NYARADZO] ⚠️ No active session found for ${userId}`);
        return {
            message: constants.RESPONSE_MESSAGES.SESSION_EXPIRED,
            session: null
        };
    }
    console.log(`⚰️ [NYARADZO] Active session verified`);
    
    try {
        let result;
        console.log(`⚰️ [NYARADZO] Routing based on state: ${session.state}`);
        
        switch (session.state) {
            case STATES.ENTER_ACCOUNT:
                console.log(`⚰️ [NYARADZO] Routing to handlePolicyEntry`);
                result = await handlePolicyEntry(userId, messageText, session);
                break;
                
            case STATES.VERIFYING_ACCOUNT:
                console.log(`⚰️ [NYARADZO] In VERIFYING_ACCOUNT state, ignoring message`);
                return {
                    message: null,
                    session: session
                };
                
            case STATES.ENTER_AMOUNT:
                console.log(`⚰️ [NYARADZO] Routing to handleAmountEntry`);
                result = await handleAmountEntry(userId, messageText, session);
                break;
                
            case STATES.SELECT_PAYMENT_METHOD:
                console.log(`⚰️ [NYARADZO] Routing to handlePaymentMethodSelection`);
                result = await handlePaymentMethodSelection(userId, messageText, session);
                break;
                
            case STATES.ENTER_PAYMENT_PHONE:
                console.log(`⚰️ [NYARADZO] Routing to handlePaymentPhone`);
                result = await handlePaymentPhone(userId, messageText, session);
                break;
                
            case STATES.ENTER_NOTIFY_PHONE:
                console.log(`⚰️ [NYARADZO] Routing to handleNotificationPhone`);
                result = await handleNotificationPhone(userId, messageText, session);
                break;
                
            case STATES.CONFIRM_PAYMENT:
                console.log(`⚰️ [NYARADZO] Routing to handleConfirmation`);
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
        
        console.log(`⚰️ [NYARADZO] Handler returned:`, {
            hasMessage: !!result?.message,
            hasSession: !!result?.session,
            newState: result?.session?.state
        });
        console.log(`⚰️ [NYARADZO] ========== END HANDLE REQUEST ==========`);
        return result;
        
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
    console.log(`⚰️ [NYARADZO] >> handlePolicyEntry`);
    console.log(`⚰️ [NYARADZO] Validating policy: "${message}"`);
    
    const validation = validatePolicy(message);
    console.log(`⚰️ [NYARADZO] Validation result:`, validation);
    
    if (!validation.valid) {
        const retriesExceeded = incrementRetries(userId);
        console.log(`⚰️ [NYARADZO] Retries exceeded: ${retriesExceeded}`);
        
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
    console.log(`⚰️ [NYARADZO] Updated session state to VERIFYING_ACCOUNT`);
    
    console.log(`⚰️ [NYARADZO] Sending verification in progress message`);
    await messaging.sendMessage(userId, constants.UI_MESSAGES.BILLS.NYARADZO.VERIFYING);
    
    console.log(`⚰️ [NYARADZO] Calling hotrecharge.nyaradzo.verifyPolicy for ${validation.cleaned}`);
    const verifyResult = await hotrecharge.nyaradzo.verifyPolicy(validation.cleaned);
    console.log(`⚰️ [NYARADZO] Verification result:`, verifyResult);
    
    if (verifyResult.success) {
        session.data.customerName = verifyResult.customerName;
        session.data.policyStatus = verifyResult.status;
        session.state = STATES.ENTER_AMOUNT;
        updateSession(userId, { state: session.state, data: session.data });
        console.log(`⚰️ [NYARADZO] Verification successful, state updated to ENTER_AMOUNT`);
        
        const verifiedMessage = constants.UI_MESSAGES.BILLS.NYARADZO.VERIFIED(
            validation.cleaned,
            verifyResult.customerName || 'N/A'
        );
        
        console.log(`⚰️ [NYARADZO] Sending verified message`);
        await messaging.sendMessage(userId, verifiedMessage);
        
        console.log(`⚰️ [NYARADZO] Returning amount prompt`);
        return {
            message: constants.UI_MESSAGES.BILLS.NYARADZO.AMOUNT_PROMPT,
            session: session
        };
        
    } else {
        console.log(`⚰️ [NYARADZO] Verification failed`);
        const errorMsg = verifyResult.error === 'Policy not found' 
            ? constants.ERROR_MESSAGES.POLICY_NOT_FOUND(validation.cleaned)
            : constants.ERROR_MESSAGES.VERIFICATION_FAILED;
        
        session.state = STATES.ENTER_ACCOUNT;
        session.retries = 0;
        updateSession(userId, { state: session.state, data: session.data });
        console.log(`⚰️ [NYARADZO] Reset state to ENTER_ACCOUNT for retry`);
        
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
    console.log(`⚰️ [NYARADZO] >> handleAmountEntry`);
    console.log(`⚰️ [NYARADZO] Amount entered: "${message}"`);
    
    const amount = parseFloat(message.replace(/,/g, ''));
    console.log(`⚰️ [NYARADZO] Parsed amount: ${amount}`);
    
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
    
    console.log(`⚰️ [NYARADZO] Validating amount range: min=${session.data.minAmount}, max=${session.data.maxAmount}`);
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
    console.log(`⚰️ [NYARADZO] Fee calculation:`, feeDetails);
    
    session.data.amount = amount;
    session.data.feePercentage = feeDetails.feePercentage;
    session.data.feeAmount = feeDetails.feeAmount;
    session.data.totalAmount = feeDetails.totalAmount;
    session.state = STATES.SELECT_PAYMENT_METHOD;
    updateSession(userId, { state: session.state, data: session.data });
    console.log(`⚰️ [NYARADZO] Updated session state to SELECT_PAYMENT_METHOD`);
    
    const baseFormatted = formatAmount(amount);
    const feeFormatted = formatAmount(feeDetails.feeAmount);
    const totalFormatted = formatAmount(feeDetails.totalAmount);
    
    // Use ZiG payment methods prompt
    const message_text = `💰 *Amount Breakdown*\n\n` +
        `Payment Amount: ${baseFormatted}\n` +
        `Service Fee (${feeDetails.feePercentage}%): ${feeFormatted}\n` +
        `────────────────\n` +
        `*Total to Pay:* ${totalFormatted}\n` +
        `────────────────\n\n` +
        constants.UI_MESSAGES.PAYMENT_METHOD_PROMPT.ZIG;
    
    console.log(`⚰️ [NYARADZO] Returning payment method selection prompt`);
    return {
        message: message_text,
        session: session
    };
}

/**
 * Handle payment method selection
 */
async function handlePaymentMethodSelection(userId, message, session) {
    console.log(`⚰️ [NYARADZO] >> handlePaymentMethodSelection`);
    console.log(`⚰️ [NYARADZO] Selection: "${message}"`);
    
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
    
    console.log(`⚰️ [NYARADZO] Selected payment method: ${methodConfig.name}`);
    
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

/**
 * Handle payment phone number entry
 */
async function handlePaymentPhone(userId, message, session) {
    console.log(`⚰️ [NYARADZO] >> handlePaymentPhone`);
    console.log(`⚰️ [NYARADZO] Phone entered: "${message}"`);
    
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
    console.log(`⚰️ [NYARADZO] Updated session state to ENTER_NOTIFY_PHONE`);
    
    return {
        message: constants.UI_MESSAGES.RECIPIENT_PROMPT.ZESA_NOTIFY,
        session: session
    };
}

/**
 * Handle notification phone number entry
 */
async function handleNotificationPhone(userId, message, session) {
    console.log(`⚰️ [NYARADZO] >> handleNotificationPhone`);
    console.log(`⚰️ [NYARADZO] Notification phone entered: "${message}"`);
    
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
    console.log(`⚰️ [NYARADZO] Formatted notification phone: ${formattedPhone}`);
    
    session.data.notifyNumber = formattedPhone;
    session.data.notifyNumberDisplay = message;
    session.state = STATES.CONFIRM_PAYMENT;
    updateSession(userId, { state: session.state, data: session.data });
    console.log(`⚰️ [NYARADZO] Updated session state to CONFIRM_PAYMENT`);
    
    const confirmMessage = buildConfirmationMessage(session.data);
    console.log(`⚰️ [NYARADZO] Built confirmation message`);
    
    return {
        message: confirmMessage,
        session: session
    };
}

/**
 * Build confirmation message
 */
function buildConfirmationMessage(data) {
    console.log(`⚰️ [NYARADZO] Building confirmation message with data:`, {
        policyNumber: data.policyNumber,
        customerName: data.customerName,
        amount: data.amount,
        totalAmount: data.totalAmount,
        paymentMethodName: data.paymentMethodName
    });
    
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
    console.log(`⚰️ [NYARADZO] >> handleConfirmation`);
    console.log(`⚰️ [NYARADZO] User response: "${message}"`);
    
    if (message === '1') {
        console.log(`⚰️ [NYARADZO] User confirmed, proceeding to payment`);
        session.state = STATES.PROCESSING;
        updateSession(userId, { state: session.state });
        
        await messaging.sendMessage(userId, constants.UI_MESSAGES.BILLS.NYARADZO.PROCESSING);
        
        const result = await processTransaction(userId, session);
        console.log(`⚰️ [NYARADZO] Transaction result:`, result);
        deleteSession(userId);
        
        return {
            message: result.message,
            session: null
        };
        
    } else if (message === '2') {
        console.log(`⚰️ [NYARADZO] User cancelled`);
        deleteSession(userId);
        return {
            message: `❌ *Cancelled*\n\nNyaradzo payment cancelled. Type *hi* for main menu.`,
            session: null
        };
        
    } else {
        console.log(`⚰️ [NYARADZO] Invalid response: "${message}"`);
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
    console.log(`⚰️ [NYARADZO] >> processTransaction`);
    console.log(`⚰️ [NYARADZO] Processing transaction for user ${userId}`);
    
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
        
        console.log(`⚰️ [NYARADZO] Transaction details:`, {
            policyNumber,
            amount,
            totalAmount,
            paymentMethod: paymentMethodName,
            notifyNumber: maskPhone(notifyNumber)
        });
        
        const reference = `NYR${Date.now().toString().slice(-8)}`;
        console.log(`⚰️ [NYARADZO] Generated reference: ${reference}`);
        
        console.log(`⚰️ [NYARADZO] Initiating PayNow payment...`);
        const paynowResult = await paynow.initiateQuickPay({
            amount: totalAmount,
            reference: reference,
            phone: paymentPhone,
            method: paymentProvider,
            paymentMethodCode: paymentMethodCode,
            service: 'Nyaradzo Funeral',
            currency: 'ZiG'
        });
        
        console.log(`⚰️ [NYARADZO] PayNow result:`, {
            success: paynowResult.success,
            hasPollUrl: !!paynowResult.pollUrl
        });
        
        if (!paynowResult.success) {
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
        
        // For InnBucks
        if (paymentProvider === 'innbucks') {
            return {
                message: paynowResult.instructions + `\n\n⏳ After payment, your Nyaradzo payment confirmation will be sent to ${maskPhone(notifyNumber)}`
            };
        }
        
        // For mobile money methods (EcoCash, OneMoney, PayGo), we need to poll
        await messaging.sendMessage(userId, `⏳ Waiting for payment confirmation...\n\nCheck your phone and enter PIN when prompted.`);
        
        let paymentConfirmed = false;
        let attempts = 0;
        
        console.log(`⚰️ [NYARADZO] Starting payment polling (max ${POLLING_CONFIG.MAX_ATTEMPTS} attempts)`);
        while (!paymentConfirmed && attempts < POLLING_CONFIG.MAX_ATTEMPTS) {
            attempts++;
            console.log(`⚰️ [NYARADZO] Polling attempt ${attempts}/${POLLING_CONFIG.MAX_ATTEMPTS}`);
            
            await new Promise(resolve => setTimeout(resolve, POLLING_CONFIG.INTERVAL_MS));
            
            const status = await paynow.checkPaymentStatus(paynowResult.pollUrl);
            console.log(`⚰️ [NYARADZO] Payment status:`, status);
            
            if (status.paid) {
                paymentConfirmed = true;
                console.log(`⚰️ [NYARADZO] Payment confirmed on attempt ${attempts}`);
                break;
            }
        }
        
        if (!paymentConfirmed) {
            console.log(`⚰️ [NYARADZO] Payment timeout after ${attempts} attempts`);
            return {
                message: `❌ *Payment Timeout*\n\nPayment not confirmed after ${POLLING_CONFIG.TOTAL_TIMEOUT_MS/1000} seconds. Please check your mobile money app and try again.\n\nReference: ${reference}`
            };
        }
        
        await messaging.sendMessage(userId, `✅ Payment confirmed! Now processing Nyaradzo payment...`);
        
        console.log(`⚰️ [NYARADZO] Calling hotrecharge.nyaradzo.purchase...`);
        const paymentResult = await hotrecharge.nyaradzo.purchase({
            policyNumber,
            amount,
            notifyNumber,
            paymentPhone,
            userId,
            customerName,
            reference
        });
        
        console.log(`⚰️ [NYARADZO] Nyaradzo purchase result:`, paymentResult);
        
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
    validatePolicy,
    validatePaymentPhone
};
