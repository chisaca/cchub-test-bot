// handlers/messageHandler.js
// ============================================================================
// MAIN MESSAGE PROCESSING HANDLER
// Entry point for all incoming WhatsApp messages
// Manages session routing, timer cleanup, and flow control
// ============================================================================

const { getActiveSession, deleteSession, createSession } = require('./sessionHandlers');
const { handleMainMenu } = require('./mainMenuHandler');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const nyaradzoService = require('../services/nyaradzo');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');
const hotUpdatesService = require('../services/hotUpdates');
const messaging = require('../utils/messaging');
const { userActivity } = require('./sessionHandlers');
const { FLOW_STATES, SERVICE_TYPES } = require('../config/constants');

// Submenu handlers for biller selection
const { getSubmenuSession, createSubmenuSession, deleteSubmenuSession } = require('./submenuSessionHandler');
const { sendSubmenu, handleSubmenuSelection } = require('./subMenuHandler');

// ============================================================================
// PENDING WELCOME TIMER MANAGEMENT
// Prevents duplicate welcome messages and handles auto-return to main menu
// ============================================================================
const pendingWelcomeTimers = new Map();

/**
 * Clear any pending welcome timer for a user
 * Prevents duplicate welcome messages when user types "hi" during delay
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {boolean} True if timer was cleared, false if no timer existed
 */
function clearPendingWelcome(userId) {
    if (pendingWelcomeTimers.has(userId)) {
        clearTimeout(pendingWelcomeTimers.get(userId));
        pendingWelcomeTimers.delete(userId);
        console.log(`🧹 [TIMER] Cleared pending welcome timer for ${userId}`);
        return true;
    }
    return false;
}

/**
 * Set a pending welcome timer for a user
 * Used by services to return to main menu after a completion delay
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {number} delayMs - Delay in milliseconds (default: 2000)
 * @returns {Timeout} The created timer object
 */
function setPendingWelcome(userId, delayMs = 2000) {
    // Clear any existing timer first
    clearPendingWelcome(userId);
    
    const timer = setTimeout(async () => {
        // Check if user still has no active session before sending welcome
        const existingSession = getActiveSession(userId);
        const existingSubmenu = getSubmenuSession(userId);
        
        if (!existingSession && !existingSubmenu) {
            console.log(`⏰ [TIMER] Auto-returning ${userId} to main menu after delay`);
            await messaging.sendWelcomeMessage(userId);
        } else {
            console.log(`⏰ [TIMER] Skipped auto-welcome for ${userId} - active session exists`);
        }
        
        // Clean up timer reference
        pendingWelcomeTimers.delete(userId);
    }, delayMs);
    
    pendingWelcomeTimers.set(userId, timer);
    console.log(`⏲️ [TIMER] Set pending welcome timer for ${userId} (${delayMs}ms)`);
    
    return timer;
}

// ============================================================================
// MAIN MESSAGE PROCESSOR
// Handles all incoming messages with priority-based routing
// ============================================================================

/**
 * Main message processing function
 * Routes messages through the appropriate handlers based on session state
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} messageText - User's message text
 */
async function processMessage(userId, messageText) {
    console.log(`📱 [PROCESS] User: ${userId}, Message: "${messageText}"`);
    
    // ==========================================================================
    // STEP 1: UNIVERSAL RESET COMMAND
    // "hi" always resets to main menu, regardless of session state
    // ==========================================================================
    if (messageText.trim().toLowerCase() === 'hi') {
        console.log(`🔄 [RESET] User ${userId} typed "hi" - resetting all sessions`);
        
        // Clear any pending welcome timer (prevents duplicate welcome)
        clearPendingWelcome(userId);
        
        deleteSession(userId);
        deleteSubmenuSession(userId);
        await messaging.sendWelcomeMessage(userId);
        return;
    }
    
    // ==========================================================================
    // STEP 2: LOCKOUT CHECK
    // Users with active lockouts cannot proceed
    // ==========================================================================
    const userState = userActivity[userId];
    if (userState && userState.lockoutUntil > Date.now()) {
        const remainingMinutes = Math.ceil((userState.lockoutUntil - Date.now()) / (60 * 1000));
        await messaging.sendMessage(userId, 
            `🔒 *ACCOUNT LOCKED*\n\nToo many invalid attempts.\n\n⏰ Time remaining: ${remainingMinutes} minute(s)\n\nType "hi" after lockout expires.`
        );
        return;
    }
    
    // ==========================================================================
    // STEP 3: ACTIVE SERVICE SESSION CHECK
    // If user has an active service session, route directly to that service
    // ==========================================================================
    const session = getActiveSession(userId);
    
    if (session) {
        console.log(`📱 [SESSION] Active ${session.service} session for ${userId}`);
        
        // ----------------------------------------------------------------------
        // NYARADZO SERVICE ROUTING
        // ----------------------------------------------------------------------
        if (session.service === SERVICE_TYPES.NYARADZO) {
            console.log(`📱 [ROUTE] Routing to Nyaradzo service`);
            const result = await nyaradzoService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Nyaradzo session continues`);
            } else {
                deleteSession(userId);
                console.log(`📱 [SESSION] Nyaradzo session ended`);
                
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
            }
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // AIRTIME SERVICE ROUTING
        // ----------------------------------------------------------------------
        if (session.service === SERVICE_TYPES.AIRTIME) {
            console.log(`📱 [ROUTE] Routing to Airtime service`);
            const result = await airtimeService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Airtime session continues`);
            } else {
                deleteSession(userId);
                console.log(`📱 [SESSION] Airtime session ended`);
                
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
            }
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // ZESA SERVICE ROUTING
        // ----------------------------------------------------------------------
        if (session.service === SERVICE_TYPES.ZESA) {
            console.log(`📱 [ROUTE] Routing to ZESA service`);
            const result = await zesaService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] ZESA session continues`);
            } else {
                deleteSession(userId);
                console.log(`📱 [SESSION] ZESA session ended`);
                
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
            }
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // BILL PAYMENT SERVICE ROUTING
        // Handles biller selection and delegates to specific biller services
        // ----------------------------------------------------------------------
        if (session.service === SERVICE_TYPES.BILL_PAYMENT) {
            // Check if this is actually a Nyaradzo flow in progress
            if (session.data && session.data.biller === 'nyaradzo') {
                console.log(`📱 [ROUTE] Detected Nyaradzo flow within bill_payment, routing to Nyaradzo service`);
                const result = await nyaradzoService.handleRequest(userId, messageText, session);
                
                if (result?.session) {
                    console.log(`📱 [SESSION] Nyaradzo session continues`);
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
            console.log(`📱 [ROUTE] Routing to Bills service for biller selection`);
            const result = await billsService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Bills session continues`);
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
        
        // ----------------------------------------------------------------------
        // EMERGENCY SERVICE ROUTING
        // ----------------------------------------------------------------------
        if (session.service === SERVICE_TYPES.EMERGENCY) {
            console.log(`📱 [ROUTE] Routing to Emergency service`);
            const result = await emergencyService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Emergency session continues`);
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
        
        // ----------------------------------------------------------------------
        // HELP SERVICE ROUTING
        // ----------------------------------------------------------------------
        if (session.service === SERVICE_TYPES.HELP) {
            console.log(`📱 [ROUTE] Routing to Help service`);
            const result = await helpService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Help session continues`);
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
        
        // ----------------------------------------------------------------------
        // HOT UPDATES SERVICE ROUTING
        // ----------------------------------------------------------------------
        if (session.service === SERVICE_TYPES.HOT_UPDATES) {
            console.log(`📱 [ROUTE] Routing to Hot Updates service`);
            const result = await hotUpdatesService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Hot Updates session continues`);
            } else {
                deleteSession(userId);
                console.log(`📱 [SESSION] Hot Updates session ended`);
                
                // Only set pending welcome if explicitly requested
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
            }
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // UNKNOWN SERVICE - Clean up and restart
        // ----------------------------------------------------------------------
        console.error(`❌ [ERROR] Unknown service: ${session.service}`);
        deleteSession(userId);
        await messaging.sendWelcomeMessage(userId);
        return;
    }
    
    // ==========================================================================
    // STEP 4: SUBMENU SESSION CHECK
    // User has a submenu session (biller selection) but no main service session
    // ==========================================================================
    const submenuSession = getSubmenuSession(userId);
    
    if (submenuSession) {
        console.log(`📱 [SUBMENU] User has submenu session: ${submenuSession.menu}`);
        
        // Handle submenu selection (biller choice or hot updates service)
        const result = await handleSubmenuSelection(userId, submenuSession.menu, messageText.trim());
        
        if (result.service) {
            // User selected a service - Delete submenu session first
            console.log(`📱 [SUBMENU] User selected service: ${result.service} from menu: ${submenuSession.menu}`);
            deleteSubmenuSession(userId);
            
            // Clear any pending welcome (in case one was set)
            clearPendingWelcome(userId);
            
            // ====================================================================
            // LAUNCH THE SELECTED SERVICE BASED ON SERVICE TYPE
            // ====================================================================
            
            // BILLS SUBMENU SERVICES
            if (result.service === SERVICE_TYPES.NYARADZO) {
                console.log(`📱 [LAUNCH] Starting Nyaradzo service`);
                const nyaradzoResult = await nyaradzoService.startFlow(userId);
                
                if (nyaradzoResult?.message) {
                    await messaging.sendMessage(userId, nyaradzoResult.message);
                }
                return;
            }
            
            // HOT UPDATES SUBMENU SERVICES
            if (submenuSession.menu === 'HOT_UPDATES') {
                console.log(`📱 [LAUNCH] Starting Hot Updates service with selection: ${result.option?.key}`);
                
                // Create main session for Hot Updates with the selected service
                const hotUpdatesSession = createSession(userId, SERVICE_TYPES.HOT_UPDATES);
                hotUpdatesSession.state = FLOW_STATES.HOT_UPDATES.START;
                hotUpdatesSession.data = {
                    selectedService: result.option?.key,
                    serviceName: result.option?.name,
                    serviceEmoji: result.option?.emoji
                };
                
                // Call hotUpdatesService with the session
                const hotUpdatesResult = await hotUpdatesService.handleRequest(userId, messageText, hotUpdatesSession);
                
                if (hotUpdatesResult?.message) {
                    await messaging.sendMessage(userId, hotUpdatesResult.message);
                }
                return;
            }
            
            // Add other biller services here as they're added
        }
        
        if (result.message) {
            // Just a message (like showing menu again)
            await messaging.sendMessage(userId, result.message);
        }
        return;
    }
    
    // ==========================================================================
    // STEP 5: NO SESSIONS - MAIN MENU
    // User has no active sessions, treat as main menu input
    // ==========================================================================
    console.log(`📱 [MAIN] No sessions for ${userId}, processing as main menu input`);
    
    // Clear any pending welcome (they're interacting, so cancel auto-return)
    clearPendingWelcome(userId);
    
    const mainMenuResult = await handleMainMenu(userId, messageText.trim());
    
    // Handle service launches from main menu
    if (mainMenuResult?.service) {
        console.log(`📱 [MAIN] User selected: ${mainMenuResult.service}`);
        
        // Clear any pending welcome
        clearPendingWelcome(userId);
        
        // ----------------------------------------------------------------------
        // BILL PAYMENT LAUNCH
        // Special case: creates both main session and submenu
        // ----------------------------------------------------------------------
        if (mainMenuResult.service === SERVICE_TYPES.BILL_PAYMENT) {
            // Create main session for bills
            const billSession = createSession(userId, SERVICE_TYPES.BILL_PAYMENT);
            billSession.state = FLOW_STATES.BILL_PAYMENT.SELECT_BILLER;
            
            // Create submenu session for biller selection
            createSubmenuSession(userId, 'BILLS');
            
            // Send the bills menu
            await sendSubmenu(userId, 'BILLS');
            return;
        }
        
        // ----------------------------------------------------------------------
        // AIRTIME LAUNCH
        // ----------------------------------------------------------------------
        if (mainMenuResult.service === SERVICE_TYPES.AIRTIME) {
            const airtimeSession = createSession(userId, SERVICE_TYPES.AIRTIME);
            const result = await airtimeService.handleRequest(userId, messageText, airtimeSession);
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // ZESA LAUNCH
        // ----------------------------------------------------------------------
        if (mainMenuResult.service === SERVICE_TYPES.ZESA) {
            const zesaSession = createSession(userId, SERVICE_TYPES.ZESA);
            const result = await zesaService.handleRequest(userId, messageText, zesaSession);
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // EMERGENCY LAUNCH
        // ----------------------------------------------------------------------
        if (mainMenuResult.service === SERVICE_TYPES.EMERGENCY) {
            const emergencySession = createSession(userId, SERVICE_TYPES.EMERGENCY);
            const result = await emergencyService.handleRequest(userId, messageText, emergencySession);
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // HELP LAUNCH
        // ----------------------------------------------------------------------
        if (mainMenuResult.service === SERVICE_TYPES.HELP) {
            const helpSession = createSession(userId, SERVICE_TYPES.HELP);
            const result = await helpService.handleRequest(userId, messageText, helpSession);
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // HOT UPDATES LAUNCH
        // ----------------------------------------------------------------------
        if (mainMenuResult.service === SERVICE_TYPES.HOT_UPDATES) {
            console.log(`📱 [LAUNCH] Starting Hot Updates service`);
            
            // Create session for Hot Updates
            const hotUpdatesSession = createSession(userId, SERVICE_TYPES.HOT_UPDATES);
            hotUpdatesSession.state = FLOW_STATES.HOT_UPDATES.START;
            
            // Get the main menu for Hot Updates
            const result = await hotUpdatesService.startFlow(userId);
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
    }
    
    // Send any response message from main menu handler
    if (mainMenuResult?.message) {
        await messaging.sendMessage(userId, mainMenuResult.message);
    }
}

// ============================================================================
// CLEANUP FUNCTION
// For server shutdown and maintenance
// ============================================================================

/**
 * Clean up all pending timers
 * Useful for graceful server shutdown
 * 
 * @returns {number} Number of timers cleaned up
 */
function cleanupAllPendingTimers() {
    let count = 0;
    for (const [userId, timer] of pendingWelcomeTimers.entries()) {
        clearTimeout(timer);
        pendingWelcomeTimers.delete(userId);
        count++;
    }
    console.log(`🧹 [CLEANUP] Cleaned up ${count} pending welcome timers`);
    return count;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = { 
    processMessage,
    clearPendingWelcome,
    setPendingWelcome,
    pendingWelcomeTimers,
    cleanupAllPendingTimers
};