// handlers/sessionHandlers.js - COMPLETE UPDATED with ZESA fee support
const { SESSION_CONFIG, FLOW_STATES, RATE_LIMIT_CONFIG } = require('../config/constants');

const sessions = {}; // Global session store
const userActivity = {}; // For rate limiting/lockout
const transactionHistory = {}; // Optional: Store recent transactions for reference

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
        console.log(`⏰ Session expired for ${userId}`);
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
    
    // Convert service to uppercase for FLOW_STATES lookup
    const serviceKey = service.toUpperCase();
    
    // Determine initial flow state based on service
    let initialFlow = service;
    if (FLOW_STATES[serviceKey]?.START) {
        initialFlow = FLOW_STATES[serviceKey].START;
    } else if (service === 'zesa') {
        initialFlow = FLOW_STATES.ZESA.SELECT_CURRENCY;
    } else if (service === 'airtime') {
        initialFlow = FLOW_STATES.AIRTIME.START;
    }
    
    // Create new session with architecture structure
    sessions[userId] = {
        service: service, // 'airtime', 'zesa', 'bill_payment', 'emergency'
        step: 'start', // Starting step, will be updated by service
        flow: initialFlow, // Flow-specific state
        data: {
            userId: userId,
            createdAt: now,
            service: service
        }, // Flow-specific data storage
        retries: 0, // Track invalid attempts for current step
        expiresAt: now + SESSION_CONFIG.TIMEOUT,
        createdAt: now,
        userId: userId,
        metadata: {
            userAgent: null, // Can be populated if needed
            lastActivity: now,
            stepHistory: [] // Track steps for debugging
        }
    };
    
    console.log(`🆕 Created ${service} session for ${userId} [Flow: ${initialFlow}]`);
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
    
    // Track step history if moving to new state
    if (updates.state && updates.state !== sessions[userId].state) {
        if (!sessions[userId].metadata.stepHistory) {
            sessions[userId].metadata.stepHistory = [];
        }
        sessions[userId].metadata.stepHistory.push({
            from: sessions[userId].state,
            to: updates.state,
            timestamp: now
        });
        
        // Keep only last 10 steps
        if (sessions[userId].metadata.stepHistory.length > 10) {
            sessions[userId].metadata.stepHistory.shift();
        }
    }
    
    // Update session with new values
    sessions[userId] = {
        ...sessions[userId],
        ...updates,
        expiresAt: now + SESSION_CONFIG.TIMEOUT, // Refresh expiry on activity
        metadata: {
            ...sessions[userId].metadata,
            lastActivity: now
        }
    };
    
    return sessions[userId];
}

/**
 * Delete session (for reset/complete)
 */
function deleteSession(userId) {
    if (sessions[userId]) {
        // Optionally archive completed transactions
        if (sessions[userId].data && sessions[userId].data.transactionReference) {
            archiveTransaction(userId, sessions[userId]);
        }
        
        console.log(`🗑️ Deleted session for ${userId} [Service: ${sessions[userId].service}]`);
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
        console.log(`🔒 Max retries (${RATE_LIMIT_CONFIG.maxAttempts}) exceeded for ${userId} at step ${sessions[userId].step}`);
        return true;
    }
    
    return false;
}

/**
 * Get session data with safe defaults
 * Useful for services that need specific fields
 */
function getSessionData(userId, field = null) {
    const session = getActiveSession(userId);
    if (!session) return null;
    
    if (field) {
        return session.data[field] || null;
    }
    
    return session.data;
}

/**
 * Update specific field in session data
 */
function updateSessionData(userId, field, value) {
    const session = getActiveSession(userId);
    if (!session) return false;
    
    session.data[field] = value;
    updateSession(userId, { data: session.data });
    return true;
}

/**
 * Archive completed transaction for history
 */
function archiveTransaction(userId, session) {
    if (!transactionHistory[userId]) {
        transactionHistory[userId] = [];
    }
    
    // Keep only last 10 transactions
    if (transactionHistory[userId].length >= 10) {
        transactionHistory[userId].shift();
    }
    
    transactionHistory[userId].push({
        service: session.service,
        amount: session.data.amount || null,
        totalAmount: session.data.totalAmount || null,
        currency: session.data.currency || null,
        reference: session.data.transactionReference || null,
        timestamp: Date.now(),
        success: session.data.success || false
    });
}

/**
 * Get user's transaction history
 */
function getTransactionHistory(userId, limit = 5) {
    if (!transactionHistory[userId]) return [];
    return transactionHistory[userId].slice(-limit);
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
            const minutes = Math.ceil(RATE_LIMIT_CONFIG.lockoutDuration / 60000);
            console.log(`🔒 User ${userId} locked out for ${minutes} minutes`);
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

/**
 * Get lockout time remaining in minutes
 */
function getLockoutTimeRemaining(userId) {
    if (!userActivity[userId]) return 0;
    
    const now = Date.now();
    const lockoutUntil = userActivity[userId].lockoutUntil;
    
    if (lockoutUntil > now) {
        return Math.ceil((lockoutUntil - now) / 60000);
    }
    
    return 0;
}

// ==================== SESSION UTILITIES ====================

/**
 * Check if user is in specific flow state
 */
function isInState(userId, state) {
    const session = getActiveSession(userId);
    return session && session.state === state;
}

/**
 * Check if user is in specific service
 */
function isInService(userId, service) {
    const session = getActiveSession(userId);
    return session && session.service === service;
}

/**
 * Get session expiry time in minutes
 */
function getSessionExpiryMinutes(userId) {
    const session = getActiveSession(userId);
    if (!session) return 0;
    
    const now = Date.now();
    const remaining = session.expiresAt - now;
    return Math.max(0, Math.ceil(remaining / 60000));
}

/**
 * Extend session timeout
 */
function extendSession(userId, minutes = 5) {
    const session = getActiveSession(userId);
    if (!session) return false;
    
    session.expiresAt += (minutes * 60 * 1000);
    return true;
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
            console.log(`🧹 Cleaning expired session for ${userId} [Service: ${sessions[userId].service}]`);
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

/**
 * Cleanup old transaction history (older than 24 hours)
 */
function cleanupOldTransactions() {
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    let cleanedCount = 0;
    
    Object.keys(transactionHistory).forEach(userId => {
        transactionHistory[userId] = transactionHistory[userId].filter(t => 
            t.timestamp > dayAgo
        );
        
        if (transactionHistory[userId].length === 0) {
            delete transactionHistory[userId];
            cleanedCount += 1;
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} empty transaction histories`);
    }
}

/**
 * Start cleanup interval
 */
function startCleanupInterval() {
    // Clean up sessions every minute
    setInterval(cleanupOldSessions, SESSION_CONFIG.CLEANUP_INTERVAL || 60000);
    
    // Clean up user activity every 5 minutes
    setInterval(cleanupUserActivity, SESSION_CONFIG.USER_ACTIVITY_CLEANUP_INTERVAL || 300000);
    
    // Clean up transactions every hour
    setInterval(cleanupOldTransactions, 60 * 60 * 1000);
    
    console.log('🔄 Session cleanup intervals started');
}

// ==================== DEBUGGING / ADMIN ====================

/**
 * Get all active sessions (admin only)
 */
function getAllActiveSessions() {
    const now = Date.now();
    const active = {};
    
    Object.keys(sessions).forEach(userId => {
        if (sessions[userId].expiresAt > now) {
            active[userId] = {
                service: sessions[userId].service,
                state: sessions[userId].state,
                timeRemaining: Math.ceil((sessions[userId].expiresAt - now) / 60000),
                retries: sessions[userId].retries
            };
        }
    });
    
    return active;
}

/**
 * Get session stats
 */
function getSessionStats() {
    const now = Date.now();
    const activeSessions = Object.values(sessions).filter(s => s.expiresAt > now);
    
    const stats = {
        total: Object.keys(sessions).length,
        active: activeSessions.length,
        byService: {},
        lockedUsers: Object.keys(userActivity).filter(u => 
            userActivity[u].lockoutUntil > now
        ).length
    };
    
    activeSessions.forEach(s => {
        stats.byService[s.service] = (stats.byService[s.service] || 0) + 1;
    });
    
    return stats;
}

module.exports = {
    // Session management
    getActiveSession,
    createSession,
    updateSession,
    updateSessionStep,
    deleteSession,
    incrementRetries,
    getSessionData,
    updateSessionData,
    
    // Transaction history
    getTransactionHistory,
    archiveTransaction,
    
    // User activity & rate limiting
    trackInvalidAttempt,
    resetUserActivity,
    getLockoutTimeRemaining,
    userActivity,
    RATE_LIMIT_CONFIG,
    
    // Session utilities
    isInState,
    isInService,
    getSessionExpiryMinutes,
    extendSession,
    
    // Cleanup
    cleanupOldSessions,
    cleanupUserActivity,
    cleanupOldTransactions,
    startCleanupInterval,
    
    // Debugging / Admin
    getAllActiveSessions,
    getSessionStats,
    
    // For debugging/testing (use with caution)
    _sessions: sessions,
    _transactionHistory: transactionHistory
};