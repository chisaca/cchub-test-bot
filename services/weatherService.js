// services/weatherService.js
// ============================================================================
// WEATHER FORECAST SERVICE
// Provides 5-day weather forecasts for Zimbabwean cities and holiday resorts
// Fetches data from WordPress REST API with fallback to sample data
// Supports 24 specific locations across Zimbabwe
// ============================================================================

const messaging = require('../utils/messaging');
const wordpressApi = require('../utils/wordpressApi');
const { 
    HOT_UPDATES_CONFIG, 
    UI_MESSAGES,
    WORDPRESS_CONFIG,        // ADD THIS
    INFO_SERVICE_MESSAGES    // ADD THIS
} = require('../config/constants');

// ============================================================================
// CONSTANTS
// ============================================================================

// Use TTL from WORDPRESS_CONFIG
const CACHE_TTL = WORDPRESS_CONFIG.CACHE_TTL.WEATHER * 1000; // Convert seconds to ms
const cache = {
    data: {}, // Store by location ID
    timestamp: {}
};

// Weather condition emoji mapping
const WEATHER_EMOJIS = {
    'sunny': '☀️',
    'clear': '☀️',
    'partly cloudy': '⛅',
    'cloudy': '☁️',
    'overcast': '☁️',
    'rain': '🌧️',
    'light rain': '🌦️',
    'heavy rain': '🌧️',
    'showers': '🌦️',
    'storm': '⛈️',
    'thunder': '⛈️',
    'thunderstorm': '⛈️',
    'fog': '🌫️',
    'mist': '🌫️',
    'wind': '💨',
    'windy': '💨',
    'default': '🌡️'
};

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Fetch and return weather forecast for a specific location
 * Can be called directly or through the main hotUpdates service
 * 
 * @param {string} userId - WhatsApp user ID (optional, for logging)
 * @param {string} locationId - Location ID from WEATHER_LOCATIONS config
 * @param {boolean} sendMessage - Whether to send message directly or return formatted string
 * @returns {Promise<string|Object>} Formatted weather data or message result
 */
async function getWeatherForecast(userId = null, locationId, sendMessage = false) {
    console.log(`🌦️ [WEATHER] Fetching forecast for ${locationId}${userId ? ` for ${userId}` : ''}`);
    
    // Get location details from config
    const location = getLocationById(locationId);
    if (!location) {
        console.error(`🌦️ [WEATHER] Invalid location ID: ${locationId}`);
        const errorMessage = `❌ Location not found. Please try again.\n\n${UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT}`;
        
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, errorMessage);
            return { success: false, error: 'Invalid location' };
        }
        return errorMessage;
    }
    
    try {
        // Send loading message if sending directly
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, INFO_SERVICE_MESSAGES.LOADING);
        }
        
        // Try to fetch from WordPress API
        const data = await fetchWeatherData(locationId, location);
        
        // Format the response (WordPress already formats with ?format=whatsapp)
        const formattedForecast = data.formatted || formatWeatherResponse(data, location);
        
        // Use the weather result template from constants
        const fullMessage = UI_MESSAGES.HOT_UPDATES.WEATHER_RESULT(location, formattedForecast);
        
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, fullMessage);
            return { success: true };
        }
        
        return fullMessage;
        
    } catch (error) {
        console.error(`🌦️ [WEATHER] Error fetching weather data:`, error.message);
        
        // Fallback to sample data
        const sampleForecast = getSampleForecast(locationId, location.name);
        const fallbackMessage = UI_MESSAGES.HOT_UPDATES.WEATHER_RESULT(location, sampleForecast);
        
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, fallbackMessage);
            return { success: true, usedFallback: true };
        }
        
        return fallbackMessage;
    }
}

/**
 * Fetch weather data from API with caching
 * 
 * @param {string} locationId - Location ID
 * @param {Object} location - Location details with coordinates
 * @returns {Promise<Object>} Weather data
 */
async function fetchWeatherData(locationId, location) {
    // Check cache first
    if (cache.data[locationId] && 
        cache.timestamp[locationId] && 
        (Date.now() - cache.timestamp[locationId] < CACHE_TTL)) {
        console.log(`🌦️ [WEATHER] Returning cached data for ${locationId} (${Math.round((Date.now() - cache.timestamp[locationId]) / 1000)}s old)`);
        return cache.data[locationId];
    }
    
    // Fetch fresh data
    console.log(`🌦️ [WEATHER] Fetching fresh data for ${location.name} (${locationId})`);
    
    try {
        const data = await wordpressApi.fetchWeatherForecast(locationId);
        
        // Update cache
        cache.data[locationId] = data;
        cache.timestamp[locationId] = Date.now();
        
        return data;
    } catch (error) {
        console.log(`🌦️ [WEATHER] WordPress API failed:`, error.message);
        throw error; // Let the caller handle fallback
    }
}

// ============================================================================
// RESPONSE FORMATTER (Fallback only - WordPress does main formatting)
// ============================================================================

/**
 * Format weather data into readable WhatsApp message
 * This is only used when WordPress doesn't return formatted data
 * 
 * @param {Object} data - Weather data from API
 * @param {Object} location - Location details
 * @returns {string} Formatted forecast
 */
function formatWeatherResponse(data, location) {
    // If WordPress already formatted it, return as-is
    if (data && data.formatted) {
        return data.formatted;
    }
    
    if (!data) {
        return getSampleForecast(location.id, location.name);
    }
    
    try {
        let forecast = '';
        
        // ====================================================================
        // 5-DAY FORECAST
        // ====================================================================
        if (data.daily && data.daily.length > 0) {
            data.daily.slice(0, 5).forEach((day, index) => {
                const date = new Date(day.date || day.day || Date.now() + (index * 86400000));
                const dayName = date.toLocaleDateString('en-ZW', { weekday: 'short' });
                
                const tempMin = day.temperature_min || day.min_temp || day.all_day?.temperature_min || '--';
                const tempMax = day.temperature_max || day.max_temp || day.all_day?.temperature_max || '--';
                const condition = day.condition || day.summary || day.weather || 'Unknown';
                const emoji = getWeatherEmoji(condition);
                
                forecast += `${dayName}: ${emoji} ${tempMin}°C - ${tempMax}°C\n`;
                if (index === 0) {
                    forecast += `   ${condition}\n`;
                }
            });
        }
        
        return forecast || getSampleForecast(location.id, location.name);
        
    } catch (error) {
        console.error(`🌦️ [WEATHER] Error formatting response:`, error);
        return getSampleForecast(location.id, location.name);
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get location object by ID
 * 
 * @param {string} locationId - Location ID
 * @returns {Object|null} Location object or null
 */
function getLocationById(locationId) {
    const locations = HOT_UPDATES_CONFIG.WEATHER_LOCATIONS;
    
    // Find by direct key match
    for (const [key, location] of Object.entries(locations)) {
        if (location.id === locationId || key === locationId) {
            return {
                ...location,
                key: key
            };
        }
    }
    
    return null;
}

/**
 * Get all available locations
 * 
 * @returns {Array} List of locations with keys
 */
function getAllLocations() {
    const locations = HOT_UPDATES_CONFIG.WEATHER_LOCATIONS;
    return Object.entries(locations).map(([key, location]) => ({
        key,
        ...location
    }));
}

/**
 * Get locations by type (City, Resort, Heritage Site, etc.)
 * 
 * @param {string} type - Location type
 * @returns {Array} Filtered locations
 */
function getLocationsByType(type) {
    const locations = HOT_UPDATES_CONFIG.WEATHER_LOCATIONS;
    return Object.entries(locations)
        .filter(([_, loc]) => loc.type === type)
        .map(([key, loc]) => ({ key, ...loc }));
}

/**
 * Get emoji for weather condition
 * 
 * @param {string} condition - Weather condition
 * @returns {string} Appropriate emoji
 */
function getWeatherEmoji(condition) {
    if (!condition) return WEATHER_EMOJIS.default;
    
    const conditionLower = condition.toLowerCase();
    
    for (const [key, emoji] of Object.entries(WEATHER_EMOJIS)) {
        if (conditionLower.includes(key)) {
            return emoji;
        }
    }
    
    return WEATHER_EMOJIS.default;
}

// ============================================================================
// SAMPLE DATA (Fallback)
// ============================================================================

/**
 * Get sample forecast for a location
 * 
 * @param {string} locationId - Location ID
 * @param {string} locationName - Location name
 * @returns {string} Formatted sample forecast
 */
function getSampleForecast(locationId, locationName) {
    const sampleData = HOT_UPDATES_CONFIG.SAMPLE_DATA.WEATHER;
    
    // If sample is a function (it is in constants), call it with locationId
    if (typeof sampleData === 'function') {
        return sampleData(locationId);
    }
    
    // Location-specific sample forecasts
    const locationSpecific = {
        'victoria_falls': `Today: 32°C ☀️ Hot & Sunny
Tue: 33°C ☀️ Clear skies
Wed: 31°C ⛅ Partly cloudy
Thu: 30°C ☁️ Cloudy
Fri: 31°C ☀️ Sunny`,
        
        'nyanga': `Today: 22°C ☁️ Cool mountain breeze
Tue: 23°C ⛅ Pleasant
Wed: 20°C 🌧️ Light rain
Thu: 21°C ☁️ Misty morning
Fri: 22°C ☀️ Clear`,
        
        'kariba': `Today: 34°C ☀️ Hot
Tue: 35°C ☀️ Very hot
Wed: 33°C ⛅ Partly cloudy
Thu: 32°C ☁️ Cloudy
Fri: 33°C ☀️ Sunny`,
        
        'harare': `Today: 25°C ☀️ Sunny
Tue: 27°C ⛅ Partly cloudy
Wed: 23°C 🌧️ Rain showers
Thu: 24°C ☁️ Cloudy
Fri: 26°C ☀️ Sunny`,
        
        'bulawayo': `Today: 27°C ☀️ Sunny
Tue: 28°C ☀️ Clear
Wed: 26°C ⛅ Partly cloudy
Thu: 25°C ☁️ Cloudy
Fri: 26°C ☀️ Sunny`
    };
    
    if (locationSpecific[locationId]) {
        return locationSpecific[locationId];
    }
    
    // Default forecast for any location
    return `Today: 26°C ☀️ Sunny
Tue: 27°C ⛅ Partly cloudy
Wed: 24°C 🌧️ Rain possible
Thu: 25°C ☁️ Cloudy
Fri: 26°C ☀️ Sunny`;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clear the cache for a specific location or all locations
 * 
 * @param {string} locationId - Optional specific location ID
 */
function clearCache(locationId = null) {
    if (locationId) {
        delete cache.data[locationId];
        delete cache.timestamp[locationId];
        console.log(`🌦️ [WEATHER] Cache cleared for ${locationId}`);
    } else {
        cache.data = {};
        cache.timestamp = {};
        console.log(`🌦️ [WEATHER] All cache cleared`);
    }
}

/**
 * Get cache status for a location or all locations
 * 
 * @param {string} locationId - Optional specific location ID
 * @returns {Object} Cache status
 */
function getCacheStatus(locationId = null) {
    if (locationId) {
        return {
            hasData: !!cache.data[locationId],
            age: cache.timestamp[locationId] ? Date.now() - cache.timestamp[locationId] : null,
            expiresIn: cache.timestamp[locationId] ? (CACHE_TTL - (Date.now() - cache.timestamp[locationId])) : null
        };
    }
    
    const status = {};
    Object.keys(cache.data).forEach(id => {
        status[id] = {
            hasData: true,
            age: Date.now() - cache.timestamp[id],
            expiresIn: CACHE_TTL - (Date.now() - cache.timestamp[id])
        };
    });
    return status;
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    getWeatherForecast,
    fetchWeatherData,
    formatWeatherResponse,
    getAllLocations,
    getLocationsByType,
    getLocationById,
    getWeatherEmoji,
    clearCache,
    getCacheStatus
};