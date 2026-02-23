// services/zesa.js - COMPLETE UPDATED with All Payment Methods
/**
 * ZESA Flow Handler
 * Manages the conversation flow for ZESA purchases with service fees
 * Supports: ZiG (EcoCash, Zimswitch, PayGo, OneMoney) and USD (EcoCash, Zimswitch, PayGo, InnBucks)
 */

const currencyGate = require('./currencyGate');
const paynow = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { createSession, updateSession, getActiveSession, deleteSession } = require('../handlers/sessionHandlers');
const constants = require('../config/constants');

// Flow states from constants
const STATES = constants.FLOW_STATES.ZESA;

// Phone validation from constants
const PHONE_REGEX = constants.PHONE_PATTERN;

// Payment method constants
const { PAYMENT_PROVIDERS, PAYMENT_METHOD_NAMES, PAYMENT_METHOD_CONFIG, PAYMENT_PREFIXES } = constants;

// Polling configuration
const POLLING_CONFIG = {
    MAX_ATTEMPTS: 30,      // 30 attempts
    INTERVAL_MS: 3000,     // 3 seconds
    TOTAL_TIMEOUT_MS: 90000 // 90 seconds (30 * 3)
};

/**
 * Calculate ZESA service fee
 * @param {number} amount - Purchase amount
 * @param {string} currency - 'zig' or 'usd'
 * @returns {Object} Fee details
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
 * Format amount with currency symbol
 * @param {number} amount - Amount to format
 * @param {string} currency - 'zig' or 'usd'
 * @returns {string} Formatted amount
 */
function formatAmountWithCurrency(amount, currency) {
    if (currency === 'usd') {
        return `$${amount.toFixed(2)}`;
    } else {
        return `${amount.toLocaleString()} ZiG`;
    }
}

/**
 * Mask phone number for privacy
 * @param {string} phone - Phone number to mask
 * @returns {string} Masked phone
 */
function maskPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 7) return phone;
    return cleaned.slice(0, 5) + '****' + cleaned.slice(-3);
}

/**
 * Start ZESA flow
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

/**
 * Handle ZESA flow messages
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
        console.error(`⚡ [ZESA] Error:`, error);
        deleteSession(userId);
        return {
            message: `❌ *Error*\n\nAn error occurred. Please type *hi* to restart.`,
            session: null
        };
    }
}

/**
 * Handle currency selection
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
    
    // Show verification in progress
    await sendIntermediateMessage(userId, `⏳ Verifying meter...`);
    
    const verifyResult = await hotrecharge.verifyZesaMeter(meterNumber, session.data.currency);
    
    if (verifyResult.success) {
        session.data.customerName = verifyResult.customerName;
        session.state = STATES.ENTER_AMOUNT;
        updateSession(userId, { state: session.state, data: session.data });
        
        return {
            message: `✅ *Meter Verified*\n\n` +
                    `Customer: ${verifyResult.customerName}\n` +
                    `Meter: ${meterNumber}\n\n` +
                    `────────────────\n` +
                    `Now enter amount to purchase:`,
            session: session
        };
    } else {
        return {
            message: `❌ *Verification Failed*\n\n${verifyResult.error}\n\nWould you like to try another meter? (yes/no)`,
            session: session
        };
    }
}

/**
 * Handle meter verification response
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

/**
 * Handle amount entry (direct entry only - no presets)
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
    
    // Calculate fee for this amount
    const feeDetails = calculateZesaFee(amount, session.data.currency);
    
    // Store fee details in session
    session.data.amount = amount;
    session.data.feePercentage = feeDetails.feePercentage;
    session.data.feeAmount = feeDetails.feeAmount;
    session.data.totalAmount = feeDetails.totalAmount;
    
    session.state = STATES.SELECT_PAYMENT_METHOD;
    updateSession(userId, { state: session.state, data: session.data });
    
    // Show amount with fee breakdown
    const baseAmountFormatted = formatAmountWithCurrency(amount, session.data.currency);
    const feeFormatted = formatAmountWithCurrency(feeDetails.feeAmount, session.data.currency);
    const totalFormatted = formatAmountWithCurrency(feeDetails.totalAmount, session.data.currency);
    
    // Show payment method prompt based on currency
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

/**
 * Handle payment method selection
 */
async function handlePaymentMethodSelection(userId, message, session) {
    const selection = message.trim();
    const { currency } = session.data;
    
    // Define valid options based on currency
    const validOptions = currency === 'zig' 
        ? constants.VALIDATION_CONFIG.PAYMENT_METHOD.ZIG_OPTIONS
        : constants.VALIDATION_CONFIG.PAYMENT_METHOD.USD_OPTIONS;
    
    if (!validOptions.includes(selection)) {
        return {
            message: `⚠️ *Invalid Selection*\n\nPlease select 1-4:`,
            session: session
        };
    }
    
    // Map selection to payment method code
    let paymentMethodCode;
    if (currency === 'zig') {
        const methodMap = {
            '1': PAYMENT_PROVIDERS.ZIG.ECOCASH,
            '2': PAYMENT_PROVIDERS.ZIG.ZIMSWITCH,
            '3': PAYMENT_PROVIDERS.ZIG.PAYGO,
            '4': PAYMENT_PROVIDERS.ZIG.ONEMONEY
        };
        paymentMethodCode = methodMap[selection];
    } else {
        const methodMap = {
            '1': PAYMENT_PROVIDERS.USD.ECOCASH,
            '2': PAYMENT_PROVIDERS.USD.ZIMSWITCH,
            '3': PAYMENT_PROVIDERS.USD.PAYGO,
            '4': PAYMENT_PROVIDERS.USD.INNBUCKS
        };
        paymentMethodCode = methodMap[selection];
    }
    
    const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
    
    // Store payment method in session
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
        session.state = STATES.ENTER_NOTIFICATION_PHONE;
        updateSession(userId, { state: session.state, data: session.data });
        
        return {
            message: `📲 *Token SMS*\n\nPlease enter the phone number to receive the ZESA token:`,
            session: session
        };
    }
}

/**
 * Handle payment phone number entry
 */
async function handlePaymentPhone(userId, message, session) {
    const { paymentProvider } = session.data;
    
    // Validate phone number with provider-specific rules
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
 * Handle notification phone number entry
 */
async function handleNotificationPhone(userId, message, session) {
    if (!PHONE_REGEX.test(message)) {
        return {
            message: `⚠️ *Invalid Number*\n\nPlease enter a valid Zimbabwe phone number (e.g., 0771234567):`,
            session: session
        };
    }
    
    // Format notification phone
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
    
    // Build confirmation message with fee breakdown
    const confirmMessage = buildConfirmationMessage(session.data);
    
    return {
        message: confirmMessage,
        session: session
    };
}

/**
 * Build confirmation message with fee details and numbered options from constants
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
    
    // Use the confirmation prompt from constants
    message += constants.UI_MESSAGES.CONFIRMATION.PROMPT;
    
    return message;
}

/**
 * Handle confirmation - UPDATED for numbered options using constants
 */
async function handleConfirmation(userId, message, session) {
    // Check for numbered options (1 or 2)
    if (message === '1') {
        session.state = 'PROCESSING';
        updateSession(userId, { state: session.state });
        
        const result = await processTransaction(userId, session);
        deleteSession(userId);
        
        return {
            message: result.message,
            session: null
        };
        
    } else if (message === '2') {
        deleteSession(userId);
        return {
            message: `❌ *Cancelled*\n\nZESA purchase cancelled. Type *hi* for main menu.`,
            session: null
        };
        
    } else {
        // If user typed something else, show the confirmation again with options
        const confirmMessage = buildConfirmationMessage(session.data);
        
        return {
            // Use the INVALID message from constants followed by the confirmation prompt
            message: `${constants.UI_MESSAGES.CONFIRMATION.INVALID}\n\n${confirmMessage}`,
            session: session
        };
    }
}

/**
 * Send intermediate message (like "Verifying...")
 */
async function sendIntermediateMessage(userId, text) {
    const messaging = require('../utils/messaging');
    await messaging.sendMessage(userId, text);
}

/**
 * Process transaction
 */
async function processTransaction(userId, session) {
    try {
        const { 
            currency, 
            meterNumber, 
            amount, 
            totalAmount,  // Use total amount for payment
            paymentProvider,
            paymentMethodCode,
            paymentMethodName,
            paymentPhone, 
            notifyNumber,
            feeAmount,
            customerName
        } = session.data;
        
        const normalizedCurrency = currency.toLowerCase();
        
        // Generate a reference for this transaction
        const reference = `ZESA${Date.now().toString().slice(-8)}`;
        
        // Format amounts for display
        const formattedAmount = formatAmountWithCurrency(amount, currency);
        const formattedTotal = formatAmountWithCurrency(totalAmount, currency);
        
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
        } else if (paymentProvider === 'innbucks') {
            paynowMethod = 'innbucks';
        }
        
        console.log(`💳 [ZESA] Processing payment with method: ${paynowMethod}, provider: ${paymentProvider}`);
        
        // Use initiateQuickPay from paynow.js with TOTAL amount including fee
        const paynowResult = await paynow.initiateQuickPay({
            amount: totalAmount,  // Pay the total amount including fee
            reference: reference,
            phone: paymentPhone,
            method: paynowMethod,  // ← Fixed: using mapped method
            paymentMethodCode: paymentMethodCode,
            service: 'ZESA',
            currency: normalizedCurrency
        });
        
        if (!paynowResult.success) {
            return {
                message: `❌ *Payment Failed*\n\n${paynowResult.error}`
            };
        }
        
        // For methods that don't require polling (InnBucks, Zimswitch), return instructions
        if (paymentProvider === 'innbucks' || paymentProvider === 'zimswitch') {
            return {
                message: paynowResult.instructions + `\n\n⏳ After payment, your ZESA token will be sent to ${maskPhone(notifyNumber)}`
            };
        }
        
        // For mobile money methods (EcoCash, OneMoney, PayGo), we need to poll
        await sendIntermediateMessage(userId, `⏳ Waiting for payment confirmation...\n\nCheck your phone and enter PIN when prompted.`);
        
        // Poll for payment status
        let paymentConfirmed = false;
        let attempts = 0;
        
        while (!paymentConfirmed && attempts < POLLING_CONFIG.MAX_ATTEMPTS) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, POLLING_CONFIG.INTERVAL_MS));
            
            const status = await paynow.checkPaymentStatus(paynowResult.pollUrl);
            if (status.paid) {
                paymentConfirmed = true;
                break;
            }
        }
        
        if (!paymentConfirmed) {
            return {
                message: `❌ *Payment Timeout*\n\nPayment not confirmed after ${POLLING_CONFIG.TOTAL_TIMEOUT_MS/1000} seconds. Please check your mobile money app and try again.\n\nReference: ${reference}`
            };
        }
        
        // Rest of the function remains the same...
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
            amount,  // Send base amount to HotRecharge (not including fee)
            notifyNumber,
            paymentPhone,
            userId,
            customerName,
            reference
        });
        
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
        console.error('[ZESA] Transaction error:', error);
        return {
            message: `❌ *Error*\n\nAn error occurred. Please try again.`
        };
    }
}

module.exports = {
    startFlow,
    handleRequest,
    calculateZesaFee,  // Export for testing
    formatAmountWithCurrency,  // Export for reuse
    maskPhone  // Export for reuse
};
