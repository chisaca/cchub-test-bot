// services/bills.js - SIMPLIFIED (Nyaradzo only)

const { createSubmenuSession } = require('../handlers/submenuSessionHandler');
const { sendSubmenu } = require('../handlers/subMenuHandler');
const { deleteSession } = require('../handlers/sessionHandlers');
const nyaradzoService = require('./nyaradzo');

class BillsService {
    async startFlow(userId) {
        console.log(`💳 [BILLS] Starting bills flow for ${userId}`);
        
        deleteSession(userId);
        createSubmenuSession(userId, 'BILLS');
        await sendSubmenu(userId, 'BILLS');
        
        return {
            message: null,
            session: null
        };
    }
    
    async handleRequest(userId, messageText, session) {
        console.log(`💳 [BILLS] Handling selection: "${messageText}"`);
        
        const selection = messageText.trim();
        
        if (selection === '1') {
            console.log(`💳 [BILLS] User selected Nyaradzo`);
            deleteSession(userId);
            return await nyaradzoService.startFlow(userId);
        }
        
        return {
            message: `❌ Invalid option. Please select 1 or type *hi* to return to main menu.`,
            session: session
        };
    }
}

module.exports = new BillsService();
