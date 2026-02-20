// services/telone_voip.js
// TelOne VoIP Service (ZiG) - Product ID: 33

const BaseTelOneService = require('./baseTeloneService');
const { BILLERS } = require('../config/constants');
const hotrecharge = require('./hotrecharge');

class TelOneVoIPService extends BaseTelOneService {
    constructor() {
        // Get the complete biller config from constants (key '5' = TelOne VoIP)
        const billerConfig = BILLERS['5'];
        
        super(hotrecharge, {
            key: 'telone_voip',
            name: billerConfig.name,
            emoji: billerConfig.emoji,
            currency: billerConfig.currency,
            productId: billerConfig.productId,
            accountTypeId: billerConfig.accountTypeId,
            fee: billerConfig.fee,
            minAmount: billerConfig.minAmount,
            maxAmount: billerConfig.maxAmount,
            requiresAccountNumber: billerConfig.requiresAccountNumber,
            requiresNotifyNumber: billerConfig.requiresNotifyNumber,
            accountLength: billerConfig.accountLength,
            description: billerConfig.description
        });
    }
}

// Export a SINGLETON instance
module.exports = new TelOneVoIPService();
