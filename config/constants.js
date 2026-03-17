// config/constants.js - COMPLETE ORIGINAL VERSION WITH UI UPGRADES
// ============================================================================
// PRODUCTION CONSTANTS CONFIGURATION
// All system-wide constants, messages, and configurations
// Last updated: 3-Tap Maximum Architecture - 2026
// ============================================================================

const WHATSAPP_CONFIG = {
    API_VERSION: 'v17.0',
    MESSAGE_TYPES: {
        TEXT: 'text',
        INTERACTIVE: 'interactive',
        /** FLOW: For multi-screen data collection */
        FLOW: 'flow',
        /** BUTTON: For simple confirmations */
        BUTTON: 'button',
        /** LIST: For category menus */
        LIST: 'list'
    },
    MAX_MESSAGE_LENGTH: 4096
};

// ==================== PAYMENT CONFIG - ZIG & USD ONLY ====================
const PAYMENT_CONFIG = {
    MIN_AMOUNTS: {
        AIRTIME_ZIG: 0.10,
        AIRTIME_USD: 0.10,
        NYARADZO: 10
    },
    MAX_AMOUNTS: {
        AIRTIME_ZIG: 3000,
        AIRTIME_USD: 100,
        NYARADZO: 10000
    },
    SERVICE_FEES: {
        AIRTIME: 0.08,  // 8%
        ZESA: 0.05,      // 5%
        NYARADZO: 0.05   // 5%
    },
    CURRENCIES: {
        AIRTIME_ZIG: 'ZiG',
        AIRTIME_USD: 'USD',
        NYARADZO: 'ZiG'
    },
    ZESA: {
        MIN_ZIG: 100,
        MAX_ZIG: 10000,
        MIN_USD: 5,
        MAX_USD: 300,
        SERVICE_FEE_PERCENTAGE: 0.05,
        SUPPORTED_CURRENCIES: ['ZiG', 'USD']
    }
};

// ==================== AIRTIME CURRENCY OPTIONS ====================
const AIRTIME_CURRENCY_OPTIONS = {
    '1': {
        id: 'zig',
        name: 'ZiG',
        symbol: 'ZiG',
        min: PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME_ZIG,
        max: PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME_ZIG,
        hotrecharge_product_map: {
            'Econet': 110
        }
    },
    '2': {
        id: 'usd',
        name: 'USD',
        symbol: '$',
        min: PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME_USD,
        max: PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME_USD,
        hotrecharge_product_map: {
            'Econet': 100,
            'NetOne': 100,
            'Telecel': 100
        }
    }
};

// ==================== ZESA CURRENCY OPTIONS ====================
const ZESA_CURRENCY_OPTIONS = {
    '1': {
        id: 'zig',
        name: 'ZiG',
        symbol: 'ZiG',
        min: PAYMENT_CONFIG.ZESA.MIN_ZIG,
        max: PAYMENT_CONFIG.ZESA.MAX_ZIG,
        productId: 24,
        accountTypeId: 2,
        verificationProductId: 24,
        fee: PAYMENT_CONFIG.SERVICE_FEES.ZESA
    },
    '2': {
        id: 'usd',
        name: 'USD',
        symbol: '$',
        min: PAYMENT_CONFIG.ZESA.MIN_USD,
        max: PAYMENT_CONFIG.ZESA.MAX_USD,
        productId: 41,
        accountTypeId: 4,
        verificationProductId: 24,
        fee: PAYMENT_CONFIG.SERVICE_FEES.ZESA
    }
};

// Session Management Constants
const SESSION_CONFIG = {
    TIMEOUT: 10 * 60 * 1000,           // 10 minutes
    CLEANUP_INTERVAL: 60 * 1000,
    USER_ACTIVITY_CLEANUP_INTERVAL: 5 * 60 * 1000,
    MAX_RETRY_COUNT: 3
};

// ==================== NETWORK DETECTION ====================
const NETWORK_PREFIXES = {
    ECONET: {
        prefixes: ['077', '078'],
        internationalPrefixes: ['26377', '26378'],
        name: 'Econet'
    },
    NETONE: {
        prefixes: ['071'],
        internationalPrefixes: ['26371'],
        name: 'NetOne'
    },
    TELECEL: {
        prefixes: ['073'],
        internationalPrefixes: ['26373'],
        name: 'Telecel'
    }
};

// ==================== PAYMENT PROVIDER CODES ====================
const PAYMENT_PROVIDERS = {
    ZIG: {
        ECOCASH: '1',
        ZIMSWITCH: '2',
        ONEMONEY: '3'
    },
    USD: {
        ECOCASH: '1',
        ZIMSWITCH: '2',
        INNBUCKS: '3'
    }
};

// ==================== PAYMENT METHOD DISPLAY NAMES ====================
const PAYMENT_METHOD_NAMES = {
    [PAYMENT_PROVIDERS.ZIG.ECOCASH]: '💰 EcoCash ZiG',
    [PAYMENT_PROVIDERS.ZIG.ZIMSWITCH]: '💳 Zimswitch ZiG',
    [PAYMENT_PROVIDERS.ZIG.ONEMONEY]: '📱 OneMoney ZiG',
    [PAYMENT_PROVIDERS.USD.ECOCASH]: '💰 EcoCash USD',
    [PAYMENT_PROVIDERS.USD.ZIMSWITCH]: '💳 Zimswitch USD',
    [PAYMENT_PROVIDERS.USD.INNBUCKS]: '🏦 InnBucks USD'
};

// ==================== PAYMENT METHOD CONFIGURATIONS ====================
const PAYMENT_METHOD_CONFIG = {
    [PAYMENT_PROVIDERS.ZIG.ECOCASH]: {
        name: 'EcoCash ZiG',
        currency: 'ZiG',
        requiresPhone: true,
        phonePrefixes: ['077', '078'],
        provider: 'ecocash'
    },
    [PAYMENT_PROVIDERS.ZIG.ZIMSWITCH]: {
        name: 'Zimswitch ZiG',
        currency: 'ZiG',
        requiresPhone: false,
        provider: 'zimswitch'
    },
    [PAYMENT_PROVIDERS.ZIG.ONEMONEY]: {
        name: 'OneMoney ZiG',
        currency: 'ZiG',
        requiresPhone: true,
        phonePrefixes: ['071'],
        provider: 'onemoney'
    },
    [PAYMENT_PROVIDERS.USD.ECOCASH]: {
        name: 'EcoCash USD',
        currency: 'USD',
        requiresPhone: true,
        phonePrefixes: ['077', '078'],
        provider: 'ecocash'
    },
    [PAYMENT_PROVIDERS.USD.ZIMSWITCH]: {
        name: 'Zimswitch USD',
        currency: 'USD',
        requiresPhone: false,
        provider: 'zimswitch'
    },
    [PAYMENT_PROVIDERS.USD.INNBUCKS]: {
        name: 'InnBucks USD',
        currency: 'USD',
        requiresPhone: false,
        provider: 'innbucks'
    }
};

// Airtime Networks
const AIRTIME_NETWORKS = {
    '1': 'Econet',
    '2': 'NetOne',
    '3': 'Telecel'
};

// ==================== PAYMENT PREFIXES ====================
const PAYMENT_PREFIXES = {
    ECOCASH: ['077', '078'],
    ONEMONEY: ['071'],
    INNBUCKS: ['071', '077', '078'] 
};

// ==================== FLOW STATE CONSTANTS ====================
const FLOW_STATES = {
    AIRTIME: {
        START: 'airtime_start',
        SELECT_CURRENCY: 'airtime_select_currency',
        SELECT_NETWORK: 'airtime_select_network',
        ENTER_PHONE: 'airtime_enter_phone',
        ENTER_AMOUNT: 'airtime_enter_amount',
        SELECT_PAYMENT_METHOD: 'airtime_select_payment_method',
        CONFIRM_PAYMENT: 'airtime_confirm_payment'
    },
    
    ZESA: {
        SELECT_CURRENCY: 'zesa_select_currency',
        ENTER_METER: 'zesa_enter_meter',
        VERIFYING_METER: 'zesa_verifying_meter',
        ENTER_AMOUNT: 'zesa_enter_amount',
        SELECT_PAYMENT_METHOD: 'zesa_select_payment_method',
        ENTER_PAYMENT_PHONE: 'zesa_enter_payment_phone',
        ENTER_NOTIFICATION_PHONE: 'zesa_enter_notification_phone',
        CONFIRM_PAYMENT: 'zesa_confirm_payment',
        PROCESSING: 'zesa_processing'
    },
    
    BILL_PAYMENT: {
        START: 'bill_start',
        SELECT_BILLER: 'bill_select_biller',
        ENTER_ACCOUNT: 'bill_enter_account',
        VERIFYING_ACCOUNT: 'bill_verifying_account',
        ENTER_AMOUNT: 'bill_enter_amount',
        SELECT_PAYMENT_METHOD: 'bill_select_payment_method',
        ENTER_PAYMENT_PHONE: 'bill_enter_payment_phone',
        ENTER_NOTIFY_PHONE: 'bill_enter_notify_phone',
        CONFIRM_PAYMENT: 'bill_confirm_payment',
        PROCESSING: 'bill_processing'
    },
    
    NYARADZO: {
        ENTER_POLICY: 'nyaradzo_enter_policy',
        VERIFY_POLICY: 'nyaradzo_verify_policy',
        ENTER_AMOUNT: 'nyaradzo_enter_amount',
        SELECT_PAYMENT_METHOD: 'nyaradzo_select_payment_method',
        CONFIRM_PAYMENT: 'nyaradzo_confirm_payment'
    },
    
    EMERGENCY: {
        START: 'emergency_start',
        SELECT_SERVICE: 'emergency_select_service',
        SELECT_PROVINCE: 'emergency_select_province',
        SHOW_CONTACTS: 'emergency_show_contacts'
    },

    HOT_UPDATES: {
        START: 'hot_updates_start',
        SELECT_SERVICE: 'hot_updates_select_service',
        SELECT_WEATHER_LOCATION: 'hot_updates_select_weather_location', 
        SHOW_INFO: 'hot_updates_show_info'
    },

    // Quick Service States
    QUICK_SERVICE: {
        AIRTIME: 'quick_airtime',
        ZESA: 'quick_zesa',
        CONFIRM: 'quick_confirm'
    },

    // NEW: Flow states for WhatsApp Flows
    FLOW: {
        AIRTIME: 'flow_airtime',
        ZESA: 'flow_zesa',
        AWAITING_FLOW_COMPLETION: 'awaiting_flow_completion'
    }

};

// Service Types
const SERVICE_TYPES = {
    AIRTIME: 'airtime',
    ZESA: 'zesa',
    BILL_PAYMENT: 'bill_payment',
    NYARADZO: 'nyaradzo',
    EMERGENCY: 'emergency',
    HOT_UPDATES: 'hot_updates',
    EPL: 'epl',
    NEWS: 'news',
    WEATHER: 'weather',
    QUICK_AIRTIME: 'quick_airtime',
    QUICK_ZESA: 'quick_zesa'
};

// ==================== BILLERS ====================
const BILLERS = {
    '1': {
        key: 'nyaradzo',
        name: 'Nyaradzo Funeral',
        emoji: '🌸',
        productId: 15,
        accountTypeId: 2,
        minAmount: PAYMENT_CONFIG.MIN_AMOUNTS.NYARADZO,
        maxAmount: PAYMENT_CONFIG.MAX_AMOUNTS.NYARADZO,
        currency: 'ZiG',
        requiresPolicyNumber: true,
        policyLength: 8,
        requiresNotifyNumber: true,
        description: 'Pay Nyaradzo funeral policy subscriptions',
        fee: PAYMENT_CONFIG.SERVICE_FEES.NYARADZO
    }
};

// ==================== HOT UPDATES CONFIG ====================
const HOT_UPDATES_CONFIG = {
    SERVICES: {
        '1': {
            key: 'epl',
            name: '⚽ EPL Soccer Updates',
            endpoint: '/wp-json/cchub/v1/epl',
            description: 'League standings, fixtures, results'
        },
        '2': {
            key: 'news',
            name: '📰 Zimbabwe News',
            endpoint: '/wp-json/cchub/v1/news',
            description: 'Herald, Chronicle, Newsday headlines'
        },
        '3': {
            key: 'weather',
            name: '🌦️ Weather Forecasts',
            endpoint: '/wp-json/cchub/v1/weather/{city}',
            description: 'Current weather & 5-day forecasts for cities and resorts'
        }
    },
    
    // 🌍 ZIMBABWEAN CITIES & HOLIDAY RESORTS - UPDATED
    WEATHER_LOCATIONS: {
        // Major Cities
        '1': {
            id: 'harare',
            name: 'Harare',
            type: 'City',
            coordinates: { lat: -17.8252, lon: 31.0335 },
            emoji: '🏛️',
            description: 'Capital City'
        },
        '2': {
            id: 'bulawayo',
            name: 'Bulawayo',
            type: 'City',
            coordinates: { lat: -20.1325, lon: 28.6265 },
            emoji: '🏭',
            description: 'City of Kings'
        },
        '3': {
            id: 'gweru',
            name: 'Gweru',
            type: 'City',
            coordinates: { lat: -19.4500, lon: 29.8167 },
            emoji: '🏛️',
            description: 'Midlands City'
        },
        '4': {
            id: 'mutare',
            name: 'Mutare',
            type: 'City',
            coordinates: { lat: -18.9667, lon: 32.6333 },
            emoji: '⛰️',
            description: 'Eastern Highlands Gateway'
        },
        '5': {
            id: 'masvingo',
            name: 'Masvingo',
            type: 'City',
            coordinates: { lat: -20.0667, lon: 30.8167 },
            emoji: '🏛️',
            description: 'Ancient City, Great Zimbabwe'
        },
        '6': {
            id: 'kwekwe',
            name: 'Kwekwe',
            type: 'City',
            coordinates: { lat: -18.9167, lon: 29.8167 },
            emoji: '⛏️',
            description: 'Mining City'
        },
        '7': {
            id: 'kadoma',
            name: 'Kadoma',
            type: 'City',
            coordinates: { lat: -18.3333, lon: 29.9167 },
            emoji: '🏭',
            description: 'Industrial Hub'
        },
        '8': {
            id: 'chinhoyi',
            name: 'Chinhoyi',
            type: 'City',
            coordinates: { lat: -17.3667, lon: 30.2000 },
            emoji: '🏞️',
            description: 'Caves Gateway'
        },
        '9': {
            id: 'bindura',
            name: 'Bindura',
            type: 'City',
            coordinates: { lat: -17.3000, lon: 31.3167 },
            emoji: '⛏️',
            description: 'Mining Town'
        },
        '10': {
            id: 'marondera',
            name: 'Marondera',
            type: 'City',
            coordinates: { lat: -18.1833, lon: 31.5500 },
            emoji: '🌾',
            description: 'Farming Hub'
        },
        
        // Holiday Resorts & Tourist Destinations
        '11': {
            id: 'victoria_falls',
            name: 'Victoria Falls',
            type: 'Resort',
            coordinates: { lat: -17.9243, lon: 25.8566 },
            emoji: '🌊',
            description: 'Mosi-oa-Tunya - The Smoke That Thunders'
        },
        '12': {
            id: 'kariba',
            name: 'Kariba',
            type: 'Resort',
            coordinates: { lat: -16.5167, lon: 28.8000 },
            emoji: '🌅',
            description: 'Lake Kariba - World\'s Largest Man-Made Lake'
        },
        '13': {
            id: 'nyanga',
            name: 'Nyanga',
            type: 'Resort',
            coordinates: { lat: -18.2167, lon: 32.7500 },
            emoji: '🏔️',
            description: 'Eastern Highlands - Mount Nyangani'
        },
        '14': {
            id: 'hwange',
            name: 'Hwange',
            type: 'Resort',
            coordinates: { lat: -18.3667, lon: 26.5000 },
            emoji: '🦁',
            description: 'Hwange National Park - Wildlife Paradise'
        },
        '15': {
            id: 'great_zimbabwe',
            name: 'Great Zimbabwe',
            type: 'Heritage Site',
            coordinates: { lat: -20.2833, lon: 30.9333 },
            emoji: '🏛️',
            description: 'UNESCO World Heritage - Ancient City'
        },
        '16': {
            id: 'chimanimani',
            name: 'Chimanimani',
            type: 'Resort',
            coordinates: { lat: -19.8000, lon: 32.8667 },
            emoji: '🏔️',
            description: 'Mountain Paradise - Hiking Trails'
        },
        '17': {
            id: 'vumba',
            name: 'Vumba',
            type: 'Resort',
            coordinates: { lat: -19.0833, lon: 32.7500 },
            emoji: '🌺',
            description: 'Botanical Gardens & Mountain Scenery'
        },
        '18': {
            id: 'troutbeck',
            name: 'Troutbeck',
            type: 'Resort',
            coordinates: { lat: -18.1833, lon: 32.8167 },
            emoji: '🎣',
            description: 'Trout Fishing & Golf Resort'
        },
        '19': {
            id: 'bumi_hills',
            name: 'Bumi Hills',
            type: 'Resort',
            coordinates: { lat: -16.8167, lon: 28.6167 },
            emoji: '🏕️',
            description: 'Lake Kariba Safari Lodge'
        },
        '20': {
            id: 'chiredzi',
            name: 'Chiredzi',
            type: 'Town',
            coordinates: { lat: -21.0500, lon: 31.6667 },
            emoji: '🌴',
            description: 'Lowveld - Hippo Valley, Gonarezhou Gateway'
        },
        '21': {
            id: 'mazvikadei',
            name: 'Mazvikadei',
            type: 'Resort',
            coordinates: { lat: -17.2167, lon: 30.3667 },
            emoji: '🏖️',
            description: 'Lake Mazvikadei - Water Sports & Relaxation'
        },
        '22': {
            id: 'antelope_park',
            name: 'Antelope Park',
            type: 'Resort',
            coordinates: { lat: -19.6000, lon: 29.9667 },
            emoji: '🦁',
            description: 'Lion Conservation & Game Park, Gweru'
        },
        '23': {
            id: 'matopos',
            name: 'Matopos',
            type: 'Heritage Site',
            coordinates: { lat: -20.5500, lon: 28.5000 },
            emoji: '🪨',
            description: 'Matobo National Park - Balancing Rocks'
        },
        '24': {
            id: 'chinhoyi_caves',
            name: 'Chinhoyi Caves',
            type: 'Attraction',
            coordinates: { lat: -17.3500, lon: 30.1167 },
            emoji: '🕳️',
            description: 'Wonder Hole - Blue Pool Caves'
        }
    },
    
    WORDPRESS_URL: process.env.WORDPRESS_URL || 'https://cchub.co.zw',
    CACHE_TTL: 15 * 60 * 1000, // 15 minutes
    REQUEST_TIMEOUT: 5000, // 5 seconds
    
    // Meteosource API Configuration (for future integration)
    METEOSOURCE: {
        API_KEY: process.env.METEOSOURCE_API_KEY,
        BASE_URL: 'https://api.meteosource.com/v1',
        ENDPOINTS: {
            CURRENT: '/current',
            HOURLY: '/forecast/hourly',
            DAILY: '/forecast/daily',
            LOOKUP: '/lookup'  // For converting city names to coordinates
        },
        UNITS: process.env.METEOSOURCE_UNITS || 'metric',
        LANGUAGE: process.env.METEOSOURCE_LANGUAGE || 'en',
        FORECAST_DAYS: parseInt(process.env.METEOSOURCE_FORECAST_DAYS) || 5
    },
    
    // Enhanced fallback sample data
    SAMPLE_DATA: {
        EPL: `⚽ *EPL Standings*\n\n1. Arsenal - 25pts\n2. Man City - 24pts\n3. Liverpool - 23pts\n\n*Next Fixtures:*\nArsenal vs Chelsea - Sat 15:00\nMan City vs Spurs - Sun 16:30`,
        
        NEWS: `📰 *Top Headlines*\n\n• Government announces new economic measures\n• Schools open for first term\n• Harare gets new water treatment plant\n\n*Source: Sample Data*`,
        
        WEATHER: (city) => {
            const sampleForecasts = {
                'harare': `🌦️ *Harare 5-Day Forecast*\n\nToday: 25°C ☀️ Sunny\nTue: 27°C ⛅ Partly cloudy\nWed: 23°C 🌧️ Rain showers\nThu: 24°C ☁️ Cloudy\nFri: 26°C ☀️ Sunny`,
                
                'victoria_falls': `🌦️ *Victoria Falls 5-Day Forecast*\n\nToday: 32°C ☀️ Hot & Sunny\nTue: 33°C ☀️ Clear skies\nWed: 31°C ⛅ Partly cloudy\nThu: 30°C ☁️ Cloudy\nFri: 31°C ☀️ Sunny - Perfect for falls visit!`,
                
                'nyanga': `🌦️ *Nyanga 5-Day Forecast*\n\nToday: 22°C ☁️ Cool mountain breeze\nTue: 23°C ⛅ Pleasant\nWed: 20°C 🌧️ Light rain\nThu: 21°C ☁️ Misty morning\nFri: 22°C ☀️ Clear - Great for hiking!`,
                
                'kariba': `🌦️ *Kariba 5-Day Forecast*\n\nToday: 34°C ☀️ Hot\nTue: 35°C ☀️ Very hot\nWed: 33°C ⛅ Partly cloudy\nThu: 32°C ☁️ Cloudy\nFri: 33°C ☀️ Sunny - Perfect lake weather!`,
                
                'hwange': `🌦️ *Hwange 5-Day Forecast*\n\nToday: 31°C ☀️ Game viewing ideal\nTue: 32°C ☀️ Dry\nWed: 30°C ⛅ Good for wildlife\nThu: 29°C ☁️ Cloudy\nFri: 30°C ☀️ Animals active morning/evening`,
                
                'default': `🌦️ *${city} 5-Day Forecast*\n\nToday: 26°C ☀️ Sunny\nTue: 27°C ⛅ Partly cloudy\nWed: 24°C 🌧️ Rain possible\nThu: 25°C ☁️ Cloudy\nFri: 26°C ☀️ Clearing up`
            };
            
            return sampleForecasts[city] || sampleForecasts.default;
        }
    }
};

// ==================== WORDPRESS CMS CONFIG ====================
const WORDPRESS_CONFIG = {
    BASE_URL: process.env.WORDPRESS_URL + '/wp-json/cchub/v1',
    TIMEOUT: 15000,
    RETRY_ATTEMPTS: 3,
    
    CACHE_TTL: {
        EPL: 3600,        // 1 hour
        NEWS: 1800,       // 30 minutes
        WEATHER: 1800     // 30 minutes
    },
    
    ENDPOINTS: {
        EPL: '/epl',
        EPL_STANDINGS: '/epl/standings',
        EPL_FIXTURES: '/epl/fixtures',
        EPL_RESULTS: '/epl/results',
        EPL_TOP_SCORERS: '/epl/top_scorers',
        
        NEWS: '/news',
        NEWS_CATEGORIES: '/news/categories',
        NEWS_SINGLE: (id) => `/news/${id}`,
        
        WEATHER: '/weather',
        WEATHER_LOCATIONS: '/weather/locations',
        WEATHER_SINGLE: (location) => `/weather/${encodeURIComponent(location)}`
    },
    
    PARAMS: {
        FORMAT_WHATSAPP: 'format=whatsapp',
        CATEGORY: 'category'
    }
};

// ==================== INFO SERVICE STATUS (Updated) ====================
const INFO_SERVICE_STATUS = {
    EPL: {
        status: 'LIVE',
        lastUpdated: 'Daily via cron',
        dataSource: 'WordPress Football-Data.org API'
    },
    NEWS: {
        status: 'LIVE', 
        lastUpdated: 'Daily via cron',
        dataSource: 'WordPress Zimbabwe News Aggregator'
    },
    WEATHER: {
        status: 'LIVE',
        lastUpdated: 'Daily via cron',
        dataSource: 'WordPress OpenWeatherMap API'
    }
};

// ==================== WALLET OPTIONS ====================
const WALLET_OPTIONS = {
    ZESA: {
        '1': 'EcoCash',
        '2': 'InnBucks'     
    },
    AIRTIME: {
        '1': 'EcoCash',
        '2': 'InnBucks'    
    }
};

const PAYMENT_METHODS = {
    '1': 'ecocash',
    '2': 'innbucks'         
};

// ==================== UI MESSAGES ====================
const UI_MESSAGES = {
    CURRENCY_PROMPT: {
        AIRTIME: `📱 *Airtime Purchase*

Please select currency:

1 *ZiG* (Econet only)
2 *USD* (All networks)

────────────────

Reply with *1* or *2*`,
        ZESA: `⚡ *ZESA Purchase*

Please select currency:

1 *ZiG*
2 *USD*

────────────────
Reply with *1* or *2*`
    },
    
    PAYMENT_METHOD_PROMPT: {
        ZIG: `💳 *Select Payment Method (ZiG)*

1 *💰 EcoCash ZiG*
2 *💳 Zimswitch ZiG*
3 *📱 OneMoney ZiG*

────────────────
Reply with *1-3*`,
        
        USD: `💳 *Select Payment Method (USD)*

1 *💰 EcoCash USD*
2 *💳 Zimswitch USD*
3 *🏦 InnBucks USD*

────────────────
Reply with *1-3*`
    },
    
    PAYMENT_PHONE_PROMPT: {
        ECOCASH: `📱 *EcoCash paying number*

Enter the number registered with EcoCash

────────────────

Example: 0771234567`,
        ONEMONEY: `📱 *OneMoney paying number*

Enter the number registered with OneMoney

────────────────

Example: 0711234567`,
        DEFAULT: `📱 *Payment number*

Enter the phone number for payment

────────────────

Example: 0771234567`
    },
    
    RECIPIENT_PROMPT: {
        AIRTIME: `📞 *Recipient's number*

Enter phone number you want to top up

────────────────

Example: 0771234567`,
        ZESA_NOTIFY: `📲 *Notification number*

Enter phone number to receive SMS token

────────────────

Example: 0771234567`
    },
    
    BILLS: {
        BILLER_PROMPT: `📄 *Bills Payment*

Select biller:

1 *🌸 Nyaradzo Funeral*

────────────────
Reply with *1*
Type *hi* to return to Main Menu`,
        
        NYARADZO: {
            POLICY_PROMPT: `🌸 *Nyaradzo Funeral*

Please enter your 8-digit Nyaradzo policy number:

────────────────
Example: 12345678`,
            
            AMOUNT_PROMPT: `💰 *Enter amount*

Amount must be 10 - 10,000,000 ZiG

────────────────
Reply with the amount:`,
            
            VERIFYING: `⏳ Verifying policy number...`,
            
            VERIFIED: (policy, customerName) => 
                `✅ *Policy Verified*\n\nCustomer: *${customerName}*\nPolicy: *${policy}*\n\n────────────────\nNow enter amount to pay:`,
            
            CONFIRMATION: (policy, customerName, amount, fee, total) =>
                `🌸 *Confirm Nyaradzo Payment*\n\n` +
                `Policy: *${policy}*\n` +
                `Customer: *${customerName || 'N/A'}*\n` +
                `────────────────\n` +
                `Payment: *${amount.toLocaleString()} ZiG*\n` +
                `Fee (5%): *${fee.toLocaleString()} ZiG*\n` +
                `────────────────\n` +
                `*Total: ${total.toLocaleString()} ZiG*\n` +
                `────────────────\n\n` +
                `Type *YES* to confirm or *NO* to cancel`
                ,
            
            PROCESSING: `🌶️ Paying your Nyaradzo policy. Please wait...\n\n⏳ Processing...`,
            
            SUCCESS: (policy, customerName, amount, total, reference, notifyNumber) =>
                `✅ *Nyaradzo Payment Successful!*\n\n` +
                `Policy: *${policy}*\n` +
                `Customer: *${customerName || 'N/A'}*\n` +
                `────────────────\n` +
                `Amount: *${amount.toLocaleString()} ZiG*\n` +
                `Total Paid: *${total.toLocaleString()} ZiG*\n` +
                `Reference: *${reference}*\n` +
                `────────────────\n\n` +
                `📲 Confirmation sent to: *${notifyNumber.slice(0,5)}****${notifyNumber.slice(-3)}*\n\n` +
                `Thank you for using CCHub! 💎`
        }
    },

    CONFIRMATION: {
        PROMPT: `Type *YES* to confirm or *NO* to cancel`,
        INVALID: `⚠️ *Invalid option*\n\nPlease reply with *YES* to proceed or *NO* to cancel.`
    },

    // UPDATED: Hot Updates with modern format
    HOT_UPDATES: {
        MAIN_MENU: `🔥 *HOT UPDATES*

    Choose information service:

    1 *⚽ EPL Soccer Updates*
    2 *📰 Zimbabwe News*
    3 *🌦️ Weather Forecasts*

    ────────────────
    Reply with *1-3*
    Type *hi* for Main Menu`,
        
        WEATHER_LOCATION_PROMPT: `🌦️ *Weather Forecasts*

    Select location (cities & resorts):

    ━━━━━━━━━━━━━━━━━━
    🏛️ *MAJOR CITIES*
    ━━━━━━━━━━━━━━━━━━
    1 *Harare*
    2 *Bulawayo*
    3 *Gweru*
    4 *Mutare*
    5 *Masvingo*
    6 *Kwekwe*
    7 *Kadoma*
    8 *Chinhoyi*
    9 *Bindura*
    10 *Marondera*

    ━━━━━━━━━━━━━━━━━━
    🌴 *HOLIDAY RESORTS*
    ━━━━━━━━━━━━━━━━━━
    11 *🌊 Victoria Falls* - Mosi-oa-Tunya
    12 *🌅 Kariba* - Lake paradise
    13 *🏔️ Nyanga* - Eastern Highlands
    14 *🦁 Hwange* - National Park
    15 *🏛️ Great Zimbabwe* - UNESCO Site
    16 *🏔️ Chimanimani* - Mountains
    17 *🌺 Vumba* - Gardens
    18 *🎣 Troutbeck* - Golf & fishing
    19 *🏕️ Bumi Hills* - Safari
    20 *🌴 Chiredzi* - Lowveld
    21 *🏖️ Mazvikadei* - Lake resort
    22 *🦁 Antelope Park* - Lion conservation
    23 *🪨 Matopos* - Balancing rocks
    24 *🕳️ Chinhoyi Caves* - Wonder Hole

    ────────────────
    Reply with location number (1-24)
    Type *hi* for Main Menu`,
        
        WEATHER_RESULT: (location, forecast) => 
            `🌦️ *Weather - ${location.name}*
    ${location.emoji} *${location.description}*

    ━━━━━━━━━━━━━━━━━━
    ${forecast}

    ━━━━━━━━━━━━━━━━━━
    📍 *Coordinates:* ${location.coordinates.lat}°, ${location.coordinates.lon}°

    Reply *hi* for Main Menu`,
        
        FETCHING_EPL: `⏳ Fetching latest EPL soccer updates...`,
        FETCHING_NEWS: `⏳ Fetching latest Zimbabwe news headlines...`,
        FETCHING_WEATHER: (locationName) => `⏳ Fetching weather forecast for ${locationName}...`,
        
        ERROR: `❌ *Weather Service Unavailable*\n\nShowing sample forecast:\n\n%s\n\n_We'll be back with live updates soon!_`
    },

    // Quick Service Messages
    QUICK_SERVICE: {
        AIRTIME: (last) => {
            if (!last) {
                return `⏩ *Quick Airtime*\n\nNo previous purchase found. Starting new purchase...`;
            }
            const maskedRecipient = last.recipient.replace('263', '0').slice(0,5) + '****' + last.recipient.slice(-3);
            const amountDisplay = last.currency === 'USD' ? `$${last.amount.toFixed(2)}` : `${last.amount.toFixed(2)} ZiG`;
            
            return `⏩ *Quick Airtime*
────────────────
Last purchase: *${maskedRecipient}* for *${amountDisplay}* (${last.network})

Reply:
1️⃣ *Confirm & Pay* - Use same details
2️⃣ *Change Details* - Start normal flow
3️⃣ *Cancel*

────────────────
_Reply with 1, 2, or 3_`;
        },
        
        ZESA: (last) => {
            if (!last) {
                return `⏩ *Quick ZESA*\n\nNo previous purchase found. Starting new purchase...`;
            }
            const maskedMeter = last.meterNumber.slice(0,5) + '****' + last.meterNumber.slice(-3);
            const amountDisplay = last.currency === 'USD' ? `$${last.amount.toFixed(2)}` : `${last.amount.toFixed(2)} ZiG`;
            
            return `⏩ *Quick ZESA*
────────────────
Last meter: *${maskedMeter}* (${last.customerName || 'N/A'})
Last amount: *${amountDisplay}*

Reply:
1️⃣ *Confirm & Pay* - Use same details
2️⃣ *Change Details* - Start normal flow
3️⃣ *Cancel*

────────────────
_Reply with 1, 2, or 3_`;
        },
        
        NO_HISTORY: (service) => `No previous ${service} purchase found. Starting new purchase...`,
        
        CONFIRMING: `✅ Processing your quick payment...`
    },

    // NEW: Flow UI Messages
    FLOW_MESSAGES: {
        AIRTIME_LAUNCH: `📱 *Airtime Purchase*

Just tap the button below to open the purchase form. It's that simple! 👇`,
        
        ZESA_LAUNCH: `⚡ *ZESA Token Purchase*

Tap the button below to open the ZESA purchase form. Quick and easy! 👇`,
        
        FLOW_BUTTON: "📱 Open Purchase Form",
        
        FLOW_COMPLETED: "✅ *Form submitted!* Processing your payment...",
        
        FLOW_CANCELLED: "❌ Purchase cancelled. Type *hi* for main menu."
    },

    // NEW: Button confirmation messages
    BUTTON_MESSAGES: {
        CONFIRM_AIRTIME: (recipient, amount, network, currency) => 
            `📱 *Confirm Airtime Purchase*
━━━━━━━━━━━━━━━━━━
📞 To: *${recipient}*
💰 Amount: *${amount} ${currency}*
📡 Network: *${network}*
━━━━━━━━━━━━━━━━━━

Tap below to confirm or edit:`,
        
        CONFIRM_ZESA: (meter, amount, currency, customerName) => 
            `⚡ *Confirm ZESA Purchase*
━━━━━━━━━━━━━━━━━━
🔢 Meter: *${meter}*
👤 Name: *${customerName || 'N/A'}*
💰 Amount: *${amount} ${currency}*
━━━━━━━━━━━━━━━━━━

Tap below to confirm or edit:`,
        
        POST_TRANSACTION: (service) => 
            `✨ *Transaction Complete!*

What would you like to do next? 👇`
    }
};

// URL Constants
const URLS = {
    MAIN_WEBSITE: 'https://cchub.co.zw'
};

// ==================== MESSAGING CONFIG ====================
const MESSAGING_CONFIG = {
    REQUEST_TIMEOUT: 10000, // 10 seconds
    TRUNCATION_SUFFIX: '\n\n[Message truncated due to length limits]',
    RECEIPT_MASK_LENGTH: 3,
    RECEIPT_PREFIX_LENGTH: 5,
    /** UPDATED: Modern welcome message with 4-category structure */
    WELCOME_MESSAGE: `👋 *Hey! I'm Mike, your CCHub assistant.*

━━━━━━━━━━━━━━━━━━
💰 *PAYMENTS*
━━━━━━━━━━━━━━━━━━
• 📱 Airtime - All networks
• ⚡ ZESA - Prepaid electricity
• 📄 Bills - Nyaradzo

━━━━━━━━━━━━━━━━━━
🔥 *HOT UPDATES*
━━━━━━━━━━━━━━━━━━
• ⚽ EPL Soccer - Live updates
• 📰 Zimbabwe News - Headlines
• 🌦️ Weather - 24 locations

━━━━━━━━━━━━━━━━━━
⚡ *QUICK ACTIONS*
━━━━━━━━━━━━━━━━━━
• 🔁 Repeat Last - One-tap payment
• 🚨 Emergency - Live contacts

━━━━━━━━━━━━━━━━━━
❓ *HELP & SUPPORT*
━━━━━━━━━━━━━━━━━━
• 📚 Help Center - FAQs
• 📞 Contact Us - Human support

━━━━━━━━━━━━━━━━━━
👆 *Just tap a button below to start!*`,
    
    ACCOUNT_LOCKED_TEMPLATE: `🔒 *Account Locked*\n\nToo many invalid attempts.\n\n⏰ Time remaining: %s minute(s)\n\nType "hi" after lockout expires.`,
    DEFAULT_ERROR: `❌ *Error*\n\nAn unexpected error occurred. Please type "hi" to restart.`
};

// ==================== RESPONSE MESSAGES ====================
const RESPONSE_MESSAGES = {
    /** UPDATED: Modern welcome with 4-category structure */
    WELCOME: `👋 *Hey! I'm Mike, your CCHub assistant.*

━━━━━━━━━━━━━━━━━━
💰 *PAYMENTS*
━━━━━━━━━━━━━━━━━━
• 📱 Airtime - All networks
• ⚡ ZESA - Prepaid electricity
• 📄 Bills - Nyaradzo

━━━━━━━━━━━━━━━━━━
🔥 *HOT UPDATES*
━━━━━━━━━━━━━━━━━━
• ⚽ EPL Soccer - Live updates
• 📰 Zimbabwe News - Headlines
• 🌦️ Weather - 24 locations

━━━━━━━━━━━━━━━━━━
⚡ *QUICK ACTIONS*
━━━━━━━━━━━━━━━━━━
• 🔁 Repeat Last - One-tap payment
• 🚨 Emergency - Live contacts

━━━━━━━━━━━━━━━━━━
❓ *HELP & SUPPORT*
━━━━━━━━━━━━━━━━━━
• 📚 Help Center - FAQs
• 📞 Contact Us - Human support

━━━━━━━━━━━━━━━━━━
👆 *Just tap a button below to start!*`,
    
    AIRTIME_CURRENCY_PROMPT: UI_MESSAGES.CURRENCY_PROMPT.AIRTIME,
    
    /** UPDATED: Modern help with personality */
    HELP: `❓ *Need help? I'm Mike!*

━━━━━━━━━━━━━━━━━━
📱 *AIRTIME*
━━━━━━━━━━━━━━━━━━
• *USD:* $0.10-$300 (All networks)
• *ZiG:* 0.10-3,000 ZiG (Econet only)
• *Fee:* 8% service fee

━━━━━━━━━━━━━━━━━━
⚡ *ZESA TOKENS*
━━━━━━━━━━━━━━━━━━
• *USD:* $5-$300
• *ZiG:* 100-10,000 ZiG
• *Fee:* 5% service fee
• *Meter:* 11-digit number required

━━━━━━━━━━━━━━━━━━
📄 *BILLS*
━━━━━━━━━━━━━━━━━━
🌸 *Nyaradzo Funeral*
• *Policy:* 8-digit number
• *Amount:* 10-10,000 ZiG
• *Fee:* 5% service fee

━━━━━━━━━━━━━━━━━━
🔥 *HOT UPDATES*
━━━━━━━━━━━━━━━━━━
• ⚽ EPL Soccer - Standings, fixtures
• 📰 Zimbabwe News - Headlines
• 🌦️ Weather - 24 cities & resorts

━━━━━━━━━━━━━━━━━━
💳 *PAYMENT METHODS*
━━━━━━━━━━━━━━━━━━
*ZiG:*
• 💰 EcoCash ZiG (077/078)
• 💳 Zimswitch ZiG
• 📱 OneMoney ZiG (071)

*USD:*
• 💰 EcoCash USD (077/078)
• 💳 Zimswitch USD
• 🏦 InnBucks USD

━━━━━━━━━━━━━━━━━━
⚙️ *HOW TO USE*
━━━━━━━━━━━━━━━━━━
👆 *Just tap the buttons!* It's that simple.

━━━━━━━━━━━━━━━━━━
📞 *SUPPORT*
━━━━━━━━━━━━━━━━━━
• Phone: +263 71 286 1483
• Website: cchub.co.zw

━━━━━━━━━━━━━━━━━━
💎 *CCHub - Your Daily Services Hub*`,
    
    INVALID_SELECTION: '❓ That number doesn\'t work. Try 1-9.',
    INVALID_CURRENCY: '❓ 1 for ZiG, 2 for USD.',
    
    SESSION_EXPIRED: '⏰ Session timed out. Type *hi* to start again.',
    
    TOO_MANY_ATTEMPTS: '⚠️ Too many wrong attempts. Type *hi* to restart.'
};

// ==================== ERROR MESSAGES ====================
const ERROR_MESSAGES = {
    INVALID_PHONE: `❓ That number doesn't look right.

Try: 0771234567 or 263771234567`,
    
    INVALID_METER: `❓ Meter should be 11 digits.

You sent: %s`,
    
    INVALID_POLICY: `❓ Nyaradzo policy number must be 8 digits.

You sent: %s`,
    
    INVALID_ACCOUNT: (biller) => 
        `❓ ${biller} account number must be 8 digits.\n\nYou sent: %s`,
    
    INVALID_AMOUNT: (min, max, currency) => 
        `❓ Amount must be ${min.toLocaleString()}-${max.toLocaleString()} ${currency}.`,
    
    INVALID_PAYMENT_METHOD: `❓ Invalid payment method. Please select 1-4.`,
    
    ACCOUNT_LOCKED: (minutes) => 
        `🔒 Locked for ${minutes} minutes.

Too many wrong attempts.

Type "hi" after lockout.`,
    
    POLICY_NOT_FOUND: (policy) => 
        `❌ Policy number *${policy}* not found in Nyaradzo database.\n\nPlease check and try again.`,
    
    VERIFICATION_FAILED: `❌ Failed to verify account. Please try again.`,
    
    ZIG_NETWORK_UNSUPPORTED: (network) => 
        `${network} ZiG airtime is currently unavailable. Please use USD instead.`,
    
    INSUFFICIENT_BALANCE: (currency, available, required) => 
        `Insufficient ${currency} balance. Available: ${available}, Required: ${required}`,
    
    CURRENCY_NOT_SUPPORTED: (service, currency) => 
        `${service} is only available in ZiG currency. Please select ZiG option.`,
    
    PAYMENT_PHONE_REQUIRED: (method) => 
        `📱 ${method} requires a phone number. Please enter your registered number.`,
    
    PAYMENT_PHONE_INVALID: (method, prefixes) => 
        `❌ ${method} number must start with ${prefixes.join(' or ')}.`
};

// ==================== EMERGENCY CONFIG ====================
const EMERGENCY_CONFIG = {
    CACHE_TTL: 30 * 60 * 1000, // 30 minutes
    
    SERVICES: {
        '1': {
            key: 'police',
            name: 'Police (ZRP)',
            emoji: '👮'
        },
        '2': {
            key: 'ambulance',
            name: 'Ambulance & Medical',
            emoji: '🚑'
        },
        '3': {
            key: 'fire',
            name: 'Fire Brigade',
            emoji: '🚒'
        },
        '4': {
            key: 'hospital',
            name: 'Hospital & Clinic',
            emoji: '🏥'
        },
        '5': {
            key: 'electricity',
            name: 'Electricity (ZETDC)',
            emoji: '⚡'
        }
    },
    
    PROVINCES: {
        '1': 'Harare',
        '2': 'Bulawayo',
        '3': 'Manicaland',
        '4': 'Mashonaland Central',
        '5': 'Mashonaland East',
        '6': 'Mashonaland West',
        '7': 'Masvingo',
        '8': 'Matabeleland North',
        '9': 'Matabeleland South',
        '10': 'Midlands'
    }
};

// ==================== RATE LIMIT CONFIG ====================
const RATE_LIMIT_CONFIG = {
    maxAttempts: 3,
    windowMs: 5 * 60 * 1000,
    lockoutDuration: 15 * 60 * 1000
};

// ==================== PHONE PATTERN ====================
const PHONE_PATTERN = /^(\+?263|0)[0-9]{9}$/;

// ==================== PAYNOW CONFIG ====================
const PAYNOW_CONFIG = {
    PROVIDER_PREFIXES: {
        ECOCASH: {
            local: ['077', '078'],
            international: ['26377', '26378'],
            name: 'EcoCash'
        },
        ONEMONEY: {
            local: ['071'],
            international: ['26371'],
            name: 'OneMoney'
        }
    },
    
    INNBUCKS: {
        qrCodeUrlTemplate: 'https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=schinn.wbpycode://innbucks.co.zw?pymInnCode=%s',
        deepLinkTemplate: 'schinn.wbpycode://innbucks.co.zw?pymInnCode=%s',
        appName: 'InnBucks'
    },
    
    ZIMSWITCH: {
        merchantCode: process.env.ZIMSWITCH_MERCHANT_CODE || '123456',
        posInstructions: 'Visit any Zimswitch POS or ATM and select "Pay Merchant"'
    },
    
    INSTRUCTION_TEMPLATES: {
        ECOCASH: `📱 *EcoCash Payment*

A payment request has been sent to %s.

✅ *Check your phone now:*
1. Enter your EcoCash PIN when prompted
2. Confirm payment of %s
3. Wait for "Transaction Successful" message

Reference: %s

⏳ I'll notify you when payment is confirmed.`,
        
        ZIMSWITCH: `💳 *Zimswitch Payment*

Please visit any Zimswitch POS or ATM:

1. Select "Pay Merchant"
2. Enter merchant code: *%s*
3. Enter amount: *%s*
4. Enter reference: *%s*
5. Complete transaction

Keep your receipt as proof of payment.

⏳ I'll notify you when payment is confirmed.`,
        
        ONEMONEY: `📱 *OneMoney Payment*

A payment request has been sent to %s.

✅ *Using OneMoney:*
1. Dial *171*4#
2. Enter your PIN when prompted
3. Confirm payment of %s
4. Wait for SMS confirmation

Reference: %s

⏳ I'll notify you when payment is confirmed.`,
        
        INNBUCKS: `💳 *InnBucks Payment*

🔑 *Authorization Code:* \`%s\`
⏰ *Expires:* %s
💰 *Amount:* %s

📱 *Option 1: Mobile App*
Tap this link on your phone:
%s

📲 *Option 2: Scan QR Code*
%s

🔄 *Option 3: Manual*
1. Open InnBucks app
2. Enter code: %s
3. Approve payment

Reference: %s

⏳ I'll notify you when payment is confirmed.`,
        
        SIMULATION_ECOCASH: `🔴 *SIMULATION: EcoCash*

A payment request would be sent to %s

💰 Amount: %s
Reference: %s`,
        
        SIMULATION_INNBUCKS: `🔴 *SIMULATION: InnBucks*

🔑 Auth Code: %s
⏰ Expires: %s
💰 Amount: %s

📱 Deep Link: %s
📲 QR Code: %s

Reference: %s`
    },
    
    SIMULATION: {
        authCodePrefix: 'INN',
        pollUrlTemplate: 'https://cchub.co.zw/paynow/simulate/%s'
    }
};

// ==================== MERCHANT CONFIG ====================
const MERCHANT_CONFIG = {
    EMAIL: process.env.MERCHANT_EMAIL || 'cchisango@cchub.co.zw',
    RESULT_URL: process.env.PAYNOW_RESULT_URL || 'https://cchub.co.zw/paynow/result',
    RETURN_URL: process.env.PAYNOW_RETURN_URL || 'https://cchub.co.zw/paynow/return',
    ZIMSWITCH_MERCHANT_CODE: process.env.ZIMSWITCH_MERCHANT_CODE || '123456',
    OMARI_MERCHANT_CODE: process.env.OMARI_MERCHANT_CODE || '123456'
};

// ==================== HOTRECHARGE CONFIG ====================
const HOTRECHARGE_CONFIG = {
    ACCOUNT_TYPES: {
        AIRTIME_ZIG: { id: 1, name: 'ZiG Airtime', apiName: 'ZWG' },
        ZESA_ZIG: { id: 2, name: 'ZiG ZESA', apiName: 'Utility ZWG' },
        NYARADZO: { id: 2, name: 'Nyaradzo', apiName: 'Nyaradzo' },
        AIRTIME_USD: { id: 3, name: 'USD Airtime', apiName: 'USD' },
        ZESA_USD: { id: 4, name: 'USD ZESA', apiName: 'Utility USD' }
    },
    
    CURRENCY_MAP: {
        'ZWG': 'ZiG',
        'Utility ZWG': 'ZiG',
        'Nyaradzo': 'ZiG',
        'USD': 'USD',
        'Utility USD': 'USD'
    },
    
    SERVICE_PREFIXES: {
        AIRTIME_USD: 'AIRTIME-USD',
        AIRTIME_ZIG: 'AIRTIME-ZIG',
        ZESA_USD: 'ZESA-USD',
        ZESA_ZIG: 'ZESA-ZIG',
        NYARADZO: 'NYARADZO',
        MAIN: 'MAIN'
    },
    
    TOKEN_EXPIRY_BUFFER: 60000, // 1 minute buffer
    TOKEN_EXPIRY_MINUTES: 29,   // 29 minutes (with buffer)
    REQUEST_TIMEOUT: 10000,      // 10 seconds
    HEALTH_CHECK_INTERVAL: 60000 // 1 minute
};

// ==================== VALIDATION CONFIG ====================
const VALIDATION_CONFIG = {
    PHONE: {
        LOCAL_LENGTH: 10,
        INTERNATIONAL_LENGTH: 12,
        SHORT_LENGTH: 9,
        PREFIX_LENGTH: 3,
        COUNTRY_CODE: '263'
    },
    METER: {
        MIN_LENGTH: 10
    },
    POLICY: {
        NYARADZO: {
            MIN_LENGTH: 8,
            MAX_LENGTH: 8,
            PATTERN: /^\d{8}$/,
            MESSAGE: 'Nyaradzo policy number must be 8 digits'
        }
    },
    MENU: {
        MIN_OPTION: 1,
        MAX_OPTION: 9  // Updated from 6 to 9 for 4 categories
    },
    PAYMENT_METHOD: {
        ZIG_OPTIONS: ['1', '2', '3'],
        USD_OPTIONS: ['1', '2', '3']
    },
    HOT_UPDATES: {
        SERVICE_OPTIONS: ['1', '2', '3'],
        LOCATION_OPTIONS: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 
                        '11', '12', '13', '14', '15', '16', '17', '18', '19', 
                        '20', '21', '22', '23', '24'], 
        MAIN_MENU_OPTIONS: ['1', '2', '3', '4', '5', '6', '7', '8', '9']  // Updated
    },
    QUICK_SERVICE: {
        CONFIRM_OPTIONS: ['1', '2', '3']
    }
};

// ==================== SERVICE KEYWORDS ====================
const SERVICE_KEYWORDS = {
    airtime: ['airtime', 'topup', 'top up', 'bundle', 'data'],
    zesa: ['zesa', 'electric', 'token', 'power', 'meter'],
    bill: ['bill', 'pay', 'payment', 'nyaradzo', 'funeral', 'policy'],
    nyaradzo: ['nyaradzo', 'funeral', 'policy'],
    emergency: ['emergency', 'police', 'ambulance', 'fire', 'hospital', 'services'],
    help: ['help', 'support', 'how', 'what', 'guide', 'manual'],
    hotupdates: ['hot', 'updates', 'info', 'news', 'soccer', 'epl', 'weather', 'forecast'],
    epl: ['epl', 'soccer', 'football', 'premier league', 'matches', 'standings'],
    news: ['news', 'headlines', 'herald', 'chronicle', 'newsday', 'zimbabwe'],
    weather: ['weather', 'forecast', 'rain', 'temperature', 'climate'],
    quick_airtime: ['quick airtime', 'fast airtime', 'repeat airtime'],
    quick_zesa: ['quick zesa', 'fast zesa', 'repeat zesa']
};

// ==================== RESPONSE KEYWORDS ====================
const RESPONSE_KEYWORDS = {
    YES: ['yes', 'y', 'confirm', 'ok', 'okay', 'yeah', 'yep', '1'],
    NO: ['no', 'n', 'cancel', 'stop', 'abort', '2', '3'],
    HOT_UPDATES: ['hot', 'updates', 'info', 'news', 'soccer', 'weather', 'epl']
};

// ==================== INTERACTIVE UI CONFIG ====================
// ==================== INTERACTIVE UI CONFIG ====================
/** UPDATED: 4-category main menu with 10 rows total */
const INTERACTIVE_UI_CONFIG = {
    // List menu sections for main navigation - 4 clear categories with max 10 rows total
    MAIN_MENU_SECTIONS: [
        {
            title: "💰 PAYMENTS",
            rows: [
                { id: "airtime", title: "📱 Airtime", description: "All networks" },
                { id: "zesa", title: "⚡ ZESA Tokens", description: "Prepaid electricity" },
                { id: "bills", title: "📄 Bills", description: "Nyaradzo payments" }
            ]
        },
        {
            title: "ℹ️ INFORMATION",
            rows: [
                { id: "hot_updates", title: "🔥 Hot Updates", description: "EPL, News, Weather" },
                { id: "emergency", title: "🚨 Emergency", description: "Police, hospitals, fire" }
            ]
        },
        {
            title: "⚡ QUICK ACTIONS",
            rows: [
                { id: "quick_airtime", title: "🔁 Quick Airtime", description: "Repeat last purchase" },
                { id: "quick_zesa", title: "🔁 Quick ZESA", description: "Same meter & amount" }
            ]
        },
        {
            title: "❓ HELP & SUPPORT",
            rows: [
                { id: "help", title: "📚 Help Center", description: "FAQs & guides" },
                { id: "contact", title: "📞 Contact Us", description: "Human support" }
            ]
        }
    ],
    
    // Button templates for confirmations
    CONFIRM_BUTTONS: [
        { id: "confirm_yes", title: "✅ Yes, proceed" },
        { id: "confirm_edit", title: "✏️ Edit details" },
        { id: "confirm_no", title: "❌ Cancel" }
    ],
    
    // Quick action buttons after transaction
    POST_TRANSACTION_BUTTONS: [
        { id: "another", title: "🔄 Another" },
        { id: "receipt", title: "📋 Receipt" },
        { id: "menu", title: "🏠 Menu" }
    ],
    
    // Network selection buttons
    NETWORK_BUTTONS: [
        { id: "network_econet", title: "📱 Econet" },
        { id: "network_netone", title: "📱 NetOne" },
        { id: "network_telecel", title: "📱 Telecel" }
    ],
    
    // Currency selection buttons
    CURRENCY_BUTTONS: [
        { id: "currency_zig", title: "🇿🇼 ZiG" },
        { id: "currency_usd", title: "💵 USD" }
    ],
    
    // Flow IDs for WhatsApp Flows (to be created in Meta Developer Dashboard)
    FLOW_IDS: {
        AIRTIME: "flow_airtime_purchase",
        ZESA: "flow_zesa_purchase",
        NYARADZO: "flow_nyaradzo_payment"
    },
    
    // Flow screen names
    FLOW_SCREENS: {
        AIRTIME: {
            DETAILS: "airtime_details",
            PAYMENT: "airtime_payment",
            CONFIRM: "airtime_confirm"
        },
        ZESA: {
            METER: "zesa_meter",
            AMOUNT: "zesa_amount",
            PAYMENT: "zesa_payment"
        }
    }
};

// ==================== PERSONALITY CONFIG ====================
/** UPDATED: Enhanced Zimbabwean personality */
const PERSONALITY_CONFIG = {
    BOT_NAME: "Mike",
    BOT_EMOJI: "👋",
    
    GREETINGS: {
        morning: "🌅 *Mangwanani!* Hope you slept well!",
        afternoon: "☀️ *Masikati!* Hope your day's going great!",
        evening: "🌆 *Manheru!* Thanks for stopping by!",
        night: "🌙 *Hey night owl!* Still helping out!"
    },
    
    FUN_RESPONSES: {
        greeting: [
            "👋 Hey! *Zvakanaka* to see you!",
            "🤗 Hello! Ready to help *nhasi*!",
            "😊 Hi there! What's happening *mukwasha*?"
        ],
        thanks: [
            "🤗 *Zvakanaka!* Happy to help!",
            "😊 *Tatenda* for using CCHub!",
            "👍 *Maswera*! Come back anytime!"
        ],
        error: [
            "😅 Oops! Something went wrong. Let's try that again?",
            "🤔 Hmm, *handizive* what happened. One more time?",
            "🔄 Technical hiccup! Mind trying again?"
        ],
        goodbye: [
            "👋 *Chisarai*! Stay safe!",
            "🌟 *Ndatenda*! Come back soon!",
            "📱 Bye! Don't forget to recharge!"
        ],
        joke: [
            "Why did the chicken cross the road? To avoid EMATickets! 😂",
            "What do you call a Zimbabwean AI? A 'Siri-ously' helpful *munhu*! 🤣",
            "Why don't Zimbabweans ever get lost? Because we always know the *kumusha* direction! 🗺️"
        ],
        encouragement: [
            "You're doing great! *Simudza*! 💪",
            "Almost there! Just one more step ✨",
            "Perfect choice! Let's do this 🚀"
        ]
    },
    
    PAYMENT_CONFIRMATIONS: [
        "✅ *Waita!* Payment successful! You're all set!",
        "🎉 *Yabuda!* Your transaction is complete!",
        "✨ *Zvaita!* Thank you for using CCHub!",
        "💸 *Money sent!* Check your phone for confirmation!"
    ],
    
    ZIM_FACTS: [
        "🇿🇼 *Did you know?* Zimbabwe means 'House of Stone' in Shona!",
        "🏞️ *Did you know?* Victoria Falls is one of the Seven Natural Wonders!",
        "📱 *Did you know?* You can buy airtime for ANY network through CCHub!",
        "⚡ *Did you know?* ZESA tokens never expire - buy in bulk!",
        "🌍 *Did you know?* Zimbabwe has 16 official languages!",
        "🦁 *Did you know?* The painted dog is protected in Hwange!",
        "🏆 *Did you know?* The Warriors won AFCON in 2025!",
        "💰 *Did you know?* You can pay with both ZiG and USD on CCHub!"
    ]
};

// ==================== DAILY ENGAGEMENT CONFIG ====================
/** NEW: Daily tips and engagement features */
const DAILY_ENGAGEMENT_CONFIG = {
    TIPS: [
        "Quick service repeats your last purchase in just 1 tap!",
        "Check weather before traveling - just select location",
        "You can buy airtime for friends too!",
        "Save receipts as PDF for your records",
        "Set monthly budgets to track spending",
        "Share CCHub with a friend - you both get $1 airtime!"
    ],
    
    HOLIDAYS: {
        "04-18": "🇿🇼 *Happy Independence Day!* Celebrating freedom!",
        "05-25": "🌍 *Africa Day!* Proud to be Zimbabwean!",
        "08-14": "👨 *Heroes' Day* - Honoring our heroes",
        "12-22": "🎄 *Merry Christmas!* Enjoy with family!",
        "01-01": "🎉 *Happy New Year!* Wishing you the best!"
    },
    
    STREAK_MILESTONES: {
        3: "🔥 *3-day streak!* You're on fire!",
        7: "⭐ *7-day streak!* A whole week!",
        14: "🎯 *14-day streak!* Two weeks strong!",
        30: "🏆 *30-day streak!* Absolute champion!",
        100: "👑 *100-day streak!* CCHub Royalty!"
    }
};

// ==================== EXPORT ALL CONSTANTS ====================
module.exports = {
    WHATSAPP_CONFIG,
    PAYMENT_CONFIG,
    AIRTIME_CURRENCY_OPTIONS,
    ZESA_CURRENCY_OPTIONS,
    SESSION_CONFIG,
    NETWORK_PREFIXES,
    PAYMENT_PROVIDERS,
    PAYMENT_METHOD_NAMES,
    PAYMENT_METHOD_CONFIG,
    PAYMENT_PREFIXES,        
    AIRTIME_NETWORKS,
    FLOW_STATES,           
    SERVICE_TYPES,
    BILLERS,
    WALLET_OPTIONS,          
    PAYMENT_METHODS,         
    UI_MESSAGES,
    URLS,
    MESSAGING_CONFIG,        
    RESPONSE_MESSAGES,     
    ERROR_MESSAGES,        
    EMERGENCY_CONFIG,      
    RATE_LIMIT_CONFIG,
    PHONE_PATTERN,
    PAYNOW_CONFIG,
    MERCHANT_CONFIG,
    HOTRECHARGE_CONFIG,
    VALIDATION_CONFIG,
    SERVICE_KEYWORDS,
    RESPONSE_KEYWORDS,
    HOT_UPDATES_CONFIG,
    WORDPRESS_CONFIG,
    INFO_SERVICE_STATUS,
    INTERACTIVE_UI_CONFIG,
    PERSONALITY_CONFIG,
    DAILY_ENGAGEMENT_CONFIG
};