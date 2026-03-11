// services/hotUpdates.js
// ============================================================================
// HOT UPDATES SERVICE
// Provides information services: EPL Soccer, Zimbabwe News, Weather
// Fetches data from WordPress REST API with fallback to sample data
// ============================================================================

const axios = require('axios');
const messaging = require('../utils/messaging');
const wordpressApi = require('../utils/wordpressApi');
const newsService = require('./newsService'); // ADD THIS IMPORT
const { 
    HOT_UPDATES_CONFIG, 
    FLOW_STATES, 
    SERVICE_TYPES,
    UI_MESSAGES,
    VALIDATION_CONFIG,
    WORDPRESS_CONFIG   
} = require('../config/constants');

// ============================================================================
// SESSION MANAGEMENT HELPERS
// ============================================================================

/**
 * Update session state with new data
 * 
 * @param {Object} session - Current session object
 * @param {string} newState - New state to set
 * @param {Object} additionalData - Additional data to merge
 * @returns {Object} Updated session
 */
function updateSession(session, newState, additionalData = {}) {
    session.state = newState;
    session.data = {
        ...session.data,
        ...additionalData,
        lastUpdated: Date.now()
    };
    return session;
}

// ============================================================================
// FLOW START
// ============================================================================

/**
 * Start the Hot Updates flow
 * Called from main menu when user selects option 5
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {Promise<Object>} Result with message and session
 */
async function startFlow(userId) {
    console.log(`🔥 [HOT-UPDATES] Starting flow for ${userId}`);
    
    // Return the main menu for Hot Updates
    return {
        message: UI_MESSAGES.HOT_UPDATES.MAIN_MENU,
        session: {
            service: SERVICE_TYPES.HOT_UPDATES,
            state: FLOW_STATES.HOT_UPDATES.START
        }
    };
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

/**
 * Handle all incoming requests for Hot Updates
 * Routes based on current session state
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} messageText - User's message
 * @param {Object} session - Current session object
 * @returns {Promise<Object>} Result with message and session status
 */
async function handleRequest(userId, messageText, session) {
    console.log(`🔥 [HOT-UPDATES] Handling request for ${userId}`, {
        state: session.state,
        message: messageText,
        hasData: !!session.data,
        selectedService: session.data?.selectedService
    });

    const input = messageText.trim().toLowerCase();

    // ========================================================================
    // CHECK FOR RETURN TO MAIN MENU (using 'hi')
    // ========================================================================
    if (input === 'hi') {
        console.log(`🔥 [HOT-UPDATES] User ${userId} returning to main menu`);
        return {
            message: null, // messageHandler will send welcome
            session: null,
            returnToMain: true
        };
    }

    // ========================================================================
    // CHECK IF WE ALREADY HAVE A SELECTED SERVICE IN SESSION
    // This handles the case when coming from submenu selection
    // ========================================================================
    if (session.data && session.data.selectedService && session.state === FLOW_STATES.HOT_UPDATES.START) {
        console.log(`🔥 [HOT-UPDATES] Found pre-selected service: ${session.data.selectedService}`);
        
        // Route directly to the pre-selected service
        switch (session.data.selectedService) {
            case 'epl':
                return handleEplRequest(userId, session);
            case 'news':
                return handleNewsRequest(userId, session, messageText);
            case 'weather':
                return {
                    message: UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT,
                    session: updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_WEATHER_LOCATION)
                };
            default:
                // Fall through to normal handling
                break;
        }
    }

    // ========================================================================
    // ROUTE BASED ON CURRENT STATE
    // ========================================================================
    switch (session.state) {
        case FLOW_STATES.HOT_UPDATES.START:
            return handleServiceSelection(userId, messageText, session);
            
        case FLOW_STATES.HOT_UPDATES.SELECT_WEATHER_LOCATION:
            return handleWeatherLocationSelection(userId, messageText, session);
            
        default:
            console.error(`🔥 [HOT-UPDATES] Unknown state: ${session.state}`);
            return {
                message: UI_MESSAGES.HOT_UPDATES.MAIN_MENU,
                session: updateSession(session, FLOW_STATES.HOT_UPDATES.START)
            };
    }
}

// ============================================================================
// SERVICE SELECTION HANDLER
// ============================================================================

/**
 * Handle user's selection of which info service to use
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} input - User's selection
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result with message and updated session
 */
async function handleServiceSelection(userId, input, session) {
    console.log(`🔥 [HOT-UPDATES] Service selection: ${input}`);

    // Validate input is a number between 1-3
    if (!VALIDATION_CONFIG.HOT_UPDATES.SERVICE_OPTIONS.includes(input)) {
        return {
            message: `❓ Invalid selection. Please reply with *1-3*\n\n${UI_MESSAGES.HOT_UPDATES.MAIN_MENU}`,
            session: session
        };
    }

    const service = HOT_UPDATES_CONFIG.SERVICES[input];
    
    if (!service) {
        return {
            message: `❓ Service not found. Please try again.\n\n${UI_MESSAGES.HOT_UPDATES.MAIN_MENU}`,
            session: session
        };
    }

    console.log(`🔥 [HOT-UPDATES] Selected service: ${service.key}`);

    // Store selected service in session
    updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_SERVICE, {
        selectedService: service.key,
        serviceName: service.name
    });

    // Route to specific service handler
    switch (service.key) {
        case 'epl':
            return handleEplRequest(userId, session);
            
        case 'news':
             // Check if this is a pagination command BEFORE storing selection
            const command = messageText ? messageText.trim().toLowerCase() : '';
            if (command === 'more' || command === 'back') {
                console.log(`🔥 [HOT-UPDATES] Handling pagination in service selection: ${command}`);
                return handleNewsRequest(userId, session, messageText);
            }
            return handleNewsRequest(userId, session, input);
            
        case 'weather':
            // For weather, we need to show location selection first
            return {
                message: UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT,
                session: updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_WEATHER_LOCATION)
            };
            
        default:
            return {
                message: UI_MESSAGES.HOT_UPDATES.MAIN_MENU,
                session: updateSession(session, FLOW_STATES.HOT_UPDATES.START)
            };
    }
}

// ============================================================================
// WEATHER LOCATION SELECTION HANDLER
// ============================================================================

/**
 * Handle user's selection of weather location (1-24)
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} input - User's selection
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result with message and updated session
 */
async function handleWeatherLocationSelection(userId, input, session) {
    console.log(`🔥 [HOT-UPDATES] Weather location selection: ${input}`);

    // Validate input is a number between 1-24
    const locationKeys = Object.keys(HOT_UPDATES_CONFIG.WEATHER_LOCATIONS);
    if (!locationKeys.includes(input)) {
        return {
            message: `❓ Invalid location. Please reply with a number *1-24*\n\n${UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT}`,
            session: session
        };
    }

    const location = HOT_UPDATES_CONFIG.WEATHER_LOCATIONS[input];
    
    // Store selected location in session
    updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_SERVICE, {
        selectedLocation: location.id,
        locationName: location.name,
        locationEmoji: location.emoji,
        coordinates: location.coordinates
    });

    // Now fetch weather for this location
    return handleWeatherRequest(userId, session);
}

// ============================================================================
// EPL SERVICE HANDLER
// ============================================================================

/**
 * Fetch and display EPL soccer updates
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result with message and session status
 */
async function handleEplRequest(userId, session) {
    console.log(`🔥 [HOT-UPDATES] Fetching EPL data for ${userId}`);
    
    // Send loading message
    await messaging.sendMessage(userId, UI_MESSAGES.HOT_UPDATES.FETCHING_EPL);
    
    try {
        // Try to fetch from WordPress API
        const data = await wordpressApi.fetchEplUpdates();
        
        // Format the response (WordPress already formats with ?format=whatsapp)
        const message = data.formatted || formatEplResponse(data);
        
        // Add option to return to menu
        const fullMessage = message + `\n\n────────────────\nReply *hi* for Main Menu`;
        
        return {
            message: fullMessage,
            session: session,
            returnToMain: false
        };
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error fetching EPL data:`, error.message);
        
        // Use sample data from constants
        const fallbackMessage = HOT_UPDATES_CONFIG.SAMPLE_DATA.EPL + 
            `\n\n────────────────\nReply *hi* for Main Menu`;
        
        return {
            message: fallbackMessage,
            session: session,
            returnToMain: false
        };
    }
}

// ============================================================================
// NEWS SERVICE HANDLER
// ============================================================================

/**
 * Fetch and display Zimbabwe news headlines with pagination support
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Object} session - Current session
 * @param {string} messageText - User's message (for pagination)
 * @returns {Promise<Object>} Result with message and session status
 */
async function handleNewsRequest(userId, session, messageText) {
    console.log(`🔥 [HOT-UPDATES] Fetching news data for ${userId}`);
    
    // Check if this is a pagination command
    const command = messageText ? messageText.trim().toLowerCase() : '';
    if (command === 'more' || command === 'back') {
        console.log(`🔥 [HOT-UPDATES] Handling pagination: ${command}`);
        const result = await newsService.handlePagination(userId, session, command);
        return {
            message: result.message,
            session: result.session,
            returnToMain: false
        };
    }
    
    // Initialize page if not set
    if (!session.data.newsPage) {
        session.data.newsPage = 1;
    }
    
    // Send loading message
    await messaging.sendMessage(userId, UI_MESSAGES.HOT_UPDATES.FETCHING_NEWS);
    
    try {
        const category = session.data.newsCategory || null;
        const page = session.data.newsPage;
        
        const data = await newsService.getNewsUpdates(userId, false, category, page);
        
        // Store the data in session for pagination
        session.data.lastNewsData = data;
        
        return {
            message: data,
            session: session,
            returnToMain: false
        };
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error fetching news data:`, error.message);
        
        // Use sample data from constants
        const fallbackMessage = HOT_UPDATES_CONFIG.SAMPLE_DATA.NEWS + 
            `\n\n────────────────\nReply *hi* for Main Menu`;
        
        return {
            message: fallbackMessage,
            session: session,
            returnToMain: false
        };
    }
}

// ============================================================================
// WEATHER SERVICE HANDLER
// ============================================================================

/**
 * Fetch and display weather forecast for selected location
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result with message and session status
 */
async function handleWeatherRequest(userId, session) {
    const locationId = session.data.selectedLocation;
    const locationName = session.data.locationName;
    const locationEmoji = session.data.locationEmoji || '🌦️';
    
    console.log(`🔥 [HOT-UPDATES] Fetching weather for ${locationName} (${locationId})`);
    
    // Send loading message
    await messaging.sendMessage(userId, UI_MESSAGES.HOT_UPDATES.FETCHING_WEATHER(locationName));
    
    try {
        // Try to fetch from WordPress API
        const data = await wordpressApi.fetchWeatherForecast(locationId);
        
        // Format the response (WordPress already formats with ?format=whatsapp)
        const forecast = data.formatted || formatWeatherResponse(data, locationName);
        
        // Get location details
        const location = HOT_UPDATES_CONFIG.WEATHER_LOCATIONS[
            Object.keys(HOT_UPDATES_CONFIG.WEATHER_LOCATIONS).find(
                key => HOT_UPDATES_CONFIG.WEATHER_LOCATIONS[key].id === locationId
            )
        ] || { name: locationName, emoji: locationEmoji, description: '', coordinates: { lat: 0, lon: 0 } };
        
        // Use the weather result template
        const fullMessage = UI_MESSAGES.HOT_UPDATES.WEATHER_RESULT(location, forecast);
        
        return {
            message: fullMessage,
            session: session,
            returnToMain: false
        };
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error fetching weather data:`, error.message);
        
        // Fallback to sample data
        const sampleForecast = HOT_UPDATES_CONFIG.SAMPLE_DATA.WEATHER(locationId);
        const location = { 
            name: locationName, 
            emoji: locationEmoji, 
            description: '', 
            coordinates: { lat: 0, lon: 0 } 
        };
        
        const fallbackMessage = UI_MESSAGES.HOT_UPDATES.WEATHER_RESULT(location, sampleForecast);
        
        return {
            message: fallbackMessage,
            session: session,
            returnToMain: false
        };
    }
}

// ============================================================================
// RESPONSE FORMATTERS (Fallback only - WordPress does main formatting)
// ============================================================================

/**
 * Format EPL data into readable message (fallback)
 */
function formatEplResponse(data) {
    if (!data) return HOT_UPDATES_CONFIG.SAMPLE_DATA.EPL;
    
    try {
        let message = `⚽ *EPL SOCCER UPDATES*\n\n`;
        
        // Handle WordPress plugin response with ?format=whatsapp
        if (data.formatted) return data.formatted;
        
        // Handle our API response structure
        if (data.standings) {
            message += `*STANDINGS*\n`;
            if (typeof data.standings === 'string') {
                message += data.standings;
            } else if (Array.isArray(data.standings)) {
                data.standings.slice(0, 5).forEach(team => {
                    message += `${team.position}. ${team.team} - ${team.points}pts\n`;
                });
            }
            message += `\n`;
        }
        
        if (data.fixtures) {
            message += `*NEXT FIXTURES*\n`;
            if (typeof data.fixtures === 'string') {
                message += data.fixtures;
            } else if (Array.isArray(data.fixtures)) {
                data.fixtures.slice(0, 3).forEach(fixture => {
                    message += `${fixture.home} vs ${fixture.away} - ${fixture.date}\n`;
                });
            }
        }
        
        return message;
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error formatting EPL:`, error);
        return HOT_UPDATES_CONFIG.SAMPLE_DATA.EPL;
    }
}

/**
 * Format news data into readable message (fallback)
 */
function formatNewsResponse(data) {
    if (!data) return HOT_UPDATES_CONFIG.SAMPLE_DATA.NEWS;
    
    try {
        // Handle WordPress plugin response with ?format=whatsapp
        if (data.formatted) return data.formatted;
        
        let message = `📰 *ZIMBABWE NEWS HEADLINES*\n\n`;
        
        if (Array.isArray(data)) {
            data.slice(0, 5).forEach((item, index) => {
                message += `${index + 1}. ${item.title || item.headline}\n`;
                if (item.source) message += `   _${item.source}_\n`;
                message += `\n`;
            });
        }
        
        return message;
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error formatting news:`, error);
        return HOT_UPDATES_CONFIG.SAMPLE_DATA.NEWS;
    }
}

/**
 * Format weather data into readable message (fallback)
 */
function formatWeatherResponse(data, locationName) {
    if (!data) return HOT_UPDATES_CONFIG.SAMPLE_DATA.WEATHER(locationName);
    
    try {
        // Handle WordPress plugin response with ?format=whatsapp
        if (data.formatted) return data.formatted;
        
        let forecast = '';
        
        if (data.daily) {
            data.daily.slice(0, 5).forEach(day => {
                const date = new Date(day.date).toLocaleDateString('en-ZW', { weekday: 'short' });
                const emoji = getWeatherEmoji(day.condition);
                forecast += `${date}: ${day.temp}°C ${emoji} ${day.condition}\n`;
            });
        }
        
        return forecast;
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error formatting weather:`, error);
        return HOT_UPDATES_CONFIG.SAMPLE_DATA.WEATHER(locationName);
    }
}

/**
 * Get emoji for weather condition
 */
function getWeatherEmoji(condition) {
    const conditionLower = (condition || '').toLowerCase();
    
    if (conditionLower.includes('sun') || conditionLower.includes('clear')) return '☀️';
    if (conditionLower.includes('cloud')) return '☁️';
    if (conditionLower.includes('rain')) return '🌧️';
    if (conditionLower.includes('storm')) return '⛈️';
    if (conditionLower.includes('partly')) return '⛅';
    
    return '🌡️';
}

// ============================================================================
// EXPORTS
// ============================================================================
console.log('🔥 HOT UPDATES SERVICE EXPORTS:', { 
    startFlow: typeof startFlow, 
    handleRequest: typeof handleRequest 
});

module.exports = {
    startFlow,
    handleRequest
};