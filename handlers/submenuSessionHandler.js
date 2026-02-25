// handlers/submenuSessionHandler.js
// ============================================================================
// SUBMENU SESSION HANDLER
// Pure session storage for submenu navigation
// Separate from main service sessions to allow biller selection before service starts
// Sessions auto-expire after 5 minutes of inactivity
// ============================================================================

// ============================================================================
// IN-MEMORY STORAGE
// Stores temporary submenu navigation sessions
// Format: { userId: { menu, createdAt, expiresAt, lastActivity } }
// ============================================================================
const submenuSessions = {};

// Session timeout in milliseconds (5 minutes)
const SUBMENU_SESSION_TIMEOUT = 5 * 60 * 1000;

// ============================================================================
// CREATE SUBMENU SESSION
// Creates a new submenu session for a user
// ============================================================================

/**
 * Create a new submenu session for a user
 * Submenu sessions are separate from main service sessions and only track
 * which submenu the user is currently viewing
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} menuKey - Submenu identifier (e.g., 'BILLS')
 * @returns {Object} The created session object
 */
function createSubmenuSession(userId, menuKey) {
    console.log(`📋 [SUBMENU-SESSION] Creating session for ${userId}`, {
        menu: menuKey
    });
    
    const now = Date.now();
    
    submenuSessions[userId] = {
        menu: menuKey,
        createdAt: now,
        expiresAt: now + SUBMENU_SESSION_TIMEOUT,
        lastActivity: now
    };
    
    return submenuSessions[userId];
}

// ============================================================================
// GET SUBMENU SESSION
// Retrieves active submenu session if it exists and hasn't expired
// ============================================================================

/**
 * Get active submenu session for a user
 * Automatically checks expiry and updates last activity timestamp
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {Object|null} Session object or null if not found/expired
 */
function getSubmenuSession(userId) {
    const session = submenuSessions[userId];
    
    if (!session) {
        return null;
    }
    
    const now = Date.now();
    
    // Check if session has expired
    if (session.expiresAt < now) {
        console.log(`⏰ [SUBMENU-SESSION] Expired session for ${userId}`);
        delete submenuSessions[userId];
        return null;
    }
    
    // Update last activity timestamp
    session.lastActivity = now;
    
    return session;
}

// ============================================================================
// DELETE SUBMENU SESSION
// Removes submenu session (typically after user selects a service)
// ============================================================================

/**
 * Delete a user's submenu session
 * Called when user selects a service or exits to main menu
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {boolean} True if session existed and was deleted, false otherwise
 */
function deleteSubmenuSession(userId) {
    if (submenuSessions[userId]) {
        console.log(`🗑️ [SUBMENU-SESSION] Deleting session for ${userId}`, {
            menu: submenuSessions[userId].menu,
            duration: Math.round((Date.now() - submenuSessions[userId].createdAt) / 1000) + 's'
        });
        
        delete submenuSessions[userId];
        return true;
    }
    
    return false;
}

// ============================================================================
// CLEANUP FUNCTION (Optional - can be called by main cleanup)
// ============================================================================

/**
 * Clean up all expired submenu sessions
 * Can be called by the main cleanup interval
 * 
 * @returns {number} Number of expired sessions cleaned up
 */
function cleanupExpiredSubmenuSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.keys(submenuSessions).forEach(userId => {
        if (submenuSessions[userId].expiresAt < now) {
            console.log(`🧹 [SUBMENU-SESSION] Cleaning expired session for ${userId}`);
            delete submenuSessions[userId];
            cleanedCount += 1;
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`🧹 [SUBMENU-SESSION] Cleaned up ${cleanedCount} expired sessions`);
    }
    
    return cleanedCount;
}

// ============================================================================
// DEBUGGING / ADMIN
// ============================================================================

/**
 * Get all active submenu sessions (admin use only)
 * 
 * @returns {Object} Map of active submenu sessions
 */
function getAllSubmenuSessions() {
    const now = Date.now();
    const active = {};
    
    Object.keys(submenuSessions).forEach(userId => {
        if (submenuSessions[userId].expiresAt > now) {
            active[userId] = {
                menu: submenuSessions[userId].menu,
                timeRemaining: Math.ceil((submenuSessions[userId].expiresAt - now) / 60000) + ' minutes',
                created: new Date(submenuSessions[userId].createdAt).toISOString()
            };
        }
    });
    
    return active;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    createSubmenuSession,
    getSubmenuSession,
    deleteSubmenuSession,
    cleanupExpiredSubmenuSessions,
    getAllSubmenuSessions,
    
    // For debugging/inspection (use with caution in production)
    _sessions: submenuSessions
};
