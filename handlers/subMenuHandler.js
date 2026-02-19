// handlers/subMenuHandler.js
/**
 * SubMenu Handler
 * Manages nested menu structures (like Bills → Nyaradzo, Bills → TelOne)
 */

const { createSession, updateSessionStep, deleteSession } = require('./sessionHandlers');
const messaging = require('../utils/messaging');
const constants = require('../config/constants');

// Submenu definitions
const SUBMENUS = {
    BILLS: {
        name: 'Bills',
        options: {
            '1': {
                key: 'nyaradzo',
                name: 'Nyaradzo Funeral',
                emoji: '🌸',
                service: 'nyaradzo',
                loadingMessage: '⏳ Loading Nyaradzo payment service...'
            },
            '2': {
                key: 'telone_voice',
                name: 'TelOne Voice',
                emoji: '📞',
                service: 'telone_voice',
                loadingMessage: '⏳ Loading TelOne Voice service...'
            },
            '3': {
                key: 'telone_broadband',
                name: 'TelOne Broadband',
                emoji: '🌐',
                service: 'telone_broadband',
                loadingMessage: '⏳ Loading TelOne Broadband service...'
            },
            '4': {
                key: 'telone_lte',
                name: 'TelOne LTE',
                emoji: '📶',
                service: 'telone_lte',
                loadingMessage: '⏳ Loading TelOne LTE service...'
            },
            '5': {
                key: 'telone_voip',
                name: 'TelOne VoIP',
                emoji: '📱',
                service: 'telone_voip',
                loadingMessage: '⏳ Loading TelOne VoIP service...'
            },
            '6': {
                key: 'telone_usd',
                name: 'TelOne USD Bundle',
                emoji: '💵',
                service: 'telone_usd',
                loadingMessage: '⏳ Loading TelOne USD service...'
            }
        },
        message: `📄 *Bills Payment*\n\nSelect biller:\n\n1️⃣ 🌸 Nyaradzo Funeral\n2️⃣ 📞 TelOne Voice (ZiG)\n3️⃣ 🌐 TelOne Broadband (ZiG)\n4️⃣ 📶 TelOne LTE (ZiG)\n5️⃣ 📱 TelOne VoIP (ZiG)\n6️⃣ 💵 TelOne USD Bundle (USD)\n\n────────────────\nReply with *1-6*\nType *0* to return to Main Menu`,
        timeout: 5 * 60 * 1000
    }
};

/**
 * Handle submenu selection
 * @param {string} userId - User ID
 * @param {string} submenu - Submenu key (e.g., 'BILLS')
 * @param {string} selection - User's selection (e.g., '1')
 * @returns {Object} Result object for messageHandler
 */
async function handleSubmenuSelection(userId, submenu, selection) {
    console.log(`📋 [SUBMENU] User: ${userId}, Submenu: ${submenu}, Selection: ${selection}`);
    
    const menu = SUBMENUS[submenu];
    if (!menu) {
        return {
            message: constants.RESPONSE_MESSAGES.INVALID_SELECTION,
            session: null
        };
    }
    
    // Handle return to main menu
    if (selection === '0') {
        deleteSession(userId);
        const { sendWelcomeMessage } = require('./mainMenuHandler');
        await sendWelcomeMessage(userId);
        return {
            message: null,
            session: null
        };
    }
    
    // Get the selected option
    const option = menu.options[selection];
    if (!option) {
        // Show valid options in error message
        const validOptions = Object.keys(menu.options).map(key => {
            const opt = menu.options[key];
            return `${key} for ${opt.emoji} ${opt.name}`;
        }).join(', ');
        
        return {
            message: `❌ Invalid selection. Please choose:\n${validOptions}\n\nOr 0 to return to Main Menu`,
            session: null
        };
    }
    
    console.log(`📋 [SUBMENU] Redirecting to service: ${option.service}`);
    
    try {
        // Dynamically require the service
        const service = require(`../services/${option.service}`);
        
        // Check if service has startFlow method
        if (typeof service.startFlow === 'function') {
            // Start the service flow
            const result = await service.startFlow(userId);
            return result;
        } else {
            // Create a new session for the service
            const session = createSession(userId, option.service);
            
            // Send loading message
            await messaging.sendMessage(userId, `⏳ Loading ${option.emoji} ${option.name} service...`);
            
            return {
                session,
                message: null
            };
        }
    } catch (error) {
        console.error(`[SUBMENU] Error loading service ${option.service}:`, error);
        return {
            message: `❌ Sorry, the ${option.name} service is temporarily unavailable. Please try again later.`,
            session: null
        };
    }
}

/**
 * Send submenu to user
 * @param {string} userId - User ID
 * @param {string} submenu - Submenu key
 */
async function sendSubmenu(userId, submenu) {
    const menu = SUBMENUS[submenu];
    if (menu) {
        await messaging.sendMessage(userId, menu.message);
    } else {
        await messaging.sendMessage(userId, constants.RESPONSE_MESSAGES.INVALID_SELECTION);
    }
}

/**
 * Get submenu options as text
 * @param {string} submenu - Submenu key
 * @returns {string} Formatted options text
 */
function getSubmenuOptionsText(submenu) {
    const menu = SUBMENUS[submenu];
    if (!menu) return '';
    
    return Object.entries(menu.options)
        .map(([key, opt]) => `${key} for ${opt.emoji} ${opt.name}`)
        .join(', ');
}

/**
 * Check if submenu exists
 * @param {string} submenu - Submenu key
 * @returns {boolean}
 */
function submenuExists(submenu) {
    return !!SUBMENUS[submenu];
}

/**
 * Get submenu by key
 * @param {string} submenu - Submenu key
 * @returns {Object|null} Submenu object
 */
function getSubmenu(submenu) {
    return SUBMENUS[submenu] || null;
}

module.exports = {
    handleSubmenuSelection,
    sendSubmenu,
    getSubmenuOptionsText,
    submenuExists,
    getSubmenu,
    SUBMENUS
};
