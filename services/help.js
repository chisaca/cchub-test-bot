// services/help.js - UPDATED to match architecture

const messaging = require('../utils/messaging');
const { RESPONSE_MESSAGES, URLS } = require('../config/constants');

class HelpService {
    
    /**
     * Send help message
     * Called from main menu (option 5) or when user types "help"
     */
    async sendHelpMessage(userId) {
        console.log(`🆘 Sending help to ${userId}`);
        
        await messaging.sendMessage(userId, RESPONSE_MESSAGES.HELP);
    }
    
    /**
     * Send specific help based on service type
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
        
        await messaging.sendMessage(userId, helpMessage);
    }
    
    /**
     * Airtime-specific help
     */
    getAirtimeHelp() {
        return `📱 *Airtime Purchase Help*\n\n` +
            `*How to buy airtime:*\n` +
            `1. Select network (Econet, NetOne, Telecel)\n` +
            `2. Enter phone number (0771234567 or 263771234567)\n` +
            `3. Enter amount (ZWL 100 - 50,000)\n` +
            `4. Confirm payment\n\n` +
            `*Valid phone formats:*\n` +
            `• 0771234567\n` +
            `• 263771234567\n` +
            `• 771234567\n\n` +
            `*Supported networks:*\n` +
            `• Econet (077, 078)\n` +
            `• NetOne (071)\n` +
            `• Telecel (073)\n\n` +
            `💡 *Tip:* Type "hi" anytime to restart.`;
    }
    
    /**
     * ZESA-specific help
     */
    getZesaHelp() {
        return `⚡ *ZESA Tokens Help*\n\n` +
            `*How to buy ZESA tokens:*\n` +
            `1. Enter meter number (10+ digits)\n` +
            `2. Enter amount (USD 1 - 100)\n` +
            `3. Select payment wallet\n` +
            `4. Confirm payment\n\n` +
            `*Payment wallets:*\n` +
            `• EcoCash USD\n` +
            `• OneMoney USD\n` +
            `• Innbucks USD\n` +
            `• Mukuru\n` +
            `• Omari\n\n` +
            `*Token delivery:*\n` +
            `Tokens are delivered instantly after payment.\n` +
            `Save the token and enter it on your ZESA meter.\n\n` +
            `💡 *Tip:* Type "hi" anytime to restart.`;
    }
    
    /**
     * Bill payment-specific help
     */
    getBillPaymentHelp() {
        return `💳 *Bill Payment Help*\n\n` +
            `*How to pay bills:*\n` +
            `1. Select bill category (School, Council, Insurance, Retail)\n` +
            `2. Get PayCode from website or enter if you have one\n` +
            `3. Enter amount (ZWL 50,000+)\n` +
            `4. Confirm payment\n\n` +
            `*PayCode Information:*\n` +
            `• Format: CCH123456\n` +
            `• Get from: ${URLS.MAIN_WEBSITE}\n` +
            `• One-time use only\n` +
            `• Expires after 10 minutes\n\n` +
            `*Bill categories:*\n` +
            `• School Fees\n` +
            `• City Council\n` +
            `• Insurance\n` +
            `• Retail Subscriptions\n\n` +
            `💡 *Tip:* Type "hi" anytime to restart.`;
    }
    
    /**
     * Emergency services-specific help
     */
    getEmergencyHelp() {
        return `🚨 *Emergency Services Help*\n\n` +
            `*How to get emergency contacts:*\n` +
            `1. Select service type (Police, Ambulance, Fire, etc.)\n` +
            `2. Select your province\n` +
            `3. Get emergency contacts\n\n` +
            `*Available services:*\n` +
            `• Police (ZRP)\n` +
            `• Ambulance & Medical\n` +
            `• Fire Brigade\n` +
            `• Hospital & Clinic\n` +
            `• Electricity (ZETDC)\n\n` +
            `*National emergency numbers:*\n` +
            `• All Emergencies: 999\n` +
            `• Police: 995\n` +
            `• Ambulance: 994\n` +
            `• Fire: 993\n` +
            `• Civil Protection: 112\n\n` +
            `💡 *Tip:* Type "hi" anytime to restart.`;
    }
    
    /**
     * Send error recovery help
     */
    async sendErrorRecoveryHelp(userId, errorType) {
        let message = '';
        
        switch(errorType) {
            case 'invalid_input':
                message = `❌ *Invalid Input Help*\n\n` +
                    `Each step expects specific input:\n\n` +
                    `• Menu selections: Numbers 1-5\n` +
                    `• Phone numbers: 0771234567 format\n` +
                    `• Amounts: Numbers only\n` +
                    `• Confirmations: YES or NO\n\n` +
                    `💡 *Tip:* After 3 wrong inputs, type "hi" to restart.`;
                break;
                
            case 'stuck_in_flow':
                message = `🔄 *Stuck in a Flow?*\n\n` +
                    `Type "hi" to reset everything and return to main menu.\n\n` +
                    `The "hi" command works anywhere and will:\n` +
                    `1. Cancel any ongoing transaction\n` +
                    `2. Clear your session\n` +
                    `3. Return you to main menu\n\n` +
                    `This is the universal reset command.`;
                break;
                
            case 'payment_failed':
                message = `💳 *Payment Failed Help*\n\n` +
                    `If a payment failed:\n\n` +
                    `1. Check your wallet balance\n` +
                    `2. Ensure network connection\n` +
                    `3. Try again in 5 minutes\n` +
                    `4. Contact support if issue persists\n\n` +
                    `📞 Support: +263 71 286 1483\n` +
                    `📧 Email: support@cchub.co.zw`;
                break;
                
            default:
                message = `🆘 *Need Help?*\n\n` +
                    `Type "hi" to restart or choose:\n\n` +
                    `1. Buy Airtime\n` +
                    `2. Buy ZESA\n` +
                    `3. Pay Bill\n` +
                    `4. Emergency Services\n` +
                    `5. Help\n\n` +
                    `Or contact support:\n` +
                    `📞 +263 71 286 1483`;
        }
        
        await messaging.sendMessage(userId, message);
    }
}

// Export singleton instance
module.exports = new HelpService();