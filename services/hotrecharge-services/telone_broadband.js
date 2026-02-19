// services/telone_broadband.js
const BaseTelOneService = require('./baseTelOneService');
const { BILLERS } = require('../config/constants');

const config = BILLERS['3']; // TelOne Broadband config

class TelOneBroadbandService extends BaseTelOneService {
    constructor(hotrecharge) {
        super(hotrecharge, {
            key: 'telone_broadband',
            name: 'TelOne Broadband',
            emoji: '🌐',
            currency: 'ZiG',
            productId: 31,
            accountTypeId: 1,
            fee: config.fee,
            minAmount: config.minAmount,
            maxAmount: config.maxAmount,
            requiresAccountNumber: true,
            requiresNotifyNumber: true
        });
    }
}

module.exports = TelOneBroadbandService;
