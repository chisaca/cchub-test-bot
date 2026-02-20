// services/telone_broadband.js
// TelOne Broadband Service (ZiG) - Product ID: 31

const BaseTelOneService = require('./baseTeloneService');
const { BILLERS } = require('../config/constants');
const hotrecharge = require('./hotrecharge');

class TelOneBroadbandService extends BaseTelOneService {
    constructor() {
        // Get the complete biller config from constants (key '3' = TelOne Broadband)
        const billerConfig = BILLERS['3'];
        
        super(hotrecharge, {
            key: 'telone_broadband',
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
module.exports = new TelOneBroadbandService();
