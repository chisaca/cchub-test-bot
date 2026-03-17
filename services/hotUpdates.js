// services/hotUpdates.js - COMPLETE UPDATED VERSION with EPL Submenu
// ============================================================================
// HOT UPDATES SERVICE
// Provides information services: EPL Soccer, Zimbabwe News, Weather
// Fetches data from WordPress REST API with fallback to sample data
// NOW WITH: 
// - EPL submenu with Table, Fixtures, Results, Top Scorers
// - Personality, random facts, and interactive navigation
// - Message truncation for button body limits (max 1024 chars)
// ============================================================================

const axios = require('axios');
const messaging = require('../utils/messaging');
const wordpressApi = require('../utils/wordpressApi');
const newsService = require('./newsService');
// Import personality utilities
const { 
    getRandomResponse,
    addRandomFact,
    getDailyTip,
    getThanksMessage
} = require('../utils/personality');
const { 
    HOT_UPDATES_CONFIG, 
    FLOW_STATES, 
    SERVICE_TYPES,
    UI_MESSAGES,
    VALIDATION_CONFIG,
    WORDPRESS_CONFIG,
    INTERACTIVE_UI_CONFIG,
    PERSONALITY_CONFIG
} = require('../config/constants');

// ============================================================================
// CONSTANTS
// ============================================================================
const MAX_BUTTON_BODY = 1024; // WhatsApp button body limit

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
 * NOW WITH: Interactive menu
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {Promise<Object>} Result with message and session
 */
async function startFlow(userId) {
    console.log(`🔥 [HOT-UPDATES] Starting flow for ${userId}`);
    
    // Send interactive menu instead of text
    await sendHotUpdatesMenu(userId);
    
    return {
        message: null, // Message already sent
        session: {
            service: SERVICE_TYPES.HOT_UPDATES,
            state: FLOW_STATES.HOT_UPDATES.START
        }
    };
}

// ============================================================================
// MENU FUNCTIONS
// ============================================================================

/**
 * Send interactive Hot Updates menu with buttons
 * 
 * @param {string} userId - WhatsApp user ID
 */
async function sendHotUpdatesMenu(userId) {
    const greeting = getRandomResponse('greeting');
    
    await messaging.sendButtonMessage(
        userId,
        `🔥 *HOT UPDATES*\n\n${greeting}\n\nWhat would you like to check today?`,
        [
            { id: "hu_epl", title: "⚽ EPL Soccer" },
            { id: "hu_news", title: "📰 Zimbabwe News" },
            { id: "hu_weather", title: "🌦️ Weather" },
            { id: "hi", title: "🏠 Main Menu" }
        ]
    );
}

/**
 * Send EPL submenu with options
 * 
 * @param {string} userId - WhatsApp user ID
 */
async function sendEplMenu(userId) {
    await messaging.sendButtonMessage(
        userId,
        `⚽ *EPL SOCCER UPDATES*\n\nSelect what you'd like to see:`,
        [
            { id: "epl_table", title: "📊 League Table" },
            { id: "epl_fixtures", title: "📅 Upcoming Fixtures" },
            { id: "epl_results", title: "✅ Recent Results" },
            { id: "epl_top", title: "⚽ Top Scorers" },
            { id: "hu_back", title: "🔙 Back to Hot Updates" },
            { id: "hi", title: "🏠 Main Menu" }
        ]
    );
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

/**
 * Handle all incoming requests for Hot Updates
 * Routes based on current session state
 * NOW WITH: Support for interactive button responses
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
    // HANDLE MAIN HOT UPDATES BUTTON RESPONSES
    // ========================================================================
    if (input === 'hu_epl') {
        session.data = { selectedService: 'epl' };
        await sendEplMenu(userId);
        return {
            message: null,
            session: updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_SERVICE, { selectedService: 'epl' }),
            returnToMain: false
        };
    }
    
    if (input === 'hu_news') {
        session.data = { selectedService: 'news' };
        return handleNewsRequest(userId, session, messageText);
    }
    
    if (input === 'hu_weather') {
        session.data = { selectedService: 'weather' };
        return {
            message: UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT,
            session: updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_WEATHER_LOCATION, { selectedService: 'weather' })
        };
    }
    
    if (input === 'hu_back') {
        // Go back to main hot updates menu
        await sendHotUpdatesMenu(userId);
        return {
            message: null,
            session: updateSession(session, FLOW_STATES.HOT_UPDATES.START)
        };
    }

    // ========================================================================
    // HANDLE EPL SUBMENU BUTTON RESPONSES
    // ========================================================================
    if (input === 'epl_table' || input === 'epl_fixtures' || input === 'epl_results' || input === 'epl_top') {
        return handleEplSubmenuSelection(userId, input, session);
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
                await sendEplMenu(userId);
                return {
                    message: null,
                    session: updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_SERVICE),
                    returnToMain: false
                };
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
            return handleServiceSelection(userId, messageText, messageText, session);
            
        case FLOW_STATES.HOT_UPDATES.SELECT_SERVICE:
            // When in SELECT_SERVICE state, route based on the selected service
            if (session.data && session.data.selectedService) {
                console.log(`🔥 [HOT-UPDATES] In SELECT_SERVICE state with service: ${session.data.selectedService}`);
                
                // Check if this is a pagination command for news
                const command = messageText ? messageText.trim().toLowerCase() : '';
                if (session.data.selectedService === 'news' && (command === 'more' || command === 'back')) {
                    return handleNewsRequest(userId, session, messageText);
                }
                
                // Route to the appropriate handler based on selected service
                switch (session.data.selectedService) {
                    case 'epl':
                        await sendEplMenu(userId);
                        return {
                            message: null,
                            session: session,
                            returnToMain: false
                        };
                    case 'news':
                        return handleNewsRequest(userId, session, messageText);
                    case 'weather':
                        return {
                            message: UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT,
                            session: updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_WEATHER_LOCATION)
                        };
                    default:
                        // Fall back to start
                        await sendHotUpdatesMenu(userId);
                        return {
                            message: null,
                            session: updateSession(session, FLOW_STATES.HOT_UPDATES.START)
                        };
                }
            }
            // If no selected service, go back to start
            await sendHotUpdatesMenu(userId);
            return {
                message: null,
                session: updateSession(session, FLOW_STATES.HOT_UPDATES.START)
            };
            
        case FLOW_STATES.HOT_UPDATES.SELECT_WEATHER_LOCATION:
            return handleWeatherLocationSelection(userId, messageText, session);
            
        default:
            console.error(`🔥 [HOT-UPDATES] Unknown state: ${session.state}`);
            await sendHotUpdatesMenu(userId);
            return {
                message: null,
                session: updateSession(session, FLOW_STATES.HOT_UPDATES.START)
            };
    }
}

// ============================================================================
// EPL SUBMENU HANDLER (NEW)
// ============================================================================

/**
 * Handle EPL submenu selections
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} selection - Button ID (epl_table, epl_fixtures, etc.)
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result
 */
async function handleEplSubmenuSelection(userId, selection, session) {
    console.log(`🔥 [HOT-UPDATES] EPL submenu selection: ${selection}`);
    
    // Send loading message
    await messaging.sendMessage(userId, `⚽ Fetching EPL ${getSelectionName(selection)}...`);
    
    try {
        // Fetch data from WordPress API with specific endpoint
        let endpoint = '/epl';
        switch(selection) {
            case 'epl_table':
                endpoint = '/epl/standings?format=whatsapp';
                break;
            case 'epl_fixtures':
                endpoint = '/epl/fixtures?format=whatsapp';
                break;
            case 'epl_results':
                endpoint = '/epl/results?format=whatsapp';
                break;
            case 'epl_top':
                endpoint = '/epl/top_scorers?format=whatsapp';
                break;
        }
        
        const data = await wordpressApi.fetchEplData(endpoint);
        
        // Format the response
        let message = data.formatted || data;
        
        // Add random fact
        const factMessage = addRandomFact("");
        if (factMessage) {
            message = message + `\n\n${factMessage}`;
        }
        
        // Truncate if needed
        let displayMessage = message;
        if (message.length > MAX_BUTTON_BODY) {
            displayMessage = message.substring(0, MAX_BUTTON_BODY - 50) + 
                `\n\n... (message truncated)`;
            console.log(`⚠️ [HOT-UPDATES] EPL message truncated from ${message.length} to ${displayMessage.length} chars`);
        }
        
        // Send the data with EPL menu buttons for next action
        await messaging.sendButtonMessage(
            userId,
            displayMessage,
            [
                { id: "epl_table", title: "📊 Table" },
                { id: "epl_fixtures", title: "📅 Fixtures" },
                { id: "epl_results", title: "✅ Results" },
                { id: "epl_top", title: "⚽ Top Scorers" },
                { id: "hu_back", title: "🔙 Back" },
                { id: "hi", title: "🏠 Menu" }
            ]
        );
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error fetching EPL data:`, error.message);
        
        // Fallback to sample data
        const fallbackMessage = getEplFallbackData(selection);
        
        await messaging.sendButtonMessage(
            userId,
            fallbackMessage + `\n\n_Note: Using sample data. Live updates will be back soon._`,
            [
                { id: "epl_table", title: "📊 Table" },
                { id: "epl_fixtures", title: "📅 Fixtures" },
                { id: "epl_results", title: "✅ Results" },
                { id: "epl_top", title: "⚽ Top Scorers" },
                { id: "hu_back", title: "🔙 Back" },
                { id: "hi", title: "🏠 Menu" }
            ]
        );
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
    }
}

/**
 * Get readable name for selection
 */
function getSelectionName(selection) {
    switch(selection) {
        case 'epl_table': return 'League Table';
        case 'epl_fixtures': return 'Upcoming Fixtures';
        case 'epl_results': return 'Recent Results';
        case 'epl_top': return 'Top Scorers';
        default: return 'Updates';
    }
}

/**
 * Get fallback data for EPL
 */
function getEplFallbackData(selection) {
    switch(selection) {
        case 'epl_table':
            return `⚽ *EPL LEAGUE TABLE*\n\n` +
                   `1. Arsenal - 25pts\n` +
                   `2. Man City - 24pts\n` +
                   `3. Liverpool - 23pts\n` +
                   `4. Chelsea - 21pts\n` +
                   `5. Tottenham - 20pts\n` +
                   `6. Man Utd - 18pts`;
        
        case 'epl_fixtures':
            return `⚽ *UPCOMING FIXTURES*\n\n` +
                   `Sat 20 Mar 15:00\n` +
                   `Arsenal vs Chelsea\n\n` +
                   `Sat 20 Mar 17:30\n` +
                   `Man City vs Tottenham\n\n` +
                   `Sun 21 Mar 14:00\n` +
                   `Liverpool vs Man Utd\n\n` +
                   `Sun 21 Mar 16:30\n` +
                   `Chelsea vs Arsenal`;
        
        case 'epl_results':
            return `⚽ *RECENT RESULTS*\n\n` +
                   `Arsenal 2-1 Liverpool\n` +
                   `Man City 3-0 Chelsea\n` +
                   `Tottenham 1-1 Man Utd\n` +
                   `Newcastle 0-2 Brighton`;
        
        case 'epl_top':
            return `⚽ *TOP SCORERS*\n\n` +
                   `1. Haaland (MCI) - 18 goals\n` +
                   `2. Salah (LIV) - 15 goals\n` +
                   `3. Palmer (CHE) - 12 goals\n` +
                   `4. Watkins (AVL) - 11 goals\n` +
                   `5. Isak (NEW) - 10 goals`;
        
        default:
            return HOT_UPDATES_CONFIG.SAMPLE_DATA.EPL;
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
async function handleServiceSelection(userId, input, messageText, session) {
    console.log(`🔥 [HOT-UPDATES] Service selection: ${input}`);

    // Validate input is a number between 1-3
    if (!VALIDATION_CONFIG.HOT_UPDATES.SERVICE_OPTIONS.includes(input)) {
        // Resend interactive menu on invalid selection
        await sendHotUpdatesMenu(userId);
        return {
            message: null,
            session: session
        };
    }

    const service = HOT_UPDATES_CONFIG.SERVICES[input];
    
    if (!service) {
        await sendHotUpdatesMenu(userId);
        return {
            message: null,
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
            await sendEplMenu(userId);
            return {
                message: null,
                session: session,
                returnToMain: false
            };
            
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
            await sendHotUpdatesMenu(userId);
            return {
                message: null,
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
// NEWS SERVICE HANDLER (with truncation)
// ============================================================================

/**
 * Fetch and display Zimbabwe news headlines with pagination support
 * NOW WITH: Personality and navigation buttons
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
        
        // Add navigation buttons to the result
        if (result.message) {
            // Truncate if needed
            let displayMessage = result.message;
            if (result.message.length > MAX_BUTTON_BODY) {
                displayMessage = result.message.substring(0, MAX_BUTTON_BODY - 50) + 
                    `\n\n... (message truncated, type "more" for additional news)`;
            }
            
            const navigationButtons = [
                { id: "more", title: "➡️ More News" },
                { id: "hu_back", title: "🔙 Back to Menu" },
                { id: "hi", title: "🏠 Main Menu" }
            ];
            await messaging.sendButtonMessage(userId, displayMessage, navigationButtons);
            return {
                message: null,
                session: result.session,
                returnToMain: false
            };
        }
        
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
    
    // Send loading message with personality
    await messaging.sendMessage(userId, `📰 ${getRandomResponse('greeting')} Fetching latest Zimbabwe news...`);
    
    try {
        const category = session.data.newsCategory || null;
        const page = session.data.newsPage;
        
        const data = await newsService.getNewsUpdates(userId, false, category, page);
        
        // Store the data in session for pagination
        session.data.lastNewsData = data;
        
        // Add random fact
        const factMessage = addRandomFact("");
        let fullMessage = data;
        if (factMessage) {
            fullMessage = data + `\n\n${factMessage}`;
        }
        
        // ========================================================================
        // Truncate if needed
        // ========================================================================
        let displayMessage = fullMessage;
        if (fullMessage.length > MAX_BUTTON_BODY) {
            displayMessage = fullMessage.substring(0, MAX_BUTTON_BODY - 50) + 
                `\n\n... (message truncated, type "more" for additional news)`;
            console.log(`⚠️ [HOT-UPDATES] News message truncated from ${fullMessage.length} to ${displayMessage.length} chars`);
        }
        
        // Add navigation buttons
        const navigationButtons = [
            { id: "more", title: "➡️ More News" },
            { id: "hu_back", title: "🔙 Back to Menu" },
            { id: "hi", title: "🏠 Main Menu" }
        ];
        
        await messaging.sendButtonMessage(userId, displayMessage, navigationButtons);
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error fetching news data:`, error.message);
        
        // Use sample data from constants
        let fallbackMessage = HOT_UPDATES_CONFIG.SAMPLE_DATA.NEWS;
        
        // Truncate if needed
        let displayMessage = fallbackMessage;
        if (fallbackMessage.length > MAX_BUTTON_BODY) {
            displayMessage = fallbackMessage.substring(0, MAX_BUTTON_BODY - 50) + 
                `\n\n... (message truncated)`;
        }
        
        // Add navigation buttons
        const navigationButtons = [
            { id: "hu_news", title: "🔄 Try Again" },
            { id: "hu_back", title: "🔙 Back to Menu" },
            { id: "hi", title: "🏠 Main Menu" }
        ];
        
        await messaging.sendButtonMessage(userId, displayMessage, navigationButtons);
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
    }
}

// ============================================================================
// WEATHER SERVICE HANDLER (with truncation)
// ============================================================================

/**
 * Fetch and display weather forecast for selected location
 * NOW WITH: Personality and navigation buttons
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
    
    // Send loading message with personality
    await messaging.sendMessage(userId, `🌦️ ${getRandomResponse('greeting')} Fetching weather for ${locationName}...`);
    
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
        
        // Add daily tip
        const tipMessage = `💡 *Tip:* ${getDailyTip()}`;
        let finalMessage = fullMessage + `\n\n${tipMessage}`;
        
        // ========================================================================
        // Truncate if needed
        // ========================================================================
        let displayMessage = finalMessage;
        if (finalMessage.length > MAX_BUTTON_BODY) {
            displayMessage = finalMessage.substring(0, MAX_BUTTON_BODY - 50) + 
                `\n\n... (message truncated)`;
            console.log(`⚠️ [HOT-UPDATES] Weather message truncated from ${finalMessage.length} to ${displayMessage.length} chars`);
        }
        
        // Add navigation buttons
        const navigationButtons = [
            { id: "hu_weather", title: "🔄 Another Location" },
            { id: "hu_back", title: "🔙 Back to Menu" },
            { id: "hi", title: "🏠 Main Menu" }
        ];
        
        await messaging.sendButtonMessage(userId, displayMessage, navigationButtons);
        
        return {
            message: null,
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
        
        let fallbackMessage = UI_MESSAGES.HOT_UPDATES.WEATHER_RESULT(location, sampleForecast);
        
        // Add daily tip
        const tipMessage = `💡 *Tip:* ${getDailyTip()}`;
        let finalMessage = fallbackMessage + `\n\n${tipMessage}`;
        
        // Truncate if needed
        let displayMessage = finalMessage;
        if (finalMessage.length > MAX_BUTTON_BODY) {
            displayMessage = finalMessage.substring(0, MAX_BUTTON_BODY - 50) + 
                `\n\n... (message truncated)`;
        }
        
        // Add navigation buttons
        const navigationButtons = [
            { id: "hu_weather", title: "🔄 Try Another" },
            { id: "hu_back", title: "🔙 Back to Menu" },
            { id: "hi", title: "🏠 Main Menu" }
        ];
        
        await messaging.sendButtonMessage(userId, displayMessage, navigationButtons);
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
    }
}

// ============================================================================
// RESPONSE FORMATTERS (Fallback only)
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