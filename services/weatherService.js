// services/weatherService.js
// ============================================================================
// WEATHER FORECAST SERVICE
// Provides 5-day weather forecasts for Zimbabwean cities and holiday resorts
// Fetches data from WordPress REST API / Meteosource with fallback to sample data
// Supports 24 specific locations across Zimbabwe
// ============================================================================

const messaging = require('../utils/messaging');
const wordpressApi = require('../utils/wordpressApi');
const { 
    HOT_UPDATES_CONFIG, 
    UI_MESSAGES 
} = require('../config/constants');

// ============================================================================
// CONSTANTS
// ============================================================================

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
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
    'snow': '❄️',
    'fog': '🌫️',
    'mist': '🌫️',
    'wind': '💨',
    'windy': '💨',
    'hot': '🔥',
    'cold': '❄️',
    'default': '🌡️'
};

// Time of day emojis
const TIME_EMOJIS = {
    'morning': '🌅',
    'afternoon': '☀️',
    'evening': '🌆',
    'night': '🌙'
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
        // Try to fetch from WordPress API / Meteosource
        const data = await fetchWeatherData(locationId, location);
        
        // Format the response
        const formattedForecast = formatWeatherResponse(data, location);
        
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
    
    // Try WordPress API first
    try {
        const data = await wordpressApi.fetchWeatherForecast(locationId);
        
        // Update cache
        cache.data[locationId] = data;
        cache.timestamp[locationId] = Date.now();
        
        return data;
    } catch (wpError) {
        console.log(`🌦️ [WEATHER] WordPress API failed, trying direct Meteosource...`);
        
        // Fallback to direct Meteosource API call using coordinates
        const meteosourceData = await fetchFromMeteosource(location);
        
        // Update cache
        cache.data[locationId] = meteosourceData;
        cache.timestamp[locationId] = Date.now();
        
        return meteosourceData;
    }
}

/**
 * Fetch weather directly from Meteosource API using coordinates
 * 
 * @param {Object} location - Location with coordinates
 * @returns {Promise<Object>} Weather data
 */
async function fetchFromMeteosource(location) {
    // This is a placeholder for future Meteosource integration
    // Will be implemented when API key is available
    
    const { lat, lon } = location.coordinates;
    console.log(`🌦️ [WEATHER] Meteosource API call would go here for lat: ${lat}, lon: ${lon}`);
    
    // Simulate API response structure for now
    return {
        location: location.name,
        coordinates: { lat, lon },
        current: {
            temperature: 24,
            condition: 'Partly cloudy',
            humidity: 65,
            wind_speed: 3.5
        },
        daily: generateSampleDailyData(),
        lastUpdated: new Date().toISOString()
    };
}

// ============================================================================
// RESPONSE FORMATTER
// ============================================================================

/**
 * Format weather data into readable WhatsApp message
 * 
 * @param {Object} data - Weather data from API
 * @param {Object} location - Location details
 * @returns {string} Formatted forecast
 */
function formatWeatherResponse(data, location) {
    if (!data) {
        return getSampleForecast(location.id, location.name);
    }
    
    try {
        let forecast = '';
        
        // ====================================================================
        // CURRENT CONDITIONS (if available)
        // ====================================================================
        if (data.current) {
            const current = data.current;
            const temp = current.temperature || current.temp || '--';
            const condition = current.condition || current.weather || 'Unknown';
            const emoji = getWeatherEmoji(condition);
            const feelsLike = current.feels_like || current.feelsLike;
            const humidity = current.humidity;
            const wind = current.wind_speed || current.wind?.speed;
            
            forecast += `*Current Conditions:*\n`;
            forecast += `${emoji} ${temp}°C ${condition}\n`;
            
            if (feelsLike) {
                forecast += `🌡️ Feels like: ${feelsLike}°C\n`;
            }
            if (humidity) {
                forecast += `💧 Humidity: ${humidity}%\n`;
            }
            if (wind) {
                forecast += `💨 Wind: ${wind} m/s\n`;
            }
            forecast += `\n`;
        }
        
        // ====================================================================
        // 5-DAY FORECAST
        // ====================================================================
        if (data.daily && data.daily.length > 0) {
            forecast += `*5-Day Forecast:*\n`;
            forecast += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.daily.slice(0, 5).forEach((day, index) => {
                const date = new Date(day.date || day.day || Date.now() + (index * 86400000));
                const dayName = date.toLocaleDateString('en-ZW', { weekday: 'short' });
                
                const tempMin = day.temperature_min || day.min_temp || day.all_day?.temperature_min || '--';
                const tempMax = day.temperature_max || day.max_temp || day.all_day?.temperature_max || '--';
                const condition = day.condition || day.summary || day.weather || 'Unknown';
                const emoji = getWeatherEmoji(condition);
                const rainProb = day.precipitation_probability || day.pop || day.all_day?.probability?.precipitation;
                
                // Format day line
                let dayLine = `${dayName}: ${emoji} ${tempMin}°C - ${tempMax}°C`;
                if (rainProb) {
                    dayLine += ` 🌧️ ${rainProb}%`;
                }
                forecast += dayLine + '\n';
                
                // Add condition text for first day or if significant
                if (index === 0 || condition.toLowerCase().includes('rain') || condition.toLowerCase().includes('storm')) {
                    forecast += `   ${condition}\n`;
                }
            });
        }
        
        // ====================================================================
        // ASTRONOMY DATA (if available)
        // ====================================================================
        if (data.astro || data.daily?.[0]?.astro) {
            const astro = data.astro || data.daily[0].astro;
            if (astro?.sun) {
                const sunrise = astro.sun.rise ? new Date(astro.sun.rise).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                const sunset = astro.sun.set ? new Date(astro.sun.set).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' }) : '--:--';
                
                forecast += `\n━━━━━━━━━━━━━━━━━━\n`;
                forecast += `🌅 Sunrise: ${sunrise}\n`;
                forecast += `🌇 Sunset: ${sunset}\n`;
            }
        }
        
        // Add last updated time
        if (data.lastUpdated) {
            const updated = new Date(data.lastUpdated);
            forecast += `\n_Updated: ${updated.toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}_`;
        }
        
        return forecast;
        
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

/**
 * Generate sample daily data for fallback
 * 
 * @returns {Array} Sample daily forecast data
 */
function generateSampleDailyData() {
    const days = ['Today', 'Tue', 'Wed', 'Thu', 'Fri'];
    const conditions = ['Sunny', 'Partly cloudy', 'Rain showers', 'Cloudy', 'Sunny'];
    const temps = [
        { min: 18, max: 28 },
        { min: 17, max: 27 },
        { min: 16, max: 24 },
        { min: 17, max: 25 },
        { min: 18, max: 26 }
    ];
    
    return days.map((day, index) => ({
        day: day,
        condition: conditions[index],
        temperature_min: temps[index].min,
        temperature_max: temps[index].max,
        precipitation_probability: index === 2 ? 70 : 10
    }));
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
Fri: 31°C ☀️ Sunny - Perfect for falls visit!`,
        
        'nyanga': `Today: 22°C ☁️ Cool mountain breeze
Tue: 23°C ⛅ Pleasant
Wed: 20°C 🌧️ Light rain
Thu: 21°C ☁️ Misty morning
Fri: 22°C ☀️ Clear - Great for hiking!`,
        
        'kariba': `Today: 34°C ☀️ Hot
Tue: 35°C ☀️ Very hot
Wed: 33°C ⛅ Partly cloudy
Thu: 32°C ☁️ Cloudy
Fri: 33°C ☀️ Sunny - Perfect lake weather!`,
        
        'hwange': `Today: 31°C ☀️ Game viewing ideal
Tue: 32°C ☀️ Dry
Wed: 30°C ⛅ Good for wildlife
Thu: 29°C ☁️ Cloudy
Fri: 30°C ☀️ Animals active morning/evening`,
        
        'great_zimbabwe': `Today: 28°C ☀️ Sunny - Great for tours
Tue: 29°C ☀️ Clear skies
Wed: 27°C ⛅ Partly cloudy
Thu: 26°C ☁️ Cloudy
Fri: 27°C ☀️ Perfect for exploring ruins`,
        
        'chimanimani': `Today: 23°C ☁️ Cool mountain air
Tue: 24°C ⛅ Pleasant
Wed: 21°C 🌧️ Light mountain rain
Thu: 22°C ☁️ Misty
Fri: 23°C ☀️ Clear - Hiking conditions ideal`,
        
        'vumba': `Today: 24°C 🌺 Garden weather
Tue: 25°C ⛅ Pleasant
Wed: 23°C 🌧️ Light rain
Thu: 23°C ☁️ Cloudy
Fri: 24°C ☀️ Sunny - Perfect for botanical gardens`,
        
        'matopos': `Today: 27°C ☀️ Great for rock viewing
Tue: 28°C ☀️ Clear
Wed: 26°C ⛅ Partly cloudy
Thu: 25°C ☁️ Cloudy
Fri: 26°C ☀️ Good for hiking`
    };
    
    if (locationSpecific[locationId]) {
        return locationSpecific[locationId];
    }
    
    // Default forecast for any location
    return `Today: 26°C ☀️ Sunny
Tue: 27°C ⛅ Partly cloudy
Wed: 24°C 🌧️ Rain possible
Thu: 25°C ☁️ Cloudy
Fri: 26°C ☀️ Clearing up`;
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

/**
 * Get weather tips based on conditions
 * 
 * @param {string} condition - Weather condition
 * @returns {string} Helpful tip
 */
function getWeatherTip(condition) {
    const cond = condition.toLowerCase();
    
    if (cond.includes('sun') || cond.includes('clear')) {
        return "☀️ Tip: Wear sunscreen and stay hydrated!";
    }
    if (cond.includes('rain')) {
        return "☔ Tip: Carry an umbrella or raincoat.";
    }
    if (cond.includes('cloud')) {
        return "⛅ Tip: Good day for outdoor activities.";
    }
    if (cond.includes('storm') || cond.includes('thunder')) {
        return "⛈️ Tip: Stay indoors and avoid open areas.";
    }
    if (cond.includes('cold') || cond.includes('chill')) {
        return "🧥 Tip: Bring a jacket or warm clothing.";
    }
    if (cond.includes('hot') || cond.includes('heat')) {
        return "🔥 Tip: Avoid midday sun and drink water.";
    }
    if (cond.includes('wind')) {
        return "💨 Tip: Secure loose items outdoors.";
    }
    if (cond.includes('fog') || cond.includes('mist')) {
        return "🌫️ Tip: Drive carefully with reduced visibility.";
    }
    
    return "";
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
    getWeatherTip,
    clearCache,
    getCacheStatus,
    
    // For testing
    _sampleData: getSampleForecast,
    _generateSampleDailyData: generateSampleDailyData
};