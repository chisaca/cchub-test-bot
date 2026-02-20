// services/telone_usd.js
// TelOne USD Bundle Service - Product ID: 40

const BaseTelOneService = require('./baseTeloneService');
const { BILLERS } = require('../config/constants');
const hotrecharge = require('./hotrecharge');

class TelOneUSDService extends BaseTelOneService {
    constructor() {
        // Get the complete biller config from constants (key '6' = TelOne USD)
        const billerConfig = BILLERS['6'];
        
        super(hotrecharge, {
            key: 'telone_usd',
            name: billerConfig.name,
            emoji: billerConfig.emoji,
            currency: billerConfig.currency, // 'USD'
            productId: billerConfig.productId, // 40
            accountTypeId: billerConfig.accountTypeId, // 3
            fee: billerConfig.fee, // 0.08 (8%)
            minAmount: billerConfig.minAmount, // 1
            maxAmount: billerConfig.maxAmount, // 1000
            requiresAccountNumber: billerConfig.requiresAccountNumber,
            requiresNotifyNumber: billerConfig.requiresNotifyNumber,
            accountLength: billerConfig.accountLength,
            description: billerConfig.description
        });
    }
}

// Export a SINGLETON instance
module.exports = new TelOneUSDService();
