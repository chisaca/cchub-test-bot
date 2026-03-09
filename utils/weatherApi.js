// utils/weatherApi.js
// ============================================================================
// METEOSOURCE WEATHER API CLIENT
// Handles direct communication with Meteosource API for weather forecasts
// Provides fallback to WordPress API and sample data when unavailable
// Designed for future integration when API key is available
// ============================================================================

const axios = require('axios');
const { HOT_UPDATES_CONFIG } = require('../config/constants');

// ============================================================================
// CONSTANTS
// ============================================================================

const METEOSOURCE_CONFIG = HOT_UPDATES_CONFIG.METEOSOURCE || {
    BASE_URL: 'https://api.meteosource.com/v1',
    ENDPOINTS: {
        CURRENT: '/current',
        HOURLY: '/forecast/hourly',
        DAILY: '/forecast/daily',
        LOOKUP: '/find_places'
    },
    UNITS: 'metric',
    LANGUAGE: 'en',
    FORECAST_DAYS: 5
};

const BASE_URL = METEOSOURCE_CONFIG.BASE_URL;
const TIMEOUT = HOT_UPDATES_CONFIG.REQUEST_TIMEOUT || 5000;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Cache storage
const cache = {
    data: {},      // Store by location key
    timestamp: {}  // Store timestamps
};

// ============================================================================
// AXIOS INSTANCE CONFIGURATION
// ============================================================================

const apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'CCHub-WhatsApp-Bot/1.0'
    }
});

// Request interceptor to add API key
apiClient.interceptors.request.use(
    (config) => {
        // Add API key if available from environment
        const apiKey = process.env.METEOSOURCE_API_KEY;
        if (apiKey) {
            config.params = {
                ...config.params,
                key: apiKey
            };
        }
        
        console.log(`🌤️ [METEOSOURCE] Request: ${config.method.toUpperCase()} ${config.url}`, {
            params: config.params ? { ...config.params, key: '[REDACTED]' } : null
        });
        
        return config;
    },
    (error) => {
        console.error(`🌤️ [METEOSOURCE] Request interceptor error:`, error);
        return Promise.reject(error);
    }
);

// Response interceptor for logging
apiClient.interceptors.response.use(
    (response) => {
        console.log(`🌤️ [METEOSOURCE] Response: ${response.config.url} - ${response.status}`);
        return response;
    },
    (error) => {
        if (error.response) {
            // The request was made and the server responded with a status code outside of 2xx
            console.error(`🌤️ [METEOSOURCE] Error Response: ${error.response.status} - ${error.config?.url}`, {
                data: error.response.data,
                status: error.response.status
            });
            
            // Handle specific Meteosource error codes [citation:1]
            if (error.response.data && error.response.data.detail) {
                error.message = `Meteosource API: ${error.response.data.detail}`;
            }
        } else if (error.request) {
            // The request was made but no response was received
            console.error(`🌤️ [METEOSOURCE] No Response: ${error.config?.url}`, {
                message: error.message,
                code: error.code
            });
        } else {
            // Something happened in setting up the request
            console.error(`🌤️ [METEOSOURCE] Request Error: ${error.message}`);
        }
        return Promise.reject(error);
    }
);

// ============================================================================
// LOCATION RESOLUTION
// ============================================================================

/**
 * Find places by name prefix (search as you type)
 * Useful for location autocomplete
 * 
 * @param {string} prefix - Place name prefix to search for
 * @param {string} language - Language for results (default: 'en')
 * @returns {Promise<Array>} List of matching places
 */
async function findPlacesByPrefix(prefix, language = 'en') {
    console.log(`🌤️ [METEOSOURCE] Finding places with prefix: "${prefix}"`);
    
    try {
        const response = await apiClient.get(METEOSOURCE_CONFIG.ENDPOINTS.LOOKUP, {
            params: {
                prefix: prefix,
                language: language
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(`🌤️ [METEOSOURCE] Failed to find places:`, error.message);
        return [];
    }
}

/**
 * Find places by full name
 * More precise than prefix search
 * 
 * @param {string} name - Full place name to search for
 * @param {string} language - Language for results (default: 'en')
 * @returns {Promise<Array>} List of matching places
 */
async function findPlacesByName(name, language = 'en') {
    console.log(`🌤️ [METEOSOURCE] Finding places with name: "${name}"`);
    
    try {
        const response = await apiClient.get('/find_places', {
            params: {
                name: name,
                language: language
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(`🌤️ [METEOSOURCE] Failed to find places:`, error.message);
        return [];
    }
}

// ============================================================================
// WEATHER DATA FETCHING
// ============================================================================

/**
 * Fetch current weather for a location
 * 
 * @param {string|Object} location - place_id OR { lat, lon } object
 * @param {string} language - Language for summaries (default: 'en')
 * @param {string} units - Unit system (metric/us/uk/auto) [citation:1]
 * @returns {Promise<Object>} Current weather data
 */
async function fetchCurrentWeather(location, language = 'en', units = 'metric') {
    const locationParams = resolveLocationParams(location);
    
    console.log(`🌤️ [METEOSOURCE] Fetching current weather for:`, locationParams);
    
    try {
        const response = await apiClient.get(METEOSOURCE_CONFIG.ENDPOINTS.CURRENT, {
            params: {
                ...locationParams,
                language: language,
                units: units,
                timezone: 'auto' // Use local timezone of location [citation:1]
            }
        });
        
        return transformCurrentResponse(response.data);
    } catch (error) {
        console.error(`🌤️ [METEOSOURCE] Failed to fetch current weather:`, error.message);
        throw error;
    }
}

/**
 * Fetch hourly forecast for a location
 * 
 * @param {string|Object} location - place_id OR { lat, lon } object
 * @param {number} hours - Number of hours to forecast (24/48/96/168 based on tier) [citation:1]
 * @param {string} language - Language for summaries
 * @param {string} units - Unit system
 * @returns {Promise<Object>} Hourly forecast data
 */
async function fetchHourlyForecast(location, hours = 24, language = 'en', units = 'metric') {
    const locationParams = resolveLocationParams(location);
    
    console.log(`🌤️ [METEOSOURCE] Fetching ${hours}h forecast for:`, locationParams);
    
    try {
        const response = await apiClient.get(METEOSOURCE_CONFIG.ENDPOINTS.HOURLY, {
            params: {
                ...locationParams,
                hours: hours,
                language: language,
                units: units,
                timezone: 'auto'
            }
        });
        
        return transformHourlyResponse(response.data);
    } catch (error) {
        console.error(`🌤️ [METEOSOURCE] Failed to fetch hourly forecast:`, error.message);
        throw error;
    }
}

/**
 * Fetch daily forecast for a location
 * Main endpoint for our 5-day forecast needs [citation:1]
 * 
 * @param {string|Object} location - place_id OR { lat, lon } object
 * @param {number} days - Number of days to forecast (7/10/30 based on tier)
 * @param {string} language - Language for summaries
 * @param {string} units - Unit system
 * @returns {Promise<Object>} Daily forecast data
 */
async function fetchDailyForecast(location, days = 5, language = 'en', units = 'metric') {
    const locationParams = resolveLocationParams(location);
    
    console.log(`🌤️ [METEOSOURCE] Fetching ${days}-day forecast for:`, locationParams);
    
    // Check cache first
    const cacheKey = generateCacheKey(location, days, language, units);
    if (cache.data[cacheKey] && cache.timestamp[cacheKey] > Date.now() - CACHE_TTL) {
        console.log(`🌤️ [METEOSOURCE] Returning cached forecast (${Math.round((Date.now() - cache.timestamp[cacheKey]) / 1000)}s old)`);
        return cache.data[cacheKey];
    }
    
    try {
        const response = await apiClient.get(METEOSOURCE_CONFIG.ENDPOINTS.DAILY, {
            params: {
                ...locationParams,
                days: days,
                language: language,
                units: units,
                timezone: 'auto',
                sections: 'daily' // Request only daily section for efficiency [citation:1]
            }
        });
        
        const transformed = transformDailyResponse(response.data);
        
        // Store in cache
        cache.data[cacheKey] = transformed;
        cache.timestamp[cacheKey] = Date.now();
        
        return transformed;
    } catch (error) {
        console.error(`🌤️ [METEOSOURCE] Failed to fetch daily forecast:`, error.message);
        throw error;
    }
}

/**
 * Fetch complete weather data (current + daily) in one call
 * Optimized for our use case
 * 
 * @param {string|Object} location - place_id OR { lat, lon } object
 * @param {number} days - Number of days for forecast
 * @param {string} language - Language for summaries
 * @param {string} units - Unit system
 * @returns {Promise<Object>} Complete weather data
 */
async function fetchCompleteWeather(location, days = 5, language = 'en', units = 'metric') {
    const locationParams = resolveLocationParams(location);
    
    console.log(`🌤️ [METEOSOURCE] Fetching complete weather for:`, locationParams);
    
    // Check cache first
    const cacheKey = generateCacheKey(location, days, language, units, 'complete');
    if (cache.data[cacheKey] && cache.timestamp[cacheKey] > Date.now() - CACHE_TTL) {
        console.log(`🌤️ [METEOSOURCE] Returning cached complete data (${Math.round((Date.now() - cache.timestamp[cacheKey]) / 1000)}s old)`);
        return cache.data[cacheKey];
    }
    
    try {
        // Use the point endpoint with multiple sections [citation:1]
        const response = await apiClient.get('/point', {
            params: {
                ...locationParams,
                days: days,
                sections: 'current,daily',
                language: language,
                units: units,
                timezone: 'auto'
            }
        });
        
        const transformed = transformCompleteResponse(response.data);
        
        // Store in cache
        cache.data[cacheKey] = transformed;
        cache.timestamp[cacheKey] = Date.now();
        
        return transformed;
    } catch (error) {
        console.error(`🌤️ [METEOSOURCE] Failed to fetch complete weather:`, error.message);
        throw error;
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Resolve location parameters for API request
 * 
 * @param {string|Object} location - place_id OR { lat, lon } object
 * @returns {Object} API-ready location parameters
 */
function resolveLocationParams(location) {
    if (typeof location === 'string') {
        // It's a place_id
        return { place_id: location };
    } else if (location && typeof location === 'object') {
        // It's { lat, lon }
        const params = {};
        
        if (location.lat !== undefined && location.lon !== undefined) {
            params.lat = formatCoordinate(location.lat);
            params.lon = formatCoordinate(location.lon);
        } else if (location.latitude !== undefined && location.longitude !== undefined) {
            params.lat = formatCoordinate(location.latitude);
            params.lon = formatCoordinate(location.longitude);
        }
        
        return params;
    }
    
    throw new Error('Invalid location format. Use place_id string or { lat, lon } object.');
}

/**
 * Format coordinate for Meteosource API [citation:1]
 * Examples: 12N, 12.3N, 12.3, -13.4
 * 
 * @param {number} coord - Coordinate value
 * @returns {string} Formatted coordinate
 */
function formatCoordinate(coord) {
    if (typeof coord === 'number') {
        return coord.toString();
    }
    return coord;
}

/**
 * Generate cache key for storing responses
 * 
 * @param {...any} parts - Parts to include in cache key
 * @returns {string} Cache key
 */
function generateCacheKey(...parts) {
    return parts.map(part => {
        if (typeof part === 'object') {
            return JSON.stringify(part);
        }
        return String(part);
    }).join('|');
}

// ============================================================================
// RESPONSE TRANSFORMERS
// ============================================================================

/**
 * Transform current weather response to our standard format
 * 
 * @param {Object} data - Raw API response
 * @returns {Object} Transformed current weather
 */
function transformCurrentResponse(data) {
    if (!data) return null;
    
    return {
        temperature: data.temperature,
        feels_like: data.feels_like,
        humidity: data.humidity,
        wind: {
            speed: data.wind?.speed,
            dir: data.wind?.dir,
            angle: data.wind?.angle
        },
        cloud_cover: data.cloud_cover,
        pressure: data.pressure,
        precipitation: {
            total: data.precipitation?.total,
            type: data.precipitation?.type
        },
        uv_index: data.uv_index,
        visibility: data.visibility,
        icon: data.icon,
        icon_num: data.icon_num,
        summary: data.summary,
        timestamp: new Date().toISOString()
    };
}

/**
 * Transform hourly forecast response to our standard format
 * 
 * @param {Object} data - Raw API response
 * @returns {Object} Transformed hourly forecast
 */
function transformHourlyResponse(data) {
    if (!data || !data.data) return { hourly: [] };
    
    return {
        hourly: data.data.map(hour => ({
            date: hour.date,
            temperature: hour.temperature,
            feels_like: hour.feels_like,
            humidity: hour.humidity,
            wind: {
                speed: hour.wind?.speed,
                dir: hour.wind?.dir,
                angle: hour.wind?.angle
            },
            cloud_cover: hour.cloud_cover,
            precipitation: {
                total: hour.precipitation?.total,
                type: hour.precipitation?.type,
                probability: hour.probability?.precipitation
            },
            icon: hour.icon,
            icon_num: hour.icon_num,
            summary: hour.summary
        })),
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Transform daily forecast response to our standard format [citation:4]
 * 
 * @param {Object} data - Raw API response
 * @returns {Object} Transformed daily forecast
 */
function transformDailyResponse(data) {
    if (!data || !data.data) return { daily: [] };
    
    return {
        daily: data.data.map(day => ({
            date: day.day,
            temperature_min: day.all_day?.temperature_min || day.temperature_min,
            temperature_max: day.all_day?.temperature_max || day.temperature_max,
            temperature: day.all_day?.temperature,
            weather: day.weather,
            icon: day.icon,
            icon_num: day.icon_num,
            summary: day.summary,
            wind: {
                speed: day.all_day?.wind?.speed || day.wind?.speed,
                dir: day.all_day?.wind?.dir || day.wind?.dir,
                angle: day.all_day?.wind?.angle || day.wind?.angle
            },
            cloud_cover: day.all_day?.cloud_cover || day.cloud_cover,
            precipitation: {
                total: day.all_day?.precipitation?.total || day.precipitation?.total,
                type: day.all_day?.precipitation?.type || day.precipitation?.type,
                probability: day.probability?.precipitation
            },
            astro: day.astro ? {
                sun: {
                    rise: day.astro.sun?.rise,
                    set: day.astro.sun?.set
                },
                moon: {
                    phase: day.astro.moon?.phase,
                    phase_name: getMoonPhaseName(day.astro.moon?.phase)
                }
            } : null
        })),
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Transform complete weather response (current + daily)
 * 
 * @param {Object} data - Raw API response
 * @returns {Object} Transformed complete weather data
 */
function transformCompleteResponse(data) {
    return {
        location: {
            lat: data.lat,
            lon: data.lon,
            elevation: data.elevation,
            timezone: data.timezone
        },
        current: data.current ? transformCurrentResponse(data.current) : null,
        daily: data.daily ? transformDailyResponse(data.daily) : { daily: [] },
        lastUpdated: new Date().toISOString(),
        source: 'Meteosource API'
    };
}

/**
 * Get moon phase name from phase number [citation:4]
 * 
 * @param {number} phase - Moon phase number (0-3)
 * @returns {string} Moon phase name
 */
function getMoonPhaseName(phase) {
    const phases = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'];
    return phases[phase] || 'Unknown';
}

// ============================================================================
// ICON MAPPING
// ============================================================================

/**
 * Get weather emoji from Meteosource icon number [citation:4]
 * 
 * @param {number} iconNum - Icon number from Meteosource
 * @returns {string} Corresponding emoji
 */
function getWeatherEmojiFromIcon(iconNum) {
    const iconMap = {
        1: '❓', // Not available
        2: '☀️', // Sunny
        3: '🌤️', // Mostly sunny
        4: '⛅', // Partly sunny
        5: '🌥️', // Mostly cloudy
        6: '☁️', // Cloudy
        7: '☁️', // Overcast
        8: '☁️', // Overcast with low clouds
        9: '🌫️', // Fog
        10: '🌦️', // Light rain
        11: '🌧️', // Rain
        12: '🌧️', // Possible rain
        13: '🌦️', // Rain shower
        14: '⛈️', // Thunderstorm
        15: '⛈️', // Local thunderstorms
        16: '❄️', // Light snow
        17: '❄️', // Snow
        18: '❄️', // Possible snow
        19: '🌨️', // Snow shower
        20: '🌨️', // Rain and snow
        21: '🌨️', // Possible rain and snow
        22: '🌨️', // Rain and snow
        23: '🌨️', // Freezing rain
        24: '🌨️', // Possible freezing rain
        25: '🌨️', // Hail
        26: '🌙', // Clear (night)
        27: '🌙', // Mostly clear (night)
        28: '🌙', // Partly clear (night)
        29: '☁️', // Mostly cloudy (night)
        30: '☁️', // Cloudy (night)
        31: '☁️', // Overcast with low clouds (night)
        32: '🌦️', // Rain shower (night)
        33: '⛈️', // Local thunderstorms (night)
        34: '🌨️', // Snow shower (night)
        35: '🌨️', // Rain and snow (night)
        36: '🌨️'  // Possible freezing rain (night)
    };
    
    return iconMap[iconNum] || '🌡️';
}

// ============================================================================
// HEALTH CHECK & STATUS
// ============================================================================

/**
 * Check Meteosource API health
 * 
 * @returns {Promise<Object>} Health status
 */
async function checkHealth() {
    const apiKey = process.env.METEOSOURCE_API_KEY;
    
    if (!apiKey) {
        return {
            status: 'disabled',
            message: 'Meteosource API key not configured',
            timestamp: new Date().toISOString()
        };
    }
    
    try {
        const start = Date.now();
        // Test with a simple location (Harare)
        await apiClient.get('/point', {
            params: {
                place_id: 'harare',
                sections: 'current',
                timeout: 5000
            }
        });
        
        return {
            status: 'online',
            responseTime: Date.now() - start,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            status: 'offline',
            error: error.code || error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Get API configuration status
 * 
 * @returns {Object} Configuration status
 */
function getConfigStatus() {
    return {
        configured: !!process.env.METEOSOURCE_API_KEY,
        baseUrl: BASE_URL,
        units: METEOSOURCE_CONFIG.UNITS,
        language: METEOSOURCE_CONFIG.LANGUAGE,
        forecastDays: METEOSOURCE_CONFIG.FORECAST_DAYS,
        cacheTTL: CACHE_TTL,
        endpoints: METEOSOURCE_CONFIG.ENDPOINTS
    };
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear cache for a specific key or all cache
 * 
 * @param {string} cacheKey - Optional specific cache key to clear
 */
function clearCache(cacheKey = null) {
    if (cacheKey) {
        delete cache.data[cacheKey];
        delete cache.timestamp[cacheKey];
        console.log(`🌤️ [METEOSOURCE] Cache cleared for key: ${cacheKey}`);
    } else {
        cache.data = {};
        cache.timestamp = {};
        console.log(`🌤️ [METEOSOURCE] All cache cleared`);
    }
}

/**
 * Get cache status
 * 
 * @returns {Object} Cache statistics
 */
function getCacheStatus() {
    const keys = Object.keys(cache.data);
    const now = Date.now();
    
    return {
        totalEntries: keys.length,
        entries: keys.reduce((acc, key) => {
            acc[key] = {
                age: Math.round((now - cache.timestamp[key]) / 1000) + 's',
                expiresIn: Math.round((CACHE_TTL - (now - cache.timestamp[key])) / 1000) + 's'
            };
            return acc;
        }, {}),
        cacheTTL: CACHE_TTL
    };
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    // Core API functions
    fetchCurrentWeather,
    fetchHourlyForecast,
    fetchDailyForecast,
    fetchCompleteWeather,
    
    // Location functions
    findPlacesByPrefix,
    findPlacesByName,
    
    // Utility functions
    getWeatherEmojiFromIcon,
    checkHealth,
    getConfigStatus,
    clearCache,
    getCacheStatus,
    
    // Transformers (exposed for testing)
    transformCurrentResponse,
    transformDailyResponse,
    transformCompleteResponse,
    
    // Configuration
    BASE_URL,
    TIMEOUT,
    CACHE_TTL
};