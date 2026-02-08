constructor() {
    const { PAYMENT_CONFIG } = require('../config/constants');
    this.SERVICE_FEE_PERCENTAGE = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME || 0.08;
    this.MIN_AMOUNT = PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME || 100;
    this.MAX_AMOUNT = 50000;
    this.NETWORKS = {
        '1': 'Econet',
        '2': 'NetOne',
        '3': 'Telecel'
    };
}