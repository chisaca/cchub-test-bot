// handlers/submenuSessionHandler.js
/**
 * Submenu Session Handler
 * Manages sessions for nested menus (Bills → Nyaradzo, etc.)
 * Keeps submenu state separate from main service flows
 */

const { createSession, updateSession, getActiveSession, deleteSession } = require('./sessionHandlers');
const constants = require('../config/constants');

// Store submenu context separately from main sessions
const submenuContext = {};

// Submenu definitions
const SUBMENUS = {
    BILLS: {
        key: 'bills',
        name: 'Bills',
        options: {
            '1': {
                key: 'nyaradzo',
                name: 'Nyaradzo Funeral',
                emoji: '⚰️',
                service: 'nyaradzo',
                message: `⚰️ *Nyaradzo Funeral*\n\nPlease enter your 8-digit Nyaradzo policy number:\n\n────────────────\nExample: 12345678`
            }
        },
        prompt: `📄 *Bills Payment*\n\nSelect biller:\n\n1️⃣ Nyaradzo Funeral (⚰️)\n\n────────────────\nReply with *1*\nType *0* to return to Main Menu`
    }
};

/**
 * Create a submenu session
 * @param {string} userId - User ID
 * @param {string} menuKey - Menu key (e.g., 'BILLS')
 * @returns {Object} Submenu session
 */
function createSubmenuSession(userId, menuKey) {
    console.log(`📋 [SUBMENU] Creating submenu session for ${userId}, menu: ${menuKey}`);
    
    // Clear any existing submenu context
    delete submenuContext[userId];
    
    // Create new submenu context
    submenuContext[userId] = {
        menu: menuKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000), // 5 minute expiry
        data: {}
    };
    
    return submenuContext[userId];
}

/**
 * Get active submenu session
 * @param {string} userId - User ID
 * @returns {Object|null} Submenu session or null
 */
function getSubmenuSession(userId) {
    const context = submenuContext[userId];
    
    if (!context) {
        return null;
    }
    
    // Check expiry
    if (context.expiresAt < Date.now()) {
        console.log(`📋 [SUBMENU] Submenu session expired for ${userId}`);
        delete submenuContext[userId];
        return null;
    }
    
    return context;
}

/**
 * Update submenu session
 * @param {string} userId - User ID
 * @param {Object} updates - Updates to apply
 * @returns {Object|null} Updated session
 */
function updateSubmenuSession(userId, updates) {
    if (!submenuContext[userId]) {
        return null;
    }
    
    submenuContext[userId] = {
        ...submenuContext[userId],
        ...updates,
        expiresAt: Date.now() + (5 * 60 * 1000) // Refresh expiry
    };
    
    return submenuContext[userId];
}

/**
 * Delete submenu session
 * @param {string} userId - User ID
 */
function deleteSubmenuSession(userId) {
    if (submenuContext[userId]) {
        console.log(`📋 [SUBMENU] Deleting submenu session for ${userId}`);
        delete submenuContext[userId];
    }
}

/**
 * Handle submenu selection
 * @param {string} userId - User ID
 * @param {string} menuKey - Menu key
 * @param {string} selection - User's selection
 * @returns {Object} Result object for messageHandler
 */
async function handleSubmenuSelection(userId, menuKey, selection) {
    console.log(`📋 [SUBMENU] User: ${userId}, Menu: ${menuKey}, Selection: ${selection}`);
    
    const menu = SUBMENUS[menuKey];
    if (!menu) {
        return {
            message: "❌ Invalid menu",
            session: null,
            submenuSession: null
        };
    }
    
    // Handle return to main menu
    if (selection === '0') {
        deleteSubmenuSession(userId);
        deleteSession(userId); // Clear any main session too
        
        const { sendWelcomeMessage } = require('./mainMenuHandler');
        await sendWelcomeMessage(userId);
        
        return {
            message: null,
            session: null,
            submenuSession: null
        };
    }
    
    // Get the selected option
    const option = menu.options[selection];
    if (!option) {
        // Invalid selection, resend prompt
        return {
            message: `❌ Invalid selection. Please choose:\n\n${menu.prompt}`,
            session: null,
            submenuSession: getSubmenuSession(userId)
        };
    }
    
    console.log(`📋 [SUBMENU] Selected: ${option.name}, launching service: ${option.service}`);
    
    // Clear submenu session before launching service
    deleteSubmenuSession(userId);
    
    // Dynamically load and start the service
    try {
        const service = require(`../services/${option.service}`);
        
        if (typeof service.startFlow !== 'function') {
            throw new Error(`Service ${option.service} has no startFlow method`);
        }
        
        // Start the service flow - this will create its own session
        const result = await service.startFlow(userId);
        
        console.log(`📋 [SUBMENU] Service started:`, {
            hasMessage: !!result?.message,
            hasSession: !!result?.session
        });
        
        return result;
        
    } catch (error) {
        console.error(`❌ [SUBMENU] Failed to start service:`, error);
        return {
            message: `❌ Failed to start ${option.name} service. Please try again.`,
            session: null,
            submenuSession: null
        };
    }
}

/**
 * Get submenu prompt
 * @param {string} menuKey - Menu key
 * @returns {string|null} Menu prompt or null
 */
function getSubmenuPrompt(menuKey) {
    return SUBMENUS[menuKey]?.prompt || null;
}

/**
 * Clean up expired submenu sessions
 */
function cleanupExpiredSubmenuSessions() {
    const now = Date.now();
    let count = 0;
    
    Object.keys(submenuContext).forEach(userId => {
        if (submenuContext[userId].expiresAt < now) {
            delete submenuContext[userId];
            count++;
        }
    });
    
    if (count > 0) {
        console.log(`🧹 Cleaned up ${count} expired submenu sessions`);
    }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSubmenuSessions, 5 * 60 * 1000);

module.exports = {
    createSubmenuSession,
    getSubmenuSession,
    updateSubmenuSession,
    deleteSubmenuSession,
    handleSubmenuSelection,
    getSubmenuPrompt,
    SUBMENUS
};
