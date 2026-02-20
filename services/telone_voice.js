// services/telone_voice.js
const BaseTelOneService = require('./baseTelOneService');
const { BILLERS } = require('../config/constants');
const hotrecharge = require('./hotrecharge'); // Import the instance

class TelOneVoiceService extends BaseTelOneService {
    constructor() {
        // Pass hotrecharge to parent
        super(hotrecharge, {
            key: 'telone_voice',
            name: 'TelOne Voice',
            emoji: '📞',
            currency: 'ZiG',
            productId: 30,
            accountTypeId: 1,
            fee: BILLERS['2'].fee,
            minAmount: BILLERS['2'].minAmount,
            maxAmount: BILLERS['2'].maxAmount
        });
    }
}

// Export a SINGLETON instance
module.exports = new TelOneVoiceService();
