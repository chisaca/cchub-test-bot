// services/currencyGate.js
// ============================================================================
// CURRENCY GATE SERVICE
// Manages currency availability and blocking rules per service
// 
// Business Rules:
// - AIRTIME: USD allowed for all networks, ZiG only for Econet
// - ZESA: Both USD and ZiG allowed for all meters
// 
// This gate ensures users can only select currencies that are actually
// available for their specific service and network combination.
// ============================================================================

// ============================================================================
// CURRENCY CONFIGURATION
// Defines which currencies are allowed for each service and any restrictions
// ============================================================================
const CURRENCY_CONFIG = {
    AIRTIME: {
        USD: {
            allowed: true,
            networks: ['all'], // USD works for all networks
            message: null
        },
        ZiG: {
            allowed: true,
            networks: ['Econet'], // ZiG only works for Econet numbers
            message: "❌ ZiG airtime is only available for Econet numbers.\nPlease use USD for other networks or try an Econet number."
        }
    },
    ZESA: {
        USD: {
            allowed: true,      // USD ZESA available for all meters
            message: null
        },
        ZiG: {
            allowed: true,      // ZiG ZESA available for all meters
            message: null
        }
    }
    // Add new services here following the same pattern
};

// ============================================================================
// CURRENCY CHECKING
// ============================================================================

/**
 * Check if a specific currency is allowed for a service and network
 * This is the main entry point for currency validation throughout the app
 * 
 * @param {string} service - Service name ('AIRTIME', 'ZESA')
 * @param {string} currency - Currency ('usd' or 'zig')
 * @param {string|null} network - Network name for airtime (Econet/NetOne/Telecel)
 * @returns {Object} Result with allowed flag and optional error message
 * 
 * @example
 * checkCurrency('AIRTIME', 'zig', 'Econet') // { allowed: true, message: null }
 * checkCurrency('AIRTIME', 'zig', 'NetOne') // { allowed: false, message: '...' }
 */
function checkCurrency(service, currency, network = null) {
    console.log(`💰 [CURRENCY_GATE] Checking: Service=${service}, Currency=${currency}, Network=${network}`);
    
    // Normalize inputs for consistent lookup
    const normalizedService = service.toUpperCase();
    const normalizedCurrency = currency.toUpperCase() === 'USD' ? 'USD' : 'ZiG';
    
    // ========================================================================
    // Validate service exists
    // ========================================================================
    if (!CURRENCY_CONFIG[normalizedService]) {
        console.log(`⚠️ [CURRENCY_GATE] Unknown service: ${service}`);
        return {
            allowed: false,
            message: `Unknown service: ${service}`
        };
    }
    
    const serviceConfig = CURRENCY_CONFIG[normalizedService];
    
    // ========================================================================
    // Validate currency exists for service
    // ========================================================================
    if (!serviceConfig[normalizedCurrency]) {
        console.log(`⚠️ [CURRENCY_GATE] Currency ${currency} not supported for ${service}`);
        return {
            allowed: false,
            message: `${currency} is not supported for ${service} at this time.`
        };
    }
    
    const currencyConfig = serviceConfig[normalizedCurrency];
    
    // ========================================================================
    // Check if currency is globally allowed
    // ========================================================================
    if (!currencyConfig.allowed) {
        return {
            allowed: false,
            message: currencyConfig.message || `${currency} is not available for ${service}.`
        };
    }
    
    // ========================================================================
    // Apply network-specific restrictions (for airtime only)
    // ========================================================================
    if (normalizedService === 'AIRTIME' && network) {
        const normalizedNetwork = network.charAt(0).toUpperCase() + network.slice(1).toLowerCase();
        
        // Check if this network is allowed for this currency
        if (!currencyConfig.networks.includes('all') && 
            !currencyConfig.networks.includes(normalizedNetwork)) {
            
            console.log(`⛔ [CURRENCY_GATE] Network ${network} blocked for ${currency} airtime`);
            return {
                allowed: false,
                message: currencyConfig.message || `${currency} airtime is not available for ${network} numbers.`
            };
        }
    }
    
    // ========================================================================
    // All checks passed - currency is allowed
    // ========================================================================
    console.log(`✅ [CURRENCY_GATE] Allowed: ${service}/${currency}${network ? '/' + network : ''}`);
    
    return {
        allowed: true,
        message: null
    };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get list of supported currencies for a service
 * Useful for dynamically generating prompts
 * 
 * @param {string} service - Service name ('AIRTIME', 'ZESA')
 * @returns {Array} List of currency names that are supported
 */
function getSupportedCurrencies(service) {
    const normalizedService = service.toUpperCase();
    
    if (!CURRENCY_CONFIG[normalizedService]) {
        return [];
    }
    
    return Object.keys(CURRENCY_CONFIG[normalizedService])
        .filter(currency => CURRENCY_CONFIG[normalizedService][currency].allowed);
}

/**
 * Format currency for display in messages
 * 
 * @param {string} currency - Raw currency ('usd' or 'zig')
 * @returns {string} Formatted currency name ('USD' or 'ZiG')
 */
function formatCurrency(currency) {
    return currency.toUpperCase() === 'USD' ? 'USD' : 'ZiG';
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    checkCurrency,           // Main validation function
    getSupportedCurrencies,  // Utility for prompts
    formatCurrency,          // Display formatting
    CURRENCY_CONFIG         // Exported for debugging/inspection
};
