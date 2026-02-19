// services/telone_lte.js
const BaseTelOneService = require('./baseTelOneService');
const { BILLERS } = require('../config/constants');

const config = BILLERS['4']; // TelOne LTE config

class TelOneLTEService extends BaseTelOneService {
    constructor(hotrecharge) {
        super(hotrecharge, {
            key: 'telone_lte',
            name: 'TelOne LTE',
            emoji: '📶',
            currency: 'ZiG',
            productId: 32,
            accountTypeId: 1,
            fee: config.fee,
            minAmount: config.minAmount,
            maxAmount: config.maxAmount,
            requiresAccountNumber: true,
            requiresNotifyNumber: true
        });
    }
}

module.exports = TelOneLTEService;
