// handlers/messageHandler.js - UPDATED with better session handling
// FIXED: Now properly handles session from service results
// REMOVED: All PayCode logic
// FIXED: Submenu handlers only called when no active service session

const { getActiveSession, deleteSession } = require('./sessionHandlers');
const { handleMainMenu } = require('./mainMenuHandler');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const nyaradzoService = require('../services/nyaradzo');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');
const messaging = require('../utils/messaging');
const { userActivity } = require('./sessionHandlers');

// Import submenu handlers ONLY for menu display
const { sendSubmenu } = require('./submenuMessageHandler');

// Map of service names to their handlers
const serviceMap = {
    'airtime': airtimeService,
    'zesa': zesaService,
    'bill_payment': billsService,
    'nyaradzo': nyaradzoService,
    'emergency': emergencyService,
    'help': helpService
};

async function processMessage(userId, messageText) {
    console.log(`📱 Processing message from ${userId}: "${messageText}"`);
    
    // ==================== STEP 1: UNIVERSAL RESET CHECK ====================
    if (messageText.trim().toLowerCase() === 'hi') {
        console.log(`🔄 Resetting session for ${userId} via "hi" command`);
        deleteSession(userId);
        const { deleteSubmenuSession } = require('./submenuSessionHandler');
        deleteSubmenuSession(userId);
        await messaging.sendWelcomeMessage(userId);
        return;
    }
    
    // ==================== STEP 2: LOCKOUT CHECK ====================
    const userState = userActivity[userId];
    if (userState && userState.lockoutUntil > Date.now()) {
        const remainingMinutes = Math.ceil((userState.lockoutUntil - Date.now()) / (60 * 1000));
        await messaging.sendMessage(userId, 
            `🔒 *ACCOUNT LOCKED*\n\nToo many invalid attempts.\n\n⏰ Time remaining: ${remainingMinutes} minute(s)\n\nType "hi" after lockout expires.`
        );
        return;
    }
    
    // ==================== STEP 3: GET USER'S CURRENT SESSION ====================
    const session = getActiveSession(userId);
    console.log(`📱 Current session:`, session ? {
        service: session.service,
        state: session.state
    } : 'No session');
    
    // ==================== STEP 4: ACTIVE SERVICE SESSION = ROUTE DIRECTLY ====================
    if (session) {
        console.log(`📱 Active session found for ${userId} (${session.service}), routing directly`);
        
        // Get the appropriate service handler
        const service = serviceMap[session.service];
        if (!service) {
            console.error(`❌ No service handler for: ${session.service}`);
            deleteSession(userId);
            await messaging.sendWelcomeMessage(userId);
            return;
        }
        
        // Route directly to the service - NO SUBMENU HANDLERS INVOLVED
        let result;
        if (session.service === 'nyaradzo') {
            result = await nyaradzoService.handleRequest(userId, messageText.trim(), session);
        } else if (session.service === 'airtime') {
            result = await airtimeService.handleRequest(userId, messageText.trim(), session);
        } else if (session.service === 'zesa') {
            result = await zesaService.handleRequest(userId, messageText.trim(), session);
        } else if (session.service === 'bill_payment') {
            // Bill payment is special - it shows the submenu
            result = await handleBillPaymentWithSubmenu(userId, messageText.trim(), session);
        } else if (session.service === 'emergency') {
            result = await emergencyService.handleRequest(userId, messageText.trim(), session);
        } else if (session.service === 'help') {
            result = await helpService.handleRequest(userId, messageText.trim(), session);
        }
        
        // Update or delete session based on result
        if (result?.session) {
            // Session is still active - update it
            const { updateSession } = require('./sessionHandlers');
            updateSession(userId, result.session);
            console.log(`📱 Session updated for ${userId}`);
        } else {
            // Session ended - clean up
            deleteSession(userId);
            console.log(`📱 Session ended for ${userId}`);
        }
        
        // Send response message
        if (result?.message) {
            await messaging.sendMessage(userId, result.message);
        }
        
        return;
    }
    
    // ==================== STEP 5: NO SESSION = HANDLE MAIN MENU OR SUBMENU ====================
    console.log(`📱 No active session for ${userId}, checking if they're in submenu`);
    
    // Check if user has a submenu session (looking at bills menu)
    const { getSubmenuSession } = require('./submenuSessionHandler');
    const submenuSession = getSubmenuSession(userId);
    
    if (submenuSession) {
        console.log(`📱 User has submenu session: ${submenuSession.menu}`);
        
        // Handle submenu selection
        const { handleSubmenuSelection } = require('./subMenuHandler');
        const result = await handleSubmenuSelection(userId, submenuSession.menu, messageText.trim());
        
        if (result.service) {
            // User selected a service - create session and route
            console.log(`📱 Creating session for service: ${result.service}`);
            
            if (result.service === 'nyaradzo') {
                // Use Nyaradzo's startFlow directly
                const nyaradzoResult = await nyaradzoService.startFlow(userId);
                
                if (nyaradzoResult.message) {
                    await messaging.sendMessage(userId, nyaradzoResult.message);
                }
                return;
            } else if (result.service.startsWith('telone_')) {
                // Handle TelOne services
                const { createSession } = require('./sessionHandlers');
                const serviceSession = createSession(userId, result.service);
                serviceSession.state = 'START';
                
                // Load the specific TelOne service
                const teloneService = require(`../services/${result.service}`);
                const teloneResult = await teloneService.handleMessage(userId, 'START', serviceSession);
                
                if (teloneResult.message) {
                    await messaging.sendMessage(userId, teloneResult.message);
                }
                return;
            }
        } else if (result.message) {
            // Just a message (like menu re-display)
            await messaging.sendMessage(userId, result.message);
        }
        
        return;
    }
    
    // ==================== STEP 6: NO SESSION, NO SUBMENU = MAIN MENU ====================
    console.log(`📱 No sessions at all for ${userId}, showing main menu options`);
    
    const result = await handleMainMenu(userId, messageText.trim());
    
    if (result?.message) {
        await messaging.sendMessage(userId, result.message);
    }
}

/**
 * Special handler for bill payment submenu
 */
async function handleBillPaymentWithSubmenu(userId, messageText, session) {
    console.log(`📱 Handling bill payment submenu for ${userId}`);
    
    // Get submenu session
    const { getSubmenuSession, createSubmenuSession } = require('./submenuSessionHandler');
    let submenuSession = getSubmenuSession(userId);
    
    // Create submenu session if it doesn't exist
    if (!submenuSession) {
        submenuSession = createSubmenuSession(userId, 'BILLS');
        await sendSubmenu(userId, 'BILLS');
        return { session }; // Keep main session alive
    }
    
    // Handle submenu selection
    const { handleSubmenuSelection } = require('./subMenuHandler');
    const result = await handleSubmenuSelection(userId, 'BILLS', messageText);
    
    if (result.service) {
        // User selected a service - clear main session and let the service take over
        deleteSession(userId);
        
        if (result.service === 'nyaradzo') {
            const nyaradzoResult = await nyaradzoService.startFlow(userId);
            return nyaradzoResult;
        } else if (result.service.startsWith('telone_')) {
            const { createSession } = require('./sessionHandlers');
            const serviceSession = createSession(userId, result.service);
            serviceSession.state = 'START';
            
            const teloneService = require(`../services/${result.service}`);
            return await teloneService.handleMessage(userId, 'START', serviceSession);
        }
    }
    
    return { session }; // Keep main session alive
}

module.exports = { 
    processMessage
};
