// services/zesa.js
// ============================================================================
// ZESA TOKEN PURCHASE FLOW
// Handles the complete ZESA token purchase flow:
// 1. Currency selection (ZiG/USD)
// 2. Meter number entry & verification
// 3. Amount entry with fee calculation (5% service fee)
// 4. Payment method selection (all 8 methods based on currency)
// 5. Payment phone entry (if required)
// 6. Notification phone entry (for SMS token)
// 7. Transaction confirmation
// 8. PayNow payment processing
// 9. HotRecharge token fulfillment with TiDB logging
// 
// Currency Rules:
// - ZiG: Supports EcoCash, Zimswitch, OneMoney
// - USD: Supports EcoCash, Zimswitch, Omari, InnBucks
// ============================================================================

const currencyGate = require('./currencyGate');
const paynow = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { createSession, updateSession, getActiveSession, deleteSession } = require('../handlers/sessionHandlers');
const constants = require('../config/constants');

// ============================================================================
// CONSTANTS FROM CONFIG
// ============================================================================
const STATES = constants.FLOW_STATES.ZESA;
const PHONE_REGEX = constants.PHONE_PATTERN;
const { PAYMENT_PROVIDERS, PAYMENT_METHOD_NAMES, PAYMENT_METHOD_CONFIG, PAYMENT_PREFIXES } = constants;

// ============================================================================
// POLLING CONFIGURATION
// ============================================================================
const POLLING_CONFIG = {
    MAX_ATTEMPTS: 30,      // 30 attempts
    INTERVAL_MS: 3000,     // 3 seconds
    TOTAL_TIMEOUT_MS: 90000 // 90 seconds (30 * 3)
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate ZESA service fee (5%)
 * 
 * @param {number} amount - Base purchase amount
 * @param {string} currency - Currency ('zig' or 'usd')
 * @returns {Object} Fee details with percentage, amount, and total
 */
function calculateZesaFee(amount, currency) {
    const feePercentage = constants.PAYMENT_CONFIG.SERVICE_FEES.ZESA; // 0.05 (5%)
    const feeAmount = amount * feePercentage;
    const totalAmount = amount + feeAmount;
    
    return {
        feePercentage: feePercentage * 100, // 5% for display
        feeAmount: feeAmount,
        totalAmount: totalAmount,
        currency: currency
    };
}

/**
 * Format amount with currency symbol for display
 * 
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency ('zig' or 'usd')
 * @returns {string} Formatted amount with symbol
 */
function formatAmountWithCurrency(amount, currency) {
    if (currency === 'usd') {
        return `$${amount.toFixed(2)}`;
    } else {
        return `${amount.toLocaleString()} ZiG`;
    }
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
 * Validate payment phone with provider-specific prefix rules
 * 
 * @param {string} phone - Raw phone input
 * @param {string} provider - Payment provider (ecocash, onemoney, omari)
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
        case 'omari':
            allowedPrefixes = PAYMENT_PREFIXES.OMARI;
            providerName = 'Omari';
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

/**
 * Send intermediate message (like "Verifying...")
 */
async function sendIntermediateMessage(userId, text) {
    const messaging = require('../utils/messaging');
    await messaging.sendMessage(userId, text);
}

// ============================================================================
// FLOW INITIATION
// ============================================================================

/**
 * Start the ZESA token purchase flow
 * 
 * @param {string} from - WhatsApp user ID
 * @param {string|null} currency - Optional pre-selected currency
 * @returns {Promise<Object>} Result with message and session
 */
async function startFlow(from, currency = null) {
    console.log(`⚡ [ZESA] Starting flow for user: ${from}`);
    
    deleteSession(from);
    const session = createSession(from, constants.SERVICE_TYPES.ZESA);
    
    session.state = STATES.SELECT_CURRENCY;
    session.data = { userId: from };

    if (currency) {
        session.data.currency = currency.toLowerCase();
        session.state = STATES.ENTER_METER;
        updateSession(from, { state: session.state, data: session.data });
        
        return {
            message: `⚡ *ZESA Purchase*\n\nPlease enter your 11-digit ZESA meter number:`,
            session: session
        };
    }

    updateSession(from, { state: session.state, data: session.data });
    
    return {
        message: constants.UI_MESSAGES.CURRENCY_PROMPT.ZESA,
        session: session
    };
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
    console.log(`⚡ [ZESA] Handling message - State: ${session.state}`);
    
    const activeSession = getActiveSession(userId);
    if (!activeSession) {
        return {
            message: constants.RESPONSE_MESSAGES.SESSION_EXPIRED,
            session: null
        };
    }
    
    try {
        let result;
        
        switch (session.state) {
            case STATES.SELECT_CURRENCY:
                result = await handleCurrencySelection(userId, messageText, session);
                break;
            case STATES.ENTER_METER:
                result = await handleMeterEntry(userId, messageText, session);
                break;
            case STATES.VERIFYING_METER:
                result = await handleMeterVerification(userId, messageText, session);
                break;
            case STATES.ENTER_AMOUNT:
                result = await handleAmountEntry(userId, messageText, session);
                break;
            case STATES.SELECT_PAYMENT_METHOD:
                result = await handlePaymentMethodSelection(userId, messageText, session);
                break;
            case STATES.ENTER_PAYMENT_PHONE:
                result = await handlePaymentPhone(userId, messageText, session);
                break;
            case STATES.ENTER_NOTIFICATION_PHONE:
                result = await handleNotificationPhone(userId, messageText, session);
                break;
            case STATES.CONFIRM_PAYMENT:
                result = await handleConfirmation(userId, messageText, session);
                break;
            default:
                deleteSession(userId);
                return {
                    message: `❌ *Error*\n\nSomething went wrong. Please type *hi* to restart.`,
                    session: null
                };
        }
        
        return result;
        
    } catch (error) {
        console.error(`❌ [ZESA] Error:`, error);
        deleteSession(userId);
        return {
            message: `❌ *Error*\n\nAn error occurred. Please type *hi* to restart.`,
            session: null
        };
    }
}

// ============================================================================
// STEP 1: CURRENCY SELECTION
// ============================================================================

/**
 * Handle user's currency selection
 */
async function handleCurrencySelection(userId, message, session) {
    let currency;
    
    if (message === '1' || message.toLowerCase().includes('zig')) {
        currency = 'zig';
    } else if (message === '2' || message.toLowerCase().includes('usd')) {
        currency = 'usd';
    } else {
        return {
            message: constants.UI_MESSAGES.CURRENCY_PROMPT.ZESA,
            session: session
        };
    }
    
    const gateCheck = currencyGate.checkCurrency('ZESA', currency);
    if (!gateCheck.allowed) {
        deleteSession(userId);
        return {
            message: gateCheck.message,
            session: null
        };
    }
    
    session.data.currency = currency;
    session.state = STATES.ENTER_METER;
    updateSession(userId, { state: session.state, data: session.data });
    
    return {
        message: `⚡ *ZESA Purchase*\n\nPlease enter your 11-digit ZESA meter number:`,
        session: session
    };
}

// ============================================================================
// STEP 2: METER NUMBER ENTRY
// ============================================================================

/**
 * Handle meter number entry
 */
async function handleMeterEntry(userId, message, session) {
    const meterNumber = message.replace(/\s/g, '');
    
    if (!/^\d{11}$/.test(meterNumber)) {
        return {
            message: `⚠️ *Invalid Meter*\n\nPlease enter a valid 11-digit ZESA meter number:`,
            session: session
        };
    }
    
    session.data.meterNumber = meterNumber;
    session.state = STATES.VERIFYING_METER;
    updateSession(userId, { state: session.state, data: session.data });
    
    await sendIntermediateMessage(userId, `⏳ Verifying meter...`);
    
    const verifyResult = await hotrecharge.verifyZesaMeter(meterNumber, session.data.currency);
    
    if (verifyResult.success) {
        session.data.customerName = verifyResult.customerName;
        session.state = STATES.ENTER_AMOUNT;
        updateSession(userId, { state: session.state, data: session.data });
        
        return {
            message: `✅ *Meter Verified!*\n\n` +
                    `Customer: ${verifyResult.customerName}\n` +
                    `Meter: ${meterNumber}\n\n` +
                    `────────────────\n` +
                    `Now enter amount to purchase:`,
            session: session
        };
    } else {
        session.state = STATES.VERIFYING_METER;
        updateSession(userId, { state: session.state, data: session.data });
        
        return {
            message: `❌ *Verification Failed*\n\n${verifyResult.error}\n\nWould you like to try another meter? (yes/no)`,
            session: session
        };
    }
}

// ============================================================================
// STEP 3: METER VERIFICATION RESPONSE
// ============================================================================

/**
 * Handle user's response after meter verification failure
 */
async function handleMeterVerification(userId, message, session) {
    if (message.toLowerCase() === 'yes' || message.toLowerCase() === 'y') {
        session.state = STATES.ENTER_METER;
        updateSession(userId, { state: session.state });
        
        return {
            message: `⚡ *ZESA Purchase*\n\nPlease enter the 11-digit ZESA meter number:`,
            session: session
        };
    } else {
        deleteSession(userId);
        return {
            message: `❌ *Cancelled*\n\nZESA purchase cancelled. Type *hi* for main menu.`,
            session: null
        };
    }
}

// ============================================================================
// STEP 4: AMOUNT ENTRY
// ============================================================================

/**
 * Handle amount entry with fee calculation
 */
async function handleAmountEntry(userId, message, session) {
    const amount = parseFloat(message);
    
    if (isNaN(amount) || amount <= 0) {
        return {
            message: `⚠️ *Invalid Amount*\n\nPlease enter a valid amount:`,
            session: session
        };
    }
    
    const zesaService = session.data.currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
    const amountCheck = zesaService.validateAmount(amount);
    
    if (!amountCheck.valid) {
        return {
            message: `⚠️ *Invalid Amount*\n\n${amountCheck.message}`,
            session: session
        };
    }
    
    const feeDetails = calculateZesaFee(amount, session.data.currency);
    
    session.data.amount = amount;
    session.data.feePercentage = feeDetails.feePercentage;
    session.data.feeAmount = feeDetails.feeAmount;
    session.data.totalAmount = feeDetails.totalAmount;
    
    session.state = STATES.SELECT_PAYMENT_METHOD;
    updateSession(userId, { state: session.state, data: session.data });
    
    const baseAmountFormatted = formatAmountWithCurrency(amount, session.data.currency);
    const feeFormatted = formatAmountWithCurrency(feeDetails.feeAmount, session.data.currency);
    const totalFormatted = formatAmountWithCurrency(feeDetails.totalAmount, session.data.currency);
    
    const paymentPrompt = session.data.currency === 'zig' 
        ? constants.UI_MESSAGES.PAYMENT_METHOD_PROMPT.ZIG
        : constants.UI_MESSAGES.PAYMENT_METHOD_PROMPT.USD;
    
    return {
        message: `💰 *Amount Breakdown*\n\n` +
                `Purchase Amount: ${baseAmountFormatted}\n` +
                `Service Fee (${feeDetails.feePercentage}%): ${feeFormatted}\n` +
                `────────────────\n` +
                `*Total to Pay:* ${totalFormatted}\n` +
                `────────────────\n\n` +
                `${paymentPrompt}`,
        session: session
    };
}

// ============================================================================
// STEP 5: PAYMENT METHOD SELECTION
// ============================================================================

/**
 * Handle payment method selection
 */
async function handlePaymentMethodSelection(userId, message, session) {
    const selection = message.trim();
    const { currency } = session.data;
    
    const validOptions = currency === 'zig' 
        ? constants.VALIDATION_CONFIG.PAYMENT_METHOD.ZIG_OPTIONS
        : constants.VALIDATION_CONFIG.PAYMENT_METHOD.USD_OPTIONS;
    
    if (!validOptions.includes(selection)) {
        return {
            message: `⚠️ *Invalid Selection*\n\nPlease select 1-4:`,
            session: session
        };
    }
    
    let paymentMethodCode;
    if (currency === 'zig') {
        const methodMap = {
            '1': PAYMENT_PROVIDERS.ZIG.ECOCASH,
            '2': PAYMENT_PROVIDERS.ZIG.ZIMSWITCH,
            '3': PAYMENT_PROVIDERS.ZIG.ONEMONEY
        };
        paymentMethodCode = methodMap[selection];
    } else {
        const methodMap = {
            '1': PAYMENT_PROVIDERS.USD.ECOCASH,
            '2': PAYMENT_PROVIDERS.USD.ZIMSWITCH,
            '3': PAYMENT_PROVIDERS.USD.INNBUCKS
        };
        paymentMethodCode = methodMap[selection];
    }
    
    const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
    
    session.data.paymentMethodCode = paymentMethodCode;
    session.data.paymentMethodName = methodConfig.name;
    session.data.paymentProvider = methodConfig.provider;
    session.data.requiresPaymentPhone = methodConfig.requiresPhone;
    
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
            case 'omari':
                phonePrompt = constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.OMARI;
                break;
            default:
                phonePrompt = constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.DEFAULT;
        }
        
        return {
            message: phonePrompt,
            session: session
        };
    } else {
        session.state = STATES.ENTER_NOTIFICATION_PHONE;
        updateSession(userId, { state: session.state, data: session.data });
        
        return {
            message: `📲 *Token SMS*\n\nPlease enter the phone number to receive the ZESA token:`,
            session: session
        };
    }
}

// ============================================================================
// STEP 6: PAYMENT PHONE ENTRY (if required)
// ============================================================================

/**
 * Handle payment phone number entry
 */
async function handlePaymentPhone(userId, message, session) {
    const { paymentProvider } = session.data;
    
    const validationResult = validatePaymentPhone(message, paymentProvider);
    
    if (!validationResult.valid) {
        return {
            message: validationResult.error,
            session: session
        };
    }
    
    session.data.paymentPhone = validationResult.formatted;
    session.data.paymentPhoneDisplay = validationResult.display;
    session.state = STATES.ENTER_NOTIFICATION_PHONE;
    updateSession(userId, { state: session.state, data: session.data });
    
    return {
        message: `📲 *Token SMS*\n\nPlease enter the phone number to receive the ZESA token:`,
        session: session
    };
}

// ============================================================================
// STEP 7: NOTIFICATION PHONE ENTRY
// ============================================================================

/**
 * Handle notification phone number entry
 * This number receives the SMS with the ZESA token
 */
async function handleNotificationPhone(userId, message, session) {
    if (!PHONE_REGEX.test(message)) {
        return {
            message: `⚠️ *Invalid Number*\n\nPlease enter a valid Zimbabwe phone number (e.g., 0771234567):`,
            session: session
        };
    }
    
    const digits = message.replace(/\D/g, '');
    let formatted = '';
    
    if (digits.length === 10 && digits.startsWith('0')) {
        formatted = '263' + digits.substring(1);
    } else if (digits.length === 12 && digits.startsWith('263')) {
        formatted = digits;
    } else if (digits.length === 9 && !digits.startsWith('0')) {
        formatted = '263' + digits;
    } else {
        formatted = digits;
    }
    
    session.data.notifyNumber = formatted;
    session.data.notifyDisplay = '0' + formatted.substring(3);
    session.state = STATES.CONFIRM_PAYMENT;
    updateSession(userId, { state: session.state, data: session.data });
    
    const confirmMessage = buildConfirmationMessage(session.data);
    
    return {
        message: confirmMessage,
        session: session
    };
}

// ============================================================================
// STEP 8: CONFIRMATION
// ============================================================================

/**
 * Build confirmation message with all transaction details
 */
function buildConfirmationMessage(data) {
    const {
        meterNumber,
        customerName,
        amount,
        feePercentage,
        feeAmount,
        totalAmount,
        currency,
        paymentMethodName,
        paymentProvider,
        paymentPhone,
        paymentPhoneDisplay,
        notifyDisplay
    } = data;
    
    const zesaService = currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
    
    const baseFormatted = zesaService.formatAmount(amount);
    const feeFormatted = formatAmountWithCurrency(feeAmount, currency);
    const totalFormatted = formatAmountWithCurrency(totalAmount, currency);
    
    let message = `⚡ *Confirm ZESA Purchase*\n\n`;
    message += `Customer: *${customerName || 'N/A'}*\n`;
    message += `Meter: *${meterNumber}*\n`;
    message += `────────────────\n`;
    message += `Purchase: *${baseFormatted}*\n`;
    message += `Fee (${feePercentage}%): *${feeFormatted}*\n`;
    message += `────────────────\n`;
    message += `*Total: ${totalFormatted}*\n`;
    message += `────────────────\n`;
    message += `Payment: *${paymentMethodName}*\n`;
    
    if (paymentPhone) {
        const displayPhone = paymentPhoneDisplay || maskPhone(paymentPhone);
        message += `📱 Paid with: *${displayPhone}*\n`;
    }
    
    message += `📲 Token SMS: *${maskPhone(notifyDisplay)}*\n`;
    message += `────────────────\n\n`;
    message += constants.UI_MESSAGES.CONFIRMATION.PROMPT;
    
    return message;
}

/**
 * Handle user's confirmation response
 */
async function handleConfirmation(userId, message, session) {
    const response = message.trim().toLowerCase();
    if (response === 'yes' || response === 'y') {
        session.state = 'PROCESSING';
        updateSession(userId, { state: session.state });
        
        const result = await processTransaction(userId, session);
        deleteSession(userId);
        
        return {
            message: result.message,
            session: null
        };
        
    } else if (response === 'no' || response === 'n') {
        deleteSession(userId);
        return {
            message: `❌ *Cancelled*\n\nZESA purchase cancelled. Type *hi* for main menu.`,
            session: null
        };
        
    } else {
        const confirmMessage = buildConfirmationMessage(session.data);
        
        return {
            message: `${constants.UI_MESSAGES.CONFIRMATION.INVALID}\n\n${confirmMessage}`,
            session: session
        };
    }
}

// ============================================================================
// STEP 9: TRANSACTION PROCESSING
// ============================================================================

/**
 * Process the complete transaction
 * Includes PayNow payment, HotRecharge token purchase, and TiDB logging
 */
async function processTransaction(userId, session) {
    try {
        const { 
            currency, 
            meterNumber, 
            amount, 
            totalAmount,
            paymentProvider,
            paymentMethodCode,
            paymentMethodName,
            paymentPhone, 
            notifyNumber,
            feeAmount,
            customerName
        } = session.data;
        
        const normalizedCurrency = currency.toLowerCase();
        const reference = `ZESA${Date.now().toString().slice(-8)}`;
        
        const formattedAmount = formatAmountWithCurrency(amount, currency);
        const formattedTotal = formatAmountWithCurrency(totalAmount, currency);
        
        // Map payment provider to what PayNow expects
        let paynowMethod = paymentProvider;
        
        if (paymentProvider === 'ecocash') {
            paynowMethod = 'ecocash';
        } else if (paymentProvider === 'onemoney') {
            paynowMethod = 'onemoney';
        } else if (paymentProvider === 'omari') {
            paynowMethod = 'omari';
        } else if (paymentProvider === 'zimswitch') {
            paynowMethod = 'zimswitch';
        } else if (paymentProvider === 'innbucks') {
            paynowMethod = 'innbucks';
        }
        
        console.log(`💳 [ZESA] Processing payment with method: ${paynowMethod}`);
        
        const paynowResult = await paynow.initiateQuickPay({
            amount: totalAmount,
            reference: reference,
            phone: paymentPhone,
            method: paynowMethod,
            paymentMethodCode: paymentMethodCode,
            service: 'ZESA',
            currency: normalizedCurrency
        });
        
        console.log(`🔍 [ZESA] PayNow result:`, {
            success: paynowResult.success,
            hasPollUrl: !!paynowResult.pollUrl
        });
        
        if (!paynowResult.success) {
            // ========================================================================
            // LOG PAYMENT INITIATION FAILURE TO TiDB
            // ========================================================================
            const failureData = {
                success: false,
                reference: reference,
                customerPhone: notifyNumber,
                amount: amount,
                totalAmount: totalAmount,
                currency: normalizedCurrency === 'usd' ? 'USD' : 'ZiG',
                paymentMethod: paymentProvider,
                paymentMethodName: paymentMethodName,
                userId: userId,
                error: paynowResult.error,
                metadata: {
                    meterNumber: meterNumber,
                    customerName: customerName,
                    feeAmount: feeAmount,
                    paymentPhone: paymentPhone
                }
            };
            
            if (hotrecharge.logToTiDB) {
                hotrecharge.logToTiDB(failureData, 'zesa');
            }
            
            return {
                message: `❌ *Payment Failed*\n\n${paynowResult.error}`
            };
        }
        
        // For methods that don't require polling (InnBucks, Zimswitch)
        if (paymentProvider === 'innbucks' || paymentProvider === 'zimswitch') {
            return {
                message: paynowResult.instructions + `\n\n⏳ After payment, your ZESA token will be sent to ${maskPhone(notifyNumber)}`
            };
        }
        
        // For mobile money methods (EcoCash, OneMoney, Omari), poll for status
        await sendIntermediateMessage(userId, `⏳ Waiting for payment confirmation...\n\nCheck your phone and enter PIN when prompted.`);
        
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
            // LOG PAYMENT TIMEOUT TO TiDB
            // ========================================================================
            const timeoutData = {
                success: false,
                reference: reference,
                customerPhone: notifyNumber,
                amount: amount,
                totalAmount: totalAmount,
                currency: normalizedCurrency === 'usd' ? 'USD' : 'ZiG',
                paymentMethod: paymentProvider,
                paymentMethodName: paymentMethodName,
                userId: userId,
                error: 'Payment timeout after 90 seconds',
                metadata: {
                    meterNumber: meterNumber,
                    customerName: customerName,
                    feeAmount: feeAmount,
                    paymentPhone: paymentPhone,
                    pollUrl: paynowResult.pollUrl
                }
            };
            
            if (hotrecharge.logToTiDB) {
                hotrecharge.logToTiDB(timeoutData, 'zesa');
            }
            
            return {
                message: `❌ *Payment Timeout*\n\nPayment not confirmed after ${POLLING_CONFIG.TOTAL_TIMEOUT_MS/1000} seconds. Please check your mobile money app and try again.\n\nReference: ${reference}`
            };
        }
        
        // Payment successful, purchase ZESA token
        await sendIntermediateMessage(userId, 
            `✅ *Payment Confirmed!*\n\n` +
            `🌶️ *Getting your ZESA token. Please wait...*\n\n` +
            `• Meter: ${meterNumber}\n` +
            `• Amount: ${formattedAmount}\n` +
            `• Customer: ${customerName}\n\n` +
            `⏳ *Processing...*`
        );
        
        const zesaService = normalizedCurrency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
        const tokenResult = await zesaService.purchaseToken({
            meterNumber,
            amount,
            notifyNumber,
            paymentPhone,
            userId,
            customerName,
            reference
        });
        
        // ========================================================================
        // LOG FINAL TRANSACTION RESULT TO TiDB
        // ========================================================================
        const transactionData = {
            success: tokenResult.success,
            reference: reference,
            agentReference: tokenResult.agentReference || reference,
            customerPhone: notifyNumber,
            amount: amount,
            totalAmount: totalAmount,
            currency: normalizedCurrency === 'usd' ? 'USD' : 'ZiG',
            paymentMethod: paymentProvider,
            paymentMethodName: paymentMethodName,
            userId: userId,
            metadata: {
                meterNumber: meterNumber,
                customerName: customerName,
                feeAmount: feeAmount,
                paymentPhone: paymentPhone,
                units: tokenResult.units,
                token: tokenResult.token,
                paynowReference: paymentStatus?.reference
            },
            rawResponse: tokenResult
        };
        
        if (tokenResult.success && hotrecharge.logToTiDB) {
            hotrecharge.logToTiDB(transactionData, 'zesa');
        } else if (!tokenResult.success && hotrecharge.logToTiDB) {
            transactionData.error = tokenResult.error || 'Token purchase failed';
            hotrecharge.logToTiDB(transactionData, 'zesa');
        }
        
        if (tokenResult.success) {
            const baseFormatted = zesaService.formatAmount(amount);
            
            return {
                message: `✅ *ZESA Purchase Successful!*\n\n` +
                        `Amount: ${baseFormatted}\n` +
                        `Total Paid: ${formattedTotal}\n` +
                        `Meter: ${meterNumber}\n` +
                        `Customer: ${customerName || 'N/A'}\n` +
                        `────────────────\n` +
                        `Units: ${tokenResult.units || 'N/A'}\n` +
                        `Token: ${tokenResult.token || 'N/A'}\n` +
                        `────────────────\n\n` +
                        `📲 Token sent to: ${maskPhone(notifyNumber)}\n\n` +
                        `Thank you for using CCHub! 💎`
            };
        } else {
            return {
                message: `⚠️ *Payment Successful*\n\n` +
                        `But token purchase failed.\n` +
                        `Reference: ${tokenResult.reference || reference}\n\n` +
                        `Please contact support with this reference.`
            };
        }
        
    } catch (error) {
        console.error('❌ [ZESA] Transaction error:', error);
        
        // ========================================================================
        // LOG EXCEPTION TO TiDB
        // ========================================================================
        const exceptionData = {
            success: false,
            reference: session.data?.reference || `ZESA${Date.now()}`,
            customerPhone: session.data?.notifyNumber,
            amount: session.data?.amount,
            totalAmount: session.data?.totalAmount,
            currency: session.data?.currency === 'usd' ? 'USD' : 'ZiG',
            paymentMethod: session.data?.paymentProvider,
            paymentMethodName: session.data?.paymentMethodName,
            userId: userId,
            error: error.message,
            metadata: {
                meterNumber: session.data?.meterNumber,
                customerName: session.data?.customerName
            }
        };
        
        if (hotrecharge.logToTiDB) {
            hotrecharge.logToTiDB(exceptionData, 'zesa');
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
    calculateZesaFee,
    formatAmountWithCurrency,
    maskPhone
};