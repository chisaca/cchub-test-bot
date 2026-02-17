// services/currencyGate.js - Currency validation and blocking logic

/**
 * Currency Gate Service
 * Manages which currencies are allowed for each service
 * Blocks ZiG for NetOne/Telecel as per business rules
 */

// Currency configuration
const CURRENCY_CONFIG = {
    AIRTIME: {
        USD: {
            allowed: true,
            networks: ['all'], // All networks allowed for USD
            message: null
        },
        ZiG: {
            allowed: true,
            networks: ['Econet'], // Only Econet for ZiG
            message: "❌ ZiG airtime is only available for Econet numbers.\nPlease use USD for other networks or try an Econet number."
        }
    },
    ZESA: {
        USD: {
            allowed: true,
            message: null
        },
        ZiG: {
            allowed: true,
            message: null
        }
    }
};

/**
 * Check if currency is allowed for a service
 * @param {string} service - 'AIRTIME' or 'ZESA'
 * @param {string} currency - 'usd' or 'zig'
 * @param {string} network - Optional: network for airtime (Econet/NetOne/Telecel)
 * @returns {Object} { allowed: boolean, message: string|null }
 */
function checkCurrency(service, currency, network = null) {
    console.log(`💰 [CURRENCY_GATE] Checking: Service=${service}, Currency=${currency}, Network=${network}`);
    
    // Normalize inputs
    const normalizedService = service.toUpperCase();
    const normalizedCurrency = currency.toUpperCase() === 'USD' ? 'USD' : 'ZiG';
    
    // Check if service exists
    if (!CURRENCY_CONFIG[normalizedService]) {
        console.log(`💰 [CURRENCY_GATE] Unknown service: ${service}`);
        return {
            allowed: false,
            message: `Unknown service: ${service}`
        };
    }
    
    // Get service config
    const serviceConfig = CURRENCY_CONFIG[normalizedService];
    
    // Check if currency exists for service
    if (!serviceConfig[normalizedCurrency]) {
        console.log(`💰 [CURRENCY_GATE] Currency ${currency} not supported for ${service}`);
        return {
            allowed: false,
            message: `${currency} is not supported for ${service} at this time.`
        };
    }
    
    const currencyConfig = serviceConfig[normalizedCurrency];
    
    // If currency is not allowed at all
    if (!currencyConfig.allowed) {
        return {
            allowed: false,
            message: currencyConfig.message || `${currency} is not available for ${service}.`
        };
    }
    
    // Check network restrictions for airtime
    if (normalizedService === 'AIRTIME' && network) {
        const normalizedNetwork = network.charAt(0).toUpperCase() + network.slice(1).toLowerCase();
        
        if (!currencyConfig.networks.includes('all') && 
            !currencyConfig.networks.includes(normalizedNetwork)) {
            console.log(`💰 [CURRENCY_GATE] Network ${network} blocked for ${currency} airtime`);
            return {
                allowed: false,
                message: currencyConfig.message || `${currency} airtime is not available for ${network} numbers.`
            };
        }
    }
    
    // All checks passed
    return {
        allowed: true,
        message: null
    };
}

/**
 * Get supported currencies for a service
 * @param {string} service - 'AIRTIME' or 'ZESA'
 * @returns {Array} List of supported currencies
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
 * Format currency for display
 * @param {string} currency - 'usd' or 'zig'
 * @returns {string} Formatted currency name
 */
function formatCurrency(currency) {
    return currency.toUpperCase() === 'USD' ? 'USD' : 'ZiG';
}

module.exports = {
    checkCurrency,          // ✅ Make sure this is exported
    getSupportedCurrencies,
    formatCurrency,
    CURRENCY_CONFIG        // Export for debugging
};