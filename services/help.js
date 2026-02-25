// services/help.js
// ============================================================================
// HELP SERVICE
// Provides help information for all services and error recovery assistance
// 
// Features:
// - General help menu (main menu option 5)
// - Service-specific help for each service type
// - Error recovery guidance for common error scenarios
// ============================================================================

const messaging = require('../utils/messaging');
const { RESPONSE_MESSAGES, URLS } = require('../config/constants');

class HelpService {
    
    // ============================================================================
    // GENERAL HELP
    // ============================================================================
    
    /**
     * Send general help message
     * Called from main menu (option 5) or when user types "help"
     * Uses the comprehensive HELP message from constants.js
     * 
     * @param {string} userId - WhatsApp user ID
     */
    async sendHelpMessage(userId) {
        console.log(`🆘 [HELP] Sending general help to ${userId}`);
        
        await messaging.sendMessage(userId, RESPONSE_MESSAGES.HELP);
    }
    
    // ============================================================================
    // SERVICE-SPECIFIC HELP
    // ============================================================================
    
    /**
     * Send help specific to a particular service type
     * Used when user needs guidance during a specific flow
     * 
     * @param {string} userId - WhatsApp user ID
     * @param {string} serviceType - Service type (airtime, zesa, bill_payment, emergency)
     */
    async sendServiceHelp(userId, serviceType) {
        let helpMessage = '';
        
        switch(serviceType) {
            case 'airtime':
                helpMessage = this.getAirtimeHelp();
                break;
            case 'zesa':
                helpMessage = this.getZesaHelp();
                break;
            case 'bill_payment':
                helpMessage = this.getBillPaymentHelp();
                break;
            case 'emergency':
                helpMessage = this.getEmergencyHelp();
                break;
            default:
                return await this.sendHelpMessage(userId);
        }
        
        console.log(`🆘 [HELP] Sending ${serviceType} help to ${userId}`);
        await messaging.sendMessage(userId, helpMessage);
    }
    
    /**
     * Get airtime-specific help text
     * 
     * @returns {string} Formatted help message
     */
    getAirtimeHelp() {
        return `📱 *Airtime Purchase Help*

*How to buy airtime:*
1 *Select network* (Econet, NetOne, Telecel)
2 *Enter phone number* (0771234567 or 263771234567)
3 *Enter amount* (USD 0.10-300 or ZiG 10-200,000)
4 *Confirm payment*

*Valid phone formats:*
• 0771234567
• 263771234567
• 771234567

*Supported networks:*
• Econet (077, 078)
• NetOne (071)
• Telecel (073)

*Payment methods:*
• EcoCash (USD/ZiG)
• Zimswitch (USD/ZiG)
• PayGo (USD/ZiG)
• OneMoney (ZiG only)
• InnBucks (USD only)

💡 *Tip:* Type "hi" anytime to restart.`;
    }
    
    /**
     * Get ZESA-specific help text
     * 
     * @returns {string} Formatted help message
     */
    getZesaHelp() {
        return `⚡ *ZESA Tokens Help*

*How to buy ZESA tokens:*
1 *Enter meter number* (11 digits)
2 *Enter amount* (USD 5-10,000 or ZiG 10,000-10,000,000)
3 *Select payment method*
4 *Confirm payment*

*Meter number format:*
• 11 digits (e.g., 12345678901)
• No spaces or special characters

*Token delivery:*
• SMS sent to your notification number
• Token valid for 48 hours
• Enter on your ZESA meter

*Payment methods:*
• EcoCash (USD/ZiG)
• Zimswitch (USD/ZiG)
• PayGo (USD/ZiG)
• OneMoney (ZiG only)
• InnBucks (USD only)

💡 *Tip:* Type "hi" anytime to restart.`;
    }
    
    /**
     * Get bill payment-specific help text
     * Currently focused on Nyaradzo
     * 
     * @returns {string} Formatted help message
     */
    getBillPaymentHelp() {
        return `📄 *Bill Payment Help*

*Supported Billers:*
1 *🌸 Nyaradzo Funeral*

*How to pay Nyaradzo:*
1 *Enter policy number* (8 digits)
2 *Enter amount* (10-10,000,000 ZiG)
3 *Select payment method*
4 *Confirm payment*

*Policy number format:*
• Exactly 8 digits
• Example: 12345678

*Payment methods (ZiG only):*
• EcoCash ZiG
• Zimswitch ZiG
• PayGo ZiG
• OneMoney ZiG

💡 *Tip:* Type "hi" anytime to restart.`;
    }
    
    /**
     * Get emergency services-specific help text
     * 
     * @returns {string} Formatted help message
     */
    getEmergencyHelp() {
        return `🚨 *Emergency Services Help*

*How to get emergency contacts:*
1 *Select service type* (Police, Ambulance, Fire, etc.)
2 *Select your province*
3 *Get live emergency contacts*

*Available services:*
• Police (ZRP) 👮
• Ambulance & Medical 🚑
• Fire Brigade 🚒
• Vehicle Breakdown 🔧
• Child Services 👶
• Hospital & Clinic 🏥
• Funeral Homes ⚰️
• Legal Services ⚖️
• Immigration 🛂
• Electricity (ZETDC) ⚡
• Municipal Services 🏛️

*Supported provinces:*
• All 10 Zimbabwe provinces

*National emergency numbers:*
• All Emergencies: 999
• Police: 995
• Ambulance: 994
• Fire: 993

💡 *Tip:* Type "hi" anytime to restart.`;
    }
    
    // ============================================================================
    // ERROR RECOVERY HELP
    // ============================================================================
    
    /**
     * Send error recovery help based on error type
     * Provides specific guidance for common error scenarios
     * 
     * @param {string} userId - WhatsApp user ID
     * @param {string} errorType - Type of error (invalid_input, stuck_in_flow, payment_failed)
     */
    async sendErrorRecoveryHelp(userId, errorType) {
        let message = '';
        
        switch(errorType) {
            case 'invalid_input':
                message = `❌ *Invalid Input*

• Menu: 1-5
• Phone: 0771234567  
• Amount: Numbers only
• Confirm: YES or NO

────────────────

Type *hi* to restart`;
                break;
                
            case 'stuck_in_flow':
                message = `🔄 *Stuck?*

Type *hi* anywhere to:
• Cancel current transaction
• Clear session  
• Return to main menu

────────────────

Type *hi* now`;
                break;
                
            case 'payment_failed':
                message = `💳 *Payment failed*

• Check wallet balance
• Try again in 5 minutes
• Contact support

📞 +263 71 286 1483
📧 support@cchub.co.zw

────────────────

Type *hi* to restart`;
                break;
                
            default:
                // Send the actual welcome menu for unknown error types
                await messaging.sendWelcomeMessage(userId);
                return;
        }
        
        console.log(`🆘 [HELP] Sending error recovery help (${errorType}) to ${userId}`);
        await messaging.sendMessage(userId, message);
    }
}

// Export singleton instance
module.exports = new HelpService();
