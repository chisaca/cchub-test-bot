// services/telone_voice.js
const BaseTelOneService = require('./baseTelOneService');
const { BILLERS } = require('../config/constants');
const hotrecharge = require('./hotrecharge'); // Import the instance

class TelOneVoiceService extends BaseTelOneService {
    constructor() {
        // Get the complete biller config from constants
        const billerConfig = BILLERS['2']; // TelOne Voice config
        
        // Pass ALL biller properties to the base class
        super(hotrecharge, {
            key: 'telone_voice',
            name: billerConfig.name,
            emoji: billerConfig.emoji,
            currency: billerConfig.currency,
            productId: billerConfig.productId,
            accountTypeId: billerConfig.accountTypeId,
            fee: billerConfig.fee,
            minAmount: billerConfig.minAmount,
            maxAmount: billerConfig.maxAmount,
            requiresAccountNumber: billerConfig.requiresAccountNumber, // true
            requiresNotifyNumber: billerConfig.requiresNotifyNumber,   // true
            accountLength: billerConfig.accountLength,                 // 8
            description: billerConfig.description
        });
    }
}

// Export a SINGLETON instance
module.exports = new TelOneVoiceService();
