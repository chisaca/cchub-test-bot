// handlers/messageHandler.js - COMPLETE WITH TIMER FIX

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

// Import submenu handlers
const { getSubmenuSession, createSubmenuSession, deleteSubmenuSession } = require('./submenuSessionHandler');
const { sendSubmenu } = require('./subMenuHandler');
const { handleSubmenuSelection } = require('./subMenuHandler');

// ==================== PENDING WELCOME TIMER MANAGEMENT ====================
// Map to track pending welcome timers across all services
const pendingWelcomeTimers = new Map();

/**
 * Clear any pending welcome timer for a user
 * This prevents duplicate welcome messages when user types "hi" during the delay
 */
function clearPendingWelcome(userId) {
    if (pendingWelcomeTimers.has(userId)) {
        clearTimeout(pendingWelcomeTimers.get(userId));
        pendingWelcomeTimers.delete(userId);
        console.log(`🧹 Cleared pending welcome timer for ${userId}`);
        return true;
    }
    return false;
}

/**
 * Set a pending welcome timer for a user
 * Used by services that want to return to main menu after a delay
 */
function setPendingWelcome(userId, delayMs = 2000) {
    // Clear any existing timer first
    clearPendingWelcome(userId);
    
    const timer = setTimeout(async () => {
        // Check if user still has no active session before sending welcome
        const existingSession = getActiveSession(userId);
        const existingSubmenu = getSubmenuSession(userId);
        
        if (!existingSession && !existingSubmenu) {
            console.log(`⏰ Auto-returning ${userId} to main menu after delay`);
            await messaging.sendWelcomeMessage(userId);
        } else {
            console.log(`⏰ Skipped auto-welcome for ${userId} - they have active session`);
        }
        
        // Clean up timer reference
        pendingWelcomeTimers.delete(userId);
    }, delayMs);
    
    pendingWelcomeTimers.set(userId, timer);
    console.log(`⏲️ Set pending welcome timer for ${userId} (${delayMs}ms)`);
    
    return timer;
}

/**
 * Main message processing function
 */
async function processMessage(userId, messageText) {
    console.log(`📱 Processing message from ${userId}: "${messageText}"`);
    
    // ==================== STEP 1: UNIVERSAL RESET CHECK ====================
    if (messageText.trim().toLowerCase() === 'hi') {
        console.log(`🔄 Resetting session for ${userId} via "hi" command`);
        
        // Clear any pending welcome timer (prevents duplicate welcome)
        clearPendingWelcome(userId);
        
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
                // Session ended - could be success or cancellation
                deleteSession(userId);
                console.log(`📱 Nyaradzo session ended`);
                
                // If service indicated they want to return to main menu, set a timer
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
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
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
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
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
            }
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (session.service === 'bill_payment') {
            // Check if this is actually a Nyaradzo flow in progress
            if (session.data && session.data.biller === 'nyaradzo') {
                console.log(`📱 Detected Nyaradzo flow within bill_payment session, routing to nyaradzo service`);
                const result = await nyaradzoService.handleRequest(userId, messageText, session);
                
                if (result?.session) {
                    // Session continues
                } else {
                    deleteSession(userId);
                    if (result?.returnToMain) {
                        setPendingWelcome(userId, 2000);
                    }
                }
                
                if (result?.message) {
                    await messaging.sendMessage(userId, result.message);
                }
                return;
            }
            
            // Otherwise, it's the initial biller selection
            console.log(`📱 Routing to bills service for biller selection`);
            const result = await billsService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                // Session continues
            } else {
                deleteSession(userId);
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
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
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
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
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
            }
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
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
            
            // Clear any pending welcome (in case one was set)
            clearPendingWelcome(userId);
            
            // Now handle the service selection
            if (result.service === 'nyaradzo') {
                console.log(`📱 Launching Nyaradzo service`);
                const nyaradzoResult = await nyaradzoService.startFlow(userId);
                
                if (nyaradzoResult?.message) {
                    await messaging.sendMessage(userId, nyaradzoResult.message);
                }
                return;
            }
            
            // Add other service launches as needed
            if (result.service === 'telone') {
                console.log(`📱 Launching TelOne service`);
                // const teloneResult = await teloneService.startFlow(userId);
                // if (teloneResult?.message) {
                //     await messaging.sendMessage(userId, teloneResult.message);
                // }
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
    
    // Clear any pending welcome (they're interacting, so cancel auto-return)
    clearPendingWelcome(userId);
    
    const mainMenuResult = await handleMainMenu(userId, messageText.trim());
    
    if (mainMenuResult?.service) {
        // User selected a service from main menu
        console.log(`📱 Main menu selected: ${mainMenuResult.service}`);
        
        // Clear any pending welcome
        clearPendingWelcome(userId);
        
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

// ==================== CLEANUP FUNCTION ====================
/**
 * Clean up all pending timers (useful for server shutdown)
 */
function cleanupAllPendingTimers() {
    let count = 0;
    for (const [userId, timer] of pendingWelcomeTimers.entries()) {
        clearTimeout(timer);
        pendingWelcomeTimers.delete(userId);
        count++;
    }
    console.log(`🧹 Cleaned up ${count} pending welcome timers`);
    return count;
}

module.exports = { 
    processMessage,
    clearPendingWelcome,
    setPendingWelcome,
    pendingWelcomeTimers,
    cleanupAllPendingTimers
};
