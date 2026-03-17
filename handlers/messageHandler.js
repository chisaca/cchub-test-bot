// handlers/messageHandler.js - UPDATED with 3-Tap Maximum Architecture
// ============================================================================
// MAIN MESSAGE PROCESSING HANDLER
// Entry point for all incoming WhatsApp messages
// Manages session routing, timer cleanup, and flow control
// NOW WITH: 3-Tap Maximum support, WhatsApp Flows, Interactive messages
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
const quickServiceHandler = require('./quickServiceHandler');
console.log('🔥 HOT UPDATES SERVICE LOADED:', hotUpdatesService);
const messaging = require('../utils/messaging');
const { userActivity } = require('./sessionHandlers');
const { 
    FLOW_STATES, 
    SERVICE_TYPES,
    PERSONALITY_CONFIG,
    INTERACTIVE_UI_CONFIG,
    WHATSAPP_CONFIG,
    UI_MESSAGES  // ADD THIS - needed for weather location prompt
} = require('../config/constants');

// Personality utilities
const { 
    getTimeBasedGreeting, 
    getRandomResponse, 
    maybeAddJoke,
    trackInteraction,
    getZimFact
} = require('../utils/personality');

// Submenu handlers for biller selection
const { getSubmenuSession, createSubmenuSession, deleteSubmenuSession } = require('./submenuSessionHandler');
const { sendSubmenu, handleSubmenuSelection } = require('./subMenuHandler');

// ADD THESE MISSING IMPORTS
const newsService = require('../services/newsService');  // Needed for news handling
const { sendEplMenu } = require('./subMenuHandler');    // Needed for EPL menu

// Track user interaction counts for personality features
const userInteractionCount = new Map();

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
            
            // Send interactive main menu
            await messaging.sendInteractiveMainMenu(userId);
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
 * Check if message is an interactive response (button, list, flow)
 * @param {object} metadata - Message metadata
 * @returns {object|null} Parsed interactive response or null
 */
function parseInteractiveResponse(metadata) {
    if (!metadata || !metadata.interactive) return null;
    
    const interactive = metadata.interactive;
    
    // Handle button replies
    if (interactive.type === 'button_reply') {
        return {
            type: 'button',
            id: interactive.button_reply.id,
            title: interactive.button_reply.title
        };
    }
    
    // Handle list replies
    if (interactive.type === 'list_reply') {
        return {
            type: 'list',
            id: interactive.list_reply.id,
            title: interactive.list_reply.title,
            description: interactive.list_reply.description
        };
    }
    
    return null;
}

/**
 * Main message processing function
 * Routes messages through the appropriate handlers based on session state
 * NOW WITH: Support for interactive message types, flows, and 3-tap architecture
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} messageText - User's message text
 * @param {object} metadata - Additional message metadata (type, interactive response, etc.)
 */
async function processMessage(userId, messageText, metadata = {}) {
    console.log(`📱 [PROCESS] User: ${userId}, Message: "${messageText}", Type: ${metadata.type || 'text'}`);
    
    // Check for interactive responses (button/list clicks)
    const interactiveResponse = parseInteractiveResponse(metadata);
    if (interactiveResponse) {
        console.log(`🎯 [INTERACTIVE] User ${userId} clicked: ${interactiveResponse.type} - ${interactiveResponse.id}`);
        messageText = interactiveResponse.id; // Use the button/list ID as the message
    }
    
    // Track interaction for personality features
    trackInteraction(userId, userInteractionCount);
    
    // ==========================================================================
    // STEP 1: UNIVERSAL RESET COMMAND
    // "hi" always resets to main menu, regardless of session state
    // ==========================================================================
    if (messageText.trim().toLowerCase() === 'hi' || messageText === 'menu' || messageText === 'main_menu') {
        console.log(`🔄 [RESET] User ${userId} typed "hi" - resetting all sessions`);
        
        // Clear any pending welcome timer
        clearPendingWelcome(userId);
        
        deleteSession(userId);
        deleteSubmenuSession(userId);
        
        // Send interactive main menu
        await messaging.sendInteractiveMainMenu(userId);
        return;
    }

    // ==========================================================================
    // STEP 1.5: DEBUG COMMAND (temporary)
    // ==========================================================================
    if (messageText.trim().toLowerCase() === 'clearcache') {
        console.log(`🧹 [DEBUG] User ${userId} requested cache clear`);
        
        const eplService = require('../services/eplService');
        eplService.clearCache();
        
        await messaging.sendMessage(userId, `✅ EPL cache cleared! Try fetching fixtures again.`);
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
    // STEP 3: CHECK FOR FLOW COMPLETION
    // Handle WhatsApp Flow completion webhooks
    // ==========================================================================
    if (metadata.type === WHATSAPP_CONFIG.MESSAGE_TYPES.FLOW && metadata.flow_data) {
        console.log(`🔄 [FLOW] User ${userId} completed a flow`);
        
        const flowData = metadata.flow_data;
        const session = getActiveSession(userId);
        
        if (session && session.state === FLOW_STATES.FLOW.AWAITING_FLOW_COMPLETION) {
            // Route to appropriate service with flow data
            if (session.service === SERVICE_TYPES.AIRTIME) {
                const result = await airtimeService.handleFlowCompletion(userId, flowData, session);
                if (result?.message) {
                    await messaging.sendMessage(userId, result.message);
                }
                if (result?.complete) {
                    deleteSession(userId);
                    setPendingWelcome(userId, 2000);
                }
                return;
            }
            
            if (session.service === SERVICE_TYPES.ZESA) {
                const result = await zesaService.handleFlowCompletion(userId, flowData, session);
                if (result?.message) {
                    await messaging.sendMessage(userId, result.message);
                }
                if (result?.complete) {
                    deleteSession(userId);
                    setPendingWelcome(userId, 2000);
                }
                return;
            }
        }
    }
    
    // ==========================================================================
    // STEP 4: ACTIVE SERVICE SESSION CHECK
    // If user has an active service session, route directly to that service
    // ==========================================================================
    const session = getActiveSession(userId);
    
    if (session) {
        console.log(`📱 [SESSION] Active ${session.service} session for ${userId} in state: ${session.state}`);
        
        // ----------------------------------------------------------------------
        // QUICK SERVICE ROUTING
        // Handle quick service confirmation flow
        // ----------------------------------------------------------------------
        if (session.service === SERVICE_TYPES.QUICK_AIRTIME || session.service === SERVICE_TYPES.QUICK_ZESA) {
            console.log(`📱 [ROUTE] Routing to Quick Service handler`);
            const result = await quickServiceHandler.handleResponse(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Quick service session continues`);
            } else {
                deleteSession(userId);
                console.log(`📱 [SESSION] Quick service session ended`);
                
                if (result?.returnToMain) {
                    setPendingWelcome(userId, 2000);
                }
            }
            
            if (result?.message) {
                // Add personality to response (random encouragement)
                const finalMessage = maybeAddJoke(result.message, userId, userInteractionCount);
                await messaging.sendMessage(userId, finalMessage);
            }
            return;
        }
        
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
            
            // Check if we need to launch the flow
            if (session.state === FLOW_STATES.FLOW.AIRTIME) {
                const result = await airtimeService.launchFlow(userId, session);
                if (result?.flow) {
                    await messaging.sendFlowMessage(userId, result.flow);
                }
                return;
            }
            
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
            
            // Check if we need to launch the flow
            if (session.state === FLOW_STATES.FLOW.ZESA) {
                const result = await zesaService.launchFlow(userId, session);
                if (result?.flow) {
                    await messaging.sendFlowMessage(userId, result.flow);
                }
                return;
            }
            
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
                // Add personality to response
                const finalMessage = maybeAddJoke(result.message, userId, userInteractionCount);
                await messaging.sendMessage(userId, finalMessage);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // UNKNOWN SERVICE - Clean up and restart
        // ----------------------------------------------------------------------
        console.error(`❌ [ERROR] Unknown service: ${session.service}`);
        deleteSession(userId);
        
        // Send interactive main menu
        await messaging.sendInteractiveMainMenu(userId);
        return;
    }
    
    // ==========================================================================
    // STEP 5: SUBMENU SESSION CHECK
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
                
                // Check if we already have a session
                let hotUpdatesSession = getActiveSession(userId);
                
                if (!hotUpdatesSession) {
                    // Create main session for Hot Updates if it doesn't exist
                    hotUpdatesSession = createSession(userId, SERVICE_TYPES.HOT_UPDATES);
                    hotUpdatesSession.state = FLOW_STATES.HOT_UPDATES.START;
                }
                
                hotUpdatesSession.data = {
                    ...hotUpdatesSession.data,
                    selectedService: result.option?.key,
                    serviceName: result.option?.name,
                    serviceEmoji: result.option?.emoji
                };
                
                // Handle the selected service directly
                if (result.option?.key === 'epl') {
                    // Need to import or get sendEplMenu function
                    const { sendEplMenu } = require('./subMenuHandler');
                    await sendEplMenu(userId);
                } else if (result.option?.key === 'news') {
                    // Handle news directly
                    const newsResult = await newsService.getNewsUpdates(userId, false, null, 1);
                    await messaging.sendButtonMessage(
                        userId,
                        newsResult,
                        [
                            { id: "more", title: "➡️ More News" },
                            { id: "hu_back", title: "🔙 Back" },
                            { id: "hi", title: "🏠 Menu" }
                        ]
                    );
                } else if (result.option?.key === 'weather') {
                    // Send weather location prompt
                    await messaging.sendMessage(userId, UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT);
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
    // STEP 6: NO SESSIONS - MAIN MENU
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
        // QUICK SERVICE LAUNCH
        // Handle quick airtime and quick zesa selections
        // ----------------------------------------------------------------------
        if (mainMenuResult.service === SERVICE_TYPES.QUICK_AIRTIME || 
            mainMenuResult.service === SERVICE_TYPES.QUICK_ZESA) {
            
            const quickSession = createSession(userId, mainMenuResult.service);
            const result = await quickServiceHandler.handleResponse(userId, messageText, quickSession);
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
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
        // NEW: Use WhatsApp Flow for 2-tap experience
        // ----------------------------------------------------------------------
        if (mainMenuResult.service === SERVICE_TYPES.AIRTIME) {
            const airtimeSession = createSession(userId, SERVICE_TYPES.AIRTIME);
            
            // Set state to launch flow
            airtimeSession.state = FLOW_STATES.FLOW.AIRTIME;
            
            const result = await airtimeService.launchFlow(userId, airtimeSession);
            
            if (result?.flow) {
                await messaging.sendFlowMessage(userId, result.flow);
            } else if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // ----------------------------------------------------------------------
        // ZESA LAUNCH
        // NEW: Use WhatsApp Flow for 2-tap experience
        // ----------------------------------------------------------------------
        if (mainMenuResult.service === SERVICE_TYPES.ZESA) {
            const zesaSession = createSession(userId, SERVICE_TYPES.ZESA);
            
            // Set state to launch flow
            zesaSession.state = FLOW_STATES.FLOW.ZESA;
            
            const result = await zesaService.launchFlow(userId, zesaSession);
            
            if (result?.flow) {
                await messaging.sendFlowMessage(userId, result.flow);
            } else if (result?.message) {
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
        // Add personality to response
        const finalMessage = maybeAddJoke(mainMenuResult.message, userId, userInteractionCount);
        await messaging.sendMessage(userId, finalMessage);
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