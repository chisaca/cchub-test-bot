// services/newsService.js
// ============================================================================
// ZIMBABWE NEWS SERVICE
// Provides latest headlines from Herald, Chronicle, Newsday and other sources
// Fetches data from WordPress REST API with fallback to sample data
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

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes (news changes more frequently)
const cache = {
    data: null,
    timestamp: null
};

// News sources in Zimbabwe
const NEWS_SOURCES = [
    { name: 'The Herald', emoji: '📰' },
    { name: 'The Chronicle', emoji: '📰' },
    { name: 'NewsDay', emoji: '📱' },
    { name: 'ZBC News', emoji: '📺' },
    { name: '263Chat', emoji: '💬' },
    { name: 'Bulawayo24', emoji: '🌍' }
];

// News categories
const NEWS_CATEGORIES = {
    NATIONAL: '🇿🇼 National',
    POLITICS: '🏛️ Politics',
    BUSINESS: '💼 Business',
    SPORTS: '⚽ Sports',
    ENTERTAINMENT: '🎭 Entertainment',
    TECHNOLOGY: '💻 Technology',
    WORLD: '🌐 World'
};

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

/**
 * Fetch and return Zimbabwe news updates
 * Can be called directly or through the main hotUpdates service
 * 
 * @param {string} userId - WhatsApp user ID (optional, for logging)
 * @param {boolean} sendMessage - Whether to send message directly or return formatted string
 * @param {string} category - Optional category filter
 * @returns {Promise<string|Object>} Formatted news data or message result
 */
async function getNewsUpdates(userId = null, sendMessage = false, category = null) {
    console.log(`📰 [NEWS] Fetching news updates${userId ? ` for ${userId}` : ''}${category ? ` (${category})` : ''}`);
    
    try {
        // Try to fetch from WordPress API
        const data = await fetchNewsData(category);
        
        // Format the response
        const formattedMessage = formatNewsResponse(data, category);
        
        // Add navigation options
        const fullMessage = formattedMessage + 
            `\n\n────────────────\nReply *0* for Main Menu or *5* for Hot Updates`;
        
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, fullMessage);
            return { success: true };
        }
        
        return fullMessage;
        
    } catch (error) {
        console.error(`📰 [NEWS] Error fetching news data:`, error.message);
        
        // Fallback to sample data
        const fallbackMessage = getSampleData(category) + 
            `\n\n────────────────\nReply *0* for Main Menu or *5* for Hot Updates`;
        
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, fallbackMessage);
            return { success: true, usedFallback: true };
        }
        
        return fallbackMessage;
    }
}

/**
 * Fetch news data from WordPress API with caching
 * 
 * @param {string} category - Optional category filter
 * @returns {Promise<Object>} News data
 */
async function fetchNewsData(category = null) {
    // Check cache first (only if no category filter)
    if (!category && cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_TTL)) {
        console.log(`📰 [NEWS] Returning cached data (${Math.round((Date.now() - cache.timestamp) / 1000)}s old)`);
        return cache.data;
    }
    
    // Fetch fresh data
    console.log(`📰 [NEWS] Fetching fresh data from WordPress API${category ? ` for category: ${category}` : ''}`);
    const data = await wordpressApi.fetchNewsUpdates(category);
    
    // Update cache only if no category filter
    if (!category) {
        cache.data = data;
        cache.timestamp = Date.now();
    }
    
    return data;
}

// ============================================================================
// RESPONSE FORMATTER
// ============================================================================

/**
 * Format news data into readable WhatsApp message
 * 
 * @param {Object} data - News data from API
 * @param {string} category - Optional category filter
 * @returns {string} Formatted message
 */
function formatNewsResponse(data, category = null) {
    if (!data || !data.headlines || data.headlines.length === 0) {
        return getSampleData(category);
    }
    
    try {
        // Set title based on category
        let title = `📰 *ZIMBABWE NEWS`;
        if (category && NEWS_CATEGORIES[category.toUpperCase()]) {
            title += ` - ${NEWS_CATEGORIES[category.toUpperCase()]}`;
        } else if (category) {
            title += ` - ${category}`;
        }
        title += `*\n\n`;
        
        let message = title;
        
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
        // TOP STORIES SECTION
        // ====================================================================
        if (data.headlines && data.headlines.length > 0) {
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `🔥 *TOP STORIES*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n\n`;
            
            data.headlines.slice(0, 8).forEach((headline, index) => {
                // Add numbering
                message += `${index + 1}. `;
                
                // Add emoji based on category if available
                if (headline.category) {
                    const categoryEmoji = getCategoryEmoji(headline.category);
                    message += `${categoryEmoji} `;
                }
                
                // Title with bold
                message += `*${headline.title}*\n`;
                
                // Summary if available
                if (headline.summary) {
                    message += `   ${headline.summary}\n`;
                }
                
                // Source and time
                const source = headline.source || 'Zimbabwe News';
                const timeAgo = headline.timestamp ? getTimeAgo(new Date(headline.timestamp)) : '';
                
                message += `   📍 _${source}_`;
                if (timeAgo) {
                    message += ` • ${timeAgo}`;
                }
                
                // URL if available (but don't show full URL, just indicator)
                if (headline.url) {
                    message += ` • 🔗 Read more`;
                }
                
                message += `\n\n`;
            });
        }
        
        // ====================================================================
        // CATEGORY BREAKDOWN SECTION (if no specific category)
        // ====================================================================
        if (!category && data.byCategory) {
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `📋 *BY CATEGORY*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n\n`;
            
            // Show a few headlines from each category
            const categories = Object.keys(data.byCategory).slice(0, 3);
            
            for (const cat of categories) {
                const catName = NEWS_CATEGORIES[cat.toUpperCase()] || cat;
                const catEmoji = getCategoryEmoji(cat);
                const headlines = data.byCategory[cat].slice(0, 2);
                
                message += `${catEmoji} *${catName}*\n`;
                
                headlines.forEach(h => {
                    message += `   • ${h.title.substring(0, 40)}...\n`;
                });
                
                message += `\n`;
            }
        }
        
        // ====================================================================
        // SOURCES SECTION
        // ====================================================================
        if (data.sources && data.sources.length > 0) {
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `📡 *SOURCES*\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
            
            const sourcesShown = data.sources.slice(0, 4);
            sourcesShown.forEach(source => {
                const sourceEmoji = NEWS_SOURCES.find(s => s.name === source)?.emoji || '📰';
                message += `${sourceEmoji} ${source}\n`;
            });
            
            message += `\n`;
        }
        
        return message;
        
    } catch (error) {
        console.error(`📰 [NEWS] Error formatting response:`, error);
        return getSampleData(category);
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get emoji for news category
 * 
 * @param {string} category - News category
 * @returns {string} Appropriate emoji
 */
function getCategoryEmoji(category) {
    const cat = (category || '').toLowerCase();
    
    if (cat.includes('national') || cat.includes('local')) return '🇿🇼';
    if (cat.includes('politic')) return '🏛️';
    if (cat.includes('business') || cat.includes('economy')) return '💼';
    if (cat.includes('sport')) return '⚽';
    if (cat.includes('entertainment')) return '🎭';
    if (cat.includes('tech')) return '💻';
    if (cat.includes('world') || cat.includes('international')) return '🌐';
    if (cat.includes('health')) return '🏥';
    if (cat.includes('education')) return '📚';
    if (cat.includes('agric')) return '🌾';
    
    return '📰';
}

/**
 * Get human-readable time ago string
 * 
 * @param {Date} date - Date to compare
 * @returns {string} Time ago string
 */
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' });
}

// ============================================================================
// SAMPLE DATA (Fallback)
// ============================================================================

/**
 * Get sample news data when API is unavailable
 * 
 * @param {string} category - Optional category filter
 * @returns {string} Formatted sample news data
 */
function getSampleData(category = null) {
    const sample = HOT_UPDATES_CONFIG.SAMPLE_DATA.NEWS;
    
    // If sample is a function (it is in constants), call it
    if (typeof sample === 'function') {
        return sample(category);
    }
    
    // Default sample if constants sample is not available
    if (category) {
        return getCategorySampleData(category);
    }
    
    return `📰 *ZIMBABWE NEWS HEADLINES*

━━━━━━━━━━━━━━━━━━
🔥 *TOP STORIES*
━━━━━━━━━━━━━━━━━━

1. 🇿🇼 *Government announces new economic measures*
   President outlines plans for economic recovery
   📍 _The Herald_ • 2 hours ago

2. 🏛️ *Parliament passes education reform bill*
   New curriculum to be implemented next term
   📍 _NewsDay_ • 5 hours ago

3. 💼 *Zimbabwe dollar remains stable*
   RBZ governor cites positive market sentiment
   📍 _The Chronicle_ • 8 hours ago

4. ⚽ *Warriors prepare for World Cup qualifier*
   Team trains in Harare ahead of crucial match
   📍 _ZBC News_ • 12 hours ago

5. 🌾 *Farmers expect bumper harvest*
   Good rains boost agricultural outlook
   📍 _The Herald_ • 1 day ago

━━━━━━━━━━━━━━━━━━
📡 *SOURCES*
━━━━━━━━━━━━━━━━━━
📰 The Herald
📰 The Chronicle
📱 NewsDay
📺 ZBC News

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_

────────────────
Reply *0* for Main Menu or *5* for Hot Updates`;
}

/**
 * Get category-specific sample data
 * 
 * @param {string} category - News category
 * @returns {string} Formatted category sample data
 */
function getCategorySampleData(category) {
    const cat = (category || '').toLowerCase();
    
    if (cat.includes('politic')) {
        return `📰 *ZIMBABWE NEWS - POLITICS*

━━━━━━━━━━━━━━━━━━
🏛️ *POLITICAL HEADLINES*
━━━━━━━━━━━━━━━━━━

1. *Parliament passes education reform bill*
   New curriculum to be implemented next term
   📍 _NewsDay_ • 5 hours ago

2. *Opposition parties form coalition*
   Alliance aims for 2025 elections
   📍 _The Herald_ • 1 day ago

3. *Cabinet reshuffle expected next week*
   Sources indicate changes in key ministries
   📍 _The Chronicle_ • 2 days ago

4. *Electoral commission announces voter registration drive*
   Mobile teams to visit all provinces
   📍 _ZBC News_ • 3 days ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_

────────────────
Reply *0* for Main Menu or *5* for Hot Updates`;
    }
    
    if (cat.includes('business')) {
        return `📰 *ZIMBABWE NEWS - BUSINESS*

━━━━━━━━━━━━━━━━━━
💼 *BUSINESS HEADLINES*
━━━━━━━━━━━━━━━━━━

1. *Zimbabwe dollar remains stable*
   RBZ governor cites positive market sentiment
   📍 _The Chronicle_ • 8 hours ago

2. *Mining sector exceeds export targets*
   Gold and platinum production up 15%
   📍 _The Herald_ • 1 day ago

3. *New bank launches mobile lending platform*
   Interest rates as low as 5% per month
   📍 _NewsDay_ • 2 days ago

4. *Tourism industry shows strong recovery*
   Victoria Falls records highest visitor numbers
   📍 _ZBC News_ • 3 days ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_

────────────────
Reply *0* for Main Menu or *5* for Hot Updates`;
    }
    
    if (cat.includes('sport')) {
        return `📰 *ZIMBABWE NEWS - SPORTS*

━━━━━━━━━━━━━━━━━━
⚽ *SPORTS HEADLINES*
━━━━━━━━━━━━━━━━━━

1. *Warriors prepare for World Cup qualifier*
   Team trains in Harare ahead of crucial match
   📍 _ZBC News_ • 12 hours ago

2. *Chevrons announce squad for T20 series*
   Veteran players return for Pakistan tour
   📍 _The Herald_ • 1 day ago

3. *Local derby ends in thrilling draw*
   Dynamos 2-2 Highlanders at National Sports Stadium
   📍 _NewsDay_ • 2 days ago

4. *Zimbabwean sprinter qualifies for Olympics*
   Sets new national record in 100m
   📍 _The Chronicle_ • 3 days ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_

────────────────
Reply *0* for Main Menu or *5* for Hot Updates`;
    }
    
    // Default to general news
    return `📰 *ZIMBABWE NEWS - ${category.toUpperCase()}*

━━━━━━━━━━━━━━━━━━
📋 *HEADLINES*
━━━━━━━━━━━━━━━━━━

1. *Top story in this category*
   Brief summary of the news item
   📍 _News Source_ • 2 hours ago

2. *Second major story*
   More details about this development
   📍 _Another Source_ • 5 hours ago

3. *Third important update*
   Key information for readers
   📍 _Third Source_ • 1 day ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_

────────────────
Reply *0* for Main Menu or *5* for Hot Updates`;
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
    console.log(`📰 [NEWS] Cache cleared`);
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

/**
 * Get available news categories
 * 
 * @returns {Array} List of categories
 */
function getCategories() {
    return Object.keys(NEWS_CATEGORIES).map(key => ({
        id: key.toLowerCase(),
        name: NEWS_CATEGORIES[key],
        emoji: getCategoryEmoji(key)
    }));
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    getNewsUpdates,
    fetchNewsData,
    formatNewsResponse,
    clearCache,
    getCacheStatus,
    getCategories,
    NEWS_CATEGORIES,
    NEWS_SOURCES,
    
    // For testing
    _sampleData: getSampleData,
    _getTimeAgo: getTimeAgo
};