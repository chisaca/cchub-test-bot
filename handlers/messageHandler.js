// handlers/messageHandler.js - UPDATED with Marketplace Navigation Fix
// ============================================================================
// MAIN MESSAGE PROCESSING HANDLER
// Entry point for all incoming WhatsApp messages
// Manages session routing, timer cleanup, and flow control
// NOW WITH: Fixed marketplace navigation buttons (MORE, BACK, MARKETPLACE)
// ============================================================================

const { getActiveSession, deleteSession, createSession } = require('./sessionHandlers');
const { handleMainMenu, sendInteractiveMainMenu } = require('./mainMenuHandler');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const nyaradzoService = require('../services/nyaradzo');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');
const hotUpdatesService = require('../services/hotUpdates');
const quickServiceHandler = require('./quickServiceHandler');
const marketplaceHandler = require('./marketplaceHandler');
console.log('🔥 HOT UPDATES SERVICE LOADED:', hotUpdatesService);
console.log('🏪 MARKETPLACE HANDLER LOADED:', marketplaceHandler);
const messaging = require('../utils/messaging');
const { userActivity } = require('./sessionHandlers');
const { 
    FLOW_STATES, 
    SERVICE_TYPES,
    PERSONALITY_CONFIG,
    INTERACTIVE_UI_CONFIG,
    WHATSAPP_CONFIG,
    UI_MESSAGES
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
const newsService = require('../services/newsService');
const { sendEplMenu } = require('./subMenuHandler');

// Track user interaction counts for personality features
const userInteractionCount = new Map();

// ============================================================================
// PENDING WELCOME TIMER MANAGEMENT
// ============================================================================
const pendingWelcomeTimers = new Map();

function clearPendingWelcome(userId) {
    if (pendingWelcomeTimers.has(userId)) {
        clearTimeout(pendingWelcomeTimers.get(userId));
        pendingWelcomeTimers.delete(userId);
        console.log(`🧹 [TIMER] Cleared pending welcome timer for ${userId}`);
        return true;
    }
    return false;
}

function setPendingWelcome(userId, delayMs = 2000) {
    clearPendingWelcome(userId);
    
    const timer = setTimeout(async () => {
        const existingSession = getActiveSession(userId);
        const existingSubmenu = getSubmenuSession(userId);
        
        if (!existingSession && !existingSubmenu) {
            console.log(`⏰ [TIMER] Auto-returning ${userId} to main menu after delay`);
            await sendInteractiveMainMenu(userId);
        } else {
            console.log(`⏰ [TIMER] Skipped auto-welcome for ${userId} - active session exists`);
        }
        
        pendingWelcomeTimers.delete(userId);
    }, delayMs);
    
    pendingWelcomeTimers.set(userId, timer);
    console.log(`⏲️ [TIMER] Set pending welcome timer for ${userId} (${delayMs}ms)`);
    
    return timer;
}

// ============================================================================
// HELPER FUNCTION TO SEND SUBMENUS
// ============================================================================

/**
 * Send a submenu based on category
 * @param {string} userId - User ID
 * @param {string} category - Category name (PAYMENTS, INFORMATION, QUICK, MARKETPLACE)
 */
async function sendCategorySubmenu(userId, category) {
    let submenuConfig;
    
    switch (category) {
        case 'PAYMENTS':
            submenuConfig = INTERACTIVE_UI_CONFIG.PAYMENTS_SUBMENU;
            break;
        case 'INFORMATION':
            submenuConfig = INTERACTIVE_UI_CONFIG.INFORMATION_SUBMENU;
            break;
        case 'QUICK':
            submenuConfig = INTERACTIVE_UI_CONFIG.QUICK_SUBMENU;
            break;
        case 'MARKETPLACE':
            submenuConfig = INTERACTIVE_UI_CONFIG.MARKETPLACE_SUBMENU;
            break;
        case 'SUPPORT':
            submenuConfig = INTERACTIVE_UI_CONFIG.SUPPORT_SUBMENU;
            break;
        default:
            return false;
    }
    
    await messaging.sendListMessage(
        userId,
        submenuConfig[0].title,
        "Select an option:",
        "📋 View Options",
        submenuConfig
    );
    // After sending the submenu, create a submenu session
    createSubmenuSession(userId, category);
    
    return true;
}

// ============================================================================
// MAIN MESSAGE PROCESSOR
// ============================================================================

function parseInteractiveResponse(metadata) {
    if (!metadata || !metadata.interactive) return null;
    
    const interactive = metadata.interactive;
    
    if (interactive.type === 'button_reply') {
        return {
            type: 'button',
            id: interactive.button_reply.id,
            title: interactive.button_reply.title
        };
    }
    
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

async function processMessage(userId, messageText, metadata = {}) {
     console.log(`📱 [PROCESS] User: ${userId}, Message: "${messageText}", Type: ${metadata.type || 'text'}`);
    
    const interactiveResponse = parseInteractiveResponse(metadata);
    if (interactiveResponse) {
        console.log(`🎯 [INTERACTIVE] User ${userId} clicked: ${interactiveResponse.type} - ${interactiveResponse.id}`);
        messageText = interactiveResponse.id;
    }
    
    trackInteraction(userId, userInteractionCount);
    
    // ==========================================================================
    // STEP 1: KILL SWITCH - ALWAYS FIRST, ALWAYS WORKS
    // This is the universal reset - any message that means "go to main menu"
    // ==========================================================================
    const killSwitchCommands = ['hi', 'menu', 'main_menu', 'start', 'hello', 'hey'];
    const isKillSwitch = killSwitchCommands.includes(messageText.toLowerCase().trim());
    
    if (isKillSwitch) {
        console.log(`🔫 [KILL SWITCH] User ${userId} triggered reset with "${messageText}"`);
        
        // Clear ALL sessions and timers
        clearPendingWelcome(userId);
        deleteSession(userId);
        deleteSubmenuSession(userId);
        
        // Send fresh main menu
        await sendInteractiveMainMenu(userId);
        return;
    }
    
    // ==========================================================================
    // STEP 2: MARKETPLACE NAVIGATION BUTTONS
    // These are special - they need to be handled while preserving session
    // ==========================================================================
    const marketplaceNavCommands = ['MORE', 'BACK', 'MARKETPLACE'];
    const isMarketplaceNav = marketplaceNavCommands.includes(messageText.toUpperCase().trim());
    
    if (isMarketplaceNav) {
        const session = getActiveSession(userId);
        if (session && (session.service === SERVICE_TYPES.MARKETPLACE || 
                        session.service === SERVICE_TYPES.CAR_LISTINGS || 
                        session.service === SERVICE_TYPES.JOB_LISTINGS)) {
            console.log(`🏪 [NAV] User ${userId} clicked marketplace navigation: ${messageText}`);
            const result = await marketplaceHandler.handleMarketplaceNavigation(userId, messageText, session);
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        // If no marketplace session, treat as invalid
        await messaging.sendMessage(userId, "No active marketplace session. Type *hi* to start.");
        return;
    }
    
    // ==========================================================================
    // STEP 3: HANDLE SUBMENU SELECTIONS (Main Menu Category Clicks)
    // ==========================================================================
    
    // Handle main menu category selections (they open submenus)
    if (messageText === 'submenu_payments') {
        console.log(`📱 [SUBMENU] User ${userId} selected PAYMENTS category`);
        await sendCategorySubmenu(userId, 'PAYMENTS');
        return;
    }
    
    if (messageText === 'submenu_information') {
        console.log(`📱 [SUBMENU] User ${userId} selected INFORMATION category`);
        await sendCategorySubmenu(userId, 'INFORMATION');
        return;
    }
    
    if (messageText === 'submenu_quick') {
        console.log(`📱 [SUBMENU] User ${userId} selected QUICK ACTIONS category`);
        await sendCategorySubmenu(userId, 'QUICK');
        return;
    }
    
    if (messageText === 'submenu_marketplace') {
        console.log(`📱 [SUBMENU] User ${userId} selected MARKETPLACE category`);
        await sendCategorySubmenu(userId, 'MARKETPLACE');
        return;
    }

    if (messageText === 'submenu_support') {
        console.log(`📱 [SUBMENU] User ${userId} selected SUPPORT category`);
        await sendCategorySubmenu(userId, 'SUPPORT');
        return;
    }
    
    // Handle "Back" button from submenus
    if (messageText === 'back') {
        console.log(`📱 [BACK] User ${userId} returning to main menu`);
        deleteSubmenuSession(userId);
        await sendInteractiveMainMenu(userId);
        return;
    }
    
    // ==========================================================================
    // STEP 4: LOCKOUT CHECK
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
    // STEP 5: CHECK FOR FLOW COMPLETION
    // ==========================================================================
    if (metadata.type === WHATSAPP_CONFIG.MESSAGE_TYPES.FLOW && metadata.flow_data) {
        console.log(`🔄 [FLOW] User ${userId} completed a flow`);
        
        const flowData = metadata.flow_data;
        const session = getActiveSession(userId);
        
        if (session && session.state === FLOW_STATES.FLOW.AWAITING_FLOW_COMPLETION) {
            if (session.service === SERVICE_TYPES.AIRTIME) {
                const result = await airtimeService.handleFlowCompletion(userId, flowData, session);
                if (result?.message) await messaging.sendMessage(userId, result.message);
                if (result?.complete) {
                    deleteSession(userId);
                    setPendingWelcome(userId, 2000);
                }
                return;
            }
            
            if (session.service === SERVICE_TYPES.ZESA) {
                const result = await zesaService.handleFlowCompletion(userId, flowData, session);
                if (result?.message) await messaging.sendMessage(userId, result.message);
                if (result?.complete) {
                    deleteSession(userId);
                    setPendingWelcome(userId, 2000);
                }
                return;
            }
        }
    }
    
    // ==========================================================================
    // STEP 6: ACTIVE SERVICE SESSION CHECK
    // ==========================================================================
    const session = getActiveSession(userId);
    
    if (session) {
        console.log(`📱 [SESSION] Active ${session.service} session for ${userId} in state: ${session.state}`);
        
        // Quick Service Routing
        if (session.service === SERVICE_TYPES.QUICK_AIRTIME || session.service === SERVICE_TYPES.QUICK_ZESA) {
            const result = await quickServiceHandler.handleResponse(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Quick service session continues`);
            } else {
                deleteSession(userId);
                if (result?.returnToMain) setPendingWelcome(userId, 2000);
            }
            
            if (result?.message) {
                const finalMessage = maybeAddJoke(result.message, userId, userInteractionCount);
                await messaging.sendMessage(userId, finalMessage);
            }
            return;
        }
        
        // Nyaradzo Routing
        if (session.service === SERVICE_TYPES.NYARADZO) {
            const result = await nyaradzoService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Nyaradzo session continues`);
            } else {
                deleteSession(userId);
                if (result?.returnToMain) setPendingWelcome(userId, 2000);
            }
            
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        
        // Airtime Routing
        if (session.service === SERVICE_TYPES.AIRTIME) {
            if (session.state === FLOW_STATES.FLOW.AIRTIME) {
                const result = await airtimeService.launchFlow(userId, session);
                if (result?.flow) await messaging.sendFlowMessage(userId, result.flow);
                return;
            }
            
            const result = await airtimeService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Airtime session continues`);
            } else {
                deleteSession(userId);
                if (result?.returnToMain) setPendingWelcome(userId, 2000);
            }
            
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        
        // ZESA Routing
        if (session.service === SERVICE_TYPES.ZESA) {
            const result = await zesaService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] ZESA session continues`);
            } else {
                deleteSession(userId);
                if (result?.returnToMain) setPendingWelcome(userId, 2000);
            }
            
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        
        // Bill Payment Routing
        if (session.service === SERVICE_TYPES.BILL_PAYMENT) {
            if (session.data && session.data.biller === 'nyaradzo') {
                const result = await nyaradzoService.handleRequest(userId, messageText, session);
                
                if (result?.session) {
                    console.log(`📱 [SESSION] Nyaradzo session continues`);
                } else {
                    deleteSession(userId);
                    if (result?.returnToMain) setPendingWelcome(userId, 2000);
                }
                
                if (result?.message) await messaging.sendMessage(userId, result.message);
                return;
            }
            
            const result = await billsService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Bills session continues`);
            } else {
                deleteSession(userId);
                if (result?.returnToMain) setPendingWelcome(userId, 2000);
            }
            
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        
        // Emergency Routing
        if (session.service === SERVICE_TYPES.EMERGENCY) {
            if (messageText === 'back_to_services' || messageText === 'back_to_province') {
                const result = await emergencyService.handleRequest(userId, messageText, session);
                if (result?.session) console.log(`📱 [SESSION] Emergency session continues`);
                return;
            }
            
            const result = await emergencyService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Emergency session continues`);
            } else {
                if (!messageText.startsWith('back_to')) deleteSession(userId);
                if (result?.returnToMain) setPendingWelcome(userId, 2000);
            }
            
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        
        // Help Routing
        if (session.service === SERVICE_TYPES.HELP) {
            const result = await helpService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Help session continues`);
            } else {
                deleteSession(userId);
                if (result?.returnToMain) setPendingWelcome(userId, 2000);
            }
            
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        
        // Hot Updates Routing
        if (session.service === SERVICE_TYPES.HOT_UPDATES) {
            const result = await hotUpdatesService.handleRequest(userId, messageText, session);
            
            if (result?.session) {
                console.log(`📱 [SESSION] Hot Updates session continues`);
            } else {
                deleteSession(userId);
                if (result?.returnToMain) setPendingWelcome(userId, 2000);
            }
            
            if (result?.message) {
                await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        // Marketplace Routing
        if (session.service === SERVICE_TYPES.MARKETPLACE || 
            session.service === SERVICE_TYPES.CAR_LISTINGS || 
            session.service === SERVICE_TYPES.JOB_LISTINGS) {
            
            // Check if it's a number (listing selection)
            const listingNumber = parseInt(messageText);
            if (!isNaN(listingNumber)) {
                if (session.state === FLOW_STATES.MARKETPLACE.CAR_LISTINGS_BROWSE) {
                    const result = await marketplaceHandler.viewCarListing(userId, messageText, session);
                    if (result?.message) await messaging.sendMessage(userId, result.message);
                    return;
                }
                if (session.state === FLOW_STATES.MARKETPLACE.JOB_LISTINGS_BROWSE) {
                    const result = await marketplaceHandler.viewJobListing(userId, messageText, session);
                    if (result?.message) await messaging.sendMessage(userId, result.message);
                    return;
                }
            }
            
            // Regular marketplace flow for main menu
            if (session.state === FLOW_STATES.MARKETPLACE.MAIN) {
                const result = await marketplaceHandler.handleMarketplaceSelection(userId, messageText, session);
                if (result?.message) await messaging.sendMessage(userId, result.message);
                return;
            }
            
            // Default fallback
            const result = await marketplaceHandler.handleMarketplaceMain(userId, session);
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        
        // Unknown Service
        console.error(`❌ [ERROR] Unknown service: ${session.service}`);
        deleteSession(userId);
        await sendInteractiveMainMenu(userId);
        return;
    }
    
    // ==========================================================================
    // STEP 7: SUBMENU SESSION CHECK
    // ==========================================================================
    const submenuSession = getSubmenuSession(userId);
    
    if (submenuSession) {
        console.log(`📱 [SUBMENU] User has submenu session: ${submenuSession.menu}`);
        
        const result = await handleSubmenuSelection(userId, submenuSession.menu, messageText.trim());
        
        if (result.service) {
            console.log(`📱 [SUBMENU] User selected service: ${result.service} from menu: ${submenuSession.menu}`);
            deleteSubmenuSession(userId);
            clearPendingWelcome(userId);

            // ========== HANDLE PAYMENTS SUBMENU SERVICES ==========
            if (result.service === SERVICE_TYPES.AIRTIME) {
                console.log(`📱 [SUBMENU] Starting AIRTIME flow for ${userId}`);
                // Remove this line - it's creating a duplicate session
                // const airtimeSession = createSession(userId, SERVICE_TYPES.AIRTIME);
                // airtimeSession.state = FLOW_STATES.AIRTIME.START;
                
                // Just call startFlow - it will create the session internally
                const airtimeResult = await airtimeService.startFlow(userId);
                if (airtimeResult?.message) await messaging.sendMessage(userId, airtimeResult.message);
                return;
            }

            if (result.service === SERVICE_TYPES.ZESA) {
                console.log(`📱 [SUBMENU] Starting ZESA flow for ${userId}`);
                // Remove these lines - duplicate session creation
                // const zesaSession = createSession(userId, SERVICE_TYPES.ZESA);
                // zesaSession.state = FLOW_STATES.ZESA.SELECT_CURRENCY;
                
                const zesaResult = await zesaService.startFlow(userId);
                if (zesaResult?.message) await messaging.sendMessage(userId, zesaResult.message);
                return;
            }
        
            
            // Bills Submenu Services
            if (result.service === SERVICE_TYPES.NYARADZO) {
                const nyaradzoResult = await nyaradzoService.startFlow(userId);
                if (nyaradzoResult?.message) await messaging.sendMessage(userId, nyaradzoResult.message);
                return;
            }

            // In the submenu session section (STEP 7), add these:

            // ========== HANDLE QUICK SERVICES FROM QUICK SUBMENU ==========
            if (result.service === SERVICE_TYPES.QUICK_AIRTIME) {
                console.log(`📱 [SUBMENU] Starting QUICK AIRTIME flow for ${userId}`);
                // Use startQuickFlow instead of handleResponse
                const quickResult = await quickServiceHandler.startQuickFlow(userId, 'airtime');
                if (quickResult?.message) await messaging.sendMessage(userId, quickResult.message);
                return;
            }

            if (result.service === SERVICE_TYPES.QUICK_ZESA) {
                console.log(`📱 [SUBMENU] Starting QUICK ZESA flow for ${userId}`);
                // Use startQuickFlow instead of handleResponse
                const quickResult = await quickServiceHandler.startQuickFlow(userId, 'zesa');
                if (quickResult?.message) await messaging.sendMessage(userId, quickResult.message);
                return;
            }
            
            // Hot Updates Submenu Services
            if (submenuSession.menu === 'HOT_UPDATES') {
                let hotUpdatesSession = getActiveSession(userId);
                
                if (!hotUpdatesSession) {
                    hotUpdatesSession = createSession(userId, SERVICE_TYPES.HOT_UPDATES);
                    hotUpdatesSession.state = FLOW_STATES.HOT_UPDATES.START;
                }
                
                hotUpdatesSession.data = {
                    ...hotUpdatesSession.data,
                    selectedService: result.option?.key,
                    serviceName: result.option?.name,
                    serviceEmoji: result.option?.emoji
                };
                
                if (result.option?.key === 'epl') {
                    const { sendEplMenu } = require('./subMenuHandler');
                    await sendEplMenu(userId);
                } else if (result.option?.key === 'news') {
                    const newsResult = await newsService.getNewsUpdates(userId, false, null, 1);
                    await messaging.sendButtonMessage(
                        userId,
                        newsResult,
                        [
                            { id: "more", title: "➡️ More News" },
                            { id: "hu_back", title: "🔙 Hot Updates" },
                            { id: "hi", title: "🏠 Main Menu" }
                        ]
                    );
                } else if (result.option?.key === 'weather') {
                    await messaging.sendMessage(userId, UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT);
                    if (hotUpdatesSession) {
                        hotUpdatesSession.state = FLOW_STATES.HOT_UPDATES.SELECT_WEATHER_LOCATION;
                    }
                } else if (result.option?.key === 'zera') {
                    const zeraResult = await hotUpdatesService.handleZeraRequest(userId, hotUpdatesSession);
                    if (zeraResult?.message) await messaging.sendMessage(userId, zeraResult.message);
                }
                return;
            }
            
            // Marketplace Submenu Services
            if (submenuSession.menu === 'MARKETPLACE') {
                if (result.service === SERVICE_TYPES.CAR_LISTINGS) {
                    console.log(`🏪 [SUBMENU] User selected Car Listings`);
                    
                    // DELETE existing session first
                    deleteSession(userId);
                    
                    const marketplaceSession = createSession(userId, SERVICE_TYPES.MARKETPLACE);
                    marketplaceSession.state = FLOW_STATES.MARKETPLACE.CAR_LISTINGS_BROWSE;
                    marketplaceSession.data = {
                        current_page: 1,
                        total_pages: 0,
                        listings: []
                    };
                    const listingsResult = await marketplaceHandler.handleCarListings(userId, marketplaceSession, 1);
                    if (listingsResult?.message) {
                        await messaging.sendMessage(userId, listingsResult.message);
                    }
                } 
                else if (result.service === 'job_listings') {
                    console.log(`🏪 [SUBMENU] User selected Job Listings`);
                    
                    // DELETE existing session first
                    deleteSession(userId);
                    
                    const marketplaceSession = createSession(userId, SERVICE_TYPES.MARKETPLACE);
                    marketplaceSession.state = FLOW_STATES.MARKETPLACE.JOB_LISTINGS_BROWSE;
                    marketplaceSession.data = {
                        current_page: 1,
                        total_pages: 0,
                        jobs: []
                    };
                    const jobsResult = await marketplaceHandler.handleJobListings(userId, marketplaceSession, 1);
                    if (jobsResult?.message) {
                        await messaging.sendMessage(userId, jobsResult.message);
                    }
                }
                return;
            }
        }
        
        if (result.message) {
            await messaging.sendMessage(userId, result.message);
        }
        return;
    }
    
    // ==========================================================================
    // STEP 8: NO SESSIONS - MAIN MENU
    // ==========================================================================
    console.log(`📱 [MAIN] No sessions for ${userId}, processing as main menu input`);
    
    clearPendingWelcome(userId);
    
    const mainMenuResult = await handleMainMenu(userId, messageText.trim());
    
    if (mainMenuResult?.service) {
        console.log(`📱 [MAIN] User selected: ${mainMenuResult.service}`);
        clearPendingWelcome(userId);
        
        if (mainMenuResult.service === SERVICE_TYPES.QUICK_AIRTIME || 
            mainMenuResult.service === SERVICE_TYPES.QUICK_ZESA) {
            const quickSession = createSession(userId, mainMenuResult.service);
            const result = await quickServiceHandler.handleResponse(userId, messageText, quickSession);
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        
        if (mainMenuResult.service === SERVICE_TYPES.AIRTIME) {
            return;
        }
        
        if (mainMenuResult.service === SERVICE_TYPES.ZESA) {
            return;
        }
        
        if (mainMenuResult.service === SERVICE_TYPES.EMERGENCY) {
            const existingSession = getActiveSession(userId);
            if (!existingSession) {
                const emergencySession = createSession(userId, SERVICE_TYPES.EMERGENCY);
                const result = await emergencyService.handleRequest(userId, messageText, emergencySession);
                if (result?.message) await messaging.sendMessage(userId, result.message);
            }
            return;
        }
        
        if (mainMenuResult.service === SERVICE_TYPES.HELP) {
            const helpSession = createSession(userId, SERVICE_TYPES.HELP);
            const result = await helpService.handleRequest(userId, messageText, helpSession);
            if (result?.message) await messaging.sendMessage(userId, result.message);
            return;
        }
        
        if (mainMenuResult.service === SERVICE_TYPES.HOT_UPDATES) {
            const hotUpdatesSession = createSession(userId, SERVICE_TYPES.HOT_UPDATES);
            hotUpdatesSession.state = FLOW_STATES.HOT_UPDATES.START;
            const result = await hotUpdatesService.startFlow(userId);
            return;
        }
        
        if (mainMenuResult.service === SERVICE_TYPES.MARKETPLACE || 
            mainMenuResult.service === SERVICE_TYPES.CAR_LISTINGS) {
            return;
        }
    }
    
    if (mainMenuResult?.message) {
        const finalMessage = maybeAddJoke(mainMenuResult.message, userId, userInteractionCount);
        await messaging.sendMessage(userId, finalMessage);
    }
}

// ============================================================================
// CLEANUP FUNCTION
// ============================================================================

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
    cleanupAllPendingTimers,
    sendCategorySubmenu
};