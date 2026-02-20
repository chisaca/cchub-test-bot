// services/telone_lte.js
// TelOne LTE Service (ZiG) - Product ID: 32

const BaseTelOneService = require('./baseTelOneService');
const { BILLERS } = require('../config/constants');
const hotrecharge = require('./hotrecharge');

class TelOneLTEService extends BaseTelOneService {
    constructor() {
        // Get the complete biller config from constants (key '4' = TelOne LTE)
        const billerConfig = BILLERS['4'];
        
        super(hotrecharge, {
            key: 'telone_lte',
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
module.exports = new TelOneLTEService();
