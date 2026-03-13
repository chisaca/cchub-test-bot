// services/eplService.js
// ============================================================================
// EPL SOCCER UPDATES SERVICE
// Provides English Premier League standings, fixtures, and results
// Fetches data from WordPress REST API with fallback to sample data
// ============================================================================

const axios = require('axios');
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
const CACHE_TTL = WORDPRESS_CONFIG.CACHE_TTL.EPL * 1000; // Convert seconds to ms
const cache = {
    data: null,
    timestamp: null
};

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Fetch and return EPL updates
 * Can be called directly or through the main hotUpdates service
 * 
 * @param {string} userId - WhatsApp user ID (optional, for logging)
 * @param {boolean} sendMessage - Whether to send message directly or return formatted string
 * @returns {Promise<string|Object>} Formatted EPL data or message result
 */
async function getEplUpdates(userId = null, sendMessage = false) {
    console.log(`⚽ [EPL] Fetching EPL updates${userId ? ` for ${userId}` : ''}`);
    
    try {
        // Send loading message if we're sending directly
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, INFO_SERVICE_MESSAGES.LOADING);
        }
        
        // Try to fetch from WordPress API
        const data = await fetchEplData();
        
        // Format the response (WordPress already formats with ?format=whatsapp)
        const formattedMessage = data.formatted || formatEplResponse(data);
        
        // Add navigation options - only 'hi' for main menu
        const fullMessage = formattedMessage + `\n\n────────────────\nReply *hi* for Main Menu`;
        
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, fullMessage);
            return { success: true };
        }
        
        return fullMessage;
        
    } catch (error) {
        console.error(`⚽ [EPL] Error fetching EPL data:`, error.message);
        
        // Fallback to sample data
        const fallbackMessage = getSampleData() + 
            `\n\n────────────────\nReply *hi* for Main Menu`;
        
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, fallbackMessage);
            return { success: true, usedFallback: true };
        }
        
        return fallbackMessage;
    }
}

// In services/eplService.js - replace your fetchEplData function with this debug version

async function fetchEplData() {
    // Check cache first (only if it has real data)
    if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_TTL)) {
        console.log(`⚽ [EPL] Returning cached data (${Math.round((Date.now() - cache.timestamp) / 1000)}s old)`);
        return cache.data;
    }
    
    // Fetch fresh data - get ALL data types separately to ensure we have fixtures with dates
    console.log(`⚽ [EPL] Fetching fresh data from WordPress API`);
    
    // Fetch different data types in parallel
    const [standingsData, fixturesData, resultsData, topScorersData] = await Promise.allSettled([
        wordpressApi.fetchEplStandings ? wordpressApi.fetchEplStandings() : Promise.resolve(null),
        wordpressApi.fetchEplFixtures ? wordpressApi.fetchEplFixtures() : wordpressApi.fetchEplUpdates(),
        wordpressApi.fetchEplResults ? wordpressApi.fetchEplResults() : Promise.resolve(null),
        wordpressApi.fetchEplTopScorers ? wordpressApi.fetchEplTopScorers() : Promise.resolve(null)
    ]);
    
    // ========================================================================
    // DEBUGGING - Log what came back from WordPress
    // ========================================================================
    console.log(`⚽ [EPL] ========== API RESPONSE DEBUG ==========`);
    
    // Check standings
    if (standingsData.status === 'fulfilled') {
        console.log(`⚽ [EPL] Standings received:`, {
            type: typeof standingsData.value,
            isArray: Array.isArray(standingsData.value),
            hasRaw: standingsData.value?.raw ? 'yes' : 'no',
            hasFormatted: standingsData.value?.formatted ? 'yes' : 'no',
            length: standingsData.value?.raw?.length || standingsData.value?.length || 0
        });
    } else {
        console.log(`⚽ [EPL] Standings failed:`, standingsData.reason?.message);
    }
    
    // Check fixtures - THIS IS THE IMPORTANT ONE
    if (fixturesData.status === 'fulfilled') {
        console.log(`⚽ [EPL] Fixtures received:`, {
            type: typeof fixturesData.value,
            isArray: Array.isArray(fixturesData.value),
            hasRaw: fixturesData.value?.raw ? 'yes' : 'no',
            hasFormatted: fixturesData.value?.formatted ? 'yes' : 'no',
            rawLength: fixturesData.value?.raw?.length || 0,
            directLength: fixturesData.value?.length || 0,
            firstItem: fixturesData.value?.raw?.[0] || fixturesData.value?.[0] || 'none'
        });
        
        // If fixtures exist but in raw property, log them
        if (fixturesData.value?.raw) {
            console.log(`⚽ [EPL] Fixtures raw data:`, JSON.stringify(fixturesData.value.raw).substring(0, 300));
        }
    } else {
        console.log(`⚽ [EPL] Fixtures failed:`, fixturesData.reason?.message);
    }
    
    // Check results
    if (resultsData.status === 'fulfilled') {
        console.log(`⚽ [EPL] Results received:`, {
            type: typeof resultsData.value,
            isArray: Array.isArray(resultsData.value),
            hasRaw: resultsData.value?.raw ? 'yes' : 'no',
            length: resultsData.value?.raw?.length || resultsData.value?.length || 0
        });
    } else {
        console.log(`⚽ [EPL] Results failed:`, resultsData.reason?.message);
    }
    
    // Check top scorers
    if (topScorersData.status === 'fulfilled') {
        console.log(`⚽ [EPL] Top scorers received:`, {
            type: typeof topScorersData.value,
            isArray: Array.isArray(topScorersData.value),
            hasRaw: topScorersData.value?.raw ? 'yes' : 'no',
            length: topScorersData.value?.raw?.length || topScorersData.value?.length || 0
        });
    } else {
        console.log(`⚽ [EPL] Top scorers failed:`, topScorersData.reason?.message);
    }
    
    console.log(`⚽ [EPL] ========== END DEBUG ==========`);
    // ========================================================================
    
    // Combine the data - FIXED to handle WordPress response structure
    const data = {
        standings: standingsData.status === 'fulfilled' ? (standingsData.value?.raw || standingsData.value) : null,
        fixtures: fixturesData.status === 'fulfilled' ? (fixturesData.value?.raw || fixturesData.value) : null,
        results: resultsData.status === 'fulfilled' ? (resultsData.value?.raw || resultsData.value) : null,
        topScorers: topScorersData.status === 'fulfilled' ? (topScorersData.value?.raw || topScorersData.value) : null,
        lastUpdated: new Date().toISOString()
    };
    
    // Log what we're about to cache
    console.log(`⚽ [EPL] Combined data - Fixtures array length: ${data.fixtures?.length || 0}`);
    
    // Check if we got any real data
    const hasRealData = 
        (data.standings && !data.standings.usedFallback && data.standings.length > 0) ||
        (data.fixtures && !data.fixtures.usedFallback && data.fixtures.length > 0) ||
        (data.results && !data.results.usedFallback && data.results.length > 0) ||
        (data.topScorers && !data.topScorers.usedFallback && data.topScorers.length > 0);
    
    // Log final decision
    console.log(`⚽ [EPL] Has real data: ${hasRealData}, Caching: ${hasRealData}`);
    
    // ONLY cache if we got real data back
    if (hasRealData) {
        cache.data = data;
        cache.timestamp = Date.now();
        console.log(`⚽ [EPL] Cached real data with ${data.fixtures?.length || 0} fixtures`);
    } else {
        // Don't cache empty/sample data - next request will try API again
        console.log(`⚽ [EPL] No real data received - not caching`);
        // Clear any existing cache
        cache.data = null;
        cache.timestamp = null;
    }
    
    return data;
}

/**
 * Fetch EPL fixtures with date range
 * 
 * @returns {Promise<Object>} EPL fixtures
 */
async function fetchEplFixtures() {
    try {
        // Use the dedicated fixtures function if available
        if (wordpressApi.fetchEplFixtures) {
            return await wordpressApi.fetchEplFixtures();
        }
        
        // Fallback to generic fetch
        return await wordpressApi.fetchEplUpdates();
    } catch (error) {
        console.error(`⚽ [EPL] Error fetching fixtures:`, error.message);
        return { usedFallback: true, fixtures: [] };
    }
}

// ============================================================================
// RESPONSE FORMATTER (Fallback only - WordPress does main formatting)
// ============================================================================

/**
 * Format EPL data into readable WhatsApp message
 * This is only used when WordPress doesn't return formatted data
 * 
 * @param {Object} data - EPL data from API
 * @returns {string} Formatted message
 */
function formatEplResponse(data) {
    // If WordPress already formatted it, return as-is
    if (data && data.formatted) {
        return data.formatted;
    }
    
    if (!data) {
        return getSampleData();
    }
    
    try {
        let message = `⚽ *ENGLISH PREMIER LEAGUE*\n\n`;
        let hasAnyContent = false;
        
        // Add timestamp if available
        if (data.lastUpdated) {
            const date = new Date(data.lastUpdated);
            message += `_Updated: ${date.toLocaleDateString('en-ZW', { 
                weekday: 'short', 
                day: 'numeric', 
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}_\n\n`;
        }
        
        // ====================================================================
        // STANDINGS SECTION
        // ====================================================================
        if (data.standings && data.standings.length > 0) {
            hasAnyContent = true;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `📊 *LEAGUE STANDINGS*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.standings.slice(0, 10).forEach((team, index) => {
                const position = (index + 1).toString().padStart(2, ' ');
                const name = team.name || team.team || '';
                const played = team.played || team.pld || team.playedGames || 0;
                const points = team.points || team.pts || 0;
                
                let emoji = '';
                if (index === 0) emoji = '👑 ';
                else if (index < 4) emoji = '⭐ ';
                else if (index > 16) emoji = '⬇️ ';
                else emoji = '   ';
                
                message += `${emoji}${position}. ${name.substring(0, 15)} ${played} ${points}pts\n`;
            });
            message += `\n`;
        } else {
            message += `📊 *LEAGUE STANDINGS*\n📭 No standings available yet\n\n`;
        }
        
        // ====================================================================
        // FORM GUIDE
        // ====================================================================
        if (data.form && data.form.length > 0) {
            hasAnyContent = true;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `🔥 *FORM GUIDE*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.form.slice(0, 5).forEach(team => {
                const name = team.name || team.team || '';
                const form = team.form || '';
                const formEmojis = form.split('').map(result => {
                    if (result === 'W') return '✅';
                    if (result === 'D') return '🟰';
                    if (result === 'L') return '❌';
                    return '⬜';
                }).join(' ');
                
                message += `${name.substring(0, 12)} ${formEmojis}\n`;
            });
            message += `\n`;
        }
        
        // ====================================================================
        // NEXT FIXTURES
        // ====================================================================
        if (data.fixtures && data.fixtures.length > 0) {
            hasAnyContent = true;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `📅 *NEXT FIXTURES*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.fixtures.slice(0, 5).forEach(fixture => {
                const home = fixture.home || fixture.homeTeam || '';
                const away = fixture.away || fixture.awayTeam || '';
                const date = fixture.date || '';
                const time = fixture.time || '';
                
                message += `${home.substring(0, 12)} vs ${away.substring(0, 12)}\n`;
                message += `   📆 ${date} ${time}\n\n`;
            });
        } else {
            message += `📅 *NEXT FIXTURES*\n📭 No upcoming fixtures available yet\n\n`;
        }
        
        // ====================================================================
        // RECENT RESULTS
        // ====================================================================
        if (data.results && data.results.length > 0) {
            hasAnyContent = true;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `✅ *RECENT RESULTS*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.results.slice(0, 5).forEach(result => {
                const home = result.home || result.homeTeam || '';
                const away = result.away || result.awayTeam || '';
                const homeScore = result.home_score || result.homeScore || result.score?.home || 0;
                const awayScore = result.away_score || result.awayScore || result.score?.away || 0;
                
                message += `${home.substring(0, 12)} vs ${away.substring(0, 12)}\n`;
                message += `   🏁 ${homeScore}-${awayScore}`;
                
                if (result.highlight) {
                    message += ` ✨`;
                }
                message += `\n\n`;
            });
        } else {
            message += `✅ *RECENT RESULTS*\n📭 No recent results available yet\n\n`;
        }
        
        // ====================================================================
        // TOP SCORERS
        // ====================================================================
        if (data.topScorers && data.topScorers.length > 0) {
            hasAnyContent = true;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `⚽ *TOP SCORERS*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.topScorers.slice(0, 5).forEach((scorer, index) => {
                const name = scorer.player || scorer.name || '';
                const goals = scorer.goals || 0;
                const team = scorer.team ? ` (${scorer.team})` : '';
                
                message += `${index + 1}. ${name.substring(0, 15)} ${goals} goals${team}\n`;
            });
            message += `\n`;
        } else {
            message += `⚽ *TOP SCORERS*\n📭 No top scorers data available yet\n\n`;
        }
        
        // If absolutely no data at all, use sample
        if (!hasAnyContent && !data.standings && !data.fixtures && !data.results && !data.topScorers) {
            return getSampleData();
        }
        
        return message;
        
    } catch (error) {
        console.error(`⚽ [EPL] Error formatting response:`, error);
        return getSampleData();
    }
}

// ============================================================================
// SAMPLE DATA (Fallback)
// ============================================================================

/**
 * Get sample EPL data when API is unavailable
 * 
 * @returns {string} Formatted sample EPL data
 */
function getSampleData() {
    const sample = HOT_UPDATES_CONFIG.SAMPLE_DATA.EPL;
    
    // If sample is a function (it is in constants), call it
    if (typeof sample === 'function') {
        return sample();
    }
    
    return sample || `⚽ *ENGLISH PREMIER LEAGUE*\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📊 *LEAGUE STANDINGS*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `👑 1. Arsenal        25pts\n` +
        `⭐ 2. Man City        24pts\n` +
        `⭐ 3. Liverpool       23pts\n` +
        `⭐ 4. Aston Villa     22pts\n` +
        `   5. Chelsea         19pts\n` +
        `   6. Tottenham       18pts\n` +
        `   7. Newcastle       17pts\n` +
        `   8. Man United      16pts\n` +
        `   9. Brighton        15pts\n` +
        `  10. West Ham        14pts\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📅 *NEXT FIXTURES*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Arsenal      vs Chelsea\n   📆 Sat 15:00\n\n` +
        `Man City     vs Spurs\n   📆 Sun 16:30\n\n` +
        `Liverpool    vs Everton\n   📆 Sun 14:00\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `⚽ *TOP SCORERS*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `1. Haaland     12 goals (MCI)\n` +
        `2. Salah       10 goals (LIV)\n` +
        `3. Watkins     9 goals (AVA)\n` +
        `4. Palmer      8 goals (CHE)\n` +
        `5. Solanke     7 goals (BOU)`;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clear the cache (useful for testing)
 */
function clearCache() {
    cache.data = null;
    cache.timestamp = null;
    console.log(`⚽ [EPL] Cache cleared`);
}

/**
 * Get cache status
 * 
 * @returns {Object} Cache status
 */
function getCacheStatus() {
    return {
        hasData: !!cache.data,
        age: cache.timestamp ? Date.now() - cache.timestamp : null,
        expiresIn: cache.timestamp ? (CACHE_TTL - (Date.now() - cache.timestamp)) : null
    };
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    getEplUpdates,
    fetchEplData,
    fetchEplFixtures,
    formatEplResponse,
    clearCache,
    getCacheStatus,
    
    // For testing
    _sampleData: getSampleData
};