// utils/wordpressApi.js - COMPLETE UPDATED VERSION WITH ZERA
// ============================================================================
// WORDPRESS REST API CLIENT
// Handles all communication with WordPress backend for info services
// Uses ?format=whatsapp parameter to get pre-formatted responses
// Provides fallback to sample data when API is unavailable
// NOW WITH: Specific EPL endpoints for table, fixtures, results, top scorers
// AND: ZERA fuel prices endpoint
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
 * Generic EPL data fetcher
 * 
 * @param {string} endpoint - API endpoint (e.g., '/epl/standings?format=whatsapp')
 * @returns {Promise<Object>} EPL data
 */
async function fetchEplData(endpoint) {
    // Ensure endpoint starts with /
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    // Ensure format parameter is included
    const finalEndpoint = cleanEndpoint.includes('?') 
        ? cleanEndpoint 
        : `${cleanEndpoint}?${FORMAT_PARAM}`;
    
    console.log(`📡 [WORDPRESS] Fetching EPL data from ${finalEndpoint}`);
    
    try {
        const response = await withRetry(() => apiClient.get(finalEndpoint));
        
        // WordPress returns formatted text ready to send
        return {
            formatted: response.data,
            raw: response.data,
            usedFallback: false
        };
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch EPL data from ${finalEndpoint}:`, error.message);
        
        // Return fallback based on endpoint type
        return {
            formatted: getEplFallbackByEndpoint(endpoint),
            usedFallback: true,
            error: error.message
        };
    }
}

/**
 * Get fallback data based on endpoint
 * 
 * @param {string} endpoint - API endpoint
 * @returns {string} Fallback formatted message
 */
function getEplFallbackByEndpoint(endpoint) {
    if (endpoint.includes('standings') || endpoint.includes('table')) {
        return `⚽ *EPL LEAGUE TABLE (Sample Data)*\n\n` +
               `1. Arsenal - 25pts\n` +
               `2. Man City - 24pts\n` +
               `3. Liverpool - 23pts\n` +
               `4. Chelsea - 21pts\n` +
               `5. Tottenham - 20pts\n` +
               `6. Man Utd - 18pts\n` +
               `7. Newcastle - 17pts\n` +
               `8. Brighton - 16pts`;
    }
    
    if (endpoint.includes('fixtures')) {
        return `⚽ *UPCOMING FIXTURES (Sample Data)*\n\n` +
               `*Saturday 20 March*\n` +
               `15:00 Arsenal vs Chelsea\n` +
               `15:00 Everton vs West Ham\n` +
               `17:30 Man City vs Tottenham\n\n` +
               `*Sunday 21 March*\n` +
               `14:00 Liverpool vs Man Utd\n` +
               `16:30 Chelsea vs Arsenal\n\n` +
               `*Monday 22 March*\n` +
               `20:00 Newcastle vs Brighton`;
    }
    
    if (endpoint.includes('results')) {
        return `⚽ *RECENT RESULTS (Sample Data)*\n\n` +
               `*Last Round*\n` +
               `Arsenal 2-1 Liverpool\n` +
               `Man City 3-0 Chelsea\n` +
               `Tottenham 1-1 Man Utd\n` +
               `Newcastle 0-2 Brighton\n` +
               `Everton 2-2 West Ham\n` +
               `Aston Villa 1-0 Brentford`;
    }
    
    if (endpoint.includes('top') || endpoint.includes('scorers')) {
        return `⚽ *TOP SCORERS (Sample Data)*\n\n` +
               `1. Erling Haaland (MCI) - 18 goals\n` +
               `2. Mohamed Salah (LIV) - 15 goals\n` +
               `3. Cole Palmer (CHE) - 12 goals\n` +
               `4. Ollie Watkins (AVL) - 11 goals\n` +
               `5. Alexander Isak (NEW) - 10 goals\n` +
               `6. Bukayo Saka (ARS) - 9 goals\n` +
               `7. Son Heung-min (TOT) - 8 goals`;
    }
    
    // Default fallback
    return `⚽ *EPL SOCCER UPDATES (Sample Data)*\n\n` +
           `*Standings:* Arsenal lead by 1 point\n` +
           `*Next Match:* Arsenal vs Chelsea - Sat 15:00\n` +
           `*Top Scorer:* Haaland (18 goals)`;
}

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
        
        return {
            formatted: response.data,
            raw: response.data
        };
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch EPL updates:`, error.message);
        return { 
            usedFallback: true,
            formatted: HOT_UPDATES_CONFIG.SAMPLE_DATA.EPL,
            standings: [],
            fixtures: [],
            results: [],
            topScorers: []
        };
    }
}

/**
 * Fetch EPL fixtures with date range
 * 
 * @param {string} dateFrom - Start date (YYYY-MM-DD)
 * @param {string} dateTo - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} EPL fixtures
 */
async function fetchEplFixtures(dateFrom = null, dateTo = null) {
    try {
        const today = dateFrom || new Date().toISOString().split('T')[0];
        const futureDate = dateTo || (() => {
            const date = new Date();
            date.setDate(date.getDate() + 14);
            return date.toISOString().split('T')[0];
        })();
        
        const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.EPL_FIXTURES || '/epl/fixtures'}?${FORMAT_PARAM}&date_from=${today}&date_to=${futureDate}`;
        
        console.log(`📡 [WORDPRESS] Fetching EPL fixtures from ${today} to ${futureDate}`);
        
        const response = await withRetry(() => apiClient.get(endpoint));
        return {
            formatted: response.data,
            fixtures: response.data
        };
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch EPL fixtures:`, error.message);
        return { 
            usedFallback: true,
            formatted: getEplFallbackByEndpoint('fixtures'),
            fixtures: []
        };
    }
}

/**
 * Fetch EPL standings
 * 
 * @returns {Promise<Object>} EPL standings
 */
async function fetchEplStandings() {
    try {
        const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.EPL_STANDINGS || '/epl/standings'}?${FORMAT_PARAM}`;
        const response = await withRetry(() => apiClient.get(endpoint));
        return {
            formatted: response.data,
            standings: response.data
        };
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch EPL standings:`, error.message);
        return { 
            usedFallback: true, 
            formatted: getEplFallbackByEndpoint('standings'),
            standings: [] 
        };
    }
}

/**
 * Fetch EPL results
 * 
 * @param {number} limit - Number of results to fetch
 * @returns {Promise<Object>} EPL results
 */
async function fetchEplResults(limit = 10) {
    try {
        const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.EPL_RESULTS || '/epl/results'}?${FORMAT_PARAM}&limit=${limit}`;
        const response = await withRetry(() => apiClient.get(endpoint));
        return {
            formatted: response.data,
            results: response.data
        };
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch EPL results:`, error.message);
        return { 
            usedFallback: true, 
            formatted: getEplFallbackByEndpoint('results'),
            results: [] 
        };
    }
}

/**
 * Fetch EPL top scorers
 * 
 * @param {number} limit - Number of top scorers to fetch
 * @returns {Promise<Object>} EPL top scorers
 */
async function fetchEplTopScorers(limit = 10) {
    try {
        const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.EPL_TOP_SCORERS || '/epl/top_scorers'}?${FORMAT_PARAM}&limit=${limit}`;
        const response = await withRetry(() => apiClient.get(endpoint));
        return {
            formatted: response.data,
            topScorers: response.data
        };
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch EPL top scorers:`, error.message);
        return { 
            usedFallback: true, 
            formatted: getEplFallbackByEndpoint('top_scorers'),
            topScorers: [] 
        };
    }
}

// ============================================================================
// ZIMBABWE NEWS UPDATES
// ============================================================================

/**
 * Fetch Zimbabwe news updates from WordPress
 * 
 * @param {string} category - Optional category filter
 * @param {number} limit - Number of headlines to fetch
 * @returns {Promise<Object>} News data
 */
async function fetchNewsUpdates(category = null, limit = 50) {
    let endpoint = WORDPRESS_CONFIG.ENDPOINTS.NEWS;
    
    let params = [];
    params.push(FORMAT_PARAM);
    params.push(`limit=${limit}`);
    
    if (category) {
        params.push(`${WORDPRESS_CONFIG.PARAMS.CATEGORY}=${encodeURIComponent(category)}`);
    }
    
    endpoint += `?${params.join('&')}`;
    
    console.log(`📡 [WORDPRESS] Fetching news updates from ${API_BASE}${endpoint}`);
    
    try {
        const response = await withRetry(() => apiClient.get(endpoint));
        return response.data;
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch news updates:`, error.message);
        throw error;
    }
}

/**
 * Fetch a single news article by ID
 * 
 * @param {number} id - News article ID
 * @returns {Promise<Object>} News article data
 */
async function fetchNewsArticle(id) {
    try {
        const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.NEWS_SINGLE(id)}?${FORMAT_PARAM}`;
        const response = await withRetry(() => apiClient.get(endpoint));
        return {
            formatted: response.data,
            article: response.data
        };
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch news article ${id}:`, error.message);
        throw error;
    }
}

/**
 * Fetch news categories
 * 
 * @returns {Promise<Array>} News categories
 */
async function fetchNewsCategories() {
    try {
        const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.NEWS_CATEGORIES}?${FORMAT_PARAM}`;
        const response = await withRetry(() => apiClient.get(endpoint));
        return response.data;
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch news categories:`, error.message);
        return [];
    }
}

// ============================================================================
// WEATHER FORECASTS
// ============================================================================

async function fetchWeatherForecast(locationId) {
    const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.WEATHER_SINGLE(locationId)}?${FORMAT_PARAM}`;
    console.log(`📡 [WORDPRESS] Fetching weather for ${locationId} from ${API_BASE}${endpoint}`);
    
    try {
        const response = await withRetry(() => apiClient.get(endpoint));
        
        // Handle different response formats
        let formatted = null;
        let rawData = null;
        
        // If response is a string, use it directly
        if (typeof response.data === 'string') {
            formatted = response.data;
            rawData = response.data;
        } 
        // If response is an object with formatted property
        else if (response.data && typeof response.data === 'object') {
            // Check for formatted at root level
            if (response.data.formatted && typeof response.data.formatted === 'string') {
                formatted = response.data.formatted;
            }
            // Check for formatted nested in data
            else if (response.data.data && response.data.data.formatted) {
                formatted = response.data.data.formatted;
            }
            // Check for forecast property
            else if (response.data.forecast && typeof response.data.forecast === 'string') {
                formatted = response.data.forecast;
            }
            
            rawData = response.data;
        }
        
        // If we still don't have formatted text, log error
        if (!formatted) {
            console.error(`📡 [WORDPRESS] Could not extract formatted weather data:`, response.data);
            throw new Error('Invalid weather response format');
        }
        
        return {
            formatted: formatted,
            forecast: rawData,
            raw: rawData,
            usedFallback: false
        };
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch weather for ${locationId}:`, error.message);
        throw error;
    }
}

/**
 * Fetch all weather locations
 * 
 * @returns {Promise<Object>} Weather locations data
 */
async function fetchWeatherLocations() {
    try {
        const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.WEATHER_LOCATIONS}?${FORMAT_PARAM}`;
        const response = await withRetry(() => apiClient.get(endpoint));
        return response.data;
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch weather locations:`, error.message);
        return { usedFallback: true, locations: [] };
    }
}

/**
 * Fetch all weather forecasts (all locations)
 * 
 * @returns {Promise<Object>} All weather data
 */
async function fetchAllWeather() {
    try {
        const endpoint = `${WORDPRESS_CONFIG.ENDPOINTS.WEATHER}?${FORMAT_PARAM}`;
        const response = await withRetry(() => apiClient.get(endpoint));
        return {
            formatted: response.data,
            weather: response.data
        };
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch all weather:`, error.message);
        return { usedFallback: true, weather: [] };
    }
}

// ============================================================================
// ZERA FUEL PRICES (NEW)
// ============================================================================

/**
 * Fetch ZERA fuel and energy prices from WordPress
 * 
 * @returns {Promise<Object>} ZERA price data with formatted field
 */
async function fetchZeraPrices() {
    const endpoint = `/zera?${FORMAT_PARAM}`;
    console.log(`📡 [WORDPRESS] Fetching ZERA fuel prices from ${API_BASE}${endpoint}`);
    
    try {
        const response = await withRetry(() => apiClient.get(endpoint));
        
        // Check if response has the expected structure
        if (response.data && response.data.success) {
            return {
                success: true,
                formatted: response.data.data,
                raw: response.data.raw_data,
                usedFallback: false
            };
        } else if (response.data && typeof response.data === 'string') {
            return {
                success: true,
                formatted: response.data,
                usedFallback: false
            };
        } else if (response.data && response.data.data && typeof response.data.data === 'string') {
            return {
                success: true,
                formatted: response.data.data,
                raw: response.data.raw_data,
                usedFallback: false
            };
        } else {
            console.error(`📡 [WORDPRESS] Unexpected ZERA response format:`, response.data);
            return {
                success: false,
                formatted: getZeraFallback(),
                usedFallback: true,
                error: 'invalid_response_format'
            };
        }
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch ZERA prices:`, error.message);
        
        // Return fallback data
        return {
            success: false,
            formatted: getZeraFallback(),
            usedFallback: true,
            error: error.message
        };
    }
}

/**
 * Get ZERA fallback message when API is unavailable
 * 
 * @returns {string} Fallback formatted message
 */
function getZeraFallback() {
    return `⛽ *ZERA FUEL & ENERGY PRICES* ⛽
━━━━━━━━━━━━━━━━━━

🔹 *Petrol Blend (E5)*
   Pending
   Petrol Blend (E5) - 5% ethanol blend

🔸 *Diesel (D50)*
   Pending
   Diesel (D50)

⚡ *Electricity*
   Pending
   Electricity - per 50 units/kWh

🪔 *LPG (Cooking Gas)*
   Pending
   Liquefied Petroleum Gas - per kg

━━━━━━━━━━━━━━━━━━
📅 *Last Updated*: Pending
📡 *Source*: ZERA Official Website
ℹ️ ⚠️ Unable to fetch current prices. Website may be temporarily unavailable.

_Send *hi* to return to main menu_`;
}

// ============================================================================
// CAR LISTINGS (NEW)
// ============================================================================

/**
 * Fetch car listings from WordPress
 * 
 * @param {number} page - Page number for pagination
 * @param {number} limit - Number of listings per page
 * @param {Object} filters - Optional filters (make, location, max_price)
 * @returns {Promise<Object>} Car listings data
 */
async function fetchCarListings(page = 1, limit = 10, filters = {}) {
    const endpoint = `/car-listings`;
    
    let params = [];
    params.push(`page=${page}`);
    params.push(`limit=${limit}`);
    
    if (filters.make) {
        params.push(`make=${encodeURIComponent(filters.make)}`);
    }
    if (filters.location) {
        params.push(`location=${encodeURIComponent(filters.location)}`);
    }
    if (filters.max_price) {
        params.push(`max_price=${filters.max_price}`);
    }
    
    // Request JSON format for bot processing
    params.push(`format=json`);
    
    const url = `${endpoint}?${params.join('&')}`;
    console.log(`📡 [WORDPRESS] Fetching car listings from ${url}`);
    
    try {
        const response = await withRetry(() => apiClient.get(url));
        
        // Return structured data
        return {
            success: true,
            data: response.data.data || [],
            pagination: response.data.pagination || {
                current_page: page,
                total_pages: 1,
                total_listings: 0,
                per_page: limit
            },
            usedFallback: false
        };
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch car listings:`, error.message);
        
        // Return empty data on error
        return {
            success: false,
            data: [],
            pagination: {
                current_page: page,
                total_pages: 0,
                total_listings: 0,
                per_page: limit
            },
            usedFallback: true,
            error: error.message
        };
    }
}

/**
 * Fetch single car listing by ID
 * 
 * @param {number} listingId - Car listing ID
 * @param {string} format - Response format ('json' or 'whatsapp')
 * @returns {Promise<Object>} Single car listing data
 */
async function fetchCarListingById(listingId, format = 'json') {
    const endpoint = `/car-listings/${listingId}`;
    const url = `${endpoint}?format=${format}`;
    console.log(`📡 [WORDPRESS] Fetching car listing ${listingId} from ${url}`);
    
    try {
        const response = await withRetry(() => apiClient.get(url));
        
        if (format === 'whatsapp') {
            // Return formatted text directly
            return {
                success: true,
                formatted: response.data,
                usedFallback: false
            };
        }
        
        // Return JSON data
        return {
            success: true,
            data: response.data.data || response.data,
            usedFallback: false
        };
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch car listing ${listingId}:`, error.message);
        
        // Return error
        return {
            success: false,
            usedFallback: true,
            error: error.message,
            formatted: `⚠️ *Car Listing Unavailable*\n\nThis listing may have expired or been removed.\n\nPlease try browsing again.`
        };
    }
}

/**
 * Get car listings fallback message
 * 
 * @returns {string} Fallback message
 */
function getCarListingsFallback() {
    return `🚗 *Car Listings Unavailable*\n\nUnable to fetch car listings at the moment. Please try again later.\n\nYou can also view listings directly on our website:\nhttps://cchub.co.zw/car-listings`;
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
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${endpoint}${separator}${FORMAT_PARAM}`;
        
        const response = await withRetry(() => apiClient.get(url, options));
        return {
            formatted: response.data,
            data: response.data
        };
        
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
        zera: INFO_SERVICE_STATUS.ZERA,
        wordpressUrl: WORDPRESS_URL,
        endpoints: {
            epl: `${API_BASE}${WORDPRESS_CONFIG.ENDPOINTS.EPL}`,
            eplFixtures: `${API_BASE}${WORDPRESS_CONFIG.ENDPOINTS.EPL_FIXTURES || '/epl/fixtures'}`,
            eplStandings: `${API_BASE}${WORDPRESS_CONFIG.ENDPOINTS.EPL_STANDINGS || '/epl/standings'}`,
            eplResults: `${API_BASE}${WORDPRESS_CONFIG.ENDPOINTS.EPL_RESULTS || '/epl/results'}`,
            eplTopScorers: `${API_BASE}${WORDPRESS_CONFIG.ENDPOINTS.EPL_TOP_SCORERS || '/epl/top_scorers'}`,
            news: `${API_BASE}${WORDPRESS_CONFIG.ENDPOINTS.NEWS}`,
            weather: `${API_BASE}${WORDPRESS_CONFIG.ENDPOINTS.WEATHER}`,
            zera: `${API_BASE}/zera?${FORMAT_PARAM}`
        },
        formatParam: FORMAT_PARAM
    };
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    // EPL functions
    fetchEplData,
    fetchEplUpdates,
    fetchEplFixtures,
    fetchEplStandings,
    fetchEplResults,
    fetchEplTopScorers,
    
    // News functions
    fetchNewsUpdates,
    fetchNewsArticle,
    fetchNewsCategories,
    
    // Weather functions
    fetchWeatherForecast,
    fetchWeatherLocations,
    fetchAllWeather,
    
    // ZERA functions (NEW)
    fetchZeraPrices,

    // Car Listings functions (NEW)
    fetchCarListings,
    fetchCarListingById,
    getCarListingsFallback,
    
    // Utilities
    fetchWithFallback,
    checkHealth,
    getServiceStatus,
    
    // Configuration
    WORDPRESS_URL: API_BASE,
    API_BASE,
    TIMEOUT
};