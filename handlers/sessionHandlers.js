// handlers/sessionHandlers.js
// ============================================================================
// SESSION MANAGEMENT HANDLER
// Manages user sessions, rate limiting, transaction history, and payment method awareness
// Follows the principle: ONE FLOW AT A TIME per user
// ============================================================================

const { SESSION_CONFIG, FLOW_STATES, RATE_LIMIT_CONFIG } = require('../config/constants');

// ============================================================================
// GLOBAL STORES
// In-memory storage for sessions, activity tracking, and transaction history
// ============================================================================
const sessions = {};              // Active user sessions
const userActivity = {};          // Rate limiting and lockout tracking
const transactionHistory = {};    // Recent transaction history (last 24h)

// Mobile money methods that require phone number registration
const MOBILE_MONEY_METHODS = ['ecocash', 'onemoney', 'paygo'];

// ============================================================================
// SESSION MANAGEMENT
// Core session CRUD operations with expiry handling
// ============================================================================

/**
 * Get active session for user
 * Returns null if session doesn't exist or has expired
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {Object|null} Session object or null
 */
function getActiveSession(userId) {
    const now = Date.now();
    
    if (!sessions[userId]) {
        return null;
    }
    
    const session = sessions[userId];
    
    // Check if session has expired
    if (session.expiresAt < now) {
        console.log(`⏰ [SESSION] Expired session for ${userId}`);
        delete sessions[userId];
        return null;
    }
    
    return session;
}

/**
 * Create a new session for a service flow
 * Automatically clears any existing session (one flow at a time)
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} service - Service type (airtime, zesa, bill_payment, emergency, help)
 * @param {string|null} paymentMethod - Selected payment method (optional)
 * @returns {Object} Newly created session
 */
function createSession(userId, service, paymentMethod = null) {
    const now = Date.now();
    
    // Clear any existing session (enforce one flow at a time)
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
    
    // Check if payment method requires phone number
    const requiresPhone = paymentMethod ? MOBILE_MONEY_METHODS.includes(paymentMethod) : false;
    
    // Create new session with complete architecture structure
    sessions[userId] = {
        service: service,           // Primary service identifier
        step: 'start',              // Current step in flow (service-specific)
        flow: initialFlow,           // Flow-specific state from FLOW_STATES
        data: {                      // Service-specific data storage
            userId: userId,
            createdAt: now,
            service: service,
            paymentMethod: paymentMethod,
            requiresPhone: requiresPhone,
            amount: null,
            currency: null,
            recipient: null,
            transactionReference: null
        },
        retries: 0,                  // Invalid attempts for current step
        expiresAt: now + SESSION_CONFIG.TIMEOUT,
        createdAt: now,
        userId: userId,
        metadata: {
            userAgent: null,
            lastActivity: now,
            stepHistory: []           // Tracks flow for debugging
        }
    };
    
    console.log(`🆕 [SESSION] Created ${service} session for ${userId}`, {
        flow: initialFlow,
        paymentMethod: paymentMethod || 'Not selected',
        requiresPhone: requiresPhone
    });
    
    return sessions[userId];
}

/**
 * Update existing session with new values
 * Automatically refreshes expiry timestamp
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Object} updates - Partial session object with updates
 * @returns {Object|null} Updated session or null if not found
 */
function updateSession(userId, updates) {
    if (!sessions[userId]) {
        console.warn(`⚠️ [SESSION] Attempted to update non-existent session for ${userId}`);
        return null;
    }
    
    const now = Date.now();
    
    // Track step history if moving to new flow state
    if (updates.flow && updates.flow !== sessions[userId].flow) {
        if (!sessions[userId].metadata.stepHistory) {
            sessions[userId].metadata.stepHistory = [];
        }
        
        sessions[userId].metadata.stepHistory.push({
            from: sessions[userId].flow,
            to: updates.flow,
            timestamp: now
        });
        
        // Keep only last 10 steps to prevent memory bloat
        if (sessions[userId].metadata.stepHistory.length > 10) {
            sessions[userId].metadata.stepHistory.shift();
        }
    }
    
    // Apply updates and refresh expiry
    sessions[userId] = {
        ...sessions[userId],
        ...updates,
        expiresAt: now + SESSION_CONFIG.TIMEOUT,
        metadata: {
            ...sessions[userId].metadata,
            lastActivity: now
        }
    };
    
    return sessions[userId];
}

/**
 * Delete session completely
 * Archives transaction if one was completed
 * 
 * @param {string} userId - WhatsApp user ID
 */
function deleteSession(userId) {
    if (sessions[userId]) {
        // Archive completed transaction for history
        if (sessions[userId].data?.transactionReference) {
            archiveTransaction(userId, sessions[userId]);
        }
        
        console.log(`🗑️ [SESSION] Deleted session for ${userId}`, {
            service: sessions[userId].service,
            duration: Math.round((Date.now() - sessions[userId].createdAt) / 1000) + 's'
        });
        
        delete sessions[userId];
    }
}

/**
 * Update session step and data
 * Standard method for services to progress through flow
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} step - Current step name
 * @param {string} flowState - Current flow state from FLOW_STATES
 * @param {Object} dataUpdates - Data to merge into session.data
 * @returns {Object|null} Updated session or null
 */
function updateSessionStep(userId, step, flowState, dataUpdates = {}) {
    if (!sessions[userId]) {
        return null;
    }
    
    const updates = {
        step: step,
        flow: flowState,
        retries: 0, // Reset retries on successful step
        data: {
            ...sessions[userId].data,
            ...dataUpdates
        }
    };
    
    return updateSession(userId, updates);
}

/**
 * Increment retry count for current step
 * Used for handling invalid user input
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {boolean} True if max retries exceeded, false otherwise
 */
function incrementRetries(userId) {
    if (!sessions[userId]) {
        return false;
    }
    
    sessions[userId].retries += 1;
    
    if (sessions[userId].retries >= RATE_LIMIT_CONFIG.maxAttempts) {
        console.log(`🔒 [RETRY] Max retries (${RATE_LIMIT_CONFIG.maxAttempts}) exceeded for ${userId}`, {
            step: sessions[userId].step,
            flow: sessions[userId].flow
        });
        return true;
    }
    
    return false;
}

/**
 * Get specific field from session data
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string|null} field - Specific field to retrieve, or null for all data
 * @returns {any} Session data or specific field value
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
 * Update a single field in session data
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} field - Field name to update
 * @param {any} value - New value
 * @returns {boolean} Success status
 */
function updateSessionData(userId, field, value) {
    const session = getActiveSession(userId);
    if (!session) return false;
    
    session.data[field] = value;
    updateSession(userId, { data: session.data });
    return true;
}

// ============================================================================
// PAYMENT METHOD HELPERS
// Utilities for payment method specific logic
// ============================================================================

/**
 * Check if current payment method requires a phone number
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {boolean} True if phone number is required
 */
function requiresPhoneNumber(userId) {
    const session = getActiveSession(userId);
    if (!session) return false;
    
    return session.data.requiresPhone === true;
}

/**
 * Get currently selected payment method
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {string|null} Payment method or null
 */
function getPaymentMethod(userId) {
    const session = getActiveSession(userId);
    if (!session) return null;
    
    return session.data.paymentMethod || null;
}

/**
 * Update payment method in session
 * Also updates requiresPhone flag based on method
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} paymentMethod - Selected payment method
 * @returns {boolean} Success status
 */
function setPaymentMethod(userId, paymentMethod) {
    const session = getActiveSession(userId);
    if (!session) return false;
    
    const requiresPhone = MOBILE_MONEY_METHODS.includes(paymentMethod);
    
    session.data.paymentMethod = paymentMethod;
    session.data.requiresPhone = requiresPhone;
    
    updateSession(userId, { data: session.data });
    
    console.log(`💳 [PAYMENT] Updated payment method for ${userId}`, {
        method: paymentMethod,
        requiresPhone: requiresPhone
    });
    
    return true;
}

// ============================================================================
// TRANSACTION HISTORY
// Stores recent completed transactions per user
// ============================================================================

/**
 * Archive completed transaction for history
 * Keeps only last 10 transactions per user
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Object} session - Completed session object
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
        paymentMethod: session.data.paymentMethod || null,
        reference: session.data.transactionReference || null,
        timestamp: Date.now(),
        success: session.data.success || false
    });
    
    console.log(`📦 [HISTORY] Archived transaction for ${userId}`, {
        service: session.service,
        reference: session.data.transactionReference
    });
}

/**
 * Get user's recent transaction history
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {number} limit - Maximum number of transactions to return
 * @returns {Array} Recent transactions
 */
function getTransactionHistory(userId, limit = 5) {
    if (!transactionHistory[userId]) return [];
    return transactionHistory[userId].slice(-limit);
}

// ============================================================================
// USER ACTIVITY & RATE LIMITING
// Prevents brute force attempts and manages lockouts
// ============================================================================

/**
 * Track invalid user attempt and apply lockout if threshold reached
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {boolean} True if user is now locked out
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
    
    // Check if already in lockout
    if (activity.lockoutUntil > now) {
        return true;
    }
    
    // Check if outside time window (reset counter)
    if (now - activity.firstAttempt > RATE_LIMIT_CONFIG.windowMs) {
        activity.attempts = 1;
        activity.firstAttempt = now;
    } else {
        activity.attempts += 1;
        
        // Check if threshold exceeded
        if (activity.attempts >= RATE_LIMIT_CONFIG.maxAttempts) {
            activity.lockoutUntil = now + RATE_LIMIT_CONFIG.lockoutDuration;
            const minutes = Math.ceil(RATE_LIMIT_CONFIG.lockoutDuration / 60000);
            console.log(`🔒 [LOCKOUT] User ${userId} locked out for ${minutes} minutes`);
            return true;
        }
    }
    
    return false;
}

/**
 * Reset user activity on successful action
 * 
 * @param {string} userId - WhatsApp user ID
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
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {number} Minutes remaining, 0 if not locked out
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

// ============================================================================
// SESSION UTILITIES
// Helper functions for common session checks
// ============================================================================

/**
 * Check if user is in a specific flow state
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} state - Flow state to check
 * @returns {boolean} True if user is in that state
 */
function isInState(userId, state) {
    const session = getActiveSession(userId);
    return session && session.flow === state;
}

/**
 * Check if user is in a specific service
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} service - Service to check
 * @returns {boolean} True if user is in that service
 */
function isInService(userId, service) {
    const session = getActiveSession(userId);
    return session && session.service === service;
}

/**
 * Get session expiry time in minutes remaining
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {number} Minutes remaining
 */
function getSessionExpiryMinutes(userId) {
    const session = getActiveSession(userId);
    if (!session) return 0;
    
    const now = Date.now();
    const remaining = session.expiresAt - now;
    return Math.max(0, Math.ceil(remaining / 60000));
}

/**
 * Extend session timeout by specified minutes
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {number} minutes - Minutes to extend by
 * @returns {boolean} Success status
 */
function extendSession(userId, minutes = 5) {
    const session = getActiveSession(userId);
    if (!session) return false;
    
    session.expiresAt += (minutes * 60 * 1000);
    return true;
}

// ============================================================================
// CLEANUP FUNCTIONS
// Automated maintenance of in-memory stores
// ============================================================================

/**
 * Clean up expired sessions
 */
function cleanupOldSessions() {
    const now = Date.now();
    let cleanedCount = 0;
    
    Object.keys(sessions).forEach(userId => {
        if (sessions[userId].expiresAt < now) {
            console.log(`🧹 [CLEANUP] Removing expired session for ${userId}`, {
                service: sessions[userId].service
            });
            delete sessions[userId];
            cleanedCount += 1;
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`🧹 [CLEANUP] Removed ${cleanedCount} expired sessions`);
    }
}

/**
 * Clean up old user activity records
 * Removes records older than 1 hour with no lockout
 */
function cleanupUserActivity() {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    let cleanedCount = 0;
    
    Object.keys(userActivity).forEach(userId => {
        const activity = userActivity[userId];
        
        // Remove if no lockout and last activity over hour ago
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
        console.log(`🧹 [CLEANUP] Removed ${cleanedCount} old user activity records`);
    }
}

/**
 * Clean up transactions older than 24 hours
 */
function cleanupOldTransactions() {
    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    let cleanedCount = 0;
    
    Object.keys(transactionHistory).forEach(userId => {
        const originalLength = transactionHistory[userId].length;
        
        transactionHistory[userId] = transactionHistory[userId].filter(t => 
            t.timestamp > dayAgo
        );
        
        if (transactionHistory[userId].length === 0) {
            delete transactionHistory[userId];
            cleanedCount += 1;
        } else if (transactionHistory[userId].length < originalLength) {
            console.log(`🧹 [CLEANUP] Trimmed transaction history for ${userId}`);
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`🧹 [CLEANUP] Removed ${cleanedCount} empty transaction histories`);
    }
}

/**
 * Start automated cleanup intervals
 * Should be called once at server startup
 */
function startCleanupInterval() {
    // Clean up sessions every minute
    setInterval(cleanupOldSessions, SESSION_CONFIG.CLEANUP_INTERVAL || 60000);
    
    // Clean up user activity every 5 minutes
    setInterval(cleanupUserActivity, SESSION_CONFIG.USER_ACTIVITY_CLEANUP_INTERVAL || 300000);
    
    // Clean up transactions every hour
    setInterval(cleanupOldTransactions, 60 * 60 * 1000);
    
    console.log('🔄 [CLEANUP] Session cleanup intervals started');
}

// ============================================================================
// ADMIN & DEBUGGING
// Helper functions for monitoring and troubleshooting
// ============================================================================

/**
 * Get all active sessions (admin use only)
 * 
 * @returns {Object} Map of active sessions with summary data
 */
function getAllActiveSessions() {
    const now = Date.now();
    const active = {};
    
    Object.keys(sessions).forEach(userId => {
        if (sessions[userId].expiresAt > now) {
            active[userId] = {
                service: sessions[userId].service,
                flow: sessions[userId].flow,
                paymentMethod: sessions[userId].data?.paymentMethod || 'Not set',
                requiresPhone: sessions[userId].data?.requiresPhone || false,
                timeRemaining: Math.ceil((sessions[userId].expiresAt - now) / 60000),
                retries: sessions[userId].retries
            };
        }
    });
    
    return active;
}

/**
 * Get session statistics
 * 
 * @returns {Object} Statistics about current sessions
 */
function getSessionStats() {
    const now = Date.now();
    const activeSessions = Object.values(sessions).filter(s => s.expiresAt > now);
    
    const stats = {
        total: Object.keys(sessions).length,
        active: activeSessions.length,
        byService: {},
        byPaymentMethod: {},
        lockedUsers: Object.keys(userActivity).filter(u => 
            userActivity[u].lockoutUntil > now
        ).length
    };
    
    activeSessions.forEach(s => {
        // Count by service
        stats.byService[s.service] = (stats.byService[s.service] || 0) + 1;
        
        // Count by payment method
        const method = s.data?.paymentMethod || 'unknown';
        stats.byPaymentMethod[method] = (stats.byPaymentMethod[method] || 0) + 1;
    });
    
    return stats;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    // Core session management
    getActiveSession,
    createSession,
    updateSession,
    updateSessionStep,
    deleteSession,
    incrementRetries,
    getSessionData,
    updateSessionData,
    
    // Payment method helpers
    requiresPhoneNumber,
    getPaymentMethod,
    setPaymentMethod,
    
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
    
    // Admin & debugging
    getAllActiveSessions,
    getSessionStats,
    
    // Exposed for debugging (use with caution in production)
    _sessions: sessions,
    _transactionHistory: transactionHistory
};
