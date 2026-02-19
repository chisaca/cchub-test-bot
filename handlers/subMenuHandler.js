// handlers/subMenuHandler.js
/**
 * SubMenu Handler
 * Manages nested menu structures (like Bills → Nyaradzo)
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
                emoji: '⚰️',
                service: 'nyaradzo',  // Direct service to route to
                handler: null // Will be set dynamically
            },
            // Future billers can be added here
        },
        message: `📄 *Bills Payment*\n\nSelect biller:\n\n1️⃣ Nyaradzo Funeral (⚰️)\n\n────────────────\nReply with *1*\nType *0* to return to Main Menu`
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
        return {
            message: `❌ Invalid selection. Please choose:\n\n${menu.message}`,
            session: null
        };
    }
    
    console.log(`📋 [SUBMENU] Redirecting to service: ${option.service}`);
    
    // Dynamically require the service
    const service = require(`../services/${option.service}`);
    
    // Start the service flow
    const result = await service.startFlow(userId);
    
    return result;
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
    }
}

module.exports = {
    handleSubmenuSelection,
    sendSubmenu,
    SUBMENUS
};
