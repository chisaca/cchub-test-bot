// config/constants.js - COMPLETE FIXED VERSION
// UPDATED: Product ID 100 for all USD airtime, expanded ranges ($0.10-$300)

const WHATSAPP_CONFIG = {
    API_VERSION: 'v17.0',
    MESSAGE_TYPES: {
        TEXT: 'text',
        INTERACTIVE: 'interactive'
    },
    MAX_MESSAGE_LENGTH: 4096
};

// ==================== PAYMENT CONFIG - ZIG & USD ONLY ====================
const PAYMENT_CONFIG = {
    MIN_AMOUNTS: {
        AIRTIME_ZIG: 0.10,
        AIRTIME_USD: 0.10  
    },
    MAX_AMOUNTS: {
        AIRTIME_ZIG: 200000,
        AIRTIME_USD: 300    
    },
    SERVICE_FEES: {
        AIRTIME: 0.08,
        ZESA: 0.05
    },
    CURRENCIES: {
        AIRTIME_ZIG: 'ZiG',
        AIRTIME_USD: 'USD'
    },
    // ? ZESA-specific config
    ZESA: {
        MIN_ZIG: 50,
        MAX_ZIG: 50000,
        MIN_USD: 1,
        MAX_USD: 100,
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
            'Econet': 110,
           
        }
    },
    '2': {
        id: 'usd',
        name: 'USD',
        symbol: '$',
        min: PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME_USD,  // Now 0.10
        max: PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME_USD,  // Now 300
        hotrecharge_product_map: {
            'Econet': 100,   // Product ID 100 for all networks
            'NetOne': 100,    // Product ID 100 for all networks
            'Telecel': 100    // Product ID 100 for all networks
        }
    }
};

// Session Management Constants
const SESSION_CONFIG = {
    TIMEOUT: 10 * 60 * 1000,           // 10 minutes
    CLEANUP_INTERVAL: 60 * 1000,
    USER_ACTIVITY_CLEANUP_INTERVAL: 5 * 60 * 1000,
    MAX_RETRY_COUNT: 3
};

// Phone Network Prefixes
const NETWORK_PREFIXES = {
    ECONET: ['077', '078'],
    NETONE: ['071'],
    TELECEL: ['073']
};

// Airtime Networks
const AIRTIME_NETWORKS = {
    '1': 'Econet',
    '2': 'NetOne',
    '3': 'Telecel'
};

// ==================== FLOW STATE CONSTANTS ====================
const FLOW_STATES = {
    AIRTIME: {
        START: 'airtime_start',
        SELECT_CURRENCY: 'airtime_select_currency',
        SELECT_NETWORK: 'airtime_select_network',
        ENTER_PHONE: 'airtime_enter_phone',
        ENTER_AMOUNT: 'airtime_enter_amount',
        CONFIRM_PAYMENT: 'airtime_confirm_payment'
    },
    
    ZESA: {
        SELECT_CURRENCY: 'zesa_select_currency',
        ENTER_METER: 'zesa_enter_meter',
        VERIFYING_METER: 'zesa_verifying_meter',
        ENTER_AMOUNT: 'zesa_enter_amount',
        SELECT_PAYMENT: 'zesa_select_payment',
        ENTER_PAYMENT_PHONE: 'zesa_enter_payment_phone',
        CONFIRM_PAYMENT: 'zesa_confirm_payment'
    },
    
    BILL_PAYMENT: {
        START: 'bill_payment_start',
        SELECT_CATEGORY: 'bill_select_category',
        PAYCODE_OPTION: 'bill_paycode_option',
        WAIT_FOR_PAYCODE: 'bill_wait_for_paycode',
        ENTER_AMOUNT: 'bill_enter_amount',
        CONFIRM_PAYMENT: 'bill_confirm_payment'
    },
    
    EMERGENCY: {
        START: 'emergency_start',
        SELECT_SERVICE: 'emergency_select_service',
        SELECT_PROVINCE: 'emergency_select_province',
        SHOW_CONTACTS: 'emergency_show_contacts'
    }
};

// Service Types
const SERVICE_TYPES = {
    AIRTIME: 'airtime',
    ZESA: 'zesa',
    BILL_PAYMENT: 'bill_payment',
    EMERGENCY: 'emergency'
};

// Bill Categories
const BILL_CATEGORIES = {
    '1': {
        key: 'school',
        name: 'School Fees'
    },
    '2': {
        key: 'council',
        name: 'City Council'
    },
    '3': {
        key: 'insurance',
        name: 'Insurance'
    },
    '4': {
        key: 'retail',
        name: 'Retail'
    }
};

// PayCode Options
const PAYCODE_OPTIONS = {
    '1': 'I have a PayCode',
    '2': 'Get PayCode from website',
    '3': 'Back to Main Menu'
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

// ==================== PAYMENT PREFIXES ====================
const PAYMENT_PREFIXES = {
    ECOCASH: ['077', '078'],
    INNBUCKS: ['071', '077', '078'] 
};

// Airtime Amount Presets
const AIRTIME_PRESETS = {
    ZIG: {
        '1': 10,
        '2': 50,
        '3': 100,
        '4': 500,
        '5': 1000,
        '6': 'other'
    },
    USD: {
        '1': 1,
        '2': 2,
        '3': 5,
        '4': 10,
        '5': 20,      // Added 20
        '6': 50,       // Added 50
        '7': 'other'      // Changed from 5 to 7
    }
};

// URL Constants
const URLS = {
    MAIN_WEBSITE: 'https://cchub.co.zw',
    BILLER_SEARCH: {
        SCHOOL: 'https://cchub.co.zw/pay-school-fees/',
        COUNCIL: 'https://cchub.co.zw/pay-city-council/',
        INSURANCE: 'https://cchub.co.zw/pay-insurance/',
        RETAIL: 'https://cchub.co.zw/pay-retail-subscriptions/'
    }
};

// ==================== RESPONSE MESSAGES ====================
const RESPONSE_MESSAGES = {
    WELCOME: `💎 *Welcome to CCHub*

*Please select a service:*

1 📱 *Airtime*
2 ⚡ *ZESA*
3 📄 *Bills*
4 🚨 *Emergency*
5 ❓ *Help*

----------------

Reply with *1-5* or service name
Type *hi* anytime to restart`,
    
    AIRTIME_CURRENCY_PROMPT: `💵 *Currency*

1 *ZiG*
2 *USD*

----------------

Reply 1 or 2`,
    
    HELP: `❓ *Help*

📱 Airtime - Top up any network (USD: $0.10-$300, ZiG: 100-50000)
⚡ ZESA - Buy electricity tokens
📄 Bills - Pay with PayCode
🚨 Emergency - Police, ambulance, fire

----------------

Type *hi* to start over

📞 Support: +263 71 286 1483`,
    
    INVALID_SELECTION: '❓ That number doesn\'t work. Try 1-5.',
    INVALID_CURRENCY: '❓ 1 for ZiG, 2 for USD.',
    
    SESSION_EXPIRED: '⏰ Session timed out. Type *hi* to start again.',
    
    TOO_MANY_ATTEMPTS: '⚠️ Too many wrong attempts. Type *hi* to restart.',
    
    PAYCODE_REQUIRED: `📄 *PayCode needed*

1. Visit cchub.co.zw
2. Get 6-digit code
3. Start with CCH123456

----------------

Type *hi* for other services`
};

// ==================== ERROR MESSAGES ====================
const ERROR_MESSAGES = {
    PAYCODE_FORMAT: `❓ Should be CCH plus 6 digits.

Example: CCH123456

You sent: %s`,
    
    INVALID_PHONE: `❓ That number doesn't look right.

Try: 0771234567 or 263771234567`,
    
    INVALID_METER: `❓ Meter should be 11 digits.

You sent: %s`,
    
    INVALID_AMOUNT: (min, max, currency) => 
        `❓ Amount must be ${min}-${max} ${currency}.`,
    
    ACCOUNT_LOCKED: (minutes) => 
        `🔒 Locked for ${minutes} minutes.

Too many wrong attempts.

Type "hi" after lockout.`
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

module.exports = {
    WHATSAPP_CONFIG,
    PAYMENT_CONFIG,
    AIRTIME_CURRENCY_OPTIONS,
    SESSION_CONFIG,
    NETWORK_PREFIXES,
    AIRTIME_NETWORKS,
    FLOW_STATES,           
    SERVICE_TYPES,
    BILL_CATEGORIES,
    PAYCODE_OPTIONS,
    WALLET_OPTIONS,
    PAYMENT_METHODS,
    PAYMENT_PREFIXES,
    AIRTIME_PRESETS,
    URLS,
    RESPONSE_MESSAGES,     
    ERROR_MESSAGES,        
    EMERGENCY_CONFIG,      
    RATE_LIMIT_CONFIG
};
