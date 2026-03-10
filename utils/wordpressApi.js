// utils/wordpressApi.js
// ============================================================================
// WORDPRESS REST API CLIENT
// Handles all communication with WordPress backend for info services
// Uses ?format=whatsapp parameter to get pre-formatted responses
// Provides fallback to sample data when API is unavailable
// ============================================================================

const axios = require('axios');
const { 
    WORDPRESS_CONFIG,           // Use WORDPRESS_CONFIG from constants
    HOT_UPDATES_CONFIG, 
    INFO_SERVICE_STATUS 
} = require('../config/constants');

// ============================================================================
// CONSTANTS
// ============================================================================

const WORDPRESS_URL = WORDPRESS_CONFIG.BASE_URL || 'https://cchub.co.zw/wp-json/cchub/v1';
const API_BASE = WORDPRESS_URL; // WORDPRESS_CONFIG.BASE_URL already includes the full path
const TIMEOUT = WORDPRESS_CONFIG.TIMEOUT || 5000;
const RETRY_ATTEMPTS = WORDPRESS_CONFIG.RETRY_ATTEMPTS || 3;

// Format parameter for WhatsApp-optimized responses
const FORMAT_PARAM = WORDPRESS_CONFIG.PARAMS.FORMAT_WHATSAPP;

// ============================================================================
// AXIOS INSTANCE CONFIGURATION
// ============================================================================

const apiClient = axios.create({
    baseURL: API_BASE,
    timeout: TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CCHub-WhatsApp-Bot/1.0'
    }
});

// Response interceptor for logging
apiClient.interceptors.response.use(
    (response) => {
        console.log(`📡 [WORDPRESS] ${response.config.method.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
    },
    (error) => {
        if (error.response) {
            console.error(`📡 [WORDPRESS] Error Response: ${error.response.status} - ${error.config?.url}`);
        } else if (error.request) {
            console.error(`📡 [WORDPRESS] No Response: ${error.config?.url}`);
        } else {
            console.error(`📡 [WORDPRESS] Request Error: ${error.message}`);
        }
        return Promise.reject(error);
    }
);

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Execute API call with retry logic
 * 
 * @param {Function} apiCall - API call function
 * @param {number} attempts - Remaining attempts
 * @returns {Promise} API response
 */
async function withRetry(apiCall, attempts = RETRY_ATTEMPTS) {
    try {
        return await apiCall();
    } catch (error) {
        if (attempts <= 1) throw error;
        
        console.log(`📡 [WORDPRESS] Retrying... (${attempts-1} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return withRetry(apiCall, attempts - 1);
    }
}

// ============================================================================
// EPL SOCCER UPDATES
// ============================================================================

/**
 * Fetch EPL soccer updates from WordPress
 * Uses ?format=whatsapp to get pre-formatted text
 * 
 * @returns {Promise<Object>} EPL data with formatted field
 */
async function fetchEplUpdates() {
    try {
        const response = await withRetry(() => 
            apiClient.get(`${WORDPRESS_CONFIG.ENDPOINTS.EPL}?${FORMAT_PARAM}`)
        );
        
        return response.data;
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch EPL updates:`, error.message);
        // Return empty object with fallback flag
        return { 
            usedFallback: true,
            standings: [],
            fixtures: [],
            results: [],
            topScorers: []
        };
    }
}

// ============================================================================
// ZIMBABWE NEWS UPDATES
// ============================================================================

/**
 * Fetch Zimbabwe news updates from WordPress
 * Uses ?format=whatsapp to get pre-formatted text
 * 
 * @param {string} category - Optional category filter
 * @returns {Promise<Object>} News data with formatted field
 */
async function fetchNewsUpdates(category = null) {
    let endpoint = WORDPRESS_CONFIG.ENDPOINTS.NEWS;
    
    if (category) {
        endpoint += `?${WORDPRESS_CONFIG.PARAMS.CATEGORY}=${encodeURIComponent(category)}&${FORMAT_PARAM}`;
    } else {
        endpoint += `?${FORMAT_PARAM}`;
    }
    
    console.log(`📡 [WORDPRESS] Fetching news updates from ${API_BASE}${endpoint}`);
    
    try {
        const response = await withRetry(() => apiClient.get(endpoint));
        
        // WordPress returns formatted text ready to send
        return response.data;
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch news updates:`, error.message);
        throw error;
    }
}

// ============================================================================
// WEATHER FORECASTS
// ============================================================================

/**
 * Fetch weather forecast for a specific location
 * Uses ?format=whatsapp to get pre-formatted text
 * 
 * @param {string} locationId - Location ID (e.g., 'harare', 'victoria_falls')
 * @returns {Promise<Object>} Weather data with formatted field
 */
async function fetchWeatherForecast(locationId) {
    const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.WEATHER_SINGLE(locationId)}?${FORMAT_PARAM}`;
    console.log(`📡 [WORDPRESS] Fetching weather for ${locationId} from ${API_BASE}${endpoint}`);
    
    try {
        const response = await withRetry(() => apiClient.get(endpoint));
        
        // WordPress returns formatted text ready to send
        return response.data;
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch weather for ${locationId}:`, error.message);
        throw error;
    }
}

// ============================================================================
// GENERIC API FETCH WITH FALLBACK
// ============================================================================

/**
 * Generic API fetch with built-in fallback
 * 
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @param {Function} fallbackFn - Fallback function to call on error
 * @returns {Promise<Object>} Response data
 */
async function fetchWithFallback(endpoint, options = {}, fallbackFn = null) {
    try {
        // Ensure format=whatsapp is included
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${endpoint}${separator}${FORMAT_PARAM}`;
        
        const response = await withRetry(() => apiClient.get(url, options));
        return response.data;
        
    } catch (error) {
        console.warn(`📡 [WORDPRESS] Falling back for ${endpoint}`);
        
        if (fallbackFn && typeof fallbackFn === 'function') {
            return fallbackFn();
        }
        
        throw error;
    }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Check WordPress API health using test endpoint
 * 
 * @returns {Promise<Object>} Health status
 */
async function checkHealth() {
    console.log(`📡 [WORDPRESS] Running health check on ${API_BASE}`);
    
    try {
        const start = Date.now();
        const response = await apiClient.get(WORDPRESS_CONFIG.ENDPOINTS.TEST, { timeout: 3000 });
        
        return {
            status: 'online',
            url: WORDPRESS_URL,
            responseTime: Date.now() - start,
            timestamp: new Date().toISOString(),
            data: response.data
        };
        
    } catch (error) {
        return {
            status: 'offline',
            url: WORDPRESS_URL,
            error: error.code || error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// ============================================================================
// STATUS CHECK
// ============================================================================

/**
 * Get configured service status from constants
 * 
 * @returns {Object} Service status information
 */
function getServiceStatus() {
    return {
        epl: INFO_SERVICE_STATUS.EPL,
        news: INFO_SERVICE_STATUS.NEWS,
        weather: INFO_SERVICE_STATUS.WEATHER,
        wordpressUrl: WORDPRESS_URL,
        endpoints: {
            epl: `${API_BASE}${WORDPRESS_CONFIG.ENDPOINTS.EPL}`,
            news: `${API_BASE}${WORDPRESS_CONFIG.ENDPOINTS.NEWS}`,
            weather: `${API_BASE}/weather/{location}`
        },
        formatParam: FORMAT_PARAM
    };
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    // Core API functions
    fetchEplUpdates,
    fetchNewsUpdates,
    fetchWeatherForecast,
    
    // Utilities
    fetchWithFallback,
    checkHealth,
    getServiceStatus,
    
    // Configuration
    WORDPRESS_URL: API_BASE,
    API_BASE,
    TIMEOUT
};