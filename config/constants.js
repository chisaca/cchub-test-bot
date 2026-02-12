// config/constants.js - COMPLETE FIXED VERSION

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
        AIRTIME_ZIG: 100,
        AIRTIME_USD: 0.50
    },
    MAX_AMOUNTS: {
        AIRTIME_ZIG: 50000,
        AIRTIME_USD: 50
    },
    SERVICE_FEES: {
        AIRTIME: 0.08,
        ZESA: {
            ZIG: 50,      // Fixed fee in ZiG
            USD: 0.50     // Fixed fee in USD
        }
    },
    CURRENCIES: {
        AIRTIME_ZIG: 'ZiG',
        AIRTIME_USD: 'USD'
    },
    // ✅ NEW: ZESA-specific config
    ZESA: {
        MIN_ZIG: 50,
        MAX_ZIG: 50000,
        MIN_USD: 1,
        MAX_USD: 100,
        SERVICE_FEE_ZIG: 50,
        SERVICE_FEE_USD: 0.50,
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
            'Econet': 7,
            'NetOne': 102,
            'Telecel': 6
        }
    },
    '2': {
        id: 'usd',
        name: 'USD',
        symbol: '$',
        min: PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME_USD,
        max: PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME_USD,
        hotrecharge_product_map: {
            'Econet': 101,
            'NetOne': 102,
            'Telecel': 103
        }
    }
};

// Session Management Constants
const SESSION_CONFIG = {
    TIMEOUT: 10 * 60 * 1000,           // ✅ FIXED: Use TIMEOUT consistently
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
    
    // ✅ FIXED: Complete ZESA flow states matching zesa.js
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
    // ✅ FIXED: Only PayNow-supported wallets
    ZESA: {
        '1': 'EcoCash',
        '2': 'OneMoney'
    },
    // For future use
    AIRTIME: {
        '1': 'EcoCash',
        '2': 'OneMoney'
    }
};

// Airtime Amount Presets
const AIRTIME_PRESETS = {
    ZIG: {
        '1': 5000,
        '2': 10000,
        '3': 20000,
        '4': 'other'
    },
    USD: {
        '1': 1.00,
        '2': 2.00,
        '3': 5.00,
        '4': 10.00,
        '5': 'other'
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

// Emergency Service Constants
const EMERGENCY_CONFIG = {
    CACHE_TTL: 30 * 60 * 1000,
    
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
            emoji: '💡'
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

// ==================== RESPONSE MESSAGES ====================
const RESPONSE_MESSAGES = {
    WELCOME: `🤖 *Welcome to CCHub WhatsApp Bot!*\n\n` +
        `Please select a service:\n\n` +
        `1️⃣ *Buy Airtime* - Top up your mobile (ZiG/USD)\n` +
        `2️⃣ *Buy ZESA* - Electricity tokens (ZiG/USD)\n` +  // ✅ UPDATED
        `3️⃣ *Pay Bill* - Using PayCode\n` +
        `4️⃣ *Emergency Services* - Contacts\n` +
        `5️⃣ *Help* - Assistance\n\n` +
        `📝 *Reply with the number (1-5)*\n` +
        `🔄 Type *"hi"* anytime to restart`,
    
    AIRTIME_CURRENCY_PROMPT: `💱 *Select Airtime Currency*\n\n` +
        `Choose your preferred currency:\n\n` +
        `1️⃣ *ZiG* - Local currency\n` +
        `   Range: 100 - 50,000 ZiG\n\n` +
        `2️⃣ *USD* - US Dollars\n` +
        `   Range: $0.50 - $50.00\n\n` +
        `📝 Reply with *1* or *2*:`,
    
    HELP: `🆘 *CCHub Help Center*\n\n` +
        `*Available Services:*\n\n` +
        `1️⃣ *Airtime* - Mobile top-up (ZiG/USD)\n` +
        `2️⃣ *ZESA* - Electricity tokens (ZiG/USD)\n` +  // ✅ UPDATED
        `3️⃣ *Bill Payment* - Using PayCode\n` +
        `4️⃣ *Emergency* - Emergency contacts\n\n` +
        `*How to use:*\n` +
        `• Type "hi" to restart anytime\n` +
        `• Follow step-by-step instructions\n` +
        `• 3 invalid attempts will lock you out temporarily\n\n` +
        `*For Bill Payments:*\n` +
        `1. Visit: https://cchub.co.zw\n` +
        `2. Get your PayCode (CCH + 6 digits)\n` +
        `3. Start bill payment flow here\n\n` +
        `📞 Support: +263 71 286 1483`,
    
    INVALID_SELECTION: '❌ Invalid selection. Please choose a number from 1-5.',
    INVALID_CURRENCY: '❌ Invalid currency selection. Please reply with 1 for ZiG or 2 for USD.',
    
    SESSION_EXPIRED: '⚠️ *Session Expired*\n\nYour session has timed out. Please type "hi" to start again.',
    
    TOO_MANY_ATTEMPTS: '❌ *Too many invalid attempts*\n\nPlease type "hi" to restart.',
    
    PAYCODE_REQUIRED: `💳 *PayCode Required*\n\n` +
        `For bill payments, you need a PayCode from our website.\n\n` +
        `1. Visit: https://cchub.co.zw\n` +
        `2. Search for your biller\n` +
        `3. Get your 6-digit PayCode\n` +
        `4. Return here with format: CCH123456\n\n` +
        `Or type "hi" for other services.`
};

// Error Messages
const ERROR_MESSAGES = {
    PAYCODE_FORMAT: `❌ *Invalid PayCode Format*\n\n` +
        `PayCode must be exactly: CCH + 6 digits\n` +
        `Example: CCH123456\n\n` +
        `You entered: %s\n\n` +
        `Get valid PayCode from: https://cchub.co.zw`,
    
    INVALID_PHONE: `❌ *Invalid Phone Number*\n\n` +
        `Please enter a valid Zimbabwean number:\n` +
        `• Format: 0771234567 or 263771234567\n` +
        `• Valid prefixes: 077, 078, 071, 073\n\n` +
        `You entered: %s\n\n` +
        `Example: 0771234567`,
    
    INVALID_METER: `❌ *Invalid Meter Number*\n\n` +
        `Meter number must be 6-12 digits.\n` +  // ✅ UPDATED
        `Typical ZESA meter: 11 digits\n\n` +
        `You entered: %s`,
    
    INVALID_AMOUNT: (min, max, currency) => 
        `❌ *Invalid Amount*\n\n` +
        `Amount must be between ${min} and ${max} ${currency}.\n\n` +
        `Enter a valid amount:`,
    
    ACCOUNT_LOCKED: (minutes) => 
        `🔒 *Account Locked*\n\n` +
        `Too many invalid attempts.\n\n` +
        `⏰ Time remaining: ${minutes} minute(s)\n\n` +
        `Type "hi" after lockout expires.`
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
    AIRTIME_PRESETS,
    URLS,
    RESPONSE_MESSAGES,
    ERROR_MESSAGES,
    EMERGENCY_CONFIG,
    RATE_LIMIT_CONFIG: {
        maxAttempts: 3,
        windowMs: 5 * 60 * 1000,
        lockoutDuration: 15 * 60 * 1000
    }
};