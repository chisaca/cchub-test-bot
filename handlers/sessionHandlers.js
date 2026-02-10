// handlers/sessionHandlers.js - UPDATED to match state-driven architecture
const { SESSION_CONFIG, FLOW_STATES } = require('../config/constants');

const sessions = {}; // Global session store
const userActivity = {}; // For rate limiting/lockout

const RATE_LIMIT_CONFIG = {
    maxAttempts: 3, // 3-strike rule per step
    windowMs: 5 * 60 * 1000, // 5 minutes
    lockoutDuration: 15 * 60 * 1000 // 15 minutes lockout
};

// ==================== SESSION MANAGEMENT ====================

/**
 * Get active session for user
 * Follows principle: One flow at a time
 */
function getActiveSession(userId) {
    const now = Date.now();
    
    // Check if user has an active session
    if (!sessions[userId]) {
        return null;
    }
    
    const session = sessions[userId];
    
    // Check if session expired
    if (session.expiresAt < now) {
        delete sessions[userId];
        return null;
    }
    
    return session;
}

/**
 * Create a new session for a service flow
 * Follows architecture session structure exactly
 */
function createSession(userId, service) {
    const now = Date.now();
    
    // Clear any existing session (one flow at a time)
    delete sessions[userId];
    
    // Create new session with architecture structure
    sessions[userId] = {
        service: service, // 'airtime', 'zesa', 'bill_payment', 'emergency'
        step: 'start', // Starting step, will be updated by service
        flow: FLOW_STATES[service]?.START || service, // Flow-specific state
        data: {}, // Flow-specific data storage
        retries: 0, // Track invalid attempts for current step
        expiresAt: now + SESSION_CONFIG.SESSION_TIMEOUT,
        createdAt: now,
        userId: userId
    };
    
    console.log(`🆕 Created ${service} session for ${userId}`);
    return sessions[userId];
}

/**
 * Update existing session (for moving between steps)
 */
function updateSession(userId, updates) {
    if (!sessions[userId]) {
        console.warn(`⚠️ Attempted to update non-existent session for ${userId}`);
        return null;
    }
    
    const now = Date.now();
    
    // Update session with new values
    sessions[userId] = {
        ...sessions[userId],
        ...updates,
        expiresAt: now + SESSION_CONFIG.SESSION_TIMEOUT // Refresh expiry
    };
    
    return sessions[userId];
}

/**
 * Delete session (for reset/complete)
 */
function deleteSession(userId) {
    if (sessions[userId]) {
        console.log(`🗑️  Deleted session for ${userId}`);
        delete sessions[userId];
    }
}

/**
 * Update session step and data
 * Used by services to move through flow steps
 */
function updateSessionStep(userId, step, flowState, dataUpdates = {}) {
    if (!sessions[userId]) {
        return null;
    }
    
    const updates = {
        step: step,
        flow: flowState,
        retries: 0, // Reset retries on successful step completion
        data: {
            ...sessions[userId].data,
            ...dataUpdates
        }
    };
    
    return updateSession(userId, updates);
}

/**
 * Increment retry count for current step
 * Returns true if max retries exceeded
 */
function incrementRetries(userId) {
    if (!sessions[userId]) {
        return false;
    }
    
    sessions[userId].retries += 1;
    
    if (sessions[userId].retries >= RATE_LIMIT_CONFIG.maxAttempts) {
        console.log(`🔒 Max retries exceeded for ${userId} at step ${sessions[userId].step}`);
        return true;
    }
    
    return false;
}

// ==================== USER ACTIVITY / RATE LIMITING ====================

/**
 * Track invalid attempt and apply lockout if needed
 */
function trackInvalidAttempt(userId) {
    const now = Date.now();
    
    if (!userActivity[userId]) {
        userActivity[userId] = {
            attempts: 1,
            firstAttempt: now,
            lockoutUntil: 0
        };
        return false;
    }
    
    const activity = userActivity[userId];
    
    // Check if in lockout
    if (activity.lockoutUntil > now) {
        return true; // Already locked out
    }
    
    // Check time window
    if (now - activity.firstAttempt > RATE_LIMIT_CONFIG.windowMs) {
        // Reset counter if outside window
        activity.attempts = 1;
        activity.firstAttempt = now;
    } else {
        activity.attempts += 1;
        
        // Check if exceeds max attempts
        if (activity.attempts >= RATE_LIMIT_CONFIG.maxAttempts) {
            activity.lockoutUntil = now + RATE_LIMIT_CONFIG.lockoutDuration;
            console.log(`🔒 User ${userId} locked out for 15 minutes`);
            return true;
        }
    }
    
    return false;
}

/**
 * Reset user activity on successful action
 */
function resetUserActivity(userId) {
    if (userActivity[userId]) {
        userActivity[userId].attempts = 0;
        userActivity[userId].firstAttempt = Date.now();
        userActivity[userId].lockoutUntil = 0;
    }
}

// ==================== CLEANUP FUNCTIONS ====================

/**
 * Cleanup expired sessions
 */
function cleanupOldSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.keys(sessions).forEach(userId => {
        if (sessions[userId].expiresAt < now) {
            delete sessions[userId];
            cleanedCount += 1;
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
    }
}

/**
 * Cleanup old user activity records
 */
function cleanupUserActivity() {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000); // Keep 1 hour history
    let cleanedCount = 0;
    
    Object.keys(userActivity).forEach(userId => {
        const activity = userActivity[userId];
        
        // Cleanup if no lockout and last activity over hour ago
        if (activity.lockoutUntil === 0 && activity.firstAttempt < hourAgo) {
            delete userActivity[userId];
            cleanedCount += 1;
        }
        
        // Clear expired lockouts
        if (activity.lockoutUntil > 0 && activity.lockoutUntil < now) {
            activity.lockoutUntil = 0;
            activity.attempts = 0;
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} old user activity records`);
    }
}

module.exports = {
    // Session management
    getActiveSession,
    createSession,
    updateSession,
    updateSessionStep,
    deleteSession,
    incrementRetries,
    
    // User activity & rate limiting
    trackInvalidAttempt,
    resetUserActivity,
    userActivity,
    RATE_LIMIT_CONFIG,
    
    // Cleanup
    cleanupOldSessions,
    cleanupUserActivity,
    
    // For debugging/testing
    _sessions: sessions
};