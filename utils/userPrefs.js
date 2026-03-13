// utils/userPrefs.js
// ============================================================================
// USER PREFERENCES MANAGER
// Hybrid approach: In-memory cache + TiDB persistence
// 
// Responsibilities:
// - Store last used service details in memory for quick access
// - Persist to TiDB for long-term storage
// - Retrieve from TiDB on cache miss
// - Update both cache and DB when new transactions complete
// ============================================================================

const { initTiDB } = require('./tidb');

// ============================================================================
// IN-MEMORY CACHE
// Map<userPhone, preferences object>
// Faster than DB queries for active users
// ============================================================================
const userCache = new Map();

// Cache TTL (Time To Live) - 1 hour in milliseconds
const CACHE_TTL = 60 * 60 * 1000;

// ============================================================================
// PREFERENCE STRUCTURE (for reference)
// {
//     user_phone: "263771234567",
//     lastAirtime: {
//         recipient: "263771234567",
//         network: "Econet",
//         amount: 5.00,
//         currency: "USD",
//         paymentMethod: "ecocash",
//         paymentProvider: "ecocash",
//         time: "2024-03-20 14:30:00"
//     },
//     lastZesa: {
//         meter: "12345678901",
//         customerName: "John Smith",
//         amount: 10.00,
//         currency: "ZiG",
//         paymentMethod: "onemoney",
//         paymentProvider: "onemoney",
//         time: "2024-03-20 14:30:00"
//     },
//     stats: {
//         airtimeCount: 5,
//         zesaCount: 3,
//         lastInteraction: "2024-03-20 14:30:00"
//     }
// }
// ============================================================================

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear expired cache entries
 * Called periodically to prevent memory bloat
 */
function cleanExpiredCache() {
    const now = Date.now();
    for (const [userPhone, entry] of userCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL) {
            userCache.delete(userPhone);
            console.log(`🧹 [UserPrefs] Cleared expired cache for ${userPhone}`);
        }
    }
}

// Run cache cleanup every 30 minutes
setInterval(cleanExpiredCache, 30 * 60 * 1000);

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Get user preferences from TiDB
 * 
 * @param {string} userPhone - User's phone number (263 format)
 * @returns {Promise<Object|null>} User preferences or null if not found
 */
async function getFromDB(userPhone) {
    try {
        const pool = initTiDB();
        
        const [rows] = await pool.execute(
            `SELECT 
                user_phone,
                last_airtime_recipient, last_airtime_network, 
                last_airtime_amount, last_airtime_currency, last_airtime_time,
                last_airtime_payment_method, last_airtime_payment_provider,
                last_zesa_meter, last_zesa_customer_name,
                last_zesa_amount, last_zesa_currency, last_zesa_time,
                last_zesa_payment_method, last_zesa_payment_provider,
                total_airtime_purchases, total_zesa_purchases,
                last_interaction
            FROM user_preferences 
            WHERE user_phone = ?`,
            [userPhone]
        );
        
        if (rows.length === 0) {
            return null;
        }
        
        const row = rows[0];
        
        // Transform DB row to preference object
        return {
            user_phone: row.user_phone,
            lastAirtime: row.last_airtime_recipient ? {
                recipient: row.last_airtime_recipient,
                network: row.last_airtime_network,
                amount: parseFloat(row.last_airtime_amount),
                currency: row.last_airtime_currency,
                paymentMethod: row.last_airtime_payment_method,
                paymentProvider: row.last_airtime_payment_provider,
                time: row.last_airtime_time
            } : null,
            lastZesa: row.last_zesa_meter ? {
                meter: row.last_zesa_meter,
                customerName: row.last_zesa_customer_name,
                amount: parseFloat(row.last_zesa_amount),
                currency: row.last_zesa_currency,
                paymentMethod: row.last_zesa_payment_method,
                paymentProvider: row.last_zesa_payment_provider,
                time: row.last_zesa_time
            } : null,
            stats: {
                airtimeCount: row.total_airtime_purchases || 0,
                zesaCount: row.total_zesa_purchases || 0,
                lastInteraction: row.last_interaction
            }
        };
        
    } catch (error) {
        console.error(`❌ [UserPrefs] DB fetch error for ${userPhone}:`, error.message);
        return null;
    }
}

/**
 * Save or update user preferences in TiDB
 * 
 * @param {string} userPhone - User's phone number
 * @param {Object} prefs - Preferences object to save
 */
async function saveToDB(userPhone, prefs) {
    try {
        const pool = initTiDB();
        
        // Check if user exists
        const [existing] = await pool.execute(
            'SELECT user_phone FROM user_preferences WHERE user_phone = ?',
            [userPhone]
        );
        
        if (existing.length === 0) {
            // Insert new record
            await pool.execute(
                `INSERT INTO user_preferences (
                    user_phone,
                    last_airtime_recipient, last_airtime_network,
                    last_airtime_amount, last_airtime_currency, last_airtime_time,
                    last_airtime_payment_method, last_airtime_payment_provider,
                    last_zesa_meter, last_zesa_customer_name,
                    last_zesa_amount, last_zesa_currency, last_zesa_time,
                    last_zesa_payment_method, last_zesa_payment_provider,
                    total_airtime_purchases, total_zesa_purchases,
                    last_interaction
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userPhone,
                    prefs.lastAirtime?.recipient || null,
                    prefs.lastAirtime?.network || null,
                    prefs.lastAirtime?.amount || null,
                    prefs.lastAirtime?.currency || null,
                    prefs.lastAirtime?.time || null,
                    prefs.lastAirtime?.paymentMethod || null,
                    prefs.lastAirtime?.paymentProvider || null,
                    prefs.lastZesa?.meter || null,
                    prefs.lastZesa?.customerName || null,
                    prefs.lastZesa?.amount || null,
                    prefs.lastZesa?.currency || null,
                    prefs.lastZesa?.time || null,
                    prefs.lastZesa?.paymentMethod || null,
                    prefs.lastZesa?.paymentProvider || null,
                    prefs.stats?.airtimeCount || 0,
                    prefs.stats?.zesaCount || 0,
                    prefs.stats?.lastInteraction || new Date()
                ]
            );
        } else {
            // Update existing record
            await pool.execute(
                `UPDATE user_preferences SET
                    last_airtime_recipient = ?,
                    last_airtime_network = ?,
                    last_airtime_amount = ?,
                    last_airtime_currency = ?,
                    last_airtime_time = ?,
                    last_airtime_payment_method = ?,
                    last_airtime_payment_provider = ?,
                    last_zesa_meter = ?,
                    last_zesa_customer_name = ?,
                    last_zesa_amount = ?,
                    last_zesa_currency = ?,
                    last_zesa_time = ?,
                    last_zesa_payment_method = ?,
                    last_zesa_payment_provider = ?,
                    total_airtime_purchases = ?,
                    total_zesa_purchases = ?,
                    last_interaction = ?
                WHERE user_phone = ?`,
                [
                    prefs.lastAirtime?.recipient || null,
                    prefs.lastAirtime?.network || null,
                    prefs.lastAirtime?.amount || null,
                    prefs.lastAirtime?.currency || null,
                    prefs.lastAirtime?.time || null,
                    prefs.lastAirtime?.paymentMethod || null,
                    prefs.lastAirtime?.paymentProvider || null,
                    prefs.lastZesa?.meter || null,
                    prefs.lastZesa?.customerName || null,
                    prefs.lastZesa?.amount || null,
                    prefs.lastZesa?.currency || null,
                    prefs.lastZesa?.time || null,
                    prefs.lastZesa?.paymentMethod || null,
                    prefs.lastZesa?.paymentProvider || null,
                    prefs.stats?.airtimeCount || 0,
                    prefs.stats?.zesaCount || 0,
                    prefs.stats?.lastInteraction || new Date(),
                    userPhone
                ]
            );
        }
        
        console.log(`✅ [UserPrefs] Saved preferences for ${userPhone}`);
        
    } catch (error) {
        console.error(`❌ [UserPrefs] DB save error for ${userPhone}:`, error.message);
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get user preferences (from cache or DB)
 * 
 * @param {string} userPhone - User's phone number
 * @returns {Promise<Object|null>} User preferences
 */
async function getUserPrefs(userPhone) {
    // Clean phone number (remove @c.us etc.)
    const cleanPhone = userPhone.split('@')[0];
    
    // Check cache first
    if (userCache.has(cleanPhone)) {
        const cached = userCache.get(cleanPhone);
        // Check if cache is still fresh
        if (Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`⚡ [UserPrefs] Cache hit for ${cleanPhone}`);
            return cached.data;
        } else {
            // Cache expired, remove it
            userCache.delete(cleanPhone);
        }
    }
    
    // Cache miss or expired, get from DB
    console.log(`📦 [UserPrefs] Cache miss for ${cleanPhone}, fetching from DB`);
    const dbPrefs = await getFromDB(cleanPhone);
    
    if (dbPrefs) {
        // Store in cache
        userCache.set(cleanPhone, {
            data: dbPrefs,
            timestamp: Date.now()
        });
    }
    
    return dbPrefs;
}

/**
 * Update user preferences after a successful transaction
 * 
 * @param {string} userPhone - User's phone number
 * @param {string} service - 'airtime' or 'zesa'
 * @param {Object} transactionData - Transaction details
 */
async function updateUserPrefs(userPhone, service, transactionData) {
    const cleanPhone = userPhone.split('@')[0];
    
    // Get current preferences (from cache or DB)
    let prefs = await getUserPrefs(cleanPhone) || {
        user_phone: cleanPhone,
        stats: {
            airtimeCount: 0,
            zesaCount: 0,
            lastInteraction: new Date()
        }
    };
    
    // Update based on service type with payment method details
    if (service === 'airtime') {
        prefs.lastAirtime = {
            recipient: transactionData.recipient,
            network: transactionData.network,
            amount: transactionData.amount,
            currency: transactionData.currency,
            paymentMethod: transactionData.paymentMethod,
            paymentProvider: transactionData.paymentProvider,
            time: new Date()
        };
        prefs.stats.airtimeCount = (prefs.stats.airtimeCount || 0) + 1;
        
    } else if (service === 'zesa') {
        prefs.lastZesa = {
            meter: transactionData.meterNumber,
            customerName: transactionData.customerName,
            amount: transactionData.amount,
            currency: transactionData.currency,
            paymentMethod: transactionData.paymentMethod,
            paymentProvider: transactionData.paymentProvider,
            time: new Date()
        };
        prefs.stats.zesaCount = (prefs.stats.zesaCount || 0) + 1;
    }
    
    prefs.stats.lastInteraction = new Date();
    
    // Update cache
    userCache.set(cleanPhone, {
        data: prefs,
        timestamp: Date.now()
    });
    
    // Persist to DB (non-blocking)
    saveToDB(cleanPhone, prefs);
    
    console.log(`✅ [UserPrefs] Updated ${service} preferences for ${cleanPhone} with payment method: ${transactionData.paymentMethod}`);
}

/**
 * Clear user preferences (for testing or user request)
 * 
 * @param {string} userPhone - User's phone number
 */
async function clearUserPrefs(userPhone) {
    const cleanPhone = userPhone.split('@')[0];
    
    // Remove from cache
    userCache.delete(cleanPhone);
    
    // Remove from DB
    try {
        const pool = initTiDB();
        await pool.execute('DELETE FROM user_preferences WHERE user_phone = ?', [cleanPhone]);
        console.log(`✅ [UserPrefs] Cleared preferences for ${cleanPhone}`);
    } catch (error) {
        console.error(`❌ [UserPrefs] Failed to clear DB for ${cleanPhone}:`, error.message);
    }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    getUserPrefs,
    updateUserPrefs,
    clearUserPrefs
};