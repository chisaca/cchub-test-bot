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
Type *hi* to return to Main Menu`
    },
    
    // ------------------------------------------------------------------------
    // HOT UPDATES SUBMENU (UPDATED with button IDs)
    // Provides info services selection with interactive buttons
    // ------------------------------------------------------------------------
    HOT_UPDATES: {
        name: 'Hot Updates',
        options: {
            '1': {
                key: 'epl',
                name: 'EPL Soccer Updates',
                emoji: '⚽',
                service: 'hot_updates',  // Same service, different internal routing
                buttonId: 'hu_epl'        // Button ID for interactive menu
            },
            '2': {
                key: 'news',
                name: 'Zimbabwe News',
                emoji: '📰',
                service: 'hot_updates',
                buttonId: 'hu_news'        // Button ID for interactive menu
            },
            '3': {
                key: 'weather',
                name: 'Weather Forecasts',
                emoji: '🌦️',
                service: 'hot_updates',
                buttonId: 'hu_weather'      // Button ID for interactive menu
            }
            // Future info services can be added here
            // '4': {
            //     key: 'farming',
            //     name: 'Farming & Market Prices',
            //     emoji: '🌾',
            //     service: 'hot_updates',
            //     buttonId: 'hu_farming'
            // }
        },
        // Keep text message as fallback, but we'll use buttons primarily
        message: `🔥 *HOT UPDATES*

Choose information service:

1 *⚽ EPL Soccer Updates*
2 *📰 Zimbabwe News*
3 *🌦️ Weather Forecasts*

────────────────
Reply with *1-3*
Type *hi* to return to Main Menu`
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
// NOW WITH: Support for interactive button IDs
// ============================================================================

/**
 * Handle user selection from a submenu
 * Pure mapping function - returns service name for messageHandler to route
 * 
 * @param {string} userId - WhatsApp user ID (for logging only)
 * @param {string} submenu - Submenu identifier (e.g., 'BILLS', 'HOT_UPDATES')
 * @param {string} selection - User's selection (e.g., '1', '2', '3', 'hu_epl', 'hu_news')
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
    // HANDLE INTERACTIVE BUTTON SELECTIONS
    // Map button IDs back to their corresponding option
    // ========================================================================
    let option = null;
    
    // First try to find by button ID
    if (selection.startsWith('hu_') || selection.startsWith('bills_')) {
        for (const [key, opt] of Object.entries(menu.options)) {
            if (opt.buttonId === selection) {
                option = opt;
                option.key = opt.key; // Ensure key is set
                break;
            }
        }
    }
    
    // If not found by button ID, try by numeric selection
    if (!option) {
        option = menu.options[selection];
    }
    
    if (!option) {
        const validOptions = Object.keys(menu.options).join(', ');
        const validButtons = Object.values(menu.options)
            .map(opt => opt.buttonId)
            .filter(id => id)
            .join(', ');
            
        console.warn(`⚠️ [SUBMENU] Invalid selection: "${selection}" for ${submenu}`, {
            validOptions: validOptions,
            validButtons: validButtons
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
        key: option.key,
        emoji: option.emoji
    });
    
    return {
        service: option.service,  // Service name for messageHandler routing
        option: option,           // Full option data (for potential metadata)
        submenuType: submenu      // Which submenu this came from
    };
}

// ============================================================================
// SEND SUBMENU TO USER - UPDATED with Interactive Buttons
// Displays the submenu message to the user using interactive buttons
// ============================================================================

// handlers/subMenuHandler.js - UPDATE the sendSubmenu function

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
        title: menu.name,
        rows: optionsList
    });
    
    // Send as interactive list message (same as main menu)
    await messaging.sendListMessage(
        userId,
        `📋 *${menu.name}*`,
        `What would you like to view?`,
        "View Options",
        sections
    );
    
    console.log(`📤 [SUBMENU] Sent interactive list ${submenu} menu to ${userId}`);
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
    getButtonId,           // New helper
    SUBMENUS               // Exported for potential inspection/debugging
};