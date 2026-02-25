// handlers/subMenuHandler.js
// ============================================================================
// SUBMENU HANDLER
// Pure menu definitions and selection mapping ONLY
// NO service logic - returns service names for messageHandler to route
// Follows separation of concerns: menus define options, handlers route logic
// ============================================================================

// ============================================================================
// SUBMENU DEFINITIONS
// Each submenu contains options that map to service names
// Format: options[selection] = { key, name, emoji, service }
// ============================================================================
const SUBMENUS = {
    // ------------------------------------------------------------------------
    // BILLS SUBMENU
    // Currently supports Nyaradzo Funeral only (TelOne removed)
    // ------------------------------------------------------------------------
    BILLS: {
        name: 'Bills',
        options: {
            '1': {
                key: 'nyaradzo',
                name: 'Nyaradzo Funeral',
                emoji: '🌸',
                service: 'nyaradzo'  // Returns service name for messageHandler
            }
            // Add new billers here following same format
            // '2': {
            //     key: 'new_biller',
            //     name: 'New Biller',
            //     emoji: '📄',
            //     service: 'new_biller_service'
            // }
        },
        // Maintains consistent appearance with main menu (plain numbers + emoji)
        message: `📄 *Bills Payment*

Select biller:

1 *🌸 Nyaradzo Funeral*

────────────────
Reply with *1*
Type *0* to return to Main Menu`
    }
    
    // ------------------------------------------------------------------------
    // FUTURE SUBMENUS
    // Add new submenus here following same structure
    // ------------------------------------------------------------------------
    // EMERGENCY_SUB: {
    //     name: 'Emergency',
    //     options: { ... },
    //     message: `...`
    // }
};

// ============================================================================
// SUBMENU SELECTION HANDLER
// Processes user selection from a submenu
// Returns ONLY service name - NO business logic
// ============================================================================

/**
 * Handle user selection from a submenu
 * Pure mapping function - returns service name for messageHandler to route
 * 
 * @param {string} userId - WhatsApp user ID (for logging only)
 * @param {string} submenu - Submenu identifier (e.g., 'BILLS')
 * @param {string} selection - User's selection (e.g., '1', '0')
 * @returns {Object} Result object with service name or error
 */
async function handleSubmenuSelection(userId, submenu, selection) {
    console.log(`📋 [SUBMENU] User: ${userId}, Submenu: ${submenu}, Selection: "${selection}"`);
    
    const menu = SUBMENUS[submenu];
    if (!menu) {
        console.error(`❌ [SUBMENU] Invalid submenu: ${submenu}`);
        return { error: 'Invalid menu' };
    }
    
    // ========================================================================
    // HANDLE RETURN TO MAIN MENU
    // Selection '0' indicates user wants to exit to main menu
    // ========================================================================
    if (selection === '0') {
        console.log(`📋 [SUBMENU] User ${userId} returning to main menu`);
        return { exit: true };
    }
    
    // ========================================================================
    // LOOK UP SELECTED OPTION
    // Map user's selection to configured option
    // ========================================================================
    const option = menu.options[selection];
    if (!option) {
        const validOptions = Object.keys(menu.options).join(', ');
        console.warn(`⚠️ [SUBMENU] Invalid selection: "${selection}" for ${submenu}`, {
            validOptions: validOptions
        });
        
        return { 
            error: 'Invalid selection',
            validOptions: validOptions
        };
    }
    
    // ========================================================================
    // RETURN SERVICE NAME ONLY
    // NO service logic here - messageHandler will route to appropriate service
    // This maintains clean separation of concerns
    // ========================================================================
    console.log(`📋 [SUBMENU] User ${userId} selected:`, {
        service: option.service,
        name: option.name,
        key: option.key
    });
    
    return {
        service: option.service,  // Service name for messageHandler routing
        option: option            // Full option data (for potential metadata)
    };
}

// ============================================================================
// SEND SUBMENU TO USER
// Displays the submenu message to the user
// ============================================================================

/**
 * Send a submenu message to the user
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} submenu - Submenu identifier to send
 * @returns {Promise<void>}
 */
async function sendSubmenu(userId, submenu) {
    const menu = SUBMENUS[submenu];
    if (menu) {
        const messaging = require('../utils/messaging');
        await messaging.sendMessage(userId, menu.message);
        console.log(`📤 [SUBMENU] Sent ${submenu} menu to ${userId}`);
    } else {
        console.error(`❌ [SUBMENU] Attempted to send invalid submenu: ${submenu}`);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    handleSubmenuSelection,
    sendSubmenu,
    SUBMENUS  // Exported for potential inspection/debugging
};
