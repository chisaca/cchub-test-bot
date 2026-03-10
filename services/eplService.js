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

/**
 * Fetch EPL data from WordPress API with caching
 * 
 * @returns {Promise<Object>} EPL data
 */
async function fetchEplData() {
    // Check cache first
    if (cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_TTL)) {
        console.log(`⚽ [EPL] Returning cached data (${Math.round((Date.now() - cache.timestamp) / 1000)}s old)`);
        return cache.data;
    }
    
    // Fetch fresh data
    console.log(`⚽ [EPL] Fetching fresh data from WordPress API`);
    const data = await wordpressApi.fetchEplUpdates();
    
    // Update cache
    cache.data = data;
    cache.timestamp = Date.now();
    
    return data;
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
    if (!data) {
        return getSampleData();
    }
    
    // If WordPress already formatted it, return as-is
    if (data.formatted) {
        return data.formatted;
    }
    
    try {
        let message = `⚽ *ENGLISH PREMIER LEAGUE*\n\n`;
        
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
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `📊 *LEAGUE STANDINGS*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            // Show top 10
            data.standings.slice(0, 10).forEach((team, index) => {
                const position = (index + 1).toString().padStart(2, ' ');
                const name = team.name.padEnd(15, ' ').substring(0, 15);
                const played = team.played || team.pld || 0;
                const points = team.points || team.pts || 0;
                
                // Add emoji for top 4 (Champions League)
                let emoji = '';
                if (index === 0) emoji = '👑 '; // Leader
                else if (index < 4) emoji = '⭐ '; // Top 4
                else if (index > 16) emoji = '⬇️ '; // Relegation zone
                else emoji = '   ';
                
                message += `${emoji}${position}. ${name} ${played} ${points}pts\n`;
            });
            
            message += `\n`;
        }
        
        // ====================================================================
        // FORM GUIDE (Last 5 matches for top teams)
        // ====================================================================
        if (data.form && data.form.length > 0) {
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `🔥 *FORM GUIDE*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.form.slice(0, 5).forEach(team => {
                const name = team.name.padEnd(12, ' ').substring(0, 12);
                const form = team.form || '';
                const formEmojis = form.split('').map(result => {
                    if (result === 'W') return '✅';
                    if (result === 'D') return '🟰';
                    if (result === 'L') return '❌';
                    return '⬜';
                }).join(' ');
                
                message += `${name} ${formEmojis}\n`;
            });
            
            message += `\n`;
        }
        
        // ====================================================================
        // NEXT FIXTURES SECTION
        // ====================================================================
        if (data.fixtures && data.fixtures.length > 0) {
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `📅 *NEXT FIXTURES*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.fixtures.slice(0, 5).forEach(fixture => {
                const home = fixture.home.substring(0, 12).padEnd(12, ' ');
                const away = fixture.away.substring(0, 12).padEnd(12, ' ');
                const date = fixture.date || '';
                const time = fixture.time || '';
                
                message += `${home} vs ${away}\n`;
                message += `   📆 ${date} ${time}\n\n`;
            });
        }
        
        // ====================================================================
        // RECENT RESULTS SECTION
        // ====================================================================
        if (data.results && data.results.length > 0) {
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `✅ *RECENT RESULTS*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.results.slice(0, 5).forEach(result => {
                const home = result.home.substring(0, 12).padEnd(12, ' ');
                const away = result.away.substring(0, 12).padEnd(12, ' ');
                const score = result.score || '0-0';
                
                message += `${home} vs ${away}\n`;
                message += `   🏁 ${score}`;
                
                // Add highlight for big matches
                if (result.highlight) {
                    message += ` ✨`;
                }
                message += `\n\n`;
            });
        }
        
        // ====================================================================
        // TOP SCORERS SECTION
        // ====================================================================
        if (data.topScorers && data.topScorers.length > 0) {
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `⚽ *TOP SCORERS*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            data.topScorers.slice(0, 5).forEach((scorer, index) => {
                const name = scorer.name.padEnd(15, ' ').substring(0, 15);
                const goals = scorer.goals || 0;
                const team = scorer.team ? ` (${scorer.team})` : '';
                
                message += `${index + 1}. ${name} ${goals} goals${team}\n`;
            });
            
            message += `\n`;
        }
        
        // If no data at all, use sample
        if (!data.standings && !data.fixtures && !data.results && !data.topScorers) {
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
    formatEplResponse,
    clearCache,
    getCacheStatus,
    
    // For testing
    _sampleData: getSampleData
};