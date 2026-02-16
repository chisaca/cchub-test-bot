// services/currencyGate.js
// Now allows ZiG payments since integration is complete

const messaging = require('../utils/messaging');
const { deleteSession } = require('../handlers/sessionHandlers');

/**
 * Check if currency is allowed for payment
 * Returns true if flow should continue, false if blocked
 */
async function checkCurrencyAllowed(userId, currency, session) {
    // ✅ ZiG payments are now AVAILABLE!
    if (currency === 'ZiG' || currency === 'zig') {
        // Uncomment this block if you need to check for any specific conditions
        // For example: minimum balance, specific times, etc.
        
        // For now, just allow ZiG
        return true;
    }
    
    // ✅ USD is always allowed
    return true;
}

module.exports = { checkCurrencyAllowed };