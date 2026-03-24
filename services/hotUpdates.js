// services/hotUpdates.js - COMPLETE UPDATED VERSION with ZERA
// ============================================================================
// HOT UPDATES SERVICE
// Provides information services: EPL Soccer, Zimbabwe News, Weather, ZERA Fuel Prices
// ============================================================================

const axios = require('axios');
const messaging = require('../utils/messaging');
const wordpressApi = require('../utils/wordpressApi');
const newsService = require('./newsService');
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
const MAX_BUTTON_BODY = 1024;

// ============================================================================
// SESSION MANAGEMENT HELPERS
// ============================================================================

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

async function startFlow(userId) {
    console.log(`🔥 [HOT-UPDATES] Starting flow for ${userId}`);
    await sendHotUpdatesMenu(userId);
    
    return {
        message: null,
        session: {
            service: SERVICE_TYPES.HOT_UPDATES,
            state: FLOW_STATES.HOT_UPDATES.START,
            data: {}
        }
    };
}

// ============================================================================
// MENU FUNCTIONS
// ============================================================================

async function sendHotUpdatesMenu(userId) {
    console.log(`🔥 [HOT-UPDATES] Sending menu to ${userId}`);
    
    const greeting = getRandomResponse('greeting');
    
    const sections = [{
        title: "🔥 HOT UPDATES",
        rows: [
            { id: "hu_epl", title: "⚽ EPL Soccer", description: "Standings, fixtures, results" },
            { id: "hu_news", title: "📰 Zimbabwe News", description: "Latest headlines" },
            { id: "hu_weather", title: "🌦️ Weather", description: "Forecasts for 24 locations" },
            { id: "hu_zera", title: "⛽ ZERA Fuel Prices", description: "Petrol, diesel, LPG prices" },
            { id: "hi", title: "🏠 Main Menu", description: "Return to main menu" }
        ]
    }];
    
    await messaging.sendListMessage(
        userId,
        "HOT UPDATES",
        `${greeting}\n\nWhat would you like to check today?`,
        "View Options",
        sections
    );
}

async function sendEplMenu(userId) {
    const sections = [{
        title: "⚽ EPL SOCCER UPDATES",
        rows: [
            { id: "epl_table", title: "📊 League Table", description: "Current standings and positions" },
            { id: "epl_fixtures", title: "📅 Upcoming Fixtures", description: "Next matches and schedule" },
            { id: "epl_results", title: "✅ Recent Results", description: "Latest match scores" },
            { id: "epl_top", title: "⚽ Top Scorers", description: "Leading goal scorers" },
            { id: "hu_back", title: "🔙 Back to Hot Updates", description: "Return to main updates menu" },
            { id: "hi", title: "🏠 Main Menu", description: "Return to main menu" }
        ]
    }];
    
    await messaging.sendListMessage(
        userId,
        "EPL SOCCER",
        "Select what you'd like to see:",
        "View Options",
        sections
    );
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

async function handleRequest(userId, messageText, session) {
    console.log(`🔥 [HOT-UPDATES] Handling request for ${userId}`, {
        state: session.state,
        message: messageText,
        selectedService: session.data?.selectedService
    });

    const input = messageText.trim().toLowerCase();

    if (input === 'hi') {
        console.log(`🔥 [HOT-UPDATES] User ${userId} returning to main menu`);
        return {
            message: null,
            session: null,
            returnToMain: true
        };
    }

    // Handle main menu button responses
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
        session.data = { 
            selectedService: 'news',
            newsPage: 1,  // RESET TO PAGE 1
            newsCategory: null 
        };
        return handleNewsRequest(userId, session, messageText);
    }
    
    if (input === 'hu_weather') {
        session.data = { selectedService: 'weather' };
        return {
            message: UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT,
            session: updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_WEATHER_LOCATION, { selectedService: 'weather' })
        };
    }
    
    // NEW: ZERA button handler
    if (input === 'hu_zera') {
        session.data = { selectedService: 'zera' };
        return handleZeraRequest(userId, session);
    }
    
    if (input === 'hu_back') {
        await sendHotUpdatesMenu(userId);
        return {
            message: null,
            session: updateSession(session, FLOW_STATES.HOT_UPDATES.START)
        };
    }

    // Handle EPL submenu selections
    if (input === 'epl_table' || input === 'epl_fixtures' || input === 'epl_results' || input === 'epl_top') {
        return handleEplSubmenuSelection(userId, input, session);
    }
    
    // Handle pre-selected service
    if (session.data && session.data.selectedService && session.state === FLOW_STATES.HOT_UPDATES.START) {
        console.log(`🔥 [HOT-UPDATES] Found pre-selected service: ${session.data.selectedService}`);
        
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
            case 'zera':
                return handleZeraRequest(userId, session);
            default:
                break;
        }
    }

    // Route based on state
    switch (session.state) {
        case FLOW_STATES.HOT_UPDATES.START:
            return handleServiceSelection(userId, messageText, messageText, session);
            
        case FLOW_STATES.HOT_UPDATES.SELECT_SERVICE:
            if (session.data && session.data.selectedService) {
                const command = messageText ? messageText.trim().toLowerCase() : '';
                if (command === 'more' || command === 'back') {
                    const currentPage = session.data?.newsPage || 1;
                    let newPage = currentPage;
                    
                    if (command === 'more') {
                        newPage = currentPage + 1;
                    } else if (command === 'back') {
                        newPage = Math.max(1, currentPage - 1);
                    }
                    
                    // Update session with new page BEFORE calling newsService
                    session.data.newsPage = newPage;
                    
                    const result = await newsService.handlePagination(userId, session, command);
                    
                    return {
                        message: result.message,
                        session: session,
                        returnToMain: false
                    };
                }
            }
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
// ZERA REQUEST HANDLER (NEW - ADDED ONLY)
// ============================================================================

async function handleZeraRequest(userId, session) {
    console.log(`⛽ [HOT-UPDATES] Fetching ZERA prices for ${userId}`);
    
  //  await messaging.sendMessage(userId, `⛽ Fetching current fuel and energy prices from ZERA...`);
    
    try {
        const result = await wordpressApi.fetchZeraPrices();
        
        let message = '';
        
        if (result.success && result.formatted) {
            message = result.formatted;
        } else if (result.formatted) {
            message = result.formatted;
        } else if (typeof result === 'string') {
            message = result;
        } else {
            message = getZeraFallbackMessage();
        }
        
        const tipMessage = `💡 *Tip:* ${getDailyTip()}`;
        let finalMessage = message + `\n\n${tipMessage}`;
        
        let displayMessage = finalMessage;
        if (finalMessage.length > MAX_BUTTON_BODY) {
            displayMessage = finalMessage.substring(0, MAX_BUTTON_BODY - 50) + `\n\n... (message truncated)`;
        }
        
        await messaging.sendButtonMessage(
            userId,
            displayMessage,
            [
                { id: "hu_back", title: "🔙 Hot Updates" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
        
    } catch (error) {
        console.error(`⛽ [HOT-UPDATES] Error fetching ZERA prices:`, error.message);
        
        const fallbackMessage = getZeraFallbackMessage();
        
        await messaging.sendButtonMessage(
            userId,
            fallbackMessage + `\n\n_Note: Unable to fetch live prices. Please try again later._`,
            [
                { id: "hu_back", title: "🔙 Hot Updates" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
    }
}

function getZeraFallbackMessage() {
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

_Send *hi* to return to main menu_`;
}

// ============================================================================
// EPL SUBMENU HANDLER (PRESERVED - NO CHANGES)
// ============================================================================

async function handleEplSubmenuSelection(userId, selection, session) {
    console.log(`🔥 [HOT-UPDATES] EPL submenu selection: ${selection}`);
    
  //  await messaging.sendMessage(userId, `⚽ Fetching EPL ${getSelectionName(selection)}...`);
    
    try {
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
        
        let message = '';
        if (typeof data === 'string') {
            message = data;
        } else if (data.formatted && typeof data.formatted === 'string') {
            message = data.formatted;
        } else if (data.formatted && data.formatted.formatted) {
            message = data.formatted.formatted;
        } else {
            message = getEplFallbackData(selection);
        }
        
        const factMessage = addRandomFact("");
        if (factMessage) {
            message = message + `\n\n${factMessage}`;
        }
        
        let displayMessage = message;
        if (message.length > MAX_BUTTON_BODY) {
            displayMessage = message.substring(0, MAX_BUTTON_BODY - 50) + `\n\n... (message truncated)`;
        }
        
        await messaging.sendButtonMessage(
            userId,
            displayMessage,
            [
                { id: "hu_back", title: "🔙 Hot Updates" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error fetching EPL data:`, error.message);
        
        const fallbackMessage = getEplFallbackData(selection);
        
        await messaging.sendButtonMessage(
            userId,
            fallbackMessage + `\n\n_Note: Using sample data. Live updates will be back soon._`,
            [
                { id: "hu_back", title: "🔙 Hot Updates" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
    }
}

function getSelectionName(selection) {
    switch(selection) {
        case 'epl_table': return 'League Table';
        case 'epl_fixtures': return 'Upcoming Fixtures';
        case 'epl_results': return 'Recent Results';
        case 'epl_top': return 'Top Scorers';
        default: return 'Updates';
    }
}

function getEplFallbackData(selection) {
    switch(selection) {
        case 'epl_table':
            return `⚽ *EPL LEAGUE TABLE*\n\n1. Arsenal - 25pts\n2. Man City - 24pts\n3. Liverpool - 23pts\n4. Chelsea - 21pts\n5. Tottenham - 20pts`;
        case 'epl_fixtures':
            return `⚽ *UPCOMING FIXTURES*\n\nArsenal vs Chelsea - Sat 15:00\nMan City vs Spurs - Sun 16:30\nLiverpool vs Man Utd - Sun 14:00`;
        case 'epl_results':
            return `⚽ *RECENT RESULTS*\n\nArsenal 2-1 Liverpool\nMan City 3-0 Chelsea\nTottenham 1-1 Man Utd`;
        case 'epl_top':
            return `⚽ *TOP SCORERS*\n\n🥇 Haaland - 18\n🥈 Salah - 15\n🥉 Palmer - 12`;
        default:
            return HOT_UPDATES_CONFIG.SAMPLE_DATA.EPL;
    }
}

// ============================================================================
// SERVICE SELECTION HANDLER (PRESERVED)
// ============================================================================

async function handleServiceSelection(userId, input, messageText, session) {
    console.log(`🔥 [HOT-UPDATES] Service selection: ${input}`);

    if (!VALIDATION_CONFIG.HOT_UPDATES.SERVICE_OPTIONS.includes(input)) {
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

    updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_SERVICE, {
        selectedService: service.key,
        serviceName: service.name
    });

    switch (service.key) {
        case 'epl':
            await sendEplMenu(userId);
            return {
                message: null,
                session: session,
                returnToMain: false
            };
        case 'news':
            const command = messageText ? messageText.trim().toLowerCase() : '';
            if (command === 'more' || command === 'back') {
                return handleNewsRequest(userId, session, messageText);
            }
            return handleNewsRequest(userId, session, input);
        case 'weather':
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
// NEWS REQUEST HANDLER (PRESERVED)
// ============================================================================

async function handleNewsRequest(userId, session, messageText) {
    console.log(`🔥 [HOT-UPDATES] Fetching news data for ${userId}`);
    
    const command = messageText ? messageText.trim().toLowerCase() : '';
    
    // If this is a pagination command, handle it through newsService
    if (command === 'more' || command === 'back') {
        // Get current page from session (default to 1)
        const currentPage = session.data?.newsPage || 1;
        let newPage = currentPage;
        
        if (command === 'more') {
            newPage = currentPage + 1;
        } else if (command === 'back') {
            newPage = Math.max(1, currentPage - 1);
        }
        
        console.log(`🔥 [HOT-UPDATES] Pagination: page ${currentPage} → ${newPage}`);
        
        // Call newsService to get the formatted message for the new page
        const result = await newsService.handlePagination(userId, session, command);
        
        // Update session with new page
        session.data.newsPage = newPage;
        
        return {
            message: result.message,
            session: session,
            returnToMain: false
        };
    }
    
    // This is a fresh news request (not pagination)
    // Reset to page 1
    session.data.newsPage = 1;
    session.data.selectedService = 'news';
    
    // Send loading message
  //  await messaging.sendMessage(userId, `📰 ${getRandomResponse('greeting')} Fetching latest Zimbabwe news...`);
    
    try {
        const category = session.data.newsCategory || null;
        const page = 1; // Always start at page 1 for fresh requests
        
        const result = await newsService.getNewsUpdates(userId, true, category, page);
        
        // Update session with current page
        session.data.newsPage = page;
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error fetching news data:`, error.message);
        
        const fallbackMessage = HOT_UPDATES_CONFIG.SAMPLE_DATA.NEWS + 
            `\n\n────────────────\nReply *MORE* for more headlines or *hi* for Main Menu`;
        
        await messaging.sendMessage(userId, fallbackMessage);
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
    }
}

// ============================================================================
// WEATHER REQUEST HANDLERS (PRESERVED)
// ============================================================================

async function handleWeatherLocationSelection(userId, input, session) {
    console.log(`🔥 [HOT-UPDATES] Weather location selection: ${input}`);

    const locationKeys = Object.keys(HOT_UPDATES_CONFIG.WEATHER_LOCATIONS);
    if (!locationKeys.includes(input)) {
        return {
            message: `❓ Invalid location. Please reply with a number *1-24*\n\n${UI_MESSAGES.HOT_UPDATES.WEATHER_LOCATION_PROMPT}`,
            session: session
        };
    }

    const location = HOT_UPDATES_CONFIG.WEATHER_LOCATIONS[input];
    
    updateSession(session, FLOW_STATES.HOT_UPDATES.SELECT_SERVICE, {
        selectedLocation: location.id,
        locationName: location.name,
        locationEmoji: location.emoji,
        coordinates: location.coordinates
    });

    return handleWeatherRequest(userId, session);
}

async function handleWeatherRequest(userId, session) {
    const locationId = session.data.selectedLocation;
    const locationName = session.data.locationName;
    const locationEmoji = session.data.locationEmoji || '🌦️';
    
    console.log(`🔥 [HOT-UPDATES] Fetching weather for ${locationName} (${locationId})`);
    
  //  await messaging.sendMessage(userId, `🌦️ Fetching weather for ${locationName}...`);
    
    try {
        const data = await wordpressApi.fetchWeatherForecast(locationId);
        
        let forecastText = '';
        
        if (typeof data === 'string') {
            forecastText = data;
        } else if (data.formatted && typeof data.formatted === 'string') {
            forecastText = data.formatted;
        } else if (data.forecast && typeof data.forecast === 'string') {
            forecastText = data.forecast;
        } else {
            forecastText = HOT_UPDATES_CONFIG.SAMPLE_DATA.WEATHER(locationId);
        }
        
        const location = HOT_UPDATES_CONFIG.WEATHER_LOCATIONS[
            Object.keys(HOT_UPDATES_CONFIG.WEATHER_LOCATIONS).find(
                key => HOT_UPDATES_CONFIG.WEATHER_LOCATIONS[key].id === locationId
            )
        ] || { name: locationName, emoji: locationEmoji, description: '', coordinates: { lat: 0, lon: 0 } };
        
        const fullMessage = `🌦️ *Weather - ${location.name}*\n` +
            `${location.emoji} ${location.description || ''}\n\n` +
            `${forecastText}\n\n` +
            `📍 *Coordinates:* ${location.coordinates.lat}°, ${location.coordinates.lon}°`;
        
        const tipMessage = `💡 *Tip:* ${getDailyTip()}`;
        let finalMessage = fullMessage + `\n\n${tipMessage}`;
        
        let displayMessage = finalMessage;
        if (finalMessage.length > MAX_BUTTON_BODY) {
            displayMessage = finalMessage.substring(0, MAX_BUTTON_BODY - 50) + `\n\n... (message truncated)`;
        }
        
        await messaging.sendButtonMessage(
            userId,
            displayMessage,
            [
                { id: "hu_back", title: "🔙 Hot Updates" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error fetching weather data:`, error.message);
        
        const sampleForecast = HOT_UPDATES_CONFIG.SAMPLE_DATA.WEATHER(locationId);
        const location = { name: locationName, emoji: locationEmoji, description: '', coordinates: { lat: 0, lon: 0 } };
        
        const fallbackMessage = `🌦️ *Weather - ${location.name}*\n` +
            `${location.emoji}\n\n` +
            `${sampleForecast}\n\n` +
            `_Note: Using sample data. Live updates will be back soon._`;
        
        const tipMessage = `💡 *Tip:* ${getDailyTip()}`;
        let finalMessage = fallbackMessage + `\n\n${tipMessage}`;
        
        let displayMessage = finalMessage;
        if (finalMessage.length > MAX_BUTTON_BODY) {
            displayMessage = finalMessage.substring(0, MAX_BUTTON_BODY - 50) + `\n\n... (message truncated)`;
        }
        
        await messaging.sendButtonMessage(
            userId,
            displayMessage,
            [
                { id: "hu_back", title: "🔙 Hot Updates" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
        
        return {
            message: null,
            session: session,
            returnToMain: false
        };
    }
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