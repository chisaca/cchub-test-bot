// services/telone_voice.js
const BaseTelOneService = require('./baseTeloneService');
const { BILLERS } = require('../config/constants');

const config = BILLERS['2']; // TelOne Voice config

class TelOneVoiceService extends BaseTelOneService {
    constructor(hotrecharge) {
        super(hotrecharge, {
            key: 'telone_voice',
            name: 'TelOne Voice',
            emoji: '📞',
            currency: 'ZiG',
            productId: 30,
            accountTypeId: 1,
            fee: config.fee,
            minAmount: config.minAmount,
            maxAmount: config.maxAmount,
            requiresAccountNumber: true,
            requiresNotifyNumber: true
        });
    }
}

module.exports = TelOneVoiceService;
