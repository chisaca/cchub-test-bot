// services/telone_voip.js
const BaseTelOneService = require('./baseTelOneService');
const { BILLERS } = require('../config/constants');

const config = BILLERS['5']; // TelOne VoIP config

class TelOneVoIPService extends BaseTelOneService {
    constructor(hotrecharge) {
        super(hotrecharge, {
            key: 'telone_voip',
            name: 'TelOne VoIP',
            emoji: '📱',
            currency: 'ZiG',
            productId: 33,
            accountTypeId: 1,
            fee: config.fee,
            minAmount: config.minAmount,
            maxAmount: config.maxAmount,
            requiresAccountNumber: true,
            requiresNotifyNumber: true
        });
    }
}

module.exports = TelOneVoIPService;
