// services/bills.js
// ============================================================================
// BILLS SERVICE
// Handles bill payment selection and routing to specific biller services
// Currently supports:
// - Nyaradzo Funeral (🌸)
// 
// Flow:
// 1. Creates submenu session for biller selection
// 2. Sends bills submenu to user
// 3. Routes selection to appropriate biller service
// ============================================================================

const { createSubmenuSession } = require('../handlers/submenuSessionHandler');
const { sendSubmenu } = require('../handlers/subMenuHandler');
const { deleteSession } = require('../handlers/sessionHandlers');
const nyaradzoService = require('./nyaradzo');

class BillsService {
    
    // ============================================================================
    // FLOW INITIATION
    // ============================================================================
    
    /**
     * Start the bills payment flow
     * Creates a submenu session and sends the biller selection menu
     * 
     * @param {string} userId - WhatsApp user ID
     * @returns {Promise<Object>} Result with null message (menu sent directly)
     */
    async startFlow(userId) {
        console.log(`💳 [BILLS] Starting flow for ${userId}`);
        
        // Clear any existing session and create submenu session for biller selection
        deleteSession(userId);
        createSubmenuSession(userId, 'BILLS');
        
        // Send the bills submenu (currently only Nyaradzo)
        await sendSubmenu(userId, 'BILLS');
        
        return {
            message: null,  // Message already sent via sendSubmenu
            session: null   // No main session yet - using submenu session
        };
    }
    
    // ============================================================================
    // REQUEST HANDLER
    // ============================================================================
    
    /**
     * Handle user's biller selection
     * Routes to the appropriate biller service based on selection
     * 
     * @param {string} userId - WhatsApp user ID
     * @param {string} messageText - User's selection (e.g., "1")
     * @param {Object} session - Current session (unused but kept for interface consistency)
     * @returns {Promise<Object>} Result that will be passed to messageHandler
     */
    async handleRequest(userId, messageText, session) {
        console.log(`💳 [BILLS] Handling selection: "${messageText}"`);
        
        const selection = messageText.trim();
        
        // ========================================================================
        // ROUTE TO NYARADZO SERVICE
        // ========================================================================
        if (selection === '1') {
            console.log(`💳 [BILLS] User selected Nyaradzo`);
            
            // Clear bills session before starting Nyaradzo flow
            deleteSession(userId);
            
            // Delegate to Nyaradzo service
            return await nyaradzoService.startFlow(userId);
        }
        
        // ========================================================================
        // INVALID SELECTION
        // ========================================================================
        console.log(`⚠️ [BILLS] Invalid selection: ${selection}`);
        
        return {
            message: `❌ Invalid option. Please select 1 or type *hi* to return to main menu.`,
            session: session  // Keep the session for retry
        };
    }
}

module.exports = new BillsService();
