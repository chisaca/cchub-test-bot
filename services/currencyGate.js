// services/currencyGate.js
// Blocks ZiG payments until payment methods are available

const messaging = require('../utils/messaging');
const { deleteSession } = require('../handlers/sessionHandlers');

/**
 * Check if currency is allowed for payment
 * Returns true if flow should continue, false if blocked
 */
async function checkCurrencyAllowed(userId, currency, session) {
    // ✅ ZiG payments are COMING SOON - block them
    if (currency === 'ZiG' || currency === 'zig') {
        await messaging.sendMessage(userId, `⏳ *ZiG payments coming soon*

We're currently integrating ZiG payment methods.

✅ USD payments are available now with:
• EcoCash USD
• InnBucks

────────────────

Type *hi* to return to main menu`);

        deleteSession(userId);
        return false;
    }
    
    // ✅ USD is allowed
    return true;
}

module.exports = { checkCurrencyAllowed };