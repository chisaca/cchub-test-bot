// services/bills.js - SIMPLIFIED Submenu Router
/**
 * Bills Service - Acts as a router to specific biller services
 */

const { handleSubmenuSelection, sendSubmenu } = require('../handlers/subMenuHandler');
const { getActiveSession, deleteSession } = require('../handlers/sessionHandlers');

class BillsService {
    
    /**
     * Start the bills flow - shows submenu
     */
    async startFlow(userId) {
        console.log(`💳 Starting bills flow for ${userId}`);
        await sendSubmenu(userId, 'BILLS');
        return {
            message: null,
            session: null
        };
    }
    
    /**
     * Handle biller selection
     */
    async handleRequest(userId, message, session) {
        console.log(`💳 Bills selection from ${userId}: "${message}"`);
        
        // Pass to submenu handler
        const result = await handleSubmenuSelection(userId, 'BILLS', message);
        
        // If result has message and no session, send the message
        if (result && result.message && !result.session) {
            return result;
        }
        
        // Otherwise return the result directly (may contain new session from service)
        return result;
    }
}

module.exports = new BillsService();
