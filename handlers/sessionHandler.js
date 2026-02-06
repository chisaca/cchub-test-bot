// handlers/sessionHandler.js
const { SESSION_CONFIG } = require('../config/constants');
const userActivity = {};
const sessions = {};
const RATE_LIMIT_CONFIG = {
    maxAttempts: 3,
    windowMs: 5 * 60 * 1000,
    lockoutDuration: 15 * 60 * 1000
};

// Helper function to create/update session
const updateSession = (whatsappNumber, data) => {
    Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].whatsappNumber === whatsappNumber) {
            if (data.service === 'bill_payment' && sessions[sessionId].service !== 'bill_payment') {
                return;
            }
            delete sessions[sessionId];
        }
    });
    
    const sessionId = `session_${whatsappNumber}_${Date.now()}`;
    sessions[sessionId] = {
        ...data,
        whatsappNumber,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_CONFIG.SESSION_TIMEOUT
    };
    return sessionId;
};

// Session management helpers
function getActiveSession(whatsappNumber) {
    const now = Date.now();
    
    // Clean up expired sessions
    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        if (session.expiresAt < now) {
            delete sessions[sessionId];
        }
    });
    
    // Find active sessions for this number
    const activeSessions = Object.values(sessions).filter(session => 
        session.whatsappNumber === whatsappNumber && session.expiresAt > now
    );
    
    return activeSessions.sort((a, b) => b.createdAt - a.createdAt)[0];
}

function deleteSession(whatsappNumber) {
    Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].whatsappNumber === whatsappNumber) {
            delete sessions[sessionId];
        }
    });
}

// Add this function to update existing session without deleting
const updateExistingSession = (whatsappNumber, newData) => {
    const now = Date.now();
    
    // Find and update existing session
    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        if (session.whatsappNumber === whatsappNumber && session.expiresAt > now) {
            // Update the session with new data
            sessions[sessionId] = {
                ...session,
                ...newData,
                expiresAt: now + SESSION_CONFIG.SESSION_TIMEOUT // Refresh expiry
            };
            return sessionId;
        }
    });
    
    // If no existing session found, create a new one
    return updateSession(whatsappNumber, newData);
};

// Cleanup functions
function cleanupOldSessions() {
    const now = Date.now();
    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        if (session.expiresAt < now) {
            delete sessions[sessionId];
        }
    });
}

function cleanupUserActivity() {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    
    Object.keys(userActivity).forEach(userId => {
        const activity = userActivity[userId];
        
        if (activity.lastAttempt < hourAgo && activity.lockoutUntil < now) {
            delete userActivity[userId];
        }
        
        if (activity.lockoutUntil > 0 && activity.lockoutUntil < now) {
            activity.lockoutUntil = 0;
            activity.attempts = 0;
        }
    });
}

module.exports = {
    sessions,
    userActivity,
    RATE_LIMIT_CONFIG,
    updateSession,
    getActiveSession,
    updateExistingSession,
    deleteSession,
    cleanupOldSessions,
    cleanupUserActivity
};