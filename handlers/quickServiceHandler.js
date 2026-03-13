// handlers/quickServiceHandler.js - UPDATED with Personality & Interactive UI
// ============================================================================
// QUICK SERVICE HANDLER
// Manages the quick service confirmation flow for:
// - Quick Airtime (option 6)
// - Quick ZESA (option 7)
// 
// Flow:
// 1. Show last purchase details with masked info (including payment method)
// 2. User chooses: Confirm (1), Change (2), Cancel (3)
// 3. If confirmed, use stored payment method to skip directly to payment
// ============================================================================

const { getUserPrefs } = require('../utils/userPrefs');
const { createSession, updateSessionStep, deleteSession } = require('./sessionHandlers');
const messaging = require('../utils/messaging');
const constants = require('../config/constants');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
// NEW: Import personality utilities
const { 
    getEncouragement,
    getRandomResponse,
    addPaymentPersonality,
    getThanksMessage
} = require('../utils/personality');

// ============================================================================
// CONSTANTS
// ============================================================================
const UI_MESSAGES = constants.UI_MESSAGES.QUICK_SERVICE;
const FLOW_STATES = constants.FLOW_STATES.QUICK_SERVICE;
const VALID_OPTIONS = constants.VALIDATION_CONFIG.QUICK_SERVICE.CONFIRM_OPTIONS; // ['1', '2', '3']
const PAYMENT_METHOD_CONFIG = constants.PAYMENT_METHOD_CONFIG;

// ============================================================================
// MAIN HANDLER - Called from mainMenuHandler
// ============================================================================

/**
 * Start quick service flow for a user
 * NOW WITH: Interactive confirmation buttons
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} service - 'airtime' or 'zesa'
 * @returns {Promise<Object>} Result with message and session
 */
async function startQuickFlow(userId, service) {
    console.log(`⚡ [QUICK SERVICE] Starting quick ${service} for ${userId}`);
    
    // Clean user ID
    const cleanUserId = userId.split('@')[0];
    
    // Get user preferences
    const userPrefs = await getUserPrefs(cleanUserId);
    
    // Create session
    const session = createSession(userId, service === 'airtime' ? 'quick_airtime' : 'quick_zesa');
    session.state = FLOW_STATES.CONFIRM;
    session.data = {
        userId: userId,
        service: service,
        timestamp: Date.now()
    };
    
    // Get last transaction data
    let lastData = null;
    
    if (service === 'airtime') {
        lastData = userPrefs?.lastAirtime;
        
        // If no history, fallback to normal flow
        if (!lastData) {
            console.log(`📭 [QUICK SERVICE] No airtime history for ${cleanUserId}, falling back to normal flow`);
            deleteSession(userId);
            await airtimeService.startFlow(userId);
            return {
                message: null,
                session: null
            };
        }
        
        // Store last data in session for confirmation
        session.data.lastAirtime = lastData;
        
        // NEW: Send interactive confirmation with buttons
        await sendQuickAirtimeConfirmation(userId, lastData);
        
    } else if (service === 'zesa') {
        lastData = userPrefs?.lastZesa;
        
        // If no history, fallback to normal flow
        if (!lastData) {
            console.log(`📭 [QUICK SERVICE] No ZESA history for ${cleanUserId}, falling back to normal flow`);
            deleteSession(userId);
            await zesaService.startFlow(userId);
            return {
                message: null,
                session: null
            };
        }
        
        // Store last data in session for confirmation
        session.data.lastZesa = lastData;
        
        // NEW: Send interactive confirmation with buttons
        await sendQuickZesaConfirmation(userId, lastData);
    }
    
    // Update session with the data
    updateSessionStep(userId, session.state, session.state, session.data);
    
    return {
        message: null, // Message already sent via buttons
        session: session
    };
}

// ============================================================================
// NEW: Interactive confirmation messages
// ============================================================================

/**
 * Send quick airtime confirmation with buttons
 */
async function sendQuickAirtimeConfirmation(userId, lastData) {
    const maskedRecipient = lastData.recipient.replace('263', '0').slice(0,5) + '****' + lastData.recipient.slice(-3);
    const amountDisplay = lastData.currency === 'USD' ? `$${lastData.amount.toFixed(2)}` : `${lastData.amount.toFixed(2)} ZiG`;
    const paymentDisplay = lastData.paymentMethod ? getPaymentMethodName(lastData.paymentMethod, lastData.currency) : 'EcoCash';
    
    const message = `⏩ *Quick Airtime*

📞 Recipient: *${maskedRecipient}*
💰 Amount: *${amountDisplay}* (${lastData.network})
💳 Payment: *${paymentDisplay}*

────────────────

What would you like to do?`;
    
    await messaging.sendButtonMessage(
        userId,
        message,
        [
            { id: "quick_confirm", title: "✅ Confirm & Pay" },
            { id: "quick_change", title: "✏️ Change Details" },
            { id: "quick_cancel", title: "❌ Cancel" }
        ]
    );
}

/**
 * Send quick ZESA confirmation with buttons
 */
async function sendQuickZesaConfirmation(userId, lastData) {
    const maskedMeter = lastData.meter.slice(0,5) + '****' + lastData.meter.slice(-3);
    const amountDisplay = lastData.currency === 'USD' ? `$${lastData.amount.toFixed(2)}` : `${lastData.amount.toFixed(2)} ZiG`;
    const paymentDisplay = lastData.paymentMethod ? getPaymentMethodName(lastData.paymentMethod, lastData.currency) : 'EcoCash';
    
    const message = `⏩ *Quick ZESA*

⚡ Meter: *${maskedMeter}* (${lastData.customerName || 'N/A'})
💰 Amount: *${amountDisplay}*
💳 Payment: *${paymentDisplay}*

────────────────

What would you like to do?`;
    
    await messaging.sendButtonMessage(
        userId,
        message,
        [
            { id: "quick_confirm", title: "✅ Confirm & Pay" },
            { id: "quick_change", title: "✏️ Change Details" },
            { id: "quick_cancel", title: "❌ Cancel" }
        ]
    );
}

// ============================================================================
// HANDLE USER RESPONSE
// ============================================================================

/**
 * Handle user's response to quick service confirmation
 * NOW WITH: Support for interactive button responses
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} message - User's message (1, 2, or 3, or button IDs)
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result object for messageHandler
 */
async function handleResponse(userId, message, session) {
    console.log(`⚡ [QUICK SERVICE] Handling response: "${message}" for ${userId}`);
    
    let response = message.trim();
    const { service, lastAirtime, lastZesa } = session.data;
    
    // NEW: Handle interactive button responses
    if (response === 'quick_confirm') {
        response = '1';
    } else if (response === 'quick_change') {
        response = '2';
    } else if (response === 'quick_cancel') {
        response = '3';
    }
    
    // Validate response
    if (!VALID_OPTIONS.includes(response)) {
        // NEW: Resend the appropriate confirmation with buttons
        if (service === 'airtime') {
            await sendQuickAirtimeConfirmation(userId, lastAirtime);
        } else {
            await sendQuickZesaConfirmation(userId, lastZesa);
        }
        
        return {
            message: null,
            session: session
        };
    }
    
    // Handle response
    switch (response) {
        case '1': // Confirm & Pay
            console.log(`✅ [QUICK SERVICE] User confirmed, processing quick payment`);
            await messaging.sendMessage(userId, getEncouragement() + " " + UI_MESSAGES.CONFIRMING);
            
            // Process the quick payment using stored payment method
            return await processQuickPayment(userId, session);
            
        case '2': // Change Details - Start normal flow
            console.log(`🔄 [QUICK SERVICE] User wants to change details, starting normal flow`);
            
            // Delete ONLY the quick service session
            deleteSession(userId);
            
            if (service === 'airtime') {
                const result = await airtimeService.startFlow(userId);
                return {
                    message: result?.message || null,
                    session: result?.session || null
                };
            } else {
                const result = await zesaService.startFlow(userId);
                return {
                    message: result?.message || null,
                    session: result?.session || null
                };
            }
            
        case '3': // Cancel
            console.log(`❌ [QUICK SERVICE] User cancelled`);
            deleteSession(userId);
            
            // NEW: Add personality to cancellation message
            const cancelMessage = `❌ *Cancelled*\n\nQuick ${service === 'airtime' ? 'airtime' : 'ZESA'} cancelled. ${getRandomResponse('goodbye')}`;
            
            return {
                message: cancelMessage,
                session: null
            };
            
        default:
            return {
                message: `❓ Invalid response. Please reply with 1, 2, or 3.`,
                session: session
            };
    }
}

// ============================================================================
// PROCESS QUICK PAYMENT
// ============================================================================

/**
 * Process the confirmed quick payment
 * Creates a session with the last used details including payment method
 * Now skips directly to payment phone entry if needed
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Object} session - Current quick service session
 * @returns {Promise<Object>} Result object
 */
async function processQuickPayment(userId, session) {
    const { service, lastAirtime, lastZesa } = session.data;
    
    // Delete the quick service session
    deleteSession(userId);
    
    if (service === 'airtime') {
        // Create a new airtime session with the last used details
        const airtimeSession = createSession(userId, 'airtime');
        
        // Determine currency from last purchase
        const currency = lastAirtime.currency === 'USD' ? 'usd' : 'zig';
        const currencyName = lastAirtime.currency;
        const currencySymbol = currency === 'usd' ? '$' : 'ZiG';
        
        // Calculate fee and total amount
        const fee = constants.PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = lastAirtime.amount * fee;
        const totalAmount = lastAirtime.amount + serviceFee;
        
        console.log(`💰 [QUICK SERVICE] Calculated amounts:`, {
            amount: lastAirtime.amount,
            fee: fee,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Get the stored payment method
        const paymentMethod = lastAirtime.paymentMethod || 'ecocash';
        const paymentMethodName = getPaymentMethodName(paymentMethod, currencyName);
        const methodConfig = PAYMENT_METHOD_CONFIG[getPaymentMethodCode(paymentMethod, currencyName)];
        
        console.log(`💳 [QUICK SERVICE] Using stored payment method: ${paymentMethodName}`);
        
        // Set up the session with last used data INCLUDING payment method and calculated amounts
        airtimeSession.flow = methodConfig?.requiresPhone 
            ? 'airtime_enter_payment_phone' 
            : constants.FLOW_STATES.AIRTIME.CONFIRM_PAYMENT;
        
        airtimeSession.data = {
            userId: userId,
            currency: currency,
            currencyName: currencyName,
            currencySymbol: currencySymbol,
            amount: lastAirtime.amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount,
            recipient: lastAirtime.recipient,
            network: lastAirtime.network,
            paymentMethodCode: getPaymentMethodCode(paymentMethod, currencyName),
            paymentMethodName: paymentMethodName,
            paymentProvider: paymentMethod,
            requiresPaymentPhone: methodConfig?.requiresPhone || false
        };
        
        // Update session
        updateSessionStep(userId, airtimeSession.flow, airtimeSession.flow, airtimeSession.data);
        
        // If payment method requires a phone number, ask for it
        if (methodConfig?.requiresPhone) {
            await airtimeService.sendPaymentPhonePrompt(userId, methodConfig);
        } else {
            // Otherwise show transaction details with buttons
            await airtimeService.showTransactionDetails(userId, airtimeSession);
        }
        
        return {
            message: null,
            session: airtimeSession
        };
        
    } else if (service === 'zesa') {
        // Create a new ZESA session with the last used details
        const zesaSession = createSession(userId, 'zesa');
        
        // Determine currency from last purchase
        const currency = lastZesa.currency === 'USD' ? 'usd' : 'zig';
        const currencyName = lastZesa.currency;
        
        // Calculate fee and total
        const feePercentage = constants.PAYMENT_CONFIG.SERVICE_FEES.ZESA * 100;
        const feeAmount = lastZesa.amount * constants.PAYMENT_CONFIG.SERVICE_FEES.ZESA;
        const totalAmount = lastZesa.amount * (1 + constants.PAYMENT_CONFIG.SERVICE_FEES.ZESA);
        
        // Get the stored payment method
        const paymentMethod = lastZesa.paymentMethod || 'ecocash';
        const paymentMethodName = getPaymentMethodName(paymentMethod, currencyName);
        const methodConfig = PAYMENT_METHOD_CONFIG[getPaymentMethodCode(paymentMethod, currencyName)];
        
        console.log(`💳 [QUICK SERVICE] Using stored payment method: ${paymentMethodName}`);
        
        // Set up the session with last used data INCLUDING payment method
        zesaSession.flow = methodConfig?.requiresPhone 
            ? constants.FLOW_STATES.ZESA.ENTER_PAYMENT_PHONE
            : constants.FLOW_STATES.ZESA.ENTER_NOTIFICATION_PHONE;
        
        zesaSession.data = {
            userId: userId,
            currency: currency,
            meterNumber: lastZesa.meter,
            customerName: lastZesa.customerName,
            amount: lastZesa.amount,
            feePercentage: feePercentage,
            feeAmount: feeAmount,
            totalAmount: totalAmount,
            paymentMethodCode: getPaymentMethodCode(paymentMethod, currencyName),
            paymentMethodName: paymentMethodName,
            paymentProvider: paymentMethod,
            requiresPaymentPhone: methodConfig?.requiresPhone || false
        };
        
        // Update session
        updateSessionStep(userId, zesaSession.flow, zesaSession.flow, zesaSession.data);
        
        // If payment method requires a phone number, ask for it
        if (methodConfig?.requiresPhone) {
            let phonePrompt;
            switch(methodConfig.provider) {
                case 'ecocash':
                    phonePrompt = constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.ECOCASH;
                    break;
                case 'onemoney':
                    phonePrompt = constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.ONEMONEY;
                    break;
                default:
                    phonePrompt = constants.UI_MESSAGES.PAYMENT_PHONE_PROMPT.DEFAULT;
            }
            await messaging.sendMessage(userId, phonePrompt);
        } else {
            // Otherwise ask for notification phone
            await messaging.sendMessage(userId, constants.UI_MESSAGES.RECIPIENT_PROMPT.ZESA_NOTIFY);
        }
        
        return {
            message: null,
            session: zesaSession
        };
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build quick airtime message with payment method included
 * (Kept for backward compatibility but no longer used with buttons)
 */
function buildQuickAirtimeMessage(lastData) {
    if (!lastData) {
        return `⏩ *Quick Airtime*\n\nNo previous purchase found. Starting new purchase...`;
    }
    
    const maskedRecipient = lastData.recipient.replace('263', '0').slice(0,5) + '****' + lastData.recipient.slice(-3);
    const amountDisplay = lastData.currency === 'USD' ? `$${lastData.amount.toFixed(2)}` : `${lastData.amount.toFixed(2)} ZiG`;
    const paymentDisplay = lastData.paymentMethod ? getPaymentMethodName(lastData.paymentMethod, lastData.currency) : 'EcoCash';
    
    return `⏩ *Quick Airtime*
────────────────
Last purchase: *${maskedRecipient}* for *${amountDisplay}* (${lastData.network})
Payment method: *${paymentDisplay}*

Reply:
1️⃣ *Confirm & Pay* - Use same details
2️⃣ *Change Details* - Start normal flow
3️⃣ *Cancel*

────────────────
_Reply with 1, 2, or 3_`;
}

/**
 * Build quick ZESA message with payment method included
 * (Kept for backward compatibility but no longer used with buttons)
 */
function buildQuickZesaMessage(lastData) {
    if (!lastData) {
        return `⏩ *Quick ZESA*\n\nNo previous purchase found. Starting new purchase...`;
    }
    
    const maskedMeter = lastData.meter.slice(0,5) + '****' + lastData.meter.slice(-3);
    const amountDisplay = lastData.currency === 'USD' ? `$${lastData.amount.toFixed(2)}` : `${lastData.amount.toFixed(2)} ZiG`;
    const paymentDisplay = lastData.paymentMethod ? getPaymentMethodName(lastData.paymentMethod, lastData.currency) : 'EcoCash';
    
    return `⏩ *Quick ZESA*
────────────────
Last meter: *${maskedMeter}* (${lastData.customerName || 'N/A'})
Last amount: *${amountDisplay}*
Payment method: *${paymentDisplay}*

Reply:
1️⃣ *Confirm & Pay* - Use same details
2️⃣ *Change Details* - Start normal flow
3️⃣ *Cancel*

────────────────
_Reply with 1, 2, or 3_`;
}

/**
 * Get payment method code based on provider and currency
 */
function getPaymentMethodCode(provider, currency) {
    if (currency === 'USD') {
        if (provider === 'ecocash') return constants.PAYMENT_PROVIDERS.USD.ECOCASH;
        if (provider === 'zimswitch') return constants.PAYMENT_PROVIDERS.USD.ZIMSWITCH;
        if (provider === 'innbucks') return constants.PAYMENT_PROVIDERS.USD.INNBUCKS;
        return constants.PAYMENT_PROVIDERS.USD.ECOCASH; // Default
    } else {
        if (provider === 'ecocash') return constants.PAYMENT_PROVIDERS.ZIG.ECOCASH;
        if (provider === 'zimswitch') return constants.PAYMENT_PROVIDERS.ZIG.ZIMSWITCH;
        if (provider === 'onemoney') return constants.PAYMENT_PROVIDERS.ZIG.ONEMONEY;
        return constants.PAYMENT_PROVIDERS.ZIG.ECOCASH; // Default
    }
}

/**
 * Get payment method display name
 */
function getPaymentMethodName(provider, currency) {
    if (currency === 'USD') {
        if (provider === 'ecocash') return 'EcoCash USD';
        if (provider === 'zimswitch') return 'Zimswitch USD';
        if (provider === 'innbucks') return 'InnBucks USD';
        return 'EcoCash USD'; // Default
    } else {
        if (provider === 'ecocash') return 'EcoCash ZiG';
        if (provider === 'zimswitch') return 'Zimswitch ZiG';
        if (provider === 'onemoney') return 'OneMoney ZiG';
        return 'EcoCash ZiG'; // Default
    }
}

/**
 * Build ZESA confirmation message (legacy, kept for backward compatibility)
 */
function buildZesaConfirmationMessage(data) {
    const {
        meterNumber,
        customerName,
        amount,
        feePercentage,
        feeAmount,
        totalAmount,
        currency
    } = data;
    
    const formatAmount = (amt) => {
        if (currency === 'usd') {
            return `$${amt.toFixed(2)}`;
        } else {
            return `${amt.toFixed(2)} ZiG`;
        }
    };
    
    const baseFormatted = formatAmount(amount);
    const feeFormatted = formatAmount(feeAmount);
    const totalFormatted = formatAmount(totalAmount);
    
    let message = `⚡ *Confirm ZESA Purchase*\n\n`;
    message += `Customer: *${customerName || 'N/A'}*\n`;
    message += `Meter: *${meterNumber}*\n`;
    message += `────────────────\n`;
    message += `Purchase: *${baseFormatted}*\n`;
    message += `Fee (${feePercentage}%): *${feeFormatted}*\n`;
    message += `────────────────\n`;
    message += `*Total: ${totalFormatted}*\n`;
    message += `────────────────\n\n`;
    message += `Now select your payment method:`;
    
    return message;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    startQuickFlow,
    handleResponse
};