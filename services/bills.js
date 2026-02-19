// services/bills.js - Clean version with NO PayCode logic
// UPDATED: Dynamic biller routing for Nyaradzo and TelOne
/**
 * Bills Service - Manages bills submenu and routes to biller services
 * PayCode functionality has been completely removed
 */

const { createSubmenuSession, getSubmenuSession } = require('../handlers/submenuSessionHandler');
const { sendSubmenu, handleSubmenuResponse } = require('../handlers/submenuMessageHandler');
const { createSession, deleteSession, getActiveSession } = require('../handlers/sessionHandlers');
const constants = require('../config/constants');

// Import STATES from constants for flow state checks
const STATES = constants.FLOW_STATES.BILL_PAYMENT;

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
     * @param {string} message - User's message (should be "1" for Nyaradzo, "2" for TelOne)
     * @param {Object} session - Current main session
     * @returns {Object} Result object for messageHandler
     */
    async handleRequest(userId, message, session) {
        console.log(`💳 [BILLS] Handling selection from ${userId}: "${message}"`);
        console.log(`💳 [BILLS] Current session state: ${session?.state}`);
        
        // Get submenu session to see what was selected
        const submenuSession = getSubmenuSession(userId);
        
        // If we're in the middle of a biller flow, route to the appropriate service
        if (session.state === STATES.ENTER_ACCOUNT || 
            session.state === STATES.VERIFYING_ACCOUNT ||
            session.state === STATES.ENTER_AMOUNT ||
            session.state === STATES.SELECT_PAYMENT ||
            session.state === STATES.ENTER_PAYMENT_PHONE ||
            session.state === STATES.ENTER_NOTIFY_PHONE ||
            session.state === STATES.CONFIRM_PAYMENT ||
            session.state === STATES.PROCESSING) {
            
            console.log(`💳 [BILLS] In biller flow state: ${session.state}`);
            
            // Determine which biller service to route to based on session data
            const billerKey = session.data?.selectedBiller;
            
            if (billerKey === 'nyaradzo') {
                console.log(`💳 [BILLS] Routing to Nyaradzo service`);
                const nyaradzoService = require('./nyaradzo');
                return await nyaradzoService.handleRequest(userId, message, session);
            } else if (billerKey === 'telone') {
                console.log(`💳 [BILLS] Routing to TelOne service`);
                const teloneService = require('./telone');
                return await teloneService.handleMessage(userId, message, session);
            } else {
                // Fallback - check if we can determine from message
                console.log(`💳 [BILLS] No biller key found, checking message`);
                
                // This might be the initial selection from submenu
                if (message === '1') {
                    const nyaradzoService = require('./nyaradzo');
                    return await nyaradzoService.startFlow(userId);
                } else if (message === '2') {
                    const teloneService = require('./telone');
                    return await teloneService.handleMessage(userId, 'START', null);
                }
            }
        }
        
        // Handle submenu selection if no active biller flow
        if (!submenuSession) {
            console.log(`💳 [BILLS] No active submenu session for ${userId}, restarting flow`);
            return await this.startFlow(userId);
        }
        
        // Process the submenu selection
        const result = await handleSubmenuResponse(userId, message, submenuSession);
        
        // If the result contains a service, we need to create a session for that service
        if (result && result.service) {
            console.log(`💳 [BILLS] Submenu selected service: ${result.service}`);
            
            // Clear the main bills session
            deleteSession(userId);
            
            // Get the selected option from submenu session data
            const updatedSubmenuSession = getSubmenuSession(userId);
            const selectedBiller = updatedSubmenuSession?.data?.selectedBiller || result.service;
            
            // Create a new session for the selected service
            const serviceSession = createSession(userId, result.service);
            
            // Store the biller info in session data
            serviceSession.data.selectedBiller = selectedBiller;
            serviceSession.data.fromSubmenu = true;
            
            if (result.service === 'nyaradzo') {
                serviceSession.data.billerName = 'Nyaradzo Funeral';
                serviceSession.state = STATES.ENTER_ACCOUNT;
            } else if (result.service === 'telone') {
                serviceSession.data.billerName = 'TelOne';
                serviceSession.state = STATES.ENTER_ACCOUNT;
            }
            
            console.log(`💳 [BILLS] Created ${result.service} session with state: ${serviceSession.state}`);
            
            // Get the service and start its flow
            if (result.service === 'nyaradzo') {
                const nyaradzoService = require('./nyaradzo');
                return await nyaradzoService.handleRequest(userId, 'START', serviceSession);
            } else if (result.service === 'telone') {
                const teloneService = require('./telone');
                return await teloneService.handleMessage(userId, 'START', serviceSession);
            }
        }
        
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
        const mainSession = getActiveSession(userId);
        
        return {
            hasMainSession: !!mainSession,
            mainSessionService: mainSession?.service,
            mainSessionState: mainSession?.state,
            mainSessionBiller: mainSession?.data?.selectedBiller,
            hasSubmenuSession: !!submenuSession,
            submenuMenu: submenuSession?.menu,
            submenuSelected: submenuSession?.data?.selectedBiller,
            submenuExpiresIn: submenuSession ? 
                Math.ceil((submenuSession.expiresAt - Date.now()) / 60000) + ' minutes' : null
        };
    }
}

// Export singleton instance
module.exports = new BillsService();
