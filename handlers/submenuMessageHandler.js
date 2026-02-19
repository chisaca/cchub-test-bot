// handlers/submenuMessageHandler.js
/**
 * Submenu Message Handler
 * Handles message formatting and sending for submenus
 * Works with submenuSessionHandler to manage nested menu flows
 */

const messaging = require('../utils/messaging');
const { getSubmenuSession, deleteSubmenuSession, updateSubmenuSession, SUBMENUS } = require('./submenuSessionHandler');
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
    
    // Add breadcrumb if path exists
    if (options.path && options.path.length > 0) {
        const breadcrumb = `📍 ${options.path.join(' → ')}\n\n`;
        message = breadcrumb + message;
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
    
    // Handle request to see menu again
    if (selection.toLowerCase() === 'menu' || selection.toLowerCase() === 'back') {
        console.log(`📋 [SUBMENU-MSG] User ${userId} requesting menu again`);
        
        // Resend the menu
        await sendSubmenu(userId, submenuSession.menu, {
            path: submenuSession.path
        });
        
        return {
            message: null,
            session: null,
            submenuSession: submenuSession // Keep same session
        };
    }
    
    // Validate selection is a number
    if (!/^\d+$/.test(selection)) {
        // Invalid format - show error and resend menu
        const errorMsg = `❌ *Invalid Input*\n\nPlease enter a number (1-${Object.keys(menu.options).length}) or 0 to exit.\n\n`;
        const menuPrompt = menu.prompt;
        
        await messaging.sendMessage(userId, errorMsg + menuPrompt);
        
        return {
            message: null,
            session: null,
            submenuSession: submenuSession // Keep same session
        };
    }
    
    // Validate selection is within range
    const option = menu.options[selection];
    if (!option) {
        // Track invalid attempts
        submenuSession.attempts = (submenuSession.attempts || 0) + 1;
        updateSubmenuSession(userId, { attempts: submenuSession.attempts });
        
        // Check for too many attempts
        if (submenuSession.attempts >= 3) {
            console.log(`📋 [SUBMENU-MSG] User ${userId} exceeded max attempts`);
            
            // Clean up and return to main menu
            deleteSubmenuSession(userId);
            deleteSession(userId);
            
            const { sendWelcomeMessage } = require('./mainMenuHandler');
            await sendWelcomeMessage(userId);
            
            return {
                message: null,
                session: null,
                submenuSession: null
            };
        }
        
        // Show error with valid options
        const validOptions = Object.keys(menu.options)
            .map(key => {
                const opt = menu.options[key];
                return `${key} for ${opt.emoji} ${opt.name}`;
            })
            .join('\n');
        
        const errorMsg = `❌ *Invalid Option*\n\n"${selection}" is not valid.\n\nPlease choose:\n${validOptions}\n\nOr *0* to exit.\n`;
        
        await messaging.sendMessage(userId, errorMsg);
        
        return {
            message: null,
            session: null,
            submenuSession: submenuSession // Keep same session
        };
    }
    
    // Valid selection - reset attempts
    submenuSession.attempts = 0;
    
    // Update navigation path
    if (!submenuSession.path) {
        submenuSession.path = [menu.name];
    }
    submenuSession.path.push(option.name);
    
    // Update session with selection
    updateSubmenuSession(userId, {
        attempts: 0,
        selectedOption: option.key,
        path: submenuSession.path,
        data: {
            ...submenuSession.data,
            selectedBiller: option.key,
            billerName: option.name,
            billerEmoji: option.emoji
        }
    });
    
    console.log(`📋 [SUBMENU-MSG] User ${userId} selected: ${option.name} (${option.key})`);
    
    // Send loading message
    const loadingMsg = option.loadingMessage || `⏳ Loading ${option.emoji} ${option.name} service...`;
    await messaging.sendMessage(userId, loadingMsg);
    
    // Clear submenu session before launching service
    deleteSubmenuSession(userId);
    
    try {
        // Dynamically load the service
        const service = require(`../services/${option.service}`);
        
        // Check if service exists and has handleMessage method
        if (!service || typeof service.handleMessage !== 'function') {
            throw new Error(`Service ${option.service} has no handleMessage method`);
        }
        
        // Create a new session for the service
        const { createSession } = require('./sessionHandlers');
        const serviceSession = createSession(userId, option.service);
        
        // Initialize service with data from submenu - GENERIC for all billers
        serviceSession.data = {
            ...serviceSession.data,
            fromSubmenu: true,
            selectedBiller: option.key,
            billerName: option.name,
            billerEmoji: option.emoji
        };
        
        // Add service-specific initialization if needed
        if (option.key.startsWith('telone_')) {
            serviceSession.data.accountNumber = null;
            serviceSession.data.productId = null;
            serviceSession.data.amount = null;
        } else if (option.key === 'nyaradzo') {
            serviceSession.data.policyNumber = null;
            serviceSession.data.amount = null;
        }
        
        // Get the initial message from the service - USE THE SELECTION (not 'START')
        // This is the key fix - pass the actual selection number
        console.log(`📋 [SUBMENU-MSG] Calling ${option.service}.handleMessage with selection: ${selection}`);
        const result = await service.handleMessage(userId, selection, serviceSession);
        
        console.log(`📋 [SUBMENU-MSG] Service started:`, {
            service: option.service,
            hasMessage: !!result?.message,
            hasSession: !!result?.session
        });
        
        return {
            message: result.message,
            session: result.session || serviceSession,
            submenuSession: null
        };
        
    } catch (error) {
        console.error(`❌ [SUBMENU-MSG] Failed to start service:`, error);
        
        // Send error and offer to restart
        await messaging.sendMessage(userId, 
            `❌ *Service Error*\n\nFailed to start ${option.name}.\nType *hi* to return to main menu.`
        );
        
        return {
            message: null,
            session: null,
            submenuSession: null
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
        if (opt.description) {
            message += `   └ ${opt.description}\n`;
        }
    });
    
    message += `\n────────────────\n`;
    
    if (showZeroOption) {
        message += `Type *0* to return to Main Menu\n`;
    }
    
    if (footer) {
        message += `\n${footer}`;
    }
    
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

/**
 * Show submenu options as text list
 * @param {Object} menu - Menu object
 * @returns {string} Formatted options list
 */
function getOptionsList(menu) {
    if (!menu || !menu.options) return '';
    
    return Object.entries(menu.options)
        .map(([key, opt]) => `${key}️⃣ ${opt.emoji} ${opt.name}`)
        .join('\n');
}

module.exports = {
    sendSubmenu,
    handleSubmenuResponse,
    formatSubmenuOption,
    buildSubmenuMessage,
    sendDynamicSubmenu,
    getBreadcrumb,
    getOptionsList
};
