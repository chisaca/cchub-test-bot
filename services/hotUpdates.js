// services/hotUpdates.js - COMPLETE UPDATED VERSION with EPL Submenu & Data Formatting
// ============================================================================
// HOT UPDATES SERVICE
// Provides information services: EPL Soccer, Zimbabwe News, Weather
// Fetches data from WordPress REST API with fallback to sample data
// NOW WITH: 
// - EPL submenu with Table, Fixtures, Results, Top Scorers
// - Proper data formatting for all EPL endpoints
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
 * Called from main menu when user selects Hot Updates
 * 
 * @param {string} userId - WhatsApp user ID
 * @returns {Promise<Object>} Result with message and session
 */
async function startFlow(userId) {
    console.log(`🔥 [HOT-UPDATES] Starting flow for ${userId}`);
    
    // Send ONLY the interactive menu - remove any legacy text menu
    await sendHotUpdatesMenu(userId);
    
    return {
        message: null, // Message already sent
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

// services/hotUpdates.js - REPLACE sendHotUpdatesMenu function

/**
 * Send Hot Updates menu directly (without creating extra session)
 * 
 * @param {string} userId - WhatsApp user ID
 */
async function sendHotUpdatesMenu(userId) {
    console.log(`🔥 [HOT-UPDATES] Sending menu to ${userId}`);
    
    const greeting = getRandomResponse('greeting');
    
    const sections = [{
        title: "🔥 HOT UPDATES",
        rows: [
            { id: "hu_epl", title: "⚽ EPL Soccer", description: "Standings, fixtures, results" },
            { id: "hu_news", title: "📰 Zimbabwe News", description: "Latest headlines" },
            { id: "hu_weather", title: "🌦️ Weather", description: "Forecasts for 24 locations" },
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

/**
 * Send EPL submenu with options using List Message (same style as main menu)
 * 
 * @param {string} userId - WhatsApp user ID
 */
async function sendEplMenu(userId) {
    const sections = [{
        title: "⚽ EPL SOCCER UPDATES", // Section title - plain text
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
        "EPL SOCCER", // Header - PLAIN TEXT, NO ASTERISKS
        "Select what you'd like to see:", // Body - can have markdown
        "View Options",
        sections
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
// EPL DATA FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format EPL standings from raw data
 * 
 * @param {Array} standings - Raw standings data
 * @returns {string} Formatted standings message
 */
function formatEplStandings(standings) {
    if (!standings || !Array.isArray(standings)) {
        return getEplFallbackData('epl_table');
    }
    
    let message = `⚽ *EPL LEAGUE TABLE*\n\n`;
    
    // Take top 10 teams
    standings.slice(0, 10).forEach(team => {
        const championsLeague = team.position <= 4 ? "⭐" : "";
        const europaLeague = team.position === 5 ? "🌙" : "";
        const relegation = team.position >= 18 ? "⬇️" : "";
        const indicator = championsLeague || europaLeague || relegation || "";
        
        message += `${team.position}. ${team.team} ${indicator}\n`;
        message += `   ${team.played}GP | ${team.won}W | ${team.drawn}D | ${team.lost}L | ${team.points}pts\n`;
        message += `   GF:${team.goalsFor} GA:${team.goalsAgainst} GD:${team.goalDifference > 0 ? '+' : ''}${team.goalDifference}\n\n`;
    });
    
    message += `⭐ Champions League | 🌙 Europa League | ⬇️ Relegation`;
    
    return message;
}

/**
 * Format EPL fixtures from raw data
 * 
 * @param {Array} fixtures - Raw fixtures data
 * @returns {string} Formatted fixtures message
 */
function formatEplFixtures(fixtures) {
    if (!fixtures || !Array.isArray(fixtures)) {
        return getEplFallbackData('epl_fixtures');
    }
    
    let message = `⚽ *UPCOMING FIXTURES*\n\n`;
    
    fixtures.slice(0, 10).forEach(fixture => {
        const date = new Date(fixture.date).toLocaleDateString('en-ZW', { 
            weekday: 'short', 
            day: 'numeric', 
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        message += `${date}\n`;
        message += `${fixture.homeTeam} vs ${fixture.awayTeam}\n`;
        if (fixture.venue) message += `📍 ${fixture.venue}\n`;
        message += `\n`;
    });
    
    return message;
}

/**
 * Format EPL results from raw data
 * 
 * @param {Array} results - Raw results data
 * @returns {string} Formatted results message
 */
function formatEplResults(results) {
    if (!results || !Array.isArray(results)) {
        return getEplFallbackData('epl_results');
    }
    
    let message = `⚽ *RECENT RESULTS*\n\n`;
    
    results.slice(0, 10).forEach(match => {
        const date = new Date(match.date).toLocaleDateString('en-ZW', { 
            weekday: 'short', 
            day: 'numeric', 
            month: 'short'
        });
        
        message += `${date}\n`;
        message += `${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}\n`;
        if (match.venue) message += `📍 ${match.venue}\n`;
        message += `\n`;
    });
    
    return message;
}

/**
 * Format EPL top scorers from raw data
 * 
 * @param {Array|Object} scorers - Raw top scorers data
 * @returns {string} Formatted top scorers message
 */
function formatEplTopScorers(scorers) {
    console.log(`🔥 [HOT-UPDATES] formatEplTopScorers called with:`, typeof scorers);
    
    // If no data, use fallback
    if (!scorers) {
        console.log(`🔥 [HOT-UPDATES] No scorers data, using fallback`);
        return getEplFallbackData('epl_top');
    }
    
    // If it's already a string, return it
    if (typeof scorers === 'string') {
        return scorers;
    }
    
    let scorersArray = [];
    
    // Handle different data structures
    if (Array.isArray(scorers)) {
        scorersArray = scorers;
        console.log(`🔥 [HOT-UPDATES] Scorers is array with ${scorersArray.length} items`);
    } else if (scorers.scorers && Array.isArray(scorers.scorers)) {
        scorersArray = scorers.scorers;
        console.log(`🔥 [HOT-UPDATES] Scorers has scorers array with ${scorersArray.length} items`);
    } else if (scorers.data && Array.isArray(scorers.data)) {
        scorersArray = scorers.data;
        console.log(`🔥 [HOT-UPDATES] Scorers has data array with ${scorersArray.length} items`);
    } else if (scorers.topScorers && Array.isArray(scorers.topScorers)) {
        scorersArray = scorers.topScorers;
        console.log(`🔥 [HOT-UPDATES] Scorers has topScorers array with ${scorersArray.length} items`);
    } else {
        // Try to extract any array from the object
        const possibleArrays = Object.values(scorers).filter(val => Array.isArray(val));
        if (possibleArrays.length > 0) {
            scorersArray = possibleArrays[0];
            console.log(`🔥 [HOT-UPDATES] Found array in object with ${scorersArray.length} items`);
        } else {
            console.log(`🔥 [HOT-UPDATES] Could not find array in scorers data`);
            return getEplFallbackData('epl_top');
        }
    }
    
    if (scorersArray.length === 0) {
        console.log(`🔥 [HOT-UPDATES] Scorers array is empty`);
        return getEplFallbackData('epl_top');
    }
    
    // Log the first item to see its structure
    console.log(`🔥 [HOT-UPDATES] First scorer item:`, JSON.stringify(scorersArray[0]).substring(0, 200));
    
    let message = `⚽ *TOP SCORERS*\n\n`;
    
    scorersArray.slice(0, 10).forEach((player, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "⚽";
        
        // Handle different player object structures based on your API
        const playerName = player.name || player.playerName || player.player || player.fullName || `Player ${index + 1}`;
        const teamName = player.team || player.teamName || player.club || player.team_id || "N/A";
        const goals = player.goals || player.total || player.goalsScored || 0;
        const assists = player.assists || 0;
        const appearances = player.appearances || player.matches || player.played || 0;
        
        message += `${medal} ${playerName} (${teamName})\n`;
        message += `   ${goals} goals`;
        if (assists > 0) message += `, ${assists} assists`;
        if (appearances > 0) message += ` in ${appearances} apps`;
        message += `\n\n`;
    });
    
    return message;
}

// ============================================================================
// EPL SUBMENU HANDLER
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
        
        // ========================================================================
        // DEBUG: Log what we actually received
        // ========================================================================
        console.log(`🔥 [HOT-UPDATES] Received data type:`, typeof data);
        console.log(`🔥 [HOT-UPDATES] Data keys:`, Object.keys(data));
        console.log(`🔥 [HOT-UPDATES] Data sample:`, JSON.stringify(data).substring(0, 200));
        
        // ========================================================================
        // Properly extract the formatted message
        // ========================================================================
        let message = '';

        // Case 1: It's already a string
        if (typeof data === 'string') {
            message = data;
            console.log(`🔥 [HOT-UPDATES] Using direct string data`);
        }
        // Case 2: It has a formatted property that might contain the actual data
        else if (data.formatted) {
            console.log(`🔥 [HOT-UPDATES] Data.formatted type:`, typeof data.formatted);
            
            // Check if formatted is a string (this is what we want for WhatsApp)
            if (typeof data.formatted === 'string') {
                message = data.formatted;
                console.log(`🔥 [HOT-UPDATES] ✅ Using data.formatted as string`);
            }
            // Check if formatted has a formatted property (nested)
            else if (data.formatted.formatted) {
                message = data.formatted.formatted;
                console.log(`🔥 [HOT-UPDATES] Using data.formatted.formatted`);
            }
            // Check if formatted has a message property
            else if (data.formatted.message) {
                message = data.formatted.message;
                console.log(`🔥 [HOT-UPDATES] Using data.formatted.message`);
            }
            // Check if formatted has a text property
            else if (data.formatted.text) {
                message = data.formatted.text;
                console.log(`🔥 [HOT-UPDATES] Using data.formatted.text`);
            }
            // Check if formatted has both raw and formatted (this matches your API response)
            else if (data.formatted.raw && data.formatted.formatted) {
                message = data.formatted.formatted;
                console.log(`🔥 [HOT-UPDATES] ✅ Using data.formatted.formatted from raw object`);
            }
            // If formatted is an object with raw data but no formatted string, format it ourselves
            else if (data.formatted.raw) {
                console.log(`🔥 [HOT-UPDATES] Found raw data but no formatted string, formatting manually based on selection: ${selection}`);
                console.log(`🔥 [HOT-UPDATES] Raw data type:`, typeof data.formatted.raw);
                console.log(`🔥 [HOT-UPDATES] Is array?`, Array.isArray(data.formatted.raw));
                
                if (data.formatted.raw) {
                    console.log(`🔥 [HOT-UPDATES] Raw data length:`, data.formatted.raw.length);
                    
                    // Log first item to see structure
                    if (Array.isArray(data.formatted.raw) && data.formatted.raw.length > 0) {
                        console.log(`🔥 [HOT-UPDATES] First item sample:`, JSON.stringify(data.formatted.raw[0]).substring(0, 200));
                    }
                }
                
                switch(selection) {
                    case 'epl_table':
                        message = formatEplStandings(data.formatted.raw);
                        break;
                    case 'epl_fixtures':
                        message = formatEplFixtures(data.formatted.raw);
                        break;
                    case 'epl_results':
                        message = formatEplResults(data.formatted.raw);
                        break;
                    case 'epl_top':
                        console.log(`🔥 [HOT-UPDATES] Formatting top scorers with raw data`);
                        message = formatEplTopScorers(data.formatted.raw);
                        break;
                    default:
                        message = JSON.stringify(data.formatted.raw);
                }
            }
            else {
                // Last resort - stringify the formatted object
                message = JSON.stringify(data.formatted);
                console.log(`🔥 [HOT-UPDATES] Using JSON.stringify on data.formatted`);
            }
        }
        // Case 3: It has a message property
        else if (data.message) {
            message = data.message;
            console.log(`🔥 [HOT-UPDATES] Using data.message`);
        }
        // Case 4: It has a data property
        else if (data.data) {
            if (typeof data.data === 'string') {
                message = data.data;
            } else {
                message = JSON.stringify(data.data);
            }
            console.log(`🔥 [HOT-UPDATES] Using data.data`);
        }
        // Case 5: It's an array - join it
        else if (Array.isArray(data)) {
            message = data.join('\n');
            console.log(`🔥 [HOT-UPDATES] Using array join`);
        }
        // Case 6: Last resort - stringify the whole thing
        else {
            message = JSON.stringify(data, null, 2);
            console.log(`🔥 [HOT-UPDATES] Using JSON.stringify fallback`);
        }
        
        // Ensure we have a string
        if (!message || message === '' || message === '{}') {
            console.log(`🔥 [HOT-UPDATES] No message extracted, using fallback`);
            message = getEplFallbackData(selection);
        }
        
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
        
        // FIXED: Send the data with ONLY two buttons - Hot Updates and Main Menu
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
        
        // Fallback to sample data
        const fallbackMessage = getEplFallbackData(selection);
        
        // FIXED: Send fallback with ONLY two buttons
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
                   `6. Man Utd - 18pts\n` +
                   `7. Newcastle - 17pts\n` +
                   `8. Brighton - 16pts\n` +
                   `9. Aston Villa - 15pts\n` +
                   `10. West Ham - 14pts`;
        
        case 'epl_fixtures':
            return `⚽ *UPCOMING FIXTURES*\n\n` +
                   `*Saturday 20 March*\n` +
                   `15:00 Arsenal vs Chelsea\n` +
                   `15:00 Everton vs West Ham\n` +
                   `17:30 Man City vs Tottenham\n\n` +
                   `*Sunday 21 March*\n` +
                   `14:00 Liverpool vs Man Utd\n` +
                   `16:30 Chelsea vs Arsenal\n\n` +
                   `*Monday 22 March*\n` +
                   `20:00 Newcastle vs Brighton`;
        
        case 'epl_results':
            return `⚽ *RECENT RESULTS*\n\n` +
                   `*Last Round*\n` +
                   `Arsenal 2-1 Liverpool\n` +
                   `Man City 3-0 Chelsea\n` +
                   `Tottenham 1-1 Man Utd\n` +
                   `Newcastle 0-2 Brighton\n` +
                   `Everton 2-2 West Ham\n` +
                   `Aston Villa 1-0 Brentford`;
        
        case 'epl_top':
            return `⚽ *TOP SCORERS*\n\n` +
                   `🥇 Erling Haaland (Man City) - 18 goals\n` +
                   `🥈 Mohamed Salah (Liverpool) - 15 goals\n` +
                   `🥉 Cole Palmer (Chelsea) - 12 goals\n` +
                   `⚽ Ollie Watkins (Aston Villa) - 11 goals\n` +
                   `⚽ Alexander Isak (Newcastle) - 10 goals\n` +
                   `⚽ Bukayo Saka (Arsenal) - 9 goals\n` +
                   `⚽ Son Heung-min (Tottenham) - 8 goals\n` +
                   `⚽ Phil Foden (Man City) - 8 goals\n` +
                   `⚽ Dominic Solanke (Bournemouth) - 7 goals\n` +
                   `⚽ Jarrod Bowen (West Ham) - 7 goals`;
        
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
 * NOW WITH: Only Hot Updates and Main Menu buttons
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
    await messaging.sendMessage(userId, `🌦️ Fetching weather for ${locationName}...`);
    
    try {
        // Try to fetch from WordPress API
        const data = await wordpressApi.fetchWeatherForecast(locationId);
        
        console.log(`🔥 [HOT-UPDATES] Weather data received:`, typeof data);
        console.log(`🔥 [HOT-UPDATES] Data keys:`, Object.keys(data));
        
        // ========================================================================
        // PROPERLY EXTRACT THE FORECAST DATA
        // ========================================================================
        let forecastText = '';
        
        // Case 1: Data is a string (already formatted)
        if (typeof data === 'string') {
            forecastText = data;
        }
        // Case 2: Data has formatted property that's a string
        else if (data.formatted && typeof data.formatted === 'string') {
            forecastText = data.formatted;
        }
        // Case 3: Data has forecast property that's a string
        else if (data.forecast && typeof data.forecast === 'string') {
            forecastText = data.forecast;
        }
        // Case 4: Data is an object with weather data - format it
        else if (data.current || data.daily) {
            forecastText = formatWeatherData(data, locationName);
        }
        // Case 5: Data has raw property with weather data
        else if (data.raw && (data.raw.current || data.raw.daily)) {
            forecastText = formatWeatherData(data.raw, locationName);
        }
        // Case 6: Fallback - stringify but try to make it readable
        else {
            console.log(`🔥 [HOT-UPDATES] Weather data unexpected format:`, JSON.stringify(data).substring(0, 200));
            forecastText = formatWeatherFallback(data, locationName);
        }
        
        // Get location details
        const location = HOT_UPDATES_CONFIG.WEATHER_LOCATIONS[
            Object.keys(HOT_UPDATES_CONFIG.WEATHER_LOCATIONS).find(
                key => HOT_UPDATES_CONFIG.WEATHER_LOCATIONS[key].id === locationId
            )
        ] || { name: locationName, emoji: locationEmoji, description: '', coordinates: { lat: 0, lon: 0 } };
        
        // Build the message
        const fullMessage = `🌦️ *Weather - ${location.name}*\n` +
            `${location.emoji} *${location.description || ''}*\n\n` +
            `${forecastText}\n\n` +
            `📍 *Coordinates:* ${location.coordinates.lat}°, ${location.coordinates.lon}°`;
        
        // Add daily tip
        const tipMessage = `💡 *Tip:* ${getDailyTip()}`;
        let finalMessage = fullMessage + `\n\n${tipMessage}`;
        
        // Truncate if needed
        let displayMessage = finalMessage;
        if (finalMessage.length > MAX_BUTTON_BODY) {
            displayMessage = finalMessage.substring(0, MAX_BUTTON_BODY - 50) + 
                `\n\n... (message truncated)`;
            console.log(`⚠️ [HOT-UPDATES] Weather message truncated from ${finalMessage.length} to ${displayMessage.length} chars`);
        }
        
        // Send with ONLY two buttons: Hot Updates and Main Menu
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
        
        // Fallback to sample data
        const sampleForecast = HOT_UPDATES_CONFIG.SAMPLE_DATA.WEATHER(locationId);
        const location = { 
            name: locationName, 
            emoji: locationEmoji, 
            description: '', 
            coordinates: { lat: 0, lon: 0 } 
        };
        
        const fallbackMessage = `🌦️ *Weather - ${location.name}*\n` +
            `${location.emoji}\n\n` +
            `${sampleForecast}\n\n` +
            `_Note: Using sample data. Live updates will be back soon._`;
        
        // Add daily tip
        const tipMessage = `💡 *Tip:* ${getDailyTip()}`;
        let finalMessage = fallbackMessage + `\n\n${tipMessage}`;
        
        // Truncate if needed
        let displayMessage = finalMessage;
        if (finalMessage.length > MAX_BUTTON_BODY) {
            displayMessage = finalMessage.substring(0, MAX_BUTTON_BODY - 50) + 
                `\n\n... (message truncated)`;
        }
        
        // Send with ONLY two buttons
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

/**
 * Format weather data into readable forecast
 * 
 * @param {Object} data - Weather data object
 * @param {string} locationName - Location name
 * @returns {string} Formatted forecast
 */
function formatWeatherData(data, locationName) {
    try {
        let forecast = '';
        
        // Current weather
        if (data.current) {
            const temp = data.current.temp || data.current.temperature || 'N/A';
            const condition = data.current.condition || data.current.weather || 'N/A';
            const emoji = getWeatherEmoji(condition);
            forecast += `*Current:* ${temp}°C ${emoji} ${condition}\n`;
            
            if (data.current.humidity) {
                forecast += `*Humidity:* ${data.current.humidity}%\n`;
            }
            if (data.current.wind_speed) {
                forecast += `*Wind:* ${data.current.wind_speed} km/h\n`;
            }
            forecast += `\n`;
        }
        
        // 5-day forecast
        if (data.daily && Array.isArray(data.daily)) {
            forecast += `*5-Day Forecast:*\n`;
            data.daily.slice(0, 5).forEach((day, index) => {
                const date = new Date(day.date || Date.now() + (index * 86400000));
                const dayName = date.toLocaleDateString('en-ZW', { weekday: 'short' });
                const temp = day.temp || day.temperature || 'N/A';
                const condition = day.condition || day.weather || 'N/A';
                const emoji = getWeatherEmoji(condition);
                forecast += `${dayName}: ${temp}°C ${emoji} ${condition}\n`;
            });
        } else if (data.list && Array.isArray(data.list)) {
            // Handle OpenWeatherMap format
            forecast += `*5-Day Forecast:*\n`;
            const daily = data.list.filter((item, index) => index % 8 === 0).slice(0, 5);
            daily.forEach((item, index) => {
                const date = new Date(item.dt * 1000);
                const dayName = date.toLocaleDateString('en-ZW', { weekday: 'short' });
                const temp = item.main?.temp || 'N/A';
                const condition = item.weather?.[0]?.description || 'N/A';
                const emoji = getWeatherEmoji(condition);
                forecast += `${dayName}: ${Math.round(temp)}°C ${emoji} ${condition}\n`;
            });
        }
        
        return forecast || `Weather data for ${locationName} is currently unavailable.`;
        
    } catch (error) {
        console.error(`🔥 [HOT-UPDATES] Error formatting weather:`, error);
        return `Weather data for ${locationName} is currently unavailable.`;
    }
}

/**
 * Fallback formatter for unexpected data formats
 */
function formatWeatherFallback(data, locationName) {
    try {
        // Try to extract any useful information
        if (typeof data === 'object') {
            const str = JSON.stringify(data, null, 2);
            if (str.length < 500) {
                return `Weather data received:\n${str}`;
            }
        }
        return `Weather data for ${locationName} is currently unavailable.`;
    } catch (e) {
        return `Weather data for ${locationName} is currently unavailable.`;
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