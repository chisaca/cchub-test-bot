// handlers/messageHandler.js - CORRECTED IMPORTS

const { getActiveSession, deleteSession, createSession } = require('./sessionHandlers');
const { handleMainMenu } = require('./mainMenuHandler');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const nyaradzoService = require('../services/nyaradzo');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');
const messaging = require('../utils/messaging');
const { userActivity } = require('./sessionHandlers');

// Import submenu handlers - FIXED: sendSubmenu now comes from subMenuHandler.js
const { getSubmenuSession, createSubmenuSession, deleteSubmenuSession } = require('./submenuSessionHandler');
const { sendSubmenu } = require('./subMenuHandler');  // ← CHANGED THIS LINE
const { handleSubmenuSelection } = require('./subMenuHandler');

async function processMessage(userId, messageText) {
    console.log(`📱 Processing message from ${userId}: "${messageText}"`);
    
    // ==================== STEP 1: UNIVERSAL RESET CHECK ====================
    if (messageText.trim().toLowerCase() === 'hi') {
        console.log(`🔄 Resetting session for ${userId} via "hi" command`);
        deleteSession(userId);
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
    
    // ==================== STEP 3: CHECK FOR ACTIVE SERVICE SESSION ====================
    const session = getActiveSession(userId);
    
    // If there's an active service session, route directly to that service
    if (session) {
        console.log(`📱 Active session for ${userId}: ${session.service}`);
        
        // Route to the appropriate service based on session.service
        if (session.service === 'nyaradzo') {
            console.log(`📱 Routing to nyaradzo service`);
            const result = await nyaradzoService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                // Session continues
                console.log(`📱 Nyaradzo session continues`);
            } else {
                // Session ended
                deleteSession(userId);
                console.log(`📱 Nyaradzo session ended`);
            }
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (session.service === 'airtime') {
            const result = await airtimeService.handleRequest(userId, messageText, session);
            if (result?.session) {
                // Session continues
            } else {
                deleteSession(userId);
            }
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (session.service === 'zesa') {
            const result = await zesaService.handleRequest(userId, messageText, session);
            if (result?.session) {
                // Session continues
            } else {
                deleteSession(userId);
            }
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (session.service === 'bill_payment') {
            console.log(`📱 Routing to bills service`);
            const result = await billsService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                // Session continues
            } else {
                deleteSession(userId);
            }
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (session.service === 'emergency') {
            const result = await emergencyService.handleRequest(userId, messageText, session);
            if (result?.session) {
                // Session continues
            } else {
                deleteSession(userId);
            }
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (session.service === 'help') {
            const result = await helpService.handleRequest(userId, messageText, session);
            if (result?.session) {
                // Session continues
            } else {
                deleteSession(userId);
            }
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // Handle TelOne services dynamically
        if (session.service.startsWith('telone_')) {
            console.log(`📱 Routing to ${session.service}`);
            try {
                const teloneService = require(`../services/${session.service}`);
                const result = await teloneService.handleMessage(userId, messageText, session);
                
                if (result?.session) {
                    // Session continues
                } else {
                    deleteSession(userId);
                }
                
                if (result?.message) {
                    await messaging.sendMessage(userId, result.message);
                }
            } catch (error) {
                console.error(`❌ Error loading telone service:`, error);
                deleteSession(userId);
                await messaging.sendMessage(userId, `❌ Service error. Type "hi" to restart.`);
            }
            return;
        }
        
        // Unknown service - clean up
        console.error(`❌ Unknown service: ${session.service}`);
        deleteSession(userId);
        await messaging.sendWelcomeMessage(userId);
        return;
    }
    
    // ==================== STEP 4: NO ACTIVE SESSION - CHECK FOR SUBMENU SESSION ====================
    const submenuSession = getSubmenuSession(userId);
    
    if (submenuSession) {
        console.log(`📱 User has submenu session: ${submenuSession.menu}`);
        
        // Handle submenu selection
        const result = await handleSubmenuSelection(userId, submenuSession.menu, messageText.trim());
        
        if (result.service) {
            // User selected a service - IMPORTANT: Delete submenu session first
            console.log(`📱 User selected service: ${result.service}`);
            deleteSubmenuSession(userId);
            
            // Now handle the service selection
            if (result.service === 'nyaradzo') {
                console.log(`📱 Launching Nyaradzo service`);
                const nyaradzoResult = await nyaradzoService.startFlow(userId);
                
                if (nyaradzoResult?.message) {
                    await messaging.sendMessage(userId, nyaradzoResult.message);
                }
                return;
            }
            
            if (result.service.startsWith('telone_')) {
                console.log(`📱 Launching ${result.service} service`);
                try {
                    const teloneService = require(`../services/${result.service}`);
                    const serviceSession = createSession(userId, result.service);
                    serviceSession.state = 'START';
                    
                    const teloneResult = await teloneService.handleMessage(userId, 'START', serviceSession);
                    
                    if (teloneResult?.message) {
                        await messaging.sendMessage(userId, teloneResult.message);
                    }
                } catch (error) {
                    console.error(`❌ Error launching telone service:`, error);
                    await messaging.sendMessage(userId, `❌ Service unavailable. Type "hi" to restart.`);
                }
                return;
            }
        }
        
        if (result.message) {
            // Just a message (like showing menu again)
            await messaging.sendMessage(userId, result.message);
        }
        return;
    }
    
    // ==================== STEP 5: NO SESSIONS AT ALL - MAIN MENU ====================
    console.log(`📱 No sessions for ${userId}, showing main menu`);
    
    const mainMenuResult = await handleMainMenu(userId, messageText.trim());
    
    if (mainMenuResult?.service) {
        // User selected a service from main menu
        console.log(`📱 Main menu selected: ${mainMenuResult.service}`);
        
        if (mainMenuResult.service === 'bill_payment') {
            // Create main session for bills
            const billSession = createSession(userId, 'bill_payment');
            billSession.state = 'SELECT_BILLER';
            
            // Create submenu session
            createSubmenuSession(userId, 'BILLS');
            
            // Send the bills menu
            await sendSubmenu(userId, 'BILLS');
            return;
        }
        
        if (mainMenuResult.service === 'airtime') {
            const airtimeSession = createSession(userId, 'airtime');
            const result = await airtimeService.handleRequest(userId, messageText, airtimeSession);
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (mainMenuResult.service === 'zesa') {
            const zesaSession = createSession(userId, 'zesa');
            const result = await zesaService.handleRequest(userId, messageText, zesaSession);
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (mainMenuResult.service === 'emergency') {
            const emergencySession = createSession(userId, 'emergency');
            const result = await emergencyService.handleRequest(userId, messageText, emergencySession);
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (mainMenuResult.service === 'help') {
            const helpSession = createSession(userId, 'help');
            const result = await helpService.handleRequest(userId, messageText, helpSession);
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
    }
    
    if (mainMenuResult?.message) {
        await messaging.sendMessage(userId, mainMenuResult.message);
    }
}

module.exports = { 
    processMessage
};
