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
    async handleRequest(userId, messageText, session) {
        console.log(`💳 [BILLS] Handling biller selection: "${messageText}"`);
        
        // For bill_payment, we just want to route to the appropriate service
        // based on the selection (1-6)
        
        const selection = messageText.trim();
        
        // Handle numeric selections 1-6
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
                // Clear the bill_payment session
                deleteSession(userId);
                
                // Create session for the selected service
                const { createSession } = require('../handlers/sessionHandlers');
                const serviceSession = createSession(userId, serviceName);
                
                // Set initial state based on service
                if (serviceName === 'nyaradzo') {
                    serviceSession.step = constants.FLOW_STATES.BILL_PAYMENT.ENTER_ACCOUNT;
                    serviceSession.data = {
                        biller: 'nyaradzo',
                        billerName: 'Nyaradzo Funeral'
                    };
                } else if (serviceName.startsWith('telone_')) {
                    serviceSession.step = 'ENTER_ACCOUNT';
                    serviceSession.data = {
                        service: serviceName,
                        fromBills: true
                    };
                }
                
                // Get the service handler
                let serviceHandler;
                if (serviceName === 'nyaradzo') {
                    serviceHandler = require('./nyaradzo');
                    const result = await serviceHandler.startFlow(userId);
                    return result;
                } else {
                    // For TelOne services
                    serviceHandler = require(`./${serviceName}`);
                    const result = await serviceHandler.handleMessage(userId, 'START', serviceSession);
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
