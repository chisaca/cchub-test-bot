// handlers/mainMenuHandler.js - FIXED with all imports and functions
// ============================================================================
// MAIN MENU HANDLER
// Routes user input to appropriate services based on menu selection or natural language
// Maintains clean separation between menu routing and service logic
// NOW WITH: 4-Category structure, WhatsApp Flows, 3-Tap Maximum support
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
const { createSubmenuSession, deleteSubmenuSession } = require('./submenuSessionHandler'); // FIXED: Added deleteSubmenuSession
const { sendSubmenu } = require('./subMenuHandler');
const { 
    SERVICE_TYPES, 
    SERVICE_KEYWORDS, 
    FLOW_STATES, 
    PERSONALITY_CONFIG,
    INTERACTIVE_UI_CONFIG,
    UI_MESSAGES
} = require('../config/constants');

// Import personality utilities
const { 
    getTimeBasedGreeting,
    getRandomResponse,
    getDailyTip,
    getZimFact
} = require('../utils/personality');

// ============================================================================
// SAFETY WRAPPERS FOR PERSONALITY FUNCTIONS
// Prevents "is not a function" errors if imports fail
// ============================================================================

/**
 * Safe wrapper for getTimeBasedGreeting
 */
function safeGetTimeBasedGreeting() {
    try {
        return typeof getTimeBasedGreeting === 'function' 
            ? getTimeBasedGreeting() 
            : "Hello";
    } catch (e) {
        return "Hello";
    }
}

/**
 * Safe wrapper for getDailyTip
 */
function safeGetDailyTip() {
    try {
        return typeof getDailyTip === 'function' 
            ? getDailyTip() 
            : "You can buy airtime for any network through CCHub!";
    } catch (e) {
        return "You can buy airtime for any network through CCHub!";
    }
}

/**
 * Safe wrapper for getZimFact
 */
function safeGetZimFact() {
    try {
        return typeof getZimFact === 'function' 
            ? getZimFact() 
            : "🇿🇼 Did you know? CCHub is your one-stop shop for daily services!";
    } catch (e) {
        return "🇿🇼 Did you know? CCHub is your one-stop shop for daily services!";
    }
}

/**
 * Send interactive main menu with list message (4-category structure)
 * This is the primary entry point for the 3-tap architecture
 * 
 * @param {string} userId - WhatsApp user ID
 */
async function sendInteractiveMainMenu(userId) {
    // Use safe wrappers to prevent crashes
    const greeting = safeGetTimeBasedGreeting();
    const tip = safeGetDailyTip();
    const fact = safeGetZimFact();
    
    const bodyText = `${greeting}\n\n` +
        `I'm *${PERSONALITY_CONFIG.BOT_NAME}*, your personal assistant.\n\n` +
        `💡 *Tip:* ${tip}\n` +
        `📚 *Fact:* ${fact}\n\n` +
        `👇 *Select a service below:*`;
    
    // Send as interactive list message with sections
    await messaging.sendListMessage(
        userId,
        "MAIN MENU", // Header - plain text
        bodyText,    // Body - can have markdown
        "📋 View Menu", // Button text
        INTERACTIVE_UI_CONFIG.MAIN_MENU_SECTIONS
    );
}

/**
 * Handle main menu input and route to appropriate service
 * Supports both list selections (via ID), numeric menu (1-9), and natural language
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
    // HANDLE LIST/BUTTON RESPONSES (IDs from interactive components)
    // These come from the MAIN_MENU_SECTIONS configuration
    // ========================================================================
    
    // PAYMENTS Category
    if (input === 'airtime' || input === '1' || input === '📱 airtime') {
        console.log(`📋 [MAIN MENU] Selection: AIRTIME`);
        result = await handleAirtimeSelection(userId);
    } 
    else if (input === 'zesa' || input === '2' || input === '⚡ zesa') {
        console.log(`📋 [MAIN MENU] Selection: ZESA`);
        result = await handleZesaSelection(userId);
    } 
    else if (input === 'bills' || input === '3' || input === '📄 bills' || 
             input.includes('bill') || input.includes('nyaradzo')) {
        console.log(`📋 [MAIN MENU] Selection: BILLS`);
        result = await handleBillsSelection(userId);
    } 
    
    // INFORMATION Category
    else if (input === 'hot_updates' || input === '4' || input === 'hot updates' || 
            input === '🔥 hot updates' || input === 'hot' || input === 'updates' ||
            input.includes('soccer') || input.includes('news') || input.includes('weather')) {
        console.log(`📋 [MAIN MENU] Selection: HOT UPDATES`);
        result = await handleHotUpdatesSelection(userId);
    } 
    else if (input === 'emergency' || input === '5' || input === '🚨 emergency') {
        console.log(`📋 [MAIN MENU] Selection: EMERGENCY`);
        // Call startFlow directly - it will send the menu
        const emergencySession = createSession(userId, SERVICE_TYPES.EMERGENCY);
        const emergencyResult = await emergencyService.startFlow(userId);
        result = { 
            message: null, 
            session: emergencySession, 
            service: SERVICE_TYPES.EMERGENCY 
        };
    }

    // QUICK ACTIONS Category - now options 6 and 7
    else if (input === 'quick_airtime' || input === '6' || input === 'quick airtime' || 
            input === '⏩ quick airtime' || input === 'repeat airtime') {
        console.log(`📋 [MAIN MENU] Selection: QUICK AIRTIME`);
        result = await quickServiceHandler.startQuickFlow(userId, 'airtime');
    }
    else if (input === 'quick_zesa' || input === '7' || input === 'quick zesa' || 
            input === '⏩ quick zesa' || input === 'repeat zesa') {
        console.log(`📋 [MAIN MENU] Selection: QUICK ZESA`);
        result = await quickServiceHandler.startQuickFlow(userId, 'zesa');
    }

    // HELP & SUPPORT Category - now options 8 and 9
    else if (input === 'help' || input === '8' || input === '❓ help' || 
            input === 'help center') {
        console.log(`📋 [MAIN MENU] Selection: HELP`);
        await helpService.sendHelpMessage(userId);
        result = { message: null, session: null, service: SERVICE_TYPES.HELP };
    }
    else if (input === 'contact' || input === '9' || input === '📞 contact' || 
            input === 'contact us') {
        console.log(`📋 [MAIN MENU] Selection: CONTACT`);
        await helpService.sendContactInfo(userId);
        result = { message: null, session: null, service: SERVICE_TYPES.CONTACT };
    }
    
    // ========================================================================
    // NATURAL LANGUAGE ROUTING (for backward compatibility)
    // Maps keywords to services for more flexible user input
    // ========================================================================
    else if (SERVICE_KEYWORDS.airtime.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: AIRTIME`);
        result = await handleAirtimeSelection(userId);
    } 
    else if (SERVICE_KEYWORDS.zesa.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: ZESA`);
        result = await handleZesaSelection(userId);
    } 
    else if (SERVICE_KEYWORDS.bill.some(keyword => input.includes(keyword)) || 
             SERVICE_KEYWORDS.nyaradzo.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: BILLS`);
        result = await handleBillsSelection(userId);
    } 
    else if (SERVICE_KEYWORDS.emergency.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: EMERGENCY`);
        const emergencySession = createSession(userId, SERVICE_TYPES.EMERGENCY);
        const emergencyResult = await emergencyService.startFlow(userId);
        result = { 
            message: null, 
            session: emergencySession, 
            service: SERVICE_TYPES.EMERGENCY 
        };
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
        result = { message: null, session: null, service: SERVICE_TYPES.HELP };
    } 
    else if (SERVICE_KEYWORDS.hotupdates.some(keyword => input.includes(keyword)) ||
             SERVICE_KEYWORDS.epl.some(keyword => input.includes(keyword)) ||
             SERVICE_KEYWORDS.news.some(keyword => input.includes(keyword)) ||
             SERVICE_KEYWORDS.weather.some(keyword => input.includes(keyword))) {
        console.log(`📋 [MAIN MENU] Natural language: HOT UPDATES`);
        result = await handleHotUpdatesSelection(userId);
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
        hasMessage: !!result?.message,
        hasSession: !!result?.session,
        service: result?.service,
        state: result?.session?.state
    } : 'No result');
    
    return result;
}

// ============================================================================
// HELPER FUNCTIONS FOR SERVICE SELECTIONS
// Each follows the 3-tap maximum pattern
// ============================================================================

/**
 * Handle airtime selection - 2 taps total
 * Tap 1: Main Menu → Airtime
 * Tap 2: Flow completion → Done
 */
async function handleAirtimeSelection(userId) {
    const airtimeSession = createSession(userId, SERVICE_TYPES.AIRTIME);
    
    // Set state to launch flow (2-tap experience)
    airtimeSession.state = FLOW_STATES.FLOW.AIRTIME;
    
    const result = await airtimeService.launchFlow(userId, airtimeSession);
    
    if (result?.flow) {
        await messaging.sendFlowMessage(userId, result.flow);
        return { message: null, session: airtimeSession, service: SERVICE_TYPES.AIRTIME };
    } else if (result?.message) {
        return { message: result.message, session: airtimeSession, service: SERVICE_TYPES.AIRTIME };
    }
    
    return { message: null, session: airtimeSession, service: SERVICE_TYPES.AIRTIME };
}

/**
 * Handle ZESA selection - 2 taps total
 * Tap 1: Main Menu → ZESA
 * Tap 2: Flow completion → Done
 */
async function handleZesaSelection(userId) {
    if (typeof zesaService.launchFlow !== 'function') {
        console.error(`❌ [MAIN MENU] CRITICAL: zesaService.launchFlow is not a function`);
        return {
            message: "⚠️ System error. Please try again later.",
            session: null,
            service: SERVICE_TYPES.ZESA
        };
    }
    
    const zesaSession = createSession(userId, SERVICE_TYPES.ZESA);
    
    // Set state to launch flow (2-tap experience)
    zesaSession.state = FLOW_STATES.FLOW.ZESA;
    
    const result = await zesaService.launchFlow(userId, zesaSession);
    
    if (result?.flow) {
        await messaging.sendFlowMessage(userId, result.flow);
        return { message: null, session: zesaSession, service: SERVICE_TYPES.ZESA };
    } else if (result?.message) {
        return { message: result.message, session: zesaSession, service: SERVICE_TYPES.ZESA };
    }
    
    return { message: null, session: zesaSession, service: SERVICE_TYPES.ZESA };
}

/**
 * Handle bills selection - 2 taps total
 * Tap 1: Main Menu → Bills
 * Tap 2: Select biller → Done (after payment)
 */
async function handleBillsSelection(userId) {
    deleteSession(userId);
    
    // Create main session for bills
    const billSession = createSession(userId, SERVICE_TYPES.BILL_PAYMENT);
    billSession.state = FLOW_STATES.BILL_PAYMENT.SELECT_BILLER;
    
    // Create submenu session for biller selection
    createSubmenuSession(userId, 'BILLS');
    
    // Send the bills menu
    await sendSubmenu(userId, 'BILLS');
    
    return { message: null, session: billSession, service: SERVICE_TYPES.BILL_PAYMENT };
}

/**
 * Handle hot updates selection - 2 taps total
 * Tap 1: Main Menu → Hot Updates
 * Tap 2: Select service → Instant result
 */
async function handleHotUpdatesSelection(userId) {
    console.log(`📋 [MAIN MENU] Starting Hot Updates flow for ${userId}`);
    
    // Delete any existing sessions first
    deleteSession(userId);
    if (typeof deleteSubmenuSession === 'function') {
        deleteSubmenuSession(userId);
    }
    
    // Create main session for Hot Updates
    const hotUpdatesSession = createSession(userId, SERVICE_TYPES.HOT_UPDATES);
    hotUpdatesSession.state = FLOW_STATES.HOT_UPDATES.START;
    
    // Return the session - messageHandler will send the menu
    return { 
        message: null, 
        session: hotUpdatesSession, 
        service: SERVICE_TYPES.HOT_UPDATES 
    };
}

module.exports = {
    handleMainMenu,
    sendInteractiveMainMenu
};