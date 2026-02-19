// handlers/submenuSessionHandler.js
/**
 * Submenu Session Handler
 * Manages sessions for nested menus (Bills → Nyaradzo, Bills → TelOne Voice, etc.)
 * Keeps submenu state separate from main service flows
 */

const { deleteSession } = require('./sessionHandlers');
const constants = require('../config/constants');

// Store submenu context separately from main sessions
const submenuContext = {};

// Submenu definitions - UPDATED with all 6 options
const SUBMENUS = {
    BILLS: {
        key: 'bills',
        name: 'Bills',
        options: {
            '1': {
                key: 'nyaradzo',
                name: 'Nyaradzo Funeral',
                emoji: '🌸',
                service: 'nyaradzo',
                loadingMessage: '⏳ Loading Nyaradzo payment service...',
                description: 'Pay Nyaradzo funeral policy subscriptions'
            },
            '2': {
                key: 'telone_voice',
                name: 'TelOne Voice',
                emoji: '📞',
                service: 'telone_voice',
                loadingMessage: '⏳ Loading TelOne Voice service...',
                description: 'Buy TelOne Voice bundles (ZiG)'
            },
            '3': {
                key: 'telone_broadband',
                name: 'TelOne Broadband',
                emoji: '🌐',
                service: 'telone_broadband',
                loadingMessage: '⏳ Loading TelOne Broadband service...',
                description: 'Buy TelOne Broadband bundles (ZiG)'
            },
            '4': {
                key: 'telone_lte',
                name: 'TelOne LTE',
                emoji: '📶',
                service: 'telone_lte',
                loadingMessage: '⏳ Loading TelOne LTE service...',
                description: 'Buy TelOne LTE bundles (ZiG)'
            },
            '5': {
                key: 'telone_voip',
                name: 'TelOne VoIP',
                emoji: '📱',
                service: 'telone_voip',
                loadingMessage: '⏳ Loading TelOne VoIP service...',
                description: 'Buy TelOne VoIP bundles (ZiG)'
            },
            '6': {
                key: 'telone_usd',
                name: 'TelOne USD Bundle',
                emoji: '💵',
                service: 'telone_usd',
                loadingMessage: '⏳ Loading TelOne USD service...',
                description: 'Buy TelOne USD bundles'
            }
        },
        prompt: `📄 *Bills Payment*\n\nSelect biller:\n\n1️⃣ 🌸 Nyaradzo Funeral\n2️⃣ 📞 TelOne Voice (ZiG)\n3️⃣ 🌐 TelOne Broadband (ZiG)\n4️⃣ 📶 TelOne LTE (ZiG)\n5️⃣ 📱 TelOne VoIP (ZiG)\n6️⃣ 💵 TelOne USD Bundle (USD)\n\n────────────────\nReply with *1-6*\nType *0* to return to Main Menu`,
        timeout: 5 * 60 * 1000 // 5 minutes
    },
    // Future submenus can be added here
    // SCHOOL: {
    //     key: 'school',
    //     name: 'School Fees',
    //     options: {
    //         '1': { ... }
    //     },
    //     prompt: `...`
    // }
};

// Default timeout for submenu sessions (5 minutes)
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

/**
 * Create a submenu session
 * @param {string} userId - User ID
 * @param {string} menuKey - Menu key (e.g., 'BILLS')
 * @param {Object} initialData - Initial data to store
 * @returns {Object} Submenu session
 */
function createSubmenuSession(userId, menuKey, initialData = {}) {
    console.log(`📋 [SUBMENU-SESSION] Creating submenu session for ${userId}, menu: ${menuKey}`);
    
    // Clear any existing submenu context
    if (submenuContext[userId]) {
        console.log(`📋 [SUBMENU-SESSION] Clearing existing session for ${userId}`);
        delete submenuContext[userId];
    }
    
    const menu = SUBMENUS[menuKey];
    const timeout = menu?.timeout || DEFAULT_TIMEOUT;
    
    // Create new submenu context
    submenuContext[userId] = {
        menu: menuKey,
        menuName: menu?.name || menuKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + timeout,
        lastActivity: Date.now(),
        data: initialData,
        path: [menu?.name || menuKey], // Navigation path
        attempts: 0,
        metadata: {
            userAgent: null,
            referrer: null
        }
    };
    
    console.log(`📋 [SUBMENU-SESSION] Session created for ${userId}, expires in ${timeout/60000} minutes`);
    
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
        console.log(`📋 [SUBMENU-SESSION] Session expired for ${userId}`);
        delete submenuContext[userId];
        return null;
    }
    
    // Update last activity
    context.lastActivity = Date.now();
    
    return context;
}

/**
 * Update submenu session
 * @param {string} userId - User ID
 * @param {Object} updates - Updates to apply
 * @returns {Object|null} Updated session
 */
function updateSubmenuSession(userId, updates) {
    const context = submenuContext[userId];
    
    if (!context) {
        console.log(`📋 [SUBMENU-SESSION] Cannot update - no session for ${userId}`);
        return null;
    }
    
    // Check expiry before update
    if (context.expiresAt < Date.now()) {
        console.log(`📋 [SUBMENU-SESSION] Session expired for ${userId}, cannot update`);
        delete submenuContext[userId];
        return null;
    }
    
    // Apply updates
    Object.assign(context, updates);
    
    // Refresh expiry and last activity
    const menu = SUBMENUS[context.menu];
    const timeout = menu?.timeout || DEFAULT_TIMEOUT;
    context.expiresAt = Date.now() + timeout;
    context.lastActivity = Date.now();
    
    console.log(`📋 [SUBMENU-SESSION] Session updated for ${userId}`);
    
    return context;
}

/**
 * Delete submenu session
 * @param {string} userId - User ID
 */
function deleteSubmenuSession(userId) {
    if (submenuContext[userId]) {
        console.log(`📋 [SUBMENU-SESSION] Deleting session for ${userId}`);
        delete submenuContext[userId];
        return true;
    }
    return false;
}

/**
 * Handle submenu selection
 * @param {string} userId - User ID
 * @param {string} selection - User's selection (e.g., '1', '2')
 * @returns {Object} Result with service and message
 */
function handleSubmenuSelection(userId, selection) {
    const session = getSubmenuSession(userId);
    
    if (!session) {
        return {
            error: 'No active submenu session',
            message: 'Session expired. Please start over.'
        };
    }
    
    const menu = SUBMENUS[session.menu];
    
    if (!menu) {
        deleteSubmenuSession(userId);
        return {
            error: 'Invalid menu',
            message: 'Menu not found. Please start over.'
        };
    }
    
    // Handle back/exit
    if (selection === '0') {
        deleteSubmenuSession(userId);
        return {
            exit: true,
            message: constants.MESSAGING_CONFIG.WELCOME_MESSAGE
        };
    }
    
    // Get the selected option
    const option = menu.options[selection];
    
    if (!option) {
        // Increment attempts for invalid selection
        session.attempts += 1;
        updateSubmenuSession(userId, { attempts: session.attempts });
        
        if (session.attempts >= 3) {
            deleteSubmenuSession(userId);
            return {
                error: 'Too many attempts',
                message: constants.ERROR_MESSAGES.TOO_MANY_ATTEMPTS
            };
        }
        
        return {
            error: 'Invalid selection',
            message: `❌ Invalid option. Please reply with:\n${getValidOptionsText(menu)}`
        };
    }
    
    // Reset attempts on valid selection
    session.attempts = 0;
    
    // Update navigation path
    if (!session.path) session.path = [];
    session.path.push(option.name);
    updateSubmenuSession(userId, { 
        attempts: 0,
        path: session.path,
        data: {
            ...session.data,
            selectedBiller: option.key,
            billerName: option.name,
            billerEmoji: option.emoji,
            // Add currency info for TelOne services
            currency: option.key === 'telone_usd' ? 'USD' : 
                     (option.key.startsWith('telone_') ? 'ZiG' : null)
        }
    });
    
    // Return the service to route to
    return {
        service: option.service,
        message: option.loadingMessage,
        option: option
    };
}

/**
 * Get valid options text for error messages
 * @param {Object} menu - Menu object
 * @returns {string} Formatted valid options
 */
function getValidOptionsText(menu) {
    const options = Object.keys(menu.options).map(key => {
        const opt = menu.options[key];
        return `${key} for ${opt.emoji} ${opt.name}`;
    }).join(', ');
    
    return `${options}, or 0 to cancel`;
}

/**
 * Handle incoming message for submenu
 * @param {string} userId - User ID
 * @param {string} messageText - User's message
 * @returns {Object} Result object
 */
function handleSubmenuMessage(userId, messageText) {
    const session = getSubmenuSession(userId);
    
    if (!session) {
        return {
            error: 'No session',
            message: null
        };
    }
    
    const selection = messageText.trim();
    
    // Handle special commands
    if (selection.toLowerCase() === 'menu' || selection.toLowerCase() === 'back') {
        // Show current menu again
        const menu = SUBMENUS[session.menu];
        return {
            message: menu.prompt,
            session: session
        };
    }
    
    // Process the selection
    return handleSubmenuSelection(userId, selection);
}

/**
 * Get menu prompt for a specific menu
 * @param {string} menuKey - Menu key
 * @returns {string|null} Menu prompt
 */
function getMenuPrompt(menuKey) {
    return SUBMENUS[menuKey]?.prompt || null;
}

/**
 * Update navigation path (add step)
 * @param {string} userId - User ID
 * @param {string} step - Current step in navigation
 */
function updateNavigationPath(userId, step) {
    const session = getSubmenuSession(userId);
    if (!session) return false;
    
    if (!session.path) {
        session.path = [];
    }
    
    session.path.push(step);
    updateSubmenuSession(userId, { path: session.path });
    return true;
}

/**
 * Get navigation path
 * @param {string} userId - User ID
 * @returns {Array} Navigation path
 */
function getNavigationPath(userId) {
    const session = getSubmenuSession(userId);
    return session?.path || [];
}

/**
 * Go back one level in navigation
 * @param {string} userId - User ID
 * @returns {boolean} Success
 */
function goBack(userId) {
    const session = getSubmenuSession(userId);
    if (!session || !session.path || session.path.length <= 1) {
        return false;
    }
    
    session.path.pop();
    updateSubmenuSession(userId, { path: session.path });
    return true;
}

/**
 * Reset navigation path to root
 * @param {string} userId - User ID
 */
function resetNavigationPath(userId) {
    const session = getSubmenuSession(userId);
    if (!session) return false;
    
    const menu = SUBMENUS[session.menu];
    session.path = [menu?.name || session.menu];
    updateSubmenuSession(userId, { path: session.path });
    return true;
}

/**
 * Increment attempt counter
 * @param {string} userId - User ID
 * @returns {number} Current attempt count
 */
function incrementAttempts(userId) {
    const session = getSubmenuSession(userId);
    if (!session) return 0;
    
    session.attempts += 1;
    updateSubmenuSession(userId, { attempts: session.attempts });
    return session.attempts;
}

/**
 * Reset attempt counter
 * @param {string} userId - User ID
 */
function resetAttempts(userId) {
    const session = getSubmenuSession(userId);
    if (!session) return;
    
    session.attempts = 0;
    updateSubmenuSession(userId, { attempts: 0 });
}

/**
 * Store data in submenu session
 * @param {string} userId - User ID
 * @param {string} key - Data key
 * @param {any} value - Data value
 */
function setSubmenuData(userId, key, value) {
    const session = getSubmenuSession(userId);
    if (!session) return false;
    
    session.data[key] = value;
    updateSubmenuSession(userId, { data: session.data });
    return true;
}

/**
 * Get data from submenu session
 * @param {string} userId - User ID
 * @param {string} key - Data key
 * @returns {any} Stored data or null
 */
function getSubmenuData(userId, key) {
    const session = getSubmenuSession(userId);
    if (!session) return null;
    
    return session.data[key];
}

/**
 * Clear all submenu data
 * @param {string} userId - User ID
 */
function clearSubmenuData(userId) {
    const session = getSubmenuSession(userId);
    if (!session) return;
    
    session.data = {};
    updateSubmenuSession(userId, { data: {} });
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
 * Get submenu option
 * @param {string} menuKey - Menu key
 * @param {string} optionKey - Option key
 * @returns {Object|null} Option or null
 */
function getSubmenuOption(menuKey, optionKey) {
    return SUBMENUS[menuKey]?.options[optionKey] || null;
}

/**
 * Check if menu exists
 * @param {string} menuKey - Menu key
 * @returns {boolean} True if exists
 */
function menuExists(menuKey) {
    return !!SUBMENUS[menuKey];
}

/**
 * Get all submenu keys
 * @returns {Array} Array of menu keys
 */
function getSubmenuKeys() {
    return Object.keys(SUBMENUS);
}

/**
 * Get session stats for admin/debugging
 * @returns {Object} Session statistics
 */
function getSubmenuStats() {
    const now = Date.now();
    const active = {};
    let total = 0;
    let expired = 0;
    
    Object.keys(submenuContext).forEach(userId => {
        const session = submenuContext[userId];
        if (session.expiresAt > now) {
            active[userId] = {
                menu: session.menu,
                timeRemaining: Math.ceil((session.expiresAt - now) / 60000),
                path: session.path
            };
            total++;
        } else {
            expired++;
        }
    });
    
    return {
        total,
        expired,
        active,
        byMenu: Object.values(active).reduce((acc, curr) => {
            acc[curr.menu] = (acc[curr.menu] || 0) + 1;
            return acc;
        }, {})
    };
}

/**
 * Clean up expired submenu sessions
 * @returns {number} Number of sessions cleaned
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
        console.log(`🧹 [SUBMENU-SESSION] Cleaned up ${count} expired sessions`);
    }
    
    return count;
}

/**
 * Force cleanup of all sessions for a user
 * @param {string} userId - User ID
 */
function forceCleanupUser(userId) {
    deleteSubmenuSession(userId);
    deleteSession(userId); // Also clean main session
}

// Run cleanup every 5 minutes
const CLEANUP_INTERVAL = setInterval(cleanupExpiredSubmenuSessions, 5 * 60 * 1000);

// Prevent Node from keeping process alive just for this interval
CLEANUP_INTERVAL.unref();

module.exports = {
    // Core session management
    createSubmenuSession,
    getSubmenuSession,
    updateSubmenuSession,
    deleteSubmenuSession,
    
    // Message handling
    handleSubmenuMessage,
    handleSubmenuSelection,
    
    // Navigation
    updateNavigationPath,
    getNavigationPath,
    goBack,
    resetNavigationPath,
    
    // Attempt tracking
    incrementAttempts,
    resetAttempts,
    
    // Data storage
    setSubmenuData,
    getSubmenuData,
    clearSubmenuData,
    
    // Menu definitions
    getSubmenuPrompt,
    getSubmenuOption,
    menuExists,
    getSubmenuKeys,
    getMenuPrompt,
    
    // Admin utilities
    getSubmenuStats,
    cleanupExpiredSubmenuSessions,
    forceCleanupUser,
    
    // Constants
    SUBMENUS,
    DEFAULT_TIMEOUT,
    
    // For debugging (use with caution)
    _submenuContext: submenuContext
};
