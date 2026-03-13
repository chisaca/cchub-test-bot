// services/help.js - UPDATED with Personality & Interactive UI
// ============================================================================
// HELP SERVICE
// Provides help information for all services and error recovery assistance
// 
// Features:
// - General help menu (main menu option 5)
// - Service-specific help for each service type
// - Error recovery guidance for common error scenarios
// - Interactive buttons for quick navigation
// - Personality to make help messages friendlier
// ============================================================================

const messaging = require('../utils/messaging');
const { RESPONSE_MESSAGES, URLS, INTERACTIVE_UI_CONFIG, PERSONALITY_CONFIG } = require('../config/constants');
// NEW: Import personality utilities
const { 
    getRandomResponse,
    getFriendlyErrorMessage,
    getThanksMessage
} = require('../utils/personality');

class HelpService {
    
    // ============================================================================
    // GENERAL HELP
    // ============================================================================
    
    /**
     * Send general help message
     * Called from main menu (option 5) or when user types "help"
     * Uses the comprehensive HELP message from constants.js
     * NOW WITH: Interactive navigation buttons
     * 
     * @param {string} userId - WhatsApp user ID
     */
    async sendHelpMessage(userId) {
        console.log(`🆘 [HELP] Sending general help to ${userId}`);
        
        // NEW: Add personality intro
        const intro = getRandomResponse('greeting');
        
        // Send main help message
        await messaging.sendMessage(userId, RESPONSE_MESSAGES.HELP);
        
        // NEW: Send navigation buttons
        await messaging.sendButtonMessage(
            userId,
            `📚 *Need more specific help?*\n\nChoose a topic below:`,
            [
                { id: "help_airtime", title: "📱 Airtime Help" },
                { id: "help_zesa", title: "⚡ ZESA Help" },
                { id: "help_bills", title: "📄 Bills Help" },
                { id: "help_emergency", title: "🚨 Emergency Help" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
    }
    
    // ============================================================================
    // SERVICE-SPECIFIC HELP
    // ============================================================================
    
    /**
     * Send help specific to a particular service type
     * Used when user needs guidance during a specific flow
     * NOW WITH: Interactive buttons and personality
     * 
     * @param {string} userId - WhatsApp user ID
     * @param {string} serviceType - Service type (airtime, zesa, bill_payment, emergency)
     */
    async sendServiceHelp(userId, serviceType) {
        let helpMessage = '';
        let serviceName = '';
        
        switch(serviceType) {
            case 'airtime':
                helpMessage = this.getAirtimeHelp();
                serviceName = '📱 Airtime';
                break;
            case 'zesa':
                helpMessage = this.getZesaHelp();
                serviceName = '⚡ ZESA';
                break;
            case 'bill_payment':
                helpMessage = this.getBillPaymentHelp();
                serviceName = '📄 Bills';
                break;
            case 'emergency':
                helpMessage = this.getEmergencyHelp();
                serviceName = '🚨 Emergency';
                break;
            default:
                return await this.sendHelpMessage(userId);
        }
        
        console.log(`🆘 [HELP] Sending ${serviceType} help to ${userId}`);
        
        // Add personality intro
        const intro = `Here's everything you need to know about ${serviceName}:`;
        const fullMessage = `${intro}\n\n${helpMessage}`;
        
        await messaging.sendMessage(userId, fullMessage);
        
        // NEW: Send navigation buttons after help
        await messaging.sendButtonMessage(
            userId,
            `What would you like to do next?`,
            [
                { id: `help_${serviceType}`, title: "🔄 See Again" },
                { id: "help", title: "📚 Main Help" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
    }
    
    /**
     * Get airtime-specific help text
     * 
     * @returns {string} Formatted help message
     */
    getAirtimeHelp() {
        return `📱 *Airtime Purchase Help*

*How to buy airtime:*
1️⃣ *Select network* (Econet, NetOne, Telecel)
2️⃣ *Enter phone number* (0771234567 or 263771234567)
3️⃣ *Enter amount* (USD 0.10-300 or ZiG 10-200,000)
4️⃣ *Confirm payment*

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
1️⃣ *Enter meter number* (11 digits)
2️⃣ *Enter amount* (USD 5-10,000 or ZiG 10,000-10,000,000)
3️⃣ *Select payment method*
4️⃣ *Confirm payment*

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
🌸 *Nyaradzo Funeral*

*How to pay Nyaradzo:*
1️⃣ *Enter policy number* (8 digits)
2️⃣ *Enter amount* (10-10,000,000 ZiG)
3️⃣ *Select payment method*
4️⃣ *Confirm payment*

*Policy number format:*
• Exactly 8 digits
• Example: 12345678

*Payment methods (ZiG only):*
• EcoCash ZiG
• Zimswitch ZiG
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
1️⃣ *Select service type* (Police, Ambulance, Fire, etc.)
2️⃣ *Select your province*
3️⃣ *Get live emergency contacts*

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
     * NOW WITH: Friendly error messages and interactive buttons
     * 
     * @param {string} userId - WhatsApp user ID
     * @param {string} errorType - Type of error (invalid_input, stuck_in_flow, payment_failed)
     */
    async sendErrorRecoveryHelp(userId, errorType) {
        let message = '';
        let buttons = [];
        
        switch(errorType) {
            case 'invalid_input':
                message = getFriendlyErrorMessage('invalid_input', 
                    `I didn't understand that input. Let me show you what works:`);
                message += `\n\n✅ *Valid inputs:*\n• Menu: 1-5\n• Phone: 0771234567\n• Amount: Numbers only\n• Confirm: YES or NO`;
                buttons = [
                    { id: "help", title: "📚 See Full Help" },
                    { id: "hi", title: "🏠 Main Menu" }
                ];
                break;
                
            case 'stuck_in_flow':
                message = getFriendlyErrorMessage('stuck_in_flow',
                    `Looks like you're stuck. No worries!`);
                message += `\n\n🔄 *Quick fix:* Type *hi* anywhere to:\n• Cancel current transaction\n• Clear your session\n• Return to main menu`;
                buttons = [
                    { id: "hi", title: "🏠 Go to Main Menu" },
                    { id: "help", title: "📚 Help Center" }
                ];
                break;
                
            case 'payment_failed':
                message = getFriendlyErrorMessage('payment_failed',
                    `Your payment didn't go through. Let's fix that:`);
                message += `\n\n💳 *Troubleshooting:*\n• Check wallet balance\n• Try again in 5 minutes\n• Contact support if persists`;
                message += `\n\n📞 *Support:* +263 71 286 1483\n📧 support@cchub.co.zw`;
                buttons = [
                    { id: "hi", title: "🔄 Try Again" },
                    { id: "help", title: "📚 Help Center" }
                ];
                break;
                
            case 'api_down':
                message = getFriendlyErrorMessage('api_down',
                    `Our service provider is temporarily unavailable.`);
                message += `\n\n🔧 *What's happening:*\n• Scheduled maintenance\n• Should be back in 5-10 minutes\n• Your money is safe`;
                buttons = [
                    { id: "hi", title: "🏠 Check Later" },
                    { id: "help", title: "📚 Other Services" }
                ];
                break;
                
            default:
                // Send the actual welcome menu for unknown error types
                await messaging.sendInteractiveMainMenu(userId);
                return;
        }
        
        console.log(`🆘 [HELP] Sending error recovery help (${errorType}) to ${userId}`);
        
        // Send friendly error message
        await messaging.sendMessage(userId, message);
        
        // Send navigation buttons
        if (buttons.length > 0) {
            await messaging.sendButtonMessage(
                userId,
                "What would you like to do?",
                buttons
            );
        }
    }
    
    // ============================================================================
    // QUICK TIPS
    // ============================================================================
    
    /**
     * Send a quick tip based on context
     * 
     * @param {string} userId - WhatsApp user ID
     * @param {string} tipType - Type of tip (quick_service, payment, general)
     */
    async sendQuickTip(userId, tipType) {
        let tip = '';
        
        switch(tipType) {
            case 'quick_service':
                tip = `💡 *Quick Tip:* Use options 6️⃣ and 7️⃣ to repeat your last purchase with one tap!`;
                break;
            case 'payment':
                tip = `💡 *Quick Tip:* You can save your preferred payment method for faster checkout!`;
                break;
            case 'voice':
                tip = `💡 *Quick Tip:* You can send voice notes instead of typing! Just speak your request.`;
                break;
            case 'referral':
                tip = `💡 *Quick Tip:* Refer a friend and you both get $1 airtime! Share your referral code.`;
                break;
            default:
                tip = `💡 *Quick Tip:* Type *help* anytime for assistance.`;
        }
        
        await messaging.sendMessage(userId, tip);
    }
    
    // ============================================================================
    // CONTACT SUPPORT
    // ============================================================================
    
    /**
     * Send contact information for human support
     * 
     * @param {string} userId - WhatsApp user ID
     */
    async sendContactInfo(userId) {
        const message = `📞 *Need to talk to a human?*\n\n` +
            `We're here to help!\n\n` +
            `📱 *WhatsApp:* +263 71 286 1483\n` +
            `📞 *Phone:* +263 71 286 1483\n` +
            `📧 *Email:* support@cchub.co.zw\n` +
            `🌐 *Website:* https://cchub.co.zw\n\n` +
            `⏰ *Support hours:* 24/7 - We never sleep! 😴❌\n\n` +
            `Type *hi* to return to main menu.`;
        
        await messaging.sendMessage(userId, message);
    }
}

// Export singleton instance
module.exports = new HelpService();