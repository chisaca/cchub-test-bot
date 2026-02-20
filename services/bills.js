// services/bills.js - CLEAN VERSION (NO submenuMessageHandler)

const { createSubmenuSession } = require('../handlers/submenuSessionHandler');
const { sendSubmenu } = require('../handlers/subMenuHandler');
const { deleteSession } = require('../handlers/sessionHandlers');
const constants = require('../config/constants');

class BillsService {
    /**
     * Start the bills flow - shows submenu, NO session created
     */
    async startFlow(userId) {
        console.log(`💳 [BILLS] Starting bills flow for ${userId}`);
        
        // Clear any existing main session
        deleteSession(userId);
        
        // Create ONLY submenu session
        createSubmenuSession(userId, 'BILLS');
        
        // Send the bills menu using subMenuHandler
        await sendSubmenu(userId, 'BILLS');
        
        console.log(`💳 [BILLS] Bills menu sent to ${userId}`);
        
        // Return NO session - let messageHandler handle routing
        return {
            message: null,
            session: null
        };
    }
    
    /**
     * Handle incoming messages during bill selection
     * This should only be called when user is in bill_payment session
     */
    // In services/bills.js - Update handleRequest method

async handleRequest(userId, messageText, session) {
    console.log(`💳 [BILLS] Handling biller selection: "${messageText}"`);
    
    // Check if this is a policy number (8 digits) and we're in Nyaradzo flow
    if (session.data && session.data.biller === 'nyaradzo' && /^\d{8}$/.test(messageText.trim())) {
        console.log(`💳 [BILLS] Detected policy number, handing off to Nyaradzo service`);
        
        // Get the nyaradzo service
        const nyaradzoService = require('./nyaradzo');
        
        // Update session to use nyaradzo service directly
        session.service = 'nyaradzo';
        
        // Let nyaradzo handle it
        return await nyaradzoService.handleRequest(userId, messageText, session);
    }
    
    const selection = messageText.trim();
    
    // Handle numeric selections 1-6 for biller selection
    if (['1', '2', '3', '4', '5', '6'].includes(selection)) {
        console.log(`💳 [BILLS] User selected option ${selection}`);
        
        // Map selection to service
        const serviceMap = {
            '1': 'nyaradzo',
            '2': 'telone_voice',
            '3': 'telone_broadband',
            '4': 'telone_lte',
            '5': 'telone_voip',
            '6': 'telone_usd'
        };
        
        const serviceName = serviceMap[selection];
        
        if (serviceName) {
            // For Nyaradzo, we need to update the existing session
            if (serviceName === 'nyaradzo') {
                console.log(`💳 [BILLS] Updating session for Nyaradzo`);
                
                // Update the current session to use nyaradzo
                session.service = 'nyaradzo';
                session.step = 'ENTER_ACCOUNT';
                session.data = {
                    ...session.data,
                    biller: 'nyaradzo',
                    billerName: 'Nyaradzo Funeral',
                    productId: 15,
                    accountTypeId: 2,
                    currency: 'ZiG',
                    minAmount: 10,
                    maxAmount: 10000000
                };
                
                // Get the nyaradzo service and start flow
                const nyaradzoService = require('./nyaradzo');
                
                // Return the policy prompt
                return {
                    message: constants.UI_MESSAGES.BILLS.NYARADZO.POLICY_PROMPT,
                    session: session
                };
            } else {
                // For TelOne services, create new session
                console.log(`💳 [BILLS] Creating new session for ${serviceName}`);
                
                const { createSession } = require('../handlers/sessionHandlers');
                const serviceSession = createSession(userId, serviceName);
                serviceSession.step = 'ENTER_ACCOUNT';
                serviceSession.data = {
                    service: serviceName,
                    fromBills: true
                };
                
                const teloneService = require(`./${serviceName}`);
                const result = await teloneService.handleMessage(userId, 'START', serviceSession);
                
                return {
                    message: result.message,
                    session: result.session
                };
            }
        }
    }
    
    // Handle invalid selection
    return {
        message: `❌ Invalid option. Please select 1-6 or type *hi* to return to main menu.`,
        session: session
    };
}
    
    /**
     * Cancel current bills flow
     */
    async cancelFlow(userId) {
        console.log(`💳 [BILLS] Cancelling flow for ${userId}`);
        
        const { deleteSubmenuSession } = require('../handlers/submenuSessionHandler');
        deleteSubmenuSession(userId);
        deleteSession(userId);
        
        const messaging = require('../utils/messaging');
        await messaging.sendMessage(userId,
            `❌ *Cancelled*\n\nBills payment cancelled. Type *hi* for main menu.`
        );
    }
}

// Export singleton instance
module.exports = new BillsService();
