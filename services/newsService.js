// services/newsService.js
// ============================================================================
// ZIMBABWE NEWS SERVICE
// Provides latest headlines from Herald, Chronicle, Newsday and other sources
// Fetches data from WordPress REST API with fallback to sample data
// Supports pagination with MORE/BACK commands
// ============================================================================

const messaging = require('../utils/messaging');
const wordpressApi = require('../utils/wordpressApi');
const { 
    HOT_UPDATES_CONFIG, 
    UI_MESSAGES,
    WORDPRESS_CONFIG,
    INFO_SERVICE_MESSAGES
} = require('../config/constants');

// ============================================================================
// CONSTANTS
// ============================================================================

// Use TTL from WORDPRESS_CONFIG
const CACHE_TTL = WORDPRESS_CONFIG.CACHE_TTL.NEWS * 1000; // Convert seconds to ms
const cache = {
    data: null,
    timestamp: null
};

// News categories from constants or define here
const NEWS_CATEGORIES = {
    NATIONAL: '🇿🇼 National',
    POLITICS: '🏛️ Politics',
    BUSINESS: '💼 Business',
    SPORTS: '⚽ Sports',
    TECHNOLOGY: '💻 Technology',
    LOCAL: '🇿🇼 Local',
    FOOTBALL: '⚽ Football'
};

// Pagination: Show 10 headlines per page
const PAGE_SIZE = 10;
const SUMMARY_LENGTH = 60;

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
 * @param {number} page - Page number (1-based)
 * @returns {Promise<string|Object>} Formatted news data or message result
 */
async function getNewsUpdates(userId = null, sendMessage = false, category = null, page = 1) {
    console.log(`📰 [NEWS] Fetching news updates${userId ? ` for ${userId}` : ''}${category ? ` (${category})` : ''} page ${page}`);
    
    try {
        // Send loading message if we're sending directly
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, UI_MESSAGES.HOT_UPDATES.FETCHING_NEWS);
        }
        
        // Try to fetch from WordPress API with higher limit for pagination
        const data = await fetchNewsData(category, 50); // Fetch up to 50 headlines
        
        // Extract raw data if available, otherwise use data as is
        let newsData = data;
        if (data && data.raw) {
            newsData = data.raw;  // Use raw array for pagination
        }
        
        const formattedMessage = formatNewsResponse(newsData, category, page);
        
        if (sendMessage && userId) {
            await messaging.sendMessage(userId, formattedMessage);
            return { success: true };
        }
        
        return formattedMessage;
        
    } catch (error) {
        console.error(`📰 [NEWS] Error fetching news data:`, error.message);
        
        // Fallback to sample data
        const fallbackMessage = getSampleData(category) + 
            `\n\n────────────────\nReply *MORE* for more headlines or *hi* for Main Menu`;
        
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
 * @param {number} limit - Number of headlines to fetch (default 50)
 * @returns {Promise<Object>} News data
 */
async function fetchNewsData(category = null, limit = 50) {
    // Check cache first (only if no category filter)
    if (!category && cache.data && cache.timestamp && (Date.now() - cache.timestamp < CACHE_TTL)) {
        console.log(`📰 [NEWS] Returning cached data (${Math.round((Date.now() - cache.timestamp) / 1000)}s old)`);
        return cache.data;
    }
    
    // Fetch fresh data with limit
    console.log(`📰 [NEWS] Fetching fresh data from WordPress API${category ? ` for category: ${category}` : ''} with limit: ${limit}`);
    const data = await wordpressApi.fetchNewsUpdates(category, limit);
    
    // Update cache only if no category filter
    if (!category) {
        cache.data = data;
        cache.timestamp = Date.now();
    }
    
    return data;
}

// ============================================================================
// RESPONSE FORMATTER with Pagination
// ============================================================================

/**
 * Format news data into readable WhatsApp message with pagination
 * 
 * @param {Object} data - News data from API
 * @param {string} category - Optional category filter
 * @param {number} page - Page number (1-based)
 * @returns {string} Formatted message
 */
function formatNewsResponse(data, category = null, page = 1) {
    console.log(`📰 [NEWS] Formatting page ${page}, data type:`, 
        Array.isArray(data) ? `array(${data.length})` : typeof data);

    // Force page to be at least 1
    page = Math.max(1, page);
    
    // Handle case where data is already an array (raw headlines)
    let headlines = [];
    let lastUpdated = null;

    if (Array.isArray(data)) {
        headlines = data;
    } else if (data && data.headlines) {
        headlines = data.headlines;
        lastUpdated = data.lastUpdated;
    } else if (data && data.news) {
        headlines = data.news;
        lastUpdated = data.last_updated;
    } else if (data && data.data && data.data.news) {
        headlines = data.data.news;
        lastUpdated = data.last_updated;
    }
    
    if (!headlines || headlines.length === 0) {
        return getSampleData(category);
    }
    
    try {
        const totalHeadlines = headlines.length;
        const totalPages = Math.ceil(totalHeadlines / PAGE_SIZE);
        
        // Ensure page is within bounds
        page = Math.max(1, Math.min(page, totalPages));
        
        // Set title based on category
        let title = `📰 *ZIMBABWE NEWS`;
        if (category && category !== 'all') {
            title += ` - ${category}`;
        }
        title += `*\n\n`;
        
        let message = title;
        
        // Add timestamp if available
        if (lastUpdated) {
            const date = new Date(lastUpdated);
            message += `_Updated: ${date.toLocaleDateString('en-ZW', { 
                weekday: 'short', 
                day: 'numeric', 
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}_\n\n`;
        }
        
        // Add page indicator
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `📄 *Page ${page} of ${totalPages}* (${totalHeadlines} headlines)\n`;
        message += `━━━━━━━━━━━━━━━━━━\n\n`;
        
        // Calculate slice for current page
        const startIndex = (page - 1) * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, totalHeadlines);
        const pageHeadlines = headlines.slice(startIndex, endIndex);
        
        // Display headlines for current page
        pageHeadlines.forEach((headline, index) => {
            const headlineNumber = startIndex + index + 1;
            
            // Handle different data structures
            const titleText = headline.title || headline.headline || 'Untitled';
            const source = headline.source || headline.publisher || 'Zimbabwe News';
            const timestamp = headline.timestamp || headline.published_date || headline.date || headline.published;
            const categoryText = headline.category || '';
            
            message += `${headlineNumber}. `;
            
            // Add emoji based on category
            if (categoryText) {
                message += `${getCategoryEmoji(categoryText)} `;
            }
            
            // Title with bold
            message += `*${titleText}*\n`;
            
            // Summary if available (first X words)
            if (headline.summary || headline.excerpt || headline.description) {
                const summary = headline.summary || headline.excerpt || headline.description;
                // Remove HTML tags
                const cleanSummary = summary.replace(/<[^>]*>/g, '');
                // Split into words and take first SUMMARY_LENGTH words
                const words = cleanSummary.split(/\s+/);
                if (words.length > SUMMARY_LENGTH) {
                    const truncated = words.slice(0, SUMMARY_LENGTH).join(' ') + '...';
                    message += `   ${truncated}\n`;
                } else {
                    message += `   ${cleanSummary}\n`;
                }
            }
            
            // Source and time
            message += `   📍 _${source}_`;
            if (timestamp) {
                message += ` • ${getTimeAgo(new Date(timestamp))}`;
            }
            
            message += `\n\n`;
        });

        console.log(`📰 [NEWS] Message length: ${message.length} chars for page ${page}`);
        
        // Add navigation instructions
        message += `━━━━━━━━━━━━━━━━━━\n`;
        
        if (page < totalPages) {
            const remaining = totalHeadlines - endIndex;
            message += `📱 *${remaining} more headlines available*\n`;
            message += `Reply *MORE* for page ${page + 1}\n`;
        }
        
        if (page > 1) {
            message += `◀️ Reply *BACK* for page ${page - 1}\n`;
        }
        
        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `Type *hi* for main menu`;
        
        return message;
        
    } catch (error) {
        console.error(`📰 [NEWS] Error formatting response:`, error);
        return getSampleData(category);
    }
}

// ============================================================================
// PAGINATION HANDLER
// ============================================================================

/**
 * Handle news pagination commands (MORE/BACK)
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Object} session - Current session
 * @param {string} command - 'MORE' or 'BACK'
 * @returns {Promise<Object>} Result with message and updated session
 */
async function handlePagination(userId, session, command) {
    console.log(`📰 [NEWS] Handling pagination for ${userId}: ${command}`);
    
    const currentPage = session.data?.newsPage || 1;
    const category = session.data?.newsCategory || null;
    
    let newPage = currentPage;
    const lowerCommand = command.toLowerCase(); // Convert once
    
    if (lowerCommand === 'more') {
        newPage = currentPage + 1;
    } else if (lowerCommand === 'back') {
        newPage = Math.max(1, currentPage - 1);
    } else {
        return {
            message: `❓ Invalid command. Reply *MORE* or *BACK*`,
            session
        };
    }
    
    // Fetch news data (use cached if available)
    const data = await fetchNewsData(category, 50);
    
    // Extract raw data for pagination
    let newsData = data;
    if (data && data.raw) {
        newsData = data.raw;
    }
    
    // Calculate total pages to validate
    let headlines = [];
    if (Array.isArray(newsData)) {
        headlines = newsData;
    } else if (newsData && newsData.headlines) {
        headlines = newsData.headlines;
    } else if (newsData && newsData.news) {
        headlines = newsData.news;
    } else if (newsData && newsData.data && newsData.data.news) {
        headlines = newsData.data.news;
    }
    
    const totalPages = Math.ceil(headlines.length / PAGE_SIZE);
    
    // Ensure new page is valid
    if (newPage > totalPages) {
        newPage = totalPages;
    }
    
    // Format with new page
    const message = formatNewsResponse(newsData, category, newPage);
    
    // Update session with new page
    session.data.newsPage = newPage;
    
    return {
        message,
        session
    };
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
    if (cat.includes('sport') || cat.includes('football') || cat.includes('soccer')) return '⚽';
    if (cat.includes('tech') || cat.includes('technology')) return '💻';
    if (cat.includes('world') || cat.includes('international')) return '🌐';
    if (cat.includes('health')) return '🏥';
    if (cat.includes('education')) return '📚';
    if (cat.includes('agric')) return '🌾';
    if (cat.includes('entertainment')) return '🎭';
    
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
    
    // Default sample
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

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_

────────────────
Reply *MORE* for more headlines or *hi* for Main Menu`;
}

/**
 * Get category-specific sample data
 * 
 * @param {string} category - News category
 * @returns {string} Formatted category sample data
 */
function getCategorySampleData(category) {
    const cat = (category || '').toLowerCase();
    
    if (cat.includes('football') || cat.includes('sport')) {
        return `📰 *ZIMBABWE NEWS - SPORTS*

━━━━━━━━━━━━━━━━━━
⚽ *SPORTS HEADLINES*
━━━━━━━━━━━━━━━━━━

1. *Warriors prepare for World Cup qualifier*
   Team trains in Harare ahead of crucial match
   📍 _ZBC News_ • 12 hours ago

2. *Local derby ends in thrilling draw*
   Dynamos 2-2 Highlanders at National Sports Stadium
   📍 _NewsDay_ • 2 days ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_

────────────────
Reply *MORE* for more headlines or *hi* for Main Menu`;
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

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_

────────────────
Reply *MORE* for more headlines or *hi* for Main Menu`;
    }
    
    // Default to general news
    return `📰 *ZIMBABWE NEWS - ${category.toUpperCase()}*

━━━━━━━━━━━━━━━━━━
📋 *HEADLINES*
━━━━━━━━━━━━━━━━━━

1. *Top story in this category*
   Brief summary of the news item
   📍 _News Source_ • 2 hours ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_

────────────────
Reply *MORE* for more headlines or *hi* for Main Menu`;
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
    handlePagination,
    clearCache,
    getCacheStatus,
    getCategories,
    NEWS_CATEGORIES,
    
    // For testing
    PAGE_SIZE
};