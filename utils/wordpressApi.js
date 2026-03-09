// utils/wordpressApi.js
// ============================================================================
// WORDPRESS REST API CLIENT
// Handles all communication with WordPress backend for info services
// Provides fallback to sample data when API is unavailable
// ============================================================================

const axios = require('axios');
const { HOT_UPDATES_CONFIG, INFO_SERVICE_STATUS } = require('../config/constants');

// ============================================================================
// CONSTANTS
// ============================================================================

const WORDPRESS_URL = HOT_UPDATES_CONFIG.WORDPRESS_URL || 'https://cchub.co.zw';
const API_BASE = `${WORDPRESS_URL}/wp-json/cchub/v1`;
const TIMEOUT = HOT_UPDATES_CONFIG.REQUEST_TIMEOUT || 5000;

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
            // The request was made and the server responded with a status code outside of 2xx
            console.error(`📡 [WORDPRESS] Error Response: ${error.response.status} - ${error.config.url}`, {
                data: error.response.data,
                status: error.response.status
            });
        } else if (error.request) {
            // The request was made but no response was received
            console.error(`📡 [WORDPRESS] No Response: ${error.config?.url}`, {
                message: error.message,
                code: error.code
            });
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error(`📡 [WORDPRESS] Request Error: ${error.message}`);
        }
        return Promise.reject(error);
    }
);

// ============================================================================
// EPL SOCCER UPDATES
// ============================================================================

/**
 * Fetch EPL soccer updates from WordPress
 * Returns standings, fixtures, results, and top scorers
 * 
 * @returns {Promise<Object>} EPL data
 */
async function fetchEplUpdates() {
    console.log(`📡 [WORDPRESS] Fetching EPL updates from ${API_BASE}/epl`);
    
    try {
        const response = await apiClient.get('/epl');
        
        if (response.data && response.data.success === false) {
            throw new Error(response.data.message || 'EPL API returned error');
        }
        
        return transformEplResponse(response.data);
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch EPL updates:`, error.message);
        throw error;
    }
}

/**
 * Transform raw EPL API response to standardized format
 * 
 * @param {Object} data - Raw API response
 * @returns {Object} Transformed EPL data
 */
function transformEplResponse(data) {
    // If data is already in our format, return as is
    if (data.standings || data.fixtures || data.results) {
        return {
            standings: data.standings || [],
            fixtures: data.fixtures || [],
            results: data.results || [],
            topScorers: data.topScorers || [],
            form: data.form || [],
            lastUpdated: data.lastUpdated || new Date().toISOString(),
            source: data.source || 'WordPress API'
        };
    }
    
    // Try to transform common API formats
    try {
        const transformed = {
            standings: [],
            fixtures: [],
            results: [],
            topScorers: [],
            form: [],
            lastUpdated: new Date().toISOString(),
            source: 'WordPress API (transformed)'
        };
        
        // Handle array response
        if (Array.isArray(data)) {
            // Try to identify data types
            data.forEach(item => {
                if (item.standings || item.position) {
                    transformed.standings.push(item);
                } else if (item.fixture || item.home_team) {
                    transformed.fixtures.push(item);
                } else if (item.result || item.score) {
                    transformed.results.push(item);
                } else if (item.goals || item.scorer) {
                    transformed.topScorers.push(item);
                }
            });
        }
        
        // Handle nested data structures
        if (data.data) {
            return transformEplResponse(data.data);
        }
        
        return transformed;
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Error transforming EPL response:`, error);
        return data; // Return original if transformation fails
    }
}

// ============================================================================
// ZIMBABWE NEWS UPDATES
// ============================================================================

/**
 * Fetch Zimbabwe news updates from WordPress
 * Returns headlines from Herald, Chronicle, Newsday, etc.
 * 
 * @param {string} category - Optional category filter
 * @returns {Promise<Object>} News data
 */
async function fetchNewsUpdates(category = null) {
    const url = category ? `/news?category=${encodeURIComponent(category)}` : '/news';
    console.log(`📡 [WORDPRESS] Fetching news updates from ${API_BASE}${url}`);
    
    try {
        const response = await apiClient.get(url);
        
        if (response.data && response.data.success === false) {
            throw new Error(response.data.message || 'News API returned error');
        }
        
        return transformNewsResponse(response.data, category);
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch news updates:`, error.message);
        throw error;
    }
}

/**
 * Transform raw news API response to standardized format
 * 
 * @param {Object} data - Raw API response
 * @param {string} category - Requested category
 * @returns {Object} Transformed news data
 */
function transformNewsResponse(data, category = null) {
    // If data is already in our format, return as is
    if (data.headlines || data.articles) {
        return {
            headlines: data.headlines || data.articles || [],
            byCategory: data.byCategory || {},
            sources: data.sources || [],
            lastUpdated: data.lastUpdated || new Date().toISOString(),
            category: category,
            source: data.source || 'WordPress API'
        };
    }
    
    // Try to transform common API formats
    try {
        const transformed = {
            headlines: [],
            byCategory: {},
            sources: [],
            lastUpdated: new Date().toISOString(),
            category: category,
            source: 'WordPress API (transformed)'
        };
        
        // Handle array of articles
        if (Array.isArray(data)) {
            transformed.headlines = data.map(item => ({
                title: item.title || item.headline || 'Untitled',
                summary: item.summary || item.excerpt || item.description || '',
                source: item.source || item.publisher || 'Zimbabwe News',
                timestamp: item.timestamp || item.published_at || item.date || null,
                url: item.url || item.link || null,
                category: item.category || item.section || 'general'
            }));
            
            // Extract unique sources
            const sourcesSet = new Set();
            transformed.headlines.forEach(item => {
                if (item.source) sourcesSet.add(item.source);
            });
            transformed.sources = Array.from(sourcesSet);
        }
        
        // Handle nested data structures
        if (data.data) {
            return transformNewsResponse(data.data, category);
        }
        
        return transformed;
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Error transforming news response:`, error);
        return data; // Return original if transformation fails
    }
}

// ============================================================================
// WEATHER FORECASTS
// ============================================================================

/**
 * Fetch weather forecast for a specific location
 * 
 * @param {string} locationId - Location ID (e.g., 'harare', 'victoria_falls')
 * @returns {Promise<Object>} Weather data
 */
async function fetchWeatherForecast(locationId) {
    console.log(`📡 [WORDPRESS] Fetching weather for ${locationId} from ${API_BASE}/weather/${locationId}`);
    
    try {
        const response = await apiClient.get(`/weather/${locationId}`);
        
        if (response.data && response.data.success === false) {
            throw new Error(response.data.message || 'Weather API returned error');
        }
        
        return transformWeatherResponse(response.data, locationId);
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Failed to fetch weather for ${locationId}:`, error.message);
        throw error;
    }
}

/**
 * Transform raw weather API response to standardized format
 * 
 * @param {Object} data - Raw API response
 * @param {string} locationId - Location ID
 * @returns {Object} Transformed weather data
 */
function transformWeatherResponse(data, locationId) {
    // If data is already in our format, return as is
    if (data.current || data.daily) {
        return {
            location: data.location || locationId,
            current: data.current || {},
            daily: data.daily || [],
            hourly: data.hourly || [],
            astro: data.astro || {},
            lastUpdated: data.lastUpdated || new Date().toISOString(),
            source: data.source || 'WordPress API'
        };
    }
    
    // Try to transform common weather API formats (OpenWeatherMap, WeatherAPI, etc.)
    try {
        const transformed = {
            location: locationId,
            current: {},
            daily: [],
            lastUpdated: new Date().toISOString(),
            source: 'WordPress API (transformed)'
        };
        
        // Handle OpenWeatherMap format
        if (data.current && data.daily) {
            // Already handled above, but here for completeness
            transformed.current = {
                temperature: data.current.temp,
                feels_like: data.current.feels_like,
                humidity: data.current.humidity,
                wind_speed: data.current.wind_speed,
                condition: data.current.weather?.[0]?.description || 'Unknown',
                icon: data.current.weather?.[0]?.icon
            };
            
            transformed.daily = data.daily.map(day => ({
                date: new Date(day.dt * 1000).toISOString(),
                temperature_min: day.temp?.min,
                temperature_max: day.temp?.max,
                condition: day.weather?.[0]?.description || 'Unknown',
                precipitation_probability: day.pop * 100,
                humidity: day.humidity,
                wind_speed: day.wind_speed
            }));
        }
        
        // Handle WeatherAPI format
        else if (data.current && data.forecast) {
            transformed.current = {
                temperature: data.current.temp_c || data.current.temperature,
                feels_like: data.current.feelslike_c,
                humidity: data.current.humidity,
                wind_speed: data.current.wind_kph,
                condition: data.current.condition?.text || 'Unknown'
            };
            
            transformed.daily = data.forecast.forecastday?.map(day => ({
                date: day.date,
                temperature_min: day.day?.mintemp_c,
                temperature_max: day.day?.maxtemp_c,
                condition: day.day?.condition?.text || 'Unknown',
                precipitation_probability: day.day?.daily_chance_of_rain,
                astro: day.astro
            })) || [];
        }
        
        return transformed;
        
    } catch (error) {
        console.error(`📡 [WORDPRESS] Error transforming weather response:`, error);
        return data; // Return original if transformation fails
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
        const response = await apiClient.get(endpoint, options);
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
 * Check WordPress API health
 * 
 * @returns {Promise<Object>} Health status
 */
async function checkHealth() {
    console.log(`📡 [WORDPRESS] Running health check on ${API_BASE}`);
    
    const services = {
        epl: { status: 'unknown', lastChecked: null },
        news: { status: 'unknown', lastChecked: null },
        weather: { status: 'unknown', lastChecked: null }
    };
    
    // Check EPL endpoint
    try {
        const start = Date.now();
        await apiClient.head('/epl', { timeout: 3000 });
        services.epl = {
            status: 'online',
            responseTime: Date.now() - start,
            lastChecked: new Date().toISOString()
        };
    } catch (error) {
        services.epl = {
            status: 'offline',
            error: error.code || error.message,
            lastChecked: new Date().toISOString()
        };
    }
    
    // Check News endpoint
    try {
        const start = Date.now();
        await apiClient.head('/news', { timeout: 3000 });
        services.news = {
            status: 'online',
            responseTime: Date.now() - start,
            lastChecked: new Date().toISOString()
        };
    } catch (error) {
        services.news = {
            status: 'offline',
            error: error.code || error.message,
            lastChecked: new Date().toISOString()
        };
    }
    
    // Check Weather endpoint (using Harare as test)
    try {
        const start = Date.now();
        await apiClient.head('/weather/harare', { timeout: 3000 });
        services.weather = {
            status: 'online',
            responseTime: Date.now() - start,
            lastChecked: new Date().toISOString()
        };
    } catch (error) {
        services.weather = {
            status: 'offline',
            error: error.code || error.message,
            lastChecked: new Date().toISOString()
        };
    }
    
    return {
        url: WORDPRESS_URL,
        apiBase: API_BASE,
        timestamp: new Date().toISOString(),
        services,
        allOnline: Object.values(services).every(s => s.status === 'online'),
        anyOnline: Object.values(services).some(s => s.status === 'online')
    };
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
            epl: `${API_BASE}/epl`,
            news: `${API_BASE}/news`,
            weather: `${API_BASE}/weather/{location}`
        }
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
    
    // Transformers (exposed for testing)
    transformEplResponse,
    transformNewsResponse,
    transformWeatherResponse,
    
    // Configuration
    WORDPRESS_URL,
    API_BASE,
    TIMEOUT
};