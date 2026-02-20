// handlers/submenuSessionHandler.js - PURE SESSION STORAGE

const submenuSessions = {};

function createSubmenuSession(userId, menuKey) {
    console.log(`📋 [SUBMENU-SESSION] Creating session for ${userId}, menu: ${menuKey}`);
    
    submenuSessions[userId] = {
        menu: menuKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000), // 5 minutes
        lastActivity: Date.now()
    };
    
    return submenuSessions[userId];
}

function getSubmenuSession(userId) {
    const session = submenuSessions[userId];
    
    if (!session) return null;
    
    // Check expiry
    if (session.expiresAt < Date.now()) {
        delete submenuSessions[userId];
        return null;
    }
    
    // Update last activity
    session.lastActivity = Date.now();
    return session;
}

function deleteSubmenuSession(userId) {
    if (submenuSessions[userId]) {
        delete submenuSessions[userId];
        return true;
    }
    return false;
}

module.exports = {
    createSubmenuSession,
    getSubmenuSession,
    deleteSubmenuSession,
    
    // For debugging
    _sessions: submenuSessions
};
