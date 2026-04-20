// handlers/subMenuHandler.js - UPDATED with Interactive Buttons
// ============================================================================
// SUBMENU HANDLER
// Pure menu definitions and selection mapping ONLY
// NO service logic - returns service names for messageHandler to route
// Follows separation of concerns: menus define options, handlers route logic
// NOW WITH: Interactive buttons for Hot Updates menu
// ============================================================================

// ============================================================================
// SUBMENU DEFINITIONS
// Each submenu contains options that map to service names
// Format: options[selection] = { key, name, emoji, service }
// ============================================================================
// ============================================================================
// SUBMENU DEFINITIONS - FROM CONSTANTS.JS (SINGLE SOURCE OF TRUTH)
// ============================================================================

const { INTERACTIVE_UI_CONFIG, SERVICE_TYPES } = require('../config/constants');

// Convert INTERACTIVE_UI_CONFIG submenus to the format expected by subMenuHandler
const SUBMENUS = {
    // Convert PAYMENTS_SUBMENU
    PAYMENTS: {
        name: "💰 PAYMENTS",
        options: {},
        message: `💰 *PAYMENTS*

Select service:

1 📱 Airtime - All networks
2 ⚡ ZESA - Prepaid electricity
3 📄 Bills - Nyaradzo

────────────────
Reply with *1-3*
Type *hi* to return to Main Menu`
    },
    
    // Convert INFORMATION_SUBMENU
    INFORMATION: {
        name: "ℹ️ INFORMATION",
        options: {},
        message: `ℹ️ *INFORMATION*

Select service:

1 🔥 Hot Updates - EPL, News, Weather, ZERA
2 🚨 Emergency - Police, hospitals, fire

────────────────
Reply with *1-2*
Type *hi* to return to Main Menu`
    },
    
    // Convert QUICK_SUBMENU
    QUICK: {
        name: "⚡ QUICK ACTIONS",
        options: {},
        message: `⚡ *QUICK ACTIONS*

Select action:

1 🔁 Quick Airtime - Repeat last purchase
2 🔁 Quick ZESA - Same meter & amount

────────────────
Reply with *1-2*
Type *hi* to return to Main Menu`
    },
    
    // Convert SUPPORT_SUBMENU
    SUPPORT: {
        name: "❓ SUPPORT",
        options: {},
        message: `❓ *SUPPORT*

Select option:

1 📚 Help - FAQs & guides
2 📞 Contact - Human support

────────────────
Reply with *1-2*
Type *hi* to return to Main Menu`
    },
    
    // Keep BILLS for backward compatibility
    BILLS: {
        name: 'Bills',
        options: {
            '1': {
                key: 'nyaradzo',
                name: 'Nyaradzo Funeral',
                emoji: '🌸',
                service: 'nyaradzo'
            }
        },
        message: `📄 *Bills Payment*

Select biller:

1 *🌸 Nyaradzo Funeral*

────────────────
Reply with *1*
Type *hi* to return to Main Menu`
    },
    
};

// ============================================================================
// SUBMENU SELECTION HANDLER
// Processes user selection from a submenu
// Returns ONLY service name - NO business logic
// NOW WITH: Support for interactive button IDs
// ============================================================================

async function handleSubmenuSelection(userId, menuType, selection) {
    console.log(`📋 [SUBMENU] Handling ${menuType} selection: "${selection}" for ${userId}`);
    
    // Handle back to main menu
    if (selection === 'hi' || selection === 'main_menu') {
        deleteSubmenuSession(userId);
        return {
            service: null,
            message: null,
            returnToMain: true
        };
    }
    
    // ========== PAYMENTS SUBMENU ==========
    if (menuType === 'PAYMENTS') {
        if (selection === '1' || selection === 'airtime') {
            return {
                service: SERVICE_TYPES.AIRTIME,
                option: SUBMENUS.PAYMENTS.options['1']
            };
        }
        if (selection === '2' || selection === 'zesa') {
            return {
                service: SERVICE_TYPES.ZESA,
                option: SUBMENUS.PAYMENTS.options['2']
            };
        }
        if (selection === '3' || selection === 'bills') {
            return {
                service: SERVICE_TYPES.NYARADZO,
                option: SUBMENUS.PAYMENTS.options['3']
            };
        }
        return {
            service: null,
            message: await getSubmenuMessage('PAYMENTS')
        };
    }
    
    // ========== INFORMATION SUBMENU ==========
    if (menuType === 'INFORMATION') {
        if (selection === '1' || selection === 'hot_updates') {
            return {
                service: SERVICE_TYPES.HOT_UPDATES,
                option: SUBMENUS.INFORMATION.options['1']
            };
        }
        if (selection === '2' || selection === 'emergency') {
            return {
                service: SERVICE_TYPES.EMERGENCY,
                option: SUBMENUS.INFORMATION.options['2']
            };
        }
        return {
            service: null,
            message: await getSubmenuMessage('INFORMATION')
        };
    }
    
    // ========== QUICK SUBMENU ==========
    if (menuType === 'QUICK') {
        if (selection === '1' || selection === 'quick_airtime') {
            return {
                service: SERVICE_TYPES.QUICK_AIRTIME,
                option: SUBMENUS.QUICK.options['1']
            };
        }
        if (selection === '2' || selection === 'quick_zesa') {
            return {
                service: SERVICE_TYPES.QUICK_ZESA,
                option: SUBMENUS.QUICK.options['2']
            };
        }
        return {
            service: null,
            message: await getSubmenuMessage('QUICK')
        };
    }
    
    // ========== SUPPORT SUBMENU ==========
    if (menuType === 'SUPPORT') {
        if (selection === '1' || selection === 'help') {
            return {
                service: SERVICE_TYPES.HELP,
                option: SUBMENUS.SUPPORT.options['1']
            };
        }
        if (selection === '2' || selection === 'contact') {
            return {
                service: SERVICE_TYPES.CONTACT,
                option: SUBMENUS.SUPPORT.options['2']
            };
        }
        return {
            service: null,
            message: await getSubmenuMessage('SUPPORT')
        };
    }
    
    // ========== BILLS SUBMENU ==========
    if (menuType === 'BILLS') {
        if (selection === '1' || selection === 'nyaradzo') {
            return {
                service: SERVICE_TYPES.NYARADZO,
                option: SUBMENUS.BILLS.options['1']
            };
        }
        return {
            service: null,
            message: await getSubmenuMessage('BILLS')
        };
    }
    
    // ========== HOT_UPDATES SUBMENU ==========
    if (menuType === 'HOT_UPDATES') {
        for (const [key, option] of Object.entries(SUBMENUS.HOT_UPDATES.options)) {
            if (selection === key || selection === option.key || selection === option.buttonId) {
                return {
                    service: SERVICE_TYPES.HOT_UPDATES,
                    option: option
                };
            }
        }
        if (selection === 'hu_back' || selection === 'back') {
            deleteSubmenuSession(userId);
            return {
                service: null,
                message: null,
                returnToMain: true
            };
        }
        return {
            service: null,
            message: await getSubmenuMessage('HOT_UPDATES')
        };
    }
    
    return {
        service: null,
        message: 'Invalid selection'
    };
}

// ============================================================================
// SEND SUBMENU TO USER - UPDATED with Interactive Buttons
// Displays the submenu message to the user using interactive buttons
// ============================================================================

/**
 * Send a submenu message to the user
 * NOW WITH: List messages for modern UI (same as main menu)
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} submenu - Submenu identifier to send
 * @returns {Promise<void>}
 */
async function sendSubmenu(userId, submenu) {
    const menu = SUBMENUS[submenu];
    if (!menu) {
        console.error(`❌ [SUBMENU] Attempted to send invalid submenu: ${submenu}`);
        return;
    }
    
    const messaging = require('../utils/messaging');
    
    // ========================================================================
    // For all submenus, use List Messages (same as main menu)
    // ========================================================================
    
    // Create sections for the list message
    const sections = [];
    const optionsList = [];
    
    // Convert options to list rows
    Object.entries(menu.options).forEach(([key, option]) => {
        optionsList.push({
            id: option.buttonId || `${submenu.toLowerCase()}_${option.key}`,
            title: `${option.emoji} ${option.name}`.substring(0, 24), // Max 24 chars for title
            description: option.description || `View ${option.name}` // Optional description
        });
    });
    
    // Add a "Back to Main Menu" option
    optionsList.push({
        id: "hi",
        title: "🏠 Main Menu",
        description: "Return to main menu"
    });
    
    sections.push({
        title: menu.name, // Section title CANNOT have markdown either
        rows: optionsList
    });
    
    // Send as interactive list message - REMOVED markdown from header
    await messaging.sendListMessage(
        userId,
        menu.name, // Plain text header - NO ASTERISKS
        `What would you like to view?`, // Body text - can have markdown
        "View Options",
        sections
    );
    
    console.log(`📤 [SUBMENU] Sent interactive list ${submenu} menu to ${userId}`);
}

/**
 * Get submenu message (fallback text)
 */
async function getSubmenuMessage(submenu) {
    const menu = SUBMENUS[submenu];
    return menu ? menu.message : null;
}

/**
 * Delete submenu session
 */
function deleteSubmenuSession(userId) {
    // Session cleanup logic
    const sessionManager = require('./sessionHandlers');
    if (sessionManager && sessionManager.clearSubmenuSession) {
        sessionManager.clearSubmenuSession(userId);
    }
}

// ============================================================================
// GET SUBMENU BY SERVICE TYPE
// Helper to find which submenu contains a given service
// ============================================================================

/**
 * Find submenu that contains a specific service
 * Useful for determining which submenu to send when multiple options exist
 * 
 * @param {string} serviceName - Service to look for (e.g., 'nyaradzo')
 * @returns {string|null} Submenu name or null if not found
 */
function getSubmenuForService(serviceName) {
    for (const [submenuName, submenu] of Object.entries(SUBMENUS)) {
        const hasService = Object.values(submenu.options).some(
            option => option.service === serviceName
        );
        if (hasService) {
            return submenuName;
        }
    }
    return null;
}

// ============================================================================
// GET BUTTON ID FOR OPTION
// Helper to get button ID for a specific option
// ============================================================================

/**
 * Get button ID for a specific option in a submenu
 * 
 * @param {string} submenu - Submenu name
 * @param {string} optionKey - Option key
 * @returns {string|null} Button ID or null
 */
function getButtonId(submenu, optionKey) {
    const menu = SUBMENUS[submenu];
    if (!menu) return null;
    
    const option = Object.values(menu.options).find(opt => opt.key === optionKey);
    return option?.buttonId || null;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    handleSubmenuSelection,
    sendSubmenu,
    getSubmenuForService,
    getButtonId,               // New helper
    getSubmenuMessage,         // New helper
    deleteSubmenuSession,      // New helper
    SUBMENUS                   // Exported for potential inspection/debugging
};