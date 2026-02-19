// services/telone_usd.js
const BaseTelOneService = require('./baseTelOneService');
const { BILLERS } = require('../config/constants');

const config = BILLERS['6']; // TelOne USD config

class TelOneUSDService extends BaseTelOneService {
    constructor(hotrecharge) {
        super(hotrecharge, {
            key: 'telone_usd',
            name: 'TelOne USD Bundle',
            emoji: '💵',
            currency: 'USD',
            productId: 40,
            accountTypeId: 3,
            fee: config.fee,
            minAmount: config.minAmount,
            maxAmount: config.maxAmount,
            requiresAccountNumber: true,
            requiresNotifyNumber: true
        });
    }

    // Override formatAmount for USD
    formatAmount(amount) {
        return `$${amount.toFixed(2)} USD`;
    }
}

module.exports = TelOneUSDService;
