// data/mockData.js
const TEST_METERS = {
    '12345678901': {
        customerName: 'TEST USER - CHIDO MUTSVANGWA',
        area: 'TEST AREA - HARARE CBD',
        previousUnits: 15.50,
        isTest: true
    },
    '11111111111': {
        customerName: 'TEST USER - JOHN DOE',
        area: 'TEST AREA - BULAWAYO',
        previousUnits: 10.25,
        isTest: true
    },
    '22222222222': {
        customerName: 'TEST USER - JANE SMITH',
        area: 'TEST AREA - MUTARE',
        previousUnits: 20.75,
        isTest: true
    }
};

const MOCK_BILLERS = {
    '0001': { name: 'School A', type: 'school_fees', category: '🏫 School' },
    '0002': { name: 'School B', type: 'school_fees', category: '🏫 School' },
    '0003': { name: 'School C', type: 'school_fees', category: '🏫 School' },
    '0004': { name: 'Council A', type: 'city_council', category: '🏛️ City Council' },
    '0005': { name: 'Council B', type: 'city_council', category: '🏛️ City Council' },
    '0006': { name: 'Council C', type: 'city_council', category: '🏛️ City Council' },
    '0007': { name: 'Insurance A', type: 'insurance', category: '🛡️ Insurance' },
    '0008': { name: 'Insurance B', type: 'insurance', category: '🛡️ Insurance' },
    '0009': { name: 'Insurance C', type: 'insurance', category: '🛡️ Insurance' },
    '0010': { name: 'Retail A', type: 'retail_subscriptions', category: '🛒 Retail/Subscriptions' },
    '0011': { name: 'Retail B', type: 'retail_subscriptions', category: '🛒 Retail/Subscriptions' },
    '0012': { name: 'Retail C', type: 'retail_subscriptions', category: '🛒 Retail/Subscriptions' }
};

const BILLER_SEARCH_URLS = {
    'school_fees': 'https://cchub.co.zw/pay-school-fees/',
    'city_council': 'https://cchub.co.zw/pay-city-council/',
    'insurance': 'https://cchub.co.zw/pay-insurance/',
    'retail_subscriptions': 'https://cchub.co.zw/pay-retail-subscriptions/'
};

module.exports = {
    TEST_METERS,
    MOCK_BILLERS,
    BILLER_SEARCH_URLS
};