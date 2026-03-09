// handlers/mainMenuHandler.js
// ============================================================================
// MAIN MENU HANDLER
// Routes user input to appropriate services based on menu selection or natural language
// Maintains clean separation between menu routing and service logic
// ============================================================================

const messaging = require('../utils/messaging');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');
const hotUpdatesService = require('../services/hotUpdates'); // NEW: Hot Updates service
const { deleteSession } = require('./sessionHandlers');
const { SERVICE_TYPES, SERVICE_KEYWORDS } = require('../config/constants'); // Added constants

/**
 * Handle main menu input and route to appropriate service
 * Supports both numeric menu (1-6) and natural language input
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} messageText - User's message text
 * @returns {Promise<Object>} Result object with message and session
 */
async function handleMainMenu(userId, messageText) {
    console.log(`📋 [MAIN MENU] User: ${userId}, Input: "${messageText}"`);
    
    const input = messageText.toLowerCase().trim();
    let result;
    
    // ========================================================================
    // NUMERIC MENU ROUTING
    // Maps main menu numbers (1-6) to respective services
    // ========================================================================
    if (input === '1') {
        console.log(`📋 [MAIN MENU] Numeric selection: 1 - AIRTIME`);
        result = await airtimeService.startFlow(userId);
    } 
    else if (input === '2') {
        console.log(`📋 [MAIN MENU] Numeric selection: 2 - ZESA`);
        
        // Debug logging for service availability
        if (typeof zesaService.startFlow !== 'function') {
            console.error(`❌ [MAIN MENU] CRITICAL: zesaService.startFlow is not a function`);
            console.error(`❌ [MAIN MENU] Available methods:`, Object.keys(zesaService));
            return {
                message: "⚠️ System error. Please try again later.",
                session: null
            };
        }
        
        result = await zesaService.startFlow(userId);
    } 
    else if (input === '3') {
        console.log(`📋 [MAIN MENU] Numeric selection: 3 - BILLS`);
        // Clear any existing session before starting bills flow
        deleteSession(userId);
        result = await billsService.startFlow(userId);
    } 
    else if (input === '4') {
        console.log(`📋 [MAIN MENU] Numeric selection: 4 - EMERGENCY`);
        result = await emergencyService.startFlow(userId);
    } 
    else if (input === '5') {
        console.log(`📋 [MAIN MENU] Numeric selection: 5 - HOT UPDATES`); // Updated
        result = await hotUpdatesService.startFlow(userId);
    } 
    else if (input === '6') {
        console.log(`📋 [MAIN MENU] Numeric selection: 6 - HELP`); // Updated
        result = await helpService.sendHelpMessage(userId);
    }
    
    // ========================================================================
    // NATURAL LANGUAGE ROUTING
    // Maps keywords to services for more flexible user input
    // Uses SERVICE_KEYWORDS from constants for consistency
    // ========================================================================
    else if (SERVICE_KEYWORDS.airtime.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: AIRTIME`);
        result = await airtimeService.startFlow(userId);
    } 
    else if (SERVICE_KEYWORDS.zesa.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: ZESA`);
        result = await zesaService.startFlow(userId);
    } 
    else if (SERVICE_KEYWORDS.bill.some(keyword => input.includes(keyword)) || 
             SERVICE_KEYWORDS.nyaradzo.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: BILLS`);
        deleteSession(userId);
        result = await billsService.startFlow(userId);
    } 
    else if (SERVICE_KEYWORDS.emergency.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: EMERGENCY`);
        result = await emergencyService.startFlow(userId);
    } 
    else if (SERVICE_KEYWORDS.help.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: HELP`);
        result = await helpService.sendHelpMessage(userId);
    } 
    else if (SERVICE_KEYWORDS.hotupdates.some(keyword => input.includes(keyword)) ||
             SERVICE_KEYWORDS.epl.some(keyword => input.includes(keyword)) ||
             SERVICE_KEYWORDS.news.some(keyword => input.includes(keyword)) ||
             SERVICE_KEYWORDS.weather.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: HOT UPDATES`);
        result = await hotUpdatesService.startFlow(userId);
    }
    
    // ========================================================================
    // NO MATCH FOUND
    // Send welcome message again for unrecognized input
    // ========================================================================
    else {
        console.log(`📋 [MAIN MENU] No match found, sending welcome message`);
        await messaging.sendWelcomeMessage(userId);
        result = { message: null, session: null };
    }
    
    // ========================================================================
    // LOG RESULT FOR DEBUGGING
    // Helps trace flow through the system
    // ========================================================================
    console.log(`📋 [MAIN MENU] Result:`, result ? {
        hasMessage: !!result.message,
        hasSession: !!result.session,
        state: result.session?.state
    } : 'No result');
    
    return result;
}

module.exports = {
    handleMainMenu
};