// handlers/submenuMessageHandler.js
/**
 * Submenu Message Handler
 * Handles message formatting and sending for submenus
 * Works with submenuSessionHandler to manage nested menu flows
 */

const messaging = require('../utils/messaging');
const { getSubmenuSession, deleteSubmenuSession, SUBMENUS } = require('./submenuSessionHandler');
const { deleteSession } = require('./sessionHandlers');

/**
 * Send a submenu to user
 * @param {string} userId - User ID
 * @param {string} menuKey - Menu key (e.g., 'BILLS')
 * @param {Object} options - Additional options
 * @returns {Promise<boolean>} Success status
 */
async function sendSubmenu(userId, menuKey, options = {}) {
    console.log(`📋 [SUBMENU-MSG] Sending ${menuKey} menu to ${userId}`);
    
    const menu = SUBMENUS[menuKey];
    if (!menu) {
        console.error(`❌ [SUBMENU-MSG] Invalid menu key: ${menuKey}`);
        return false;
    }
    
    let message = menu.prompt;
    
    // Add header if provided
    if (options.header) {
        message = `${options.header}\n\n${message}`;
    }
    
    // Add footer if provided
    if (options.footer) {
        message = `${message}\n\n${options.footer}`;
    }
    
    return await messaging.sendMessage(userId, message);
}

/**
 * Handle submenu response
 * @param {string} userId - User ID
 * @param {string} message - User's message
 * @param {Object} submenuSession - Current submenu session
 * @returns {Object} Result object for messageHandler
 */
async function handleSubmenuResponse(userId, message, submenuSession) {
    console.log(`📋 [SUBMENU-MSG] Handling response for ${userId}: "${message}"`);
    
    const menu = SUBMENUS[submenuSession.menu];
    if (!menu) {
        return {
            message: "❌ Invalid menu configuration",
            session: null,
            submenuSession: null
        };
    }
    
    const selection = message.trim();
    
    // Handle return to main menu
    if (selection === '0') {
        console.log(`📋 [SUBMENU-MSG] User ${userId} returning to main menu`);
        
        // Clean up all sessions
        deleteSubmenuSession(userId);
        deleteSession(userId);
        
        // Send welcome message
        const { sendWelcomeMessage } = require('./mainMenuHandler');
        await sendWelcomeMessage(userId);
        
        return {
            message: null,
            session: null,
            submenuSession: null
        };
    }
    
    // Validate selection
    const option = menu.options[selection];
    if (!option) {
        // Invalid selection - show error and resend menu
        const errorMsg = `❌ *Invalid Option*\n\n"${selection}" is not a valid choice.\n\n`;
        const menuPrompt = menu.prompt;
        
        await messaging.sendMessage(userId, errorMsg + menuPrompt);
        
        return {
            message: null,
            session: null,
            submenuSession: submenuSession // Keep same session
        };
    }
    
    // Valid selection - launch service
    console.log(`📋 [SUBMENU-MSG] User ${userId} selected: ${option.name}`);
    
    // Clear submenu session before launching service
    deleteSubmenuSession(userId);
    
    try {
        // Dynamically load the service
        const service = require(`../services/${option.service}`);
        
        if (typeof service.startFlow !== 'function') {
            throw new Error(`Service ${option.service} has no startFlow method`);
        }
        
        // Send a quick "loading" message if needed
        if (option.loadingMessage) {
            await messaging.sendMessage(userId, option.loadingMessage);
        } else {
            await messaging.sendMessage(userId, `⏳ Loading ${option.name} service...`);
        }
        
        // Start the service flow
        const result = await service.startFlow(userId);
        
        console.log(`📋 [SUBMENU-MSG] Service started:`, {
            service: option.service,
            hasMessage: !!result?.message,
            hasSession: !!result?.session
        });
        
        return result;
        
    } catch (error) {
        console.error(`❌ [SUBMENU-MSG] Failed to start service:`, error);
        
        // Send error and resend menu
        await messaging.sendMessage(userId, 
            `❌ *Service Error*\n\nFailed to start ${option.name}. Please try again.\n\n` + menu.prompt
        );
        
        return {
            message: null,
            session: null,
            submenuSession: submenuSession // Keep session for retry
        };
    }
}

/**
 * Format a submenu option for display
 * @param {string} key - Option key
 * @param {Object} option - Option configuration
 * @returns {string} Formatted option
 */
function formatSubmenuOption(key, option) {
    const emoji = option.emoji || '•';
    return `${key}️⃣ ${emoji} ${option.name}`;
}

/**
 * Build a custom submenu message
 * @param {string} title - Menu title
 * @param {Array} options - Array of option objects
 * @param {Object} config - Configuration
 * @returns {string} Formatted menu message
 */
function buildSubmenuMessage(title, options, config = {}) {
    const { showZeroOption = true, footer = '' } = config;
    
    let message = `📄 *${title}*\n\n`;
    
    // Add options
    options.forEach(opt => {
        message += `${opt.key}️⃣ ${opt.emoji || '•'} ${opt.name}\n`;
    });
    
    message += `\n────────────────\n`;
    
    if (showZeroOption) {
        message += `Type *0* to return to Main Menu\n`;
    }
    
    if (footer) {
        message += `\n${footer}`;
    }
    
    message += `\nReply with the number of your choice.`;
    
    return message;
}

/**
 * Send a dynamic submenu (not from predefined SUBMENUS)
 * @param {string} userId - User ID
 * @param {string} title - Menu title
 * @param {Array} options - Array of option objects
 * @param {Object} config - Configuration
 */
async function sendDynamicSubmenu(userId, title, options, config = {}) {
    const message = buildSubmenuMessage(title, options, config);
    await messaging.sendMessage(userId, message);
}

/**
 * Handle navigation breadcrumb
 * @param {string} userId - User ID
 * @param {Array} path - Navigation path
 * @returns {string} Formatted breadcrumb
 */
function getBreadcrumb(path) {
    if (!path || path.length === 0) return '';
    return `📍 ${path.join(' → ')}\n\n`;
}

module.exports = {
    sendSubmenu,
    handleSubmenuResponse,
    formatSubmenuOption,
    buildSubmenuMessage,
    sendDynamicSubmenu,
    getBreadcrumb
};
