// handlers/mainMenuHandler.js - UPDATED with Interactive UI & Personality
// ============================================================================
// MAIN MENU HANDLER
// Routes user input to appropriate services based on menu selection or natural language
// Maintains clean separation between menu routing and service logic
// NOW WITH: Interactive buttons, personality, and natural language support
// Updated to support:
// - Option 6: Quick Airtime
// - Option 7: Quick ZESA
// - Option 8: Help
// - Option 9: Contact Us
// ============================================================================

const messaging = require('../utils/messaging');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');
const hotUpdatesService = require('../services/hotUpdates');
const quickServiceHandler = require('./quickServiceHandler');
const { deleteSession, createSession } = require('./sessionHandlers');
const { createSubmenuSession } = require('./submenuSessionHandler');
const { sendSubmenu } = require('./subMenuHandler');
const { SERVICE_TYPES, SERVICE_KEYWORDS, FLOW_STATES, PERSONALITY_CONFIG } = require('../config/constants');
// NEW: Import personality utilities
const { 
    getTimeBasedGreeting,
    getRandomResponse,
    getDailyTip
} = require('../utils/personality');

/**
 * Send interactive main menu with buttons
 * 
 * @param {string} userId - WhatsApp user ID
 */
async function sendInteractiveMainMenu(userId) {
    const greeting = getTimeBasedGreeting();
    const tip = getDailyTip();
    
    const menuMessage = `${greeting}\n\n` +
        `I'm *${PERSONALITY_CONFIG.BOT_NAME}*, your personal assistant.\n` +
        `What would you like to do today?\n\n` +
        `💡 *Tip:* ${tip}`;
    
    await messaging.sendButtonMessage(
        userId,
        menuMessage,
        [
            { id: "1", title: "📱 Airtime" },
            { id: "2", title: "⚡ ZESA" },
            { id: "3", title: "📄 Bills" },
            { id: "4", title: "🚨 Emergency" },
            { id: "5", title: "🔥 Hot Updates" },
            { id: "6", title: "⏩ Quick Airtime" },
            { id: "7", title: "⏩ Quick ZESA" },
            { id: "8", title: "❓ Help" },
            { id: "9", title: "📞 Contact" }
        ]
    );
}

/**
 * Handle main menu input and route to appropriate service
 * Supports both numeric menu (1-9), natural language input, and button responses
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
    // HANDLE INTERACTIVE BUTTON RESPONSES
    // Buttons send their ID as the message text
    // ========================================================================
    if (input === '1' || input === 'airtime' || input === '📱 airtime') {
        console.log(`📋 [MAIN MENU] Selection: AIRTIME`);
        result = await airtimeService.startFlow(userId);
    } 
    else if (input === '2' || input === 'zesa' || input === '⚡ zesa') {
        console.log(`📋 [MAIN MENU] Selection: ZESA`);
        
        if (typeof zesaService.startFlow !== 'function') {
            console.error(`❌ [MAIN MENU] CRITICAL: zesaService.startFlow is not a function`);
            return {
                message: "⚠️ System error. Please try again later.",
                session: null
            };
        }
        
        result = await zesaService.startFlow(userId);
    } 
    else if (input === '3' || input === 'bills' || input === '📄 bills' || 
             input.includes('bill') || input.includes('nyaradzo')) {
        console.log(`📋 [MAIN MENU] Selection: BILLS`);
        deleteSession(userId);
        result = await billsService.startFlow(userId);
    } 
    else if (input === '4' || input === 'emergency' || input === '🚨 emergency') {
        console.log(`📋 [MAIN MENU] Selection: EMERGENCY`);
        result = await emergencyService.startFlow(userId);
    } 
    else if (input === '5' || input === 'hot updates' || input === '🔥 hot updates' ||
             input === 'hot' || input === 'updates') {
        console.log(`📋 [MAIN MENU] Selection: HOT UPDATES`);
        
        // Create main session for Hot Updates
        const hotUpdatesSession = createSession(userId, SERVICE_TYPES.HOT_UPDATES);
        hotUpdatesSession.state = FLOW_STATES.HOT_UPDATES.START;
        
        // Create submenu session for Hot Updates service selection
        createSubmenuSession(userId, 'HOT_UPDATES');
        console.log(`📱 [LAUNCH] Created submenu session for HOT_UPDATES`);
        
        // Send the Hot Updates menu
        await sendSubmenu(userId, 'HOT_UPDATES');
        
        result = {
            message: null,
            session: hotUpdatesSession
        };
    } 
    else if (input === '6' || input === 'quick airtime' || input === '⏩ quick airtime') {
        console.log(`📋 [MAIN MENU] Selection: QUICK AIRTIME`);
        result = await quickServiceHandler.startQuickFlow(userId, 'airtime');
    }
    else if (input === '7' || input === 'quick zesa' || input === '⏩ quick zesa') {
        console.log(`📋 [MAIN MENU] Selection: QUICK ZESA`);
        result = await quickServiceHandler.startQuickFlow(userId, 'zesa');
    }
    else if (input === '8' || input === 'help' || input === '❓ help') {
        console.log(`📋 [MAIN MENU] Selection: HELP`);
        await helpService.sendHelpMessage(userId);
        result = { message: null, session: null };
    }
    else if (input === '9' || input === 'contact' || input === '📞 contact') {
        console.log(`📋 [MAIN MENU] Selection: CONTACT`);
        await helpService.sendContactInfo(userId);
        result = { message: null, session: null };
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
    else if (SERVICE_KEYWORDS.quick_airtime.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: QUICK AIRTIME`);
        result = await quickServiceHandler.startQuickFlow(userId, 'airtime');
    }
    else if (SERVICE_KEYWORDS.quick_zesa.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: QUICK ZESA`);
        result = await quickServiceHandler.startQuickFlow(userId, 'zesa');
    }
    else if (SERVICE_KEYWORDS.help.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: HELP`);
        await helpService.sendHelpMessage(userId);
        result = { message: null, session: null };
    } 
    else if (SERVICE_KEYWORDS.hotupdates.some(keyword => input.includes(keyword)) ||
             SERVICE_KEYWORDS.epl.some(keyword => input.includes(keyword)) ||
             SERVICE_KEYWORDS.news.some(keyword => input.includes(keyword)) ||
             SERVICE_KEYWORDS.weather.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: HOT UPDATES`);
        
        const hotUpdatesSession = createSession(userId, SERVICE_TYPES.HOT_UPDATES);
        hotUpdatesSession.state = FLOW_STATES.HOT_UPDATES.START;
        createSubmenuSession(userId, 'HOT_UPDATES');
        await sendSubmenu(userId, 'HOT_UPDATES');
        
        result = {
            message: null,
            session: hotUpdatesSession
        };
    }
    
    // ========================================================================
    // NO MATCH FOUND
    // Send interactive main menu with personality
    // ========================================================================
    else {
        console.log(`📋 [MAIN MENU] No match found, sending interactive main menu`);
        await sendInteractiveMainMenu(userId);
        result = { message: null, session: null };
    }
    
    // ========================================================================
    // LOG RESULT FOR DEBUGGING
    // ========================================================================
    console.log(`📋 [MAIN MENU] Result:`, result ? {
        hasMessage: !!result.message,
        hasSession: !!result.session,
        state: result.session?.state
    } : 'No result');
    
    return result;
}

module.exports = {
    handleMainMenu,
    sendInteractiveMainMenu
};