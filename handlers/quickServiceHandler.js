// handlers/quickServiceHandler.js
// ============================================================================
// QUICK SERVICE HANDLER
// Manages the quick service confirmation flow for:
// - Quick Airtime (option 6)
// - Quick ZESA (option 7)
// 
// Flow:
// 1. Show last purchase details with masked info
// 2. User chooses: Confirm (1), Change (2), Cancel (3)
// 3. Handle each response appropriately
// ============================================================================

const { getUserPrefs } = require('../utils/userPrefs');
const { createSession, updateSessionStep, deleteSession } = require('./sessionHandlers');
const messaging = require('../utils/messaging');
const constants = require('../config/constants');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');

// ============================================================================
// CONSTANTS
// ============================================================================
const UI_MESSAGES = constants.UI_MESSAGES.QUICK_SERVICE;
const FLOW_STATES = constants.FLOW_STATES.QUICK_SERVICE;
const VALID_OPTIONS = constants.VALIDATION_CONFIG.QUICK_SERVICE.CONFIRM_OPTIONS; // ['1', '2', '3']

// ============================================================================
// MAIN HANDLER - Called from mainMenuHandler
// ============================================================================

/**
 * Start quick service flow for a user
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
    let message = '';
    
    if (service === 'airtime') {
        lastData = userPrefs?.lastAirtime;
        message = UI_MESSAGES.AIRTIME(lastData);
        
        // If no history, fallback to normal flow
        if (!lastData) {
            console.log(`📭 [QUICK SERVICE] No airtime history for ${cleanUserId}, falling back to normal flow`);
            deleteSession(userId);
            await airtimeService.startFlow(userId);
            return {
                message: null, // Message already sent by startFlow
                session: null
            };
        }
        
        // Store last data in session for confirmation
        session.data.lastAirtime = lastData;
        
    } else if (service === 'zesa') {
        lastData = userPrefs?.lastZesa;
        message = UI_MESSAGES.ZESA(lastData);
        
        // If no history, fallback to normal flow
        if (!lastData) {
            console.log(`📭 [QUICK SERVICE] No ZESA history for ${cleanUserId}, falling back to normal flow`);
            deleteSession(userId);
            await zesaService.startFlow(userId);
            return {
                message: null, // Message already sent by startFlow
                session: null
            };
        }
        
        // Store last data in session for confirmation
        session.data.lastZesa = lastData;
    }
    
    // Update session with the data
    updateSessionStep(userId, session.state, session.state, session.data);
    
    return {
        message: message,
        session: session
    };
}

// ============================================================================
// HANDLE USER RESPONSE
// ============================================================================

/**
 * Handle user's response to quick service confirmation
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} message - User's message (1, 2, or 3)
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result object for messageHandler
 */
async function handleResponse(userId, message, session) {
    console.log(`⚡ [QUICK SERVICE] Handling response: "${message}" for ${userId}`);
    
    const response = message.trim();
    const { service, lastAirtime, lastZesa } = session.data;
    
    // Validate response
    if (!VALID_OPTIONS.includes(response)) {
        // Re-show the quick service menu with error
        let errorMessage = `⚠️ *Invalid option*\n\nPlease reply with:\n`;
        errorMessage += `1️⃣ *Confirm & Pay*\n`;
        errorMessage += `2️⃣ *Change Details*\n`;
        errorMessage += `3️⃣ *Cancel*\n\n`;
        errorMessage += `────────────────\n`;
        errorMessage += `_Reply with 1, 2, or 3_`;
        
        // Append the original quick service message
        if (service === 'airtime') {
            errorMessage = UI_MESSAGES.AIRTIME(lastAirtime) + '\n\n' + errorMessage;
        } else {
            errorMessage = UI_MESSAGES.ZESA(lastZesa) + '\n\n' + errorMessage;
        }
        
        return {
            message: errorMessage,
            session: session
        };
    }
    
    // Handle response
    switch (response) {
        case '1': // Confirm & Pay
            console.log(`✅ [QUICK SERVICE] User confirmed, processing quick payment`);
            await messaging.sendMessage(userId, UI_MESSAGES.CONFIRMING);
            
            // Process the quick payment
            return await processQuickPayment(userId, session);
            
        case '2': // Change Details - Start normal flow
            console.log(`🔄 [QUICK SERVICE] User wants to change details, starting normal flow`);
            deleteSession(userId);
            
            if (service === 'airtime') {
                await airtimeService.startFlow(userId);
            } else {
                await zesaService.startFlow(userId);
            }
            
            return {
                message: null, // Message already sent by startFlow
                session: null
            };
            
        case '3': // Cancel
            console.log(`❌ [QUICK SERVICE] User cancelled`);
            deleteSession(userId);
            
            return {
                message: `❌ *Cancelled*\n\nQuick ${service === 'airtime' ? 'airtime' : 'ZESA'} cancelled. Type *hi* for main menu.`,
                session: null
            };
            
        default:
            // Should never reach here due to validation above
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
 * Creates a session with the last used details and starts the payment flow
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
        
        // Set up the session with last used data
        airtimeSession.flow = constants.FLOW_STATES.AIRTIME.CONFIRM_PAYMENT;
        airtimeSession.data = {
            userId: userId,
            currency: currency,
            currencyName: currencyName,
            currencySymbol: currencySymbol,
            amount: lastAirtime.amount,
            recipient: lastAirtime.recipient,
            network: lastAirtime.network,
            // We'll need user to select payment method again (for security)
            // So we stop at CONFIRM_PAYMENT but without payment method yet
        };
        
        // Update session
        updateSessionStep(userId, airtimeSession.flow, airtimeSession.flow, airtimeSession.data);
        
        // Show transaction details and ask for payment method
        await airtimeService.showTransactionDetails(userId, airtimeSession);
        
        return {
            message: null, // Message already sent by showTransactionDetails
            session: airtimeSession
        };
        
    } else if (service === 'zesa') {
        // Create a new ZESA session with the last used details
        const zesaSession = createSession(userId, 'zesa');
        
        // Determine currency from last purchase
        const currency = lastZesa.currency === 'USD' ? 'usd' : 'zig';
        const currencyName = lastZesa.currency;
        
        // Set up the session with last used data
        zesaSession.flow = constants.FLOW_STATES.ZESA.CONFIRM_PAYMENT;
        zesaSession.data = {
            userId: userId,
            currency: currency,
            meterNumber: lastZesa.meter,
            customerName: lastZesa.customerName,
            amount: lastZesa.amount,
            // Calculate fee and total
            feePercentage: constants.PAYMENT_CONFIG.SERVICE_FEES.ZESA * 100,
            feeAmount: lastZesa.amount * constants.PAYMENT_CONFIG.SERVICE_FEES.ZESA,
            totalAmount: lastZesa.amount * (1 + constants.PAYMENT_CONFIG.SERVICE_FEES.ZESA)
        };
        
        // Update session
        updateSessionStep(userId, zesaSession.flow, zesaSession.flow, zesaSession.data);
        
        // Show transaction details and ask for payment method
        const confirmMessage = buildZesaConfirmationMessage(zesaSession.data);
        await messaging.sendMessage(userId, confirmMessage);
        
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
 * Build ZESA confirmation message (similar to the one in zesa.js)
 * 
 * @param {Object} data - ZESA session data
 * @returns {string} Formatted confirmation message
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