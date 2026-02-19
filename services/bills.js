// services/bills.js - Clean version with NO PayCode logic
/**
 * Bills Service - Manages bills submenu and routes to biller services
 * PayCode functionality has been completely removed
 */

const { createSubmenuSession, getSubmenuSession } = require('../handlers/submenuSessionHandler');
const { sendSubmenu, handleSubmenuResponse } = require('../handlers/submenuMessageHandler');
const { createSession, deleteSession } = require('../handlers/sessionHandlers');
const constants = require('../config/constants');

class BillsService {
    
    /**
     * Start the bills flow - shows submenu
     * @param {string} userId - User ID
     * @returns {Object} Result object for messageHandler
     */
    async startFlow(userId) {
        console.log(`💳 [BILLS] Starting bills flow for ${userId}`);
        
        // Clear any existing main session
        deleteSession(userId);
        console.log(`💳 [BILLS] Cleared existing session for ${userId}`);
        
        // Create a MAIN session for bills (keeps user in bills flow)
        const session = createSession(userId, constants.SERVICE_TYPES.BILL_PAYMENT);
        session.state = constants.FLOW_STATES.BILL_PAYMENT.SELECT_BILLER;
        session.data = { 
            menu: 'BILLS',
            startedAt: Date.now()
        };
        
        console.log(`💳 [BILLS] Created main session with state: ${session.state}`);
        
        // Create submenu session for internal tracking
        createSubmenuSession(userId, 'BILLS');
        console.log(`💳 [BILLS] Created submenu session`);
        
        // Send the bills menu
        await sendSubmenu(userId, 'BILLS');
        console.log(`💳 [BILLS] Sent bills menu to user`);
        
        // Return the MAIN session so messageHandler keeps it alive
        return {
            message: null,
            session: session
        };
    }
    
    /**
     * Handle biller selection from submenu
     * @param {string} userId - User ID
     * @param {string} message - User's message (should be "1" for Nyaradzo)
     * @param {Object} session - Current main session
     * @returns {Object} Result object for messageHandler
     */
/**
 * Handle biller selection
 */
async function handleRequest(userId, message, session) {
    console.log(`💳 [BILLS] Handling selection from ${userId}: "${message}"`);
    console.log(`💳 [BILLS] Current session state: ${session?.state}`);
    
    // If we're in the middle of a biller flow (like Nyaradzo), route directly
    if (session.state === STATES.ENTER_ACCOUNT || 
        session.state === STATES.VERIFYING_ACCOUNT ||
        session.state === STATES.ENTER_AMOUNT ||
        session.state === STATES.SELECT_PAYMENT ||
        session.state === STATES.ENTER_PAYMENT_PHONE ||
        session.state === STATES.ENTER_NOTIFY_PHONE ||
        session.state === STATES.CONFIRM_PAYMENT ||
        session.state === STATES.PROCESSING) {
        
        console.log(`💳 [BILLS] Routing directly to Nyaradzo service for state: ${session.state}`);
        const nyaradzoService = require('./nyaradzo');
        return await nyaradzoService.handleRequest(userId, message, session);
    }
    
    // Otherwise, handle submenu selection
    const submenuSession = getSubmenuSession(userId);
    
    if (!submenuSession) {
        console.log(`💳 [BILLS] No active submenu session for ${userId}, restarting flow`);
        return await this.startFlow(userId);
    }
    
    // Rest of submenu handling...
    const result = await handleSubmenuResponse(userId, message, submenuSession);
    return result;
}
    
    /**
     * Cancel current bills flow
     * @param {string} userId - User ID
     */
    async cancelFlow(userId) {
        console.log(`💳 [BILLS] Cancelling flow for ${userId}`);
        
        // Clean up both main and submenu sessions
        const { deleteSubmenuSession } = require('../handlers/submenuSessionHandler');
        deleteSubmenuSession(userId);
        deleteSession(userId);
        
        const messaging = require('../utils/messaging');
        await messaging.sendMessage(userId, 
            `❌ *Cancelled*\n\nBills payment cancelled. Type *hi* for main menu.`
        );
    }
    
    /**
     * Get current flow status for debugging
     * @param {string} userId - User ID
     * @returns {Object} Status information
     */
    async getStatus(userId) {
        const { getSubmenuSession } = require('../handlers/submenuSessionHandler');
        const submenuSession = getSubmenuSession(userId);
        const mainSession = require('../handlers/sessionHandlers').getActiveSession(userId);
        
        return {
            hasMainSession: !!mainSession,
            mainSessionState: mainSession?.state,
            hasSubmenuSession: !!submenuSession,
            submenuMenu: submenuSession?.menu,
            submenuExpiresIn: submenuSession ? 
                Math.ceil((submenuSession.expiresAt - Date.now()) / 60000) + ' minutes' : null
        };
    }
}

// Export singleton instance
module.exports = new BillsService();
