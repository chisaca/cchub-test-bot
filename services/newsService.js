// services/newsService.js
// ============================================================================
// ZIMBABWE NEWS SERVICE
// Provides latest headlines from Herald, Chronicle, Newsday and other sources
// Fetches data from WordPress REST API with fallback to sample data
// Supports pagination with MORE/BACK commands
// NOW WITH: 3 buttons (More News, Hot Updates, Main Menu) and 5 headlines per page
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

// Pagination: Show 5 headlines per page (changed from 10 to 5)
const PAGE_SIZE = 5;
const SUMMARY_LENGTH = 40; // First 40 words for summary

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
            await sendNewsWithButtons(userId, formattedMessage, page);
            return { success: true };
        }
        
        return formattedMessage;
        
    } catch (error) {
        console.error(`📰 [NEWS] Error fetching news data:`, error.message);
        
        // Fallback to sample data
        const fallbackMessage = getSampleData(category);
        
        if (sendMessage && userId) {
            await sendNewsWithButtons(userId, fallbackMessage, 1);
            return { success: true, usedFallback: true };
        }
        
        return fallbackMessage;
    }
}

/**
 * Send news with 3 buttons (More News, Hot Updates, Main Menu)
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} message - The formatted news message
 * @param {number} currentPage - Current page number
 */
async function sendNewsWithButtons(userId, message, currentPage) {
    // Get total pages to determine if More News button should be shown
    const totalPages = await getTotalPages();
    
    const buttons = [];
    
    // Only show "More News" if there are more pages
    if (currentPage < totalPages) {
        buttons.push({ id: "more_news", title: "📰 More News" });
    }
    
    buttons.push({ id: "hot_updates", title: "🔥 Hot Updates" });
    buttons.push({ id: "hi", title: "🏠 Main Menu" });
    
    await messaging.sendButtonMessage(userId, message, buttons);
}

/**
 * Get total pages of news
 * 
 * @returns {Promise<number>} Total number of pages
 */
async function getTotalPages() {
    try {
        const data = await fetchNewsData(null, 50);
        let headlines = [];
        
        if (Array.isArray(data)) {
            headlines = data;
        } else if (data && data.headlines) {
            headlines = data.headlines;
        } else if (data && data.news) {
            headlines = data.news;
        } else if (data && data.data && data.data.news) {
            headlines = data.data.news;
        }
        
        return Math.ceil(headlines.length / PAGE_SIZE);
    } catch (error) {
        console.error(`📰 [NEWS] Error getting total pages:`, error.message);
        return 1;
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
 * Shows heading and first 40 words of summary
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
            
            // Get summary and truncate to first 40 words
            let summary = '';
            if (headline.summary || headline.excerpt || headline.description) {
                summary = headline.summary || headline.excerpt || headline.description;
                // Remove HTML tags
                summary = summary.replace(/<[^>]*>/g, '');
                // Truncate to first 40 words
                const words = summary.split(/\s+/);
                if (words.length > SUMMARY_LENGTH) {
                    summary = words.slice(0, SUMMARY_LENGTH).join(' ') + '...';
                }
            }
            
            message += `*${headlineNumber}. ${titleText}*\n`;
            
            // Add summary if available
            if (summary) {
                message += `${summary}\n`;
            }
            
            // Source and time
            message += `📍 _${source}_`;
            if (timestamp) {
                message += ` • ${getTimeAgo(new Date(timestamp))}`;
            }
            
            message += `\n\n`;
        });

        console.log(`📰 [NEWS] Message length: ${message.length} chars for page ${page}`);
        
        // Add divider before buttons
        message += `━━━━━━━━━━━━━━━━━━\n`;
        
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
 * Handle news pagination commands (MORE/BACK) and button responses
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Object} session - Current session
 * @param {string} command - 'MORE' or 'BACK' or 'more_news'
 * @returns {Promise<Object>} Result with message and updated session
 */
async function handlePagination(userId, session, command) {
    console.log(`📰 [NEWS] Handling pagination for ${userId}: ${command}`);
    
    const currentPage = session.data?.newsPage || 1;
    const category = session.data?.newsCategory || null;
    
    let newPage = currentPage;
    const lowerCommand = command.toLowerCase(); // Convert once
    
    if (lowerCommand === 'more' || lowerCommand === 'more_news') {
        newPage = currentPage + 1;
    } else if (lowerCommand === 'back') {
        newPage = Math.max(1, currentPage - 1);
    } else {
        return {
            message: null,
            session,
            error: true
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
    
    // Send with buttons
    await sendNewsWithButtons(userId, message, newPage);
    
    // Update session with new page
    session.data.newsPage = newPage;
    
    return {
        message: null, // Message already sent via sendNewsWithButtons
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

/**
 * Extract first N words from text
 * 
 * @param {string} text - The text to extract from
 * @param {number} wordCount - Number of words to extract
 * @returns {string} Extracted words with ellipsis if truncated
 */
function extractFirstWords(text, wordCount = 40) {
    if (!text) return '';
    
    // Remove HTML tags
    const cleanText = text.replace(/<[^>]*>/g, '');
    
    const words = cleanText.split(/\s+/);
    if (words.length <= wordCount) return cleanText;
    
    return words.slice(0, wordCount).join(' ') + '...';
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

1. *Government announces new economic measures*
President outlines plans for economic recovery including currency reforms and investment incentives...
📍 _The Herald_ • 2 hours ago

2. *Parliament passes education reform bill*
New curriculum to be implemented next term focusing on digital literacy and practical skills...
📍 _NewsDay_ • 5 hours ago

3. *Zimbabwe dollar remains stable*
RBZ governor cites positive market sentiment and improved foreign currency inflows...
📍 _The Chronicle_ • 8 hours ago

4. *Warriors prepare for World Cup qualifier*
Team trains in Harare ahead of crucial match against African champions...
📍 _ZBC News_ • 12 hours ago

5. *New mining investment announced*
Chinese company commits $500 million to platinum processing plant...
📍 _Business Times_ • 1 day ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_`;
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
Team trains in Harare ahead of crucial match against African champions. Coach calls for fan support...
📍 _ZBC News_ • 12 hours ago

2. *Local derby ends in thrilling draw*
Dynamos 2-2 Highlanders at National Sports Stadium. Late equalizer secures point for visitors...
📍 _NewsDay_ • 2 days ago

3. *Zimbabwe to host regional athletics championship*
Harare selected to host Southern African athletics event next month...
📍 _The Herald_ • 3 days ago

4. *New cricket academy opens in Bulawayo*
Former national players to lead training programs for young talent...
📍 _The Chronicle_ • 4 days ago

5. *Netball team qualifies for World Cup*
Zimbabwe secures spot after dominant performance in qualifiers...
📍 _ZBC News_ • 5 days ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_`;
    }
    
    if (cat.includes('business')) {
        return `📰 *ZIMBABWE NEWS - BUSINESS*

━━━━━━━━━━━━━━━━━━
💼 *BUSINESS HEADLINES*
━━━━━━━━━━━━━━━━━━

1. *Zimbabwe dollar remains stable*
RBZ governor cites positive market sentiment and improved foreign currency inflows...
📍 _The Chronicle_ • 8 hours ago

2. *Mining sector exceeds export targets*
Gold and platinum production up 15% compared to previous quarter...
📍 _The Herald_ • 1 day ago

3. *New investment incentives announced*
Government introduces tax breaks for manufacturing sector investments...
📍 _NewsDay_ • 2 days ago

4. *Banking sector profitability increases*
Commercial banks report strong earnings in Q3 results...
📍 _Financial Gazette_ • 3 days ago

5. *Agriculture exports grow 20%*
Tobacco and horticulture lead export growth to new markets...
📍 _The Herald_ • 4 days ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_`;
    }
    
    // Default to general news
    return `📰 *ZIMBABWE NEWS - ${category.toUpperCase()}*

━━━━━━━━━━━━━━━━━━
📋 *HEADLINES*
━━━━━━━━━━━━━━━━━━

1. *Top story in this category*
This is a sample summary showing the first 40 words of the news article to give users a preview of the content...
📍 _News Source_ • 2 hours ago

2. *Another important headline*
This demonstrates how the first 40 words of each article will be displayed to provide context before clicking...
📍 _News Source_ • 5 hours ago

3. *Third headline in this category*
The summary gives users enough information to decide if they want to read the full article elsewhere...
📍 _News Source_ • 1 day ago

4. *Fourth story making headlines*
Each news item includes the source and relative time to keep users informed of currency...
📍 _News Source_ • 2 days ago

5. *Fifth headline example*
This completes the page with 5 headlines per page for optimal reading experience...
📍 _News Source_ • 3 days ago

━━━━━━━━━━━━━━━━━━
_Last updated: Today, 14:30_`;
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
    sendNewsWithButtons,
    clearCache,
    getCacheStatus,
    getCategories,
    NEWS_CATEGORIES,
    
    // For testing
    PAGE_SIZE,
    SUMMARY_LENGTH
};