// services/zeraService.js
// ============================================================================
// ZERA FUEL PRICES SERVICE
// Fetches fuel and energy prices from WordPress REST API
// Displays petrol, diesel, electricity, and LPG prices
// ============================================================================

const axios = require('axios');
const { HOT_UPDATES_CONFIG, SERVICE_TYPES } = require('../config/constants');

// ============================================================================
// SERVICE CONFIGURATION
// ============================================================================

const ZERA_CONFIG = {
    // WordPress REST API endpoint for ZERA prices
    API_URL: process.env.WORDPRESS_URL || 'https://cchub.co.zw',
    ENDPOINT: '/wp-json/cchub/v1/zera',
    TIMEOUT: 15000,
    RETRY_ATTEMPTS: 2,
    
    // Cache duration (milliseconds)
    CACHE_TTL: 30 * 60 * 1000, // 30 minutes
    
    // User session tracking for rate limiting
    USER_LIMIT: 5, // Max requests per user per hour
    USER_LIMIT_WINDOW: 60 * 60 * 1000 // 1 hour
};

// In-memory cache for prices (optional, WordPress handles caching too)
let priceCache = {
    data: null,
    timestamp: null
};

// Rate limiting tracking
const userRequests = new Map();

// ============================================================================
// CORE SERVICE FUNCTIONS
// ============================================================================

/**
 * Get ZERA fuel prices from WordPress API
 * 
 * @param {string} userId - WhatsApp user ID (for rate limiting)
 * @returns {Promise<Object>} Response with formatted message
 */
async function getZeraPrices(userId) {
    console.log(`⛽ [ZERA] Fetching fuel prices for ${userId || 'anonymous'}`);
    
    // Check rate limit
    if (userId && !checkRateLimit(userId)) {
        return {
            success: false,
            message: `⛽ *ZERA Fuel Prices* ⛽\n\n` +
                     `*Rate Limit Exceeded*\n\n` +
                     `You've made too many requests. Please wait a few minutes and try again.\n\n` +
                     `_Send *hi* to return to main menu_`,
            error: 'rate_limit_exceeded'
        };
    }
    
    try {
        // Build API URL
        const apiUrl = `${ZERA_CONFIG.API_URL}${ZERA_CONFIG.ENDPOINT}?format=whatsapp`;
        
        console.log(`⛽ [ZERA] Fetching from: ${apiUrl}`);
        
        // Make request with timeout
        const response = await axios.get(apiUrl, {
            timeout: ZERA_CONFIG.TIMEOUT,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'CCHub-WhatsApp-Bot/1.0'
            }
        });
        
        // Check response
        if (response.data && response.data.success) {
            const formattedData = response.data.data;
            
            // Update cache
            priceCache = {
                data: formattedData,
                timestamp: Date.now()
            };
            
            console.log(`✅ [ZERA] Successfully fetched prices`);
            
            return {
                success: true,
                message: formattedData,
                raw: response.data.raw_data
            };
        } else if (response.data && response.data.data) {
            // Handle case where response is directly the formatted data
            priceCache = {
                data: response.data.data,
                timestamp: Date.now()
            };
            
            return {
                success: true,
                message: response.data.data,
                raw: response.data.raw_data
            };
        } else {
            console.error(`❌ [ZERA] Invalid response format:`, response.data);
            return {
                success: false,
                message: getUnavailableMessage(),
                error: 'invalid_response'
            };
        }
        
    } catch (error) {
        console.error(`❌ [ZERA] Error fetching prices:`, error.message);
        
        // Check if it's a timeout
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            console.error(`⛽ [ZERA] Request timeout`);
            return {
                success: false,
                message: getTimeoutMessage(),
                error: 'timeout'
            };
        }
        
        // Check if it's a network error
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.error(`⛽ [ZERA] Network error - cannot reach WordPress`);
            return {
                success: false,
                message: getNetworkErrorMessage(),
                error: 'network_error'
            };
        }
        
        // Check HTTP status
        if (error.response) {
            console.error(`⛽ [ZERA] HTTP ${error.response.status}: ${error.response.statusText}`);
            
            if (error.response.status === 404) {
                return {
                    success: false,
                    message: getNotFoundMessage(),
                    error: 'not_found'
                };
            }
            
            if (error.response.status === 500) {
                return {
                    success: false,
                    message: getServerErrorMessage(),
                    error: 'server_error'
                };
            }
        }
        
        // Return cached data if available
        if (priceCache.data && (Date.now() - priceCache.timestamp) < ZERA_CONFIG.CACHE_TTL) {
            console.log(`⛽ [ZERA] Returning cached data (age: ${Math.floor((Date.now() - priceCache.timestamp) / 1000)}s)`);
            return {
                success: true,
                message: priceCache.data + '\n\n⚠️ *Note:* Using cached data. Website may be temporarily unavailable.',
                cached: true
            };
        }
        
        // No cache available, return error message
        return {
            success: false,
            message: getUnavailableMessage(),
            error: error.message
        };
    }
}

/**
 * Get ZERA prices formatted for display
 * Alias for getZeraPrices for consistency with other services
 */
async function getZeraInfo(userId) {
    return await getZeraPrices(userId);
}

// ============================================================================
// MESSAGE FORMATTING FUNCTIONS
// ============================================================================

/**
 * Get message for service unavailable
 */
function getUnavailableMessage() {
    return `⛽ *ZERA FUEL & ENERGY PRICES* ⛽\n\n` +
           `*Service Temporarily Unavailable*\n\n` +
           `Unable to fetch current prices from ZERA website at this time.\n\n` +
           `Possible reasons:\n` +
           `• Website may be down for maintenance\n` +
           `• Network connectivity issues\n` +
           `• The service is temporarily offline\n\n` +
           `Please try again in a few minutes.\n\n` +
           `_Send *hi* to return to main menu_`;
}

/**
 * Get message for timeout
 */
function getTimeoutMessage() {
    return `⛽ *ZERA FUEL & ENERGY PRICES* ⛽\n\n` +
           `*Request Timeout*\n\n` +
           `The price update is taking longer than expected.\n\n` +
           `Please try again in a moment.\n\n` +
           `_Send *hi* to return to main menu_`;
}

/**
 * Get message for network error
 */
function getNetworkErrorMessage() {
    return `⛽ *ZERA FUEL & ENERGY PRICES* ⛽\n\n` +
           `*Network Error*\n\n` +
           `Cannot connect to the price service at this time.\n\n` +
           `Please check your internet connection and try again.\n\n` +
           `_Send *hi* to return to main menu_`;
}

/**
 * Get message for 404 not found
 */
function getNotFoundMessage() {
    return `⛽ *ZERA FUEL & ENERGY PRICES* ⛽\n\n` +
           `*Service Not Found*\n\n` +
           `The price service endpoint is temporarily unavailable.\n\n` +
           `Please try again later.\n\n` +
           `_Send *hi* to return to main menu_`;
}

/**
 * Get message for server error
 */
function getServerErrorMessage() {
    return `⛽ *ZERA FUEL & ENERGY PRICES* ⛽\n\n` +
           `*Server Error*\n\n` +
           `The price service is experiencing technical difficulties.\n\n` +
           `Our team has been notified. Please try again later.\n\n` +
           `_Send *hi* to return to main menu_`;
}

// ============================================================================
// RATE LIMITING FUNCTIONS
// ============================================================================

/**
 * Check if user has exceeded rate limit
 * 
 * @param {string} userId - User identifier
 * @returns {boolean} True if within limit, false if exceeded
 */
function checkRateLimit(userId) {
    const now = Date.now();
    const userData = userRequests.get(userId);
    
    if (!userData) {
        // First request, create entry
        userRequests.set(userId, {
            count: 1,
            timestamp: now
        });
        return true;
    }
    
    // Check if window has expired
    if (now - userData.timestamp > ZERA_CONFIG.USER_LIMIT_WINDOW) {
        // Reset window
        userRequests.set(userId, {
            count: 1,
            timestamp: now
        });
        return true;
    }
    
    // Check count
    if (userData.count >= ZERA_CONFIG.USER_LIMIT) {
        return false;
    }
    
    // Increment count
    userData.count++;
    userRequests.set(userId, userData);
    return true;
}

/**
 * Clean up old rate limit entries (call periodically)
 */
function cleanupRateLimits() {
    const now = Date.now();
    for (const [userId, data] of userRequests.entries()) {
        if (now - data.timestamp > ZERA_CONFIG.USER_LIMIT_WINDOW) {
            userRequests.delete(userId);
        }
    }
}

// Run cleanup every hour
setInterval(cleanupRateLimits, 60 * 60 * 1000);

// ============================================================================
// SERVICE HANDLER FOR MESSAGE ROUTER
// ============================================================================

/**
 * Main handler for ZERA service
 * Called from messageHandler when user selects ZERA
 * 
 * @param {Object} userSession - User's session data
 * @returns {Promise<Object>} Response object with message and next action
 */
async function handleZeraService(userSession) {
    const userId = userSession.userId;
    
    console.log(`⛽ [ZERA] Handling ZERA service request for ${userId}`);
    
    const result = await getZeraPrices(userId);
    
    if (result.success) {
        return {
            type: 'text',
            message: result.message,
            nextAction: 'mainMenu'  // Return to main menu after displaying prices
        };
    } else {
        return {
            type: 'text',
            message: result.message,
            nextAction: 'mainMenu'
        };
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get service status
 * 
 * @returns {Promise<Object>} Status information
 */
async function getServiceStatus() {
    try {
        const apiUrl = `${ZERA_CONFIG.API_URL}${ZERA_CONFIG.ENDPOINT}?format=json`;
        
        const response = await axios.get(apiUrl, {
            timeout: 5000
        });
        
        if (response.data && response.data.success) {
            return {
                available: true,
                lastUpdate: response.data.raw_data?.last_updated || 'Unknown',
                source: response.data.raw_data?.source || 'ZERA Official',
                message: '✅ ZERA service is operational'
            };
        }
        
        return {
            available: false,
            message: '⚠️ ZERA service is responding but data format is invalid'
        };
        
    } catch (error) {
        return {
            available: false,
            message: `❌ ZERA service unavailable: ${error.message}`,
            error: error.message
        };
    }
}

/**
 * Clear price cache (useful for manual refresh)
 */
function clearCache() {
    priceCache = {
        data: null,
        timestamp: null
    };
    console.log(`⛽ [ZERA] Cache cleared`);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Main handler
    handleZeraService,
    getZeraPrices,
    getZeraInfo,
    
    // Utility functions
    getServiceStatus,
    clearCache,
    
    // Service type constant for routing
    SERVICE_TYPE: SERVICE_TYPES.HOT_UPDATES
};