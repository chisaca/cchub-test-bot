// config/constants.js

// WhatsApp Messaging Constants
const WHATSAPP_CONFIG = {
    API_VERSION: 'v17.0',
    MESSAGE_TYPES: {
        TEXT: 'text',
        INTERACTIVE: 'interactive'
    },
    MAX_MESSAGE_LENGTH: 4096
};

// Payment Service Constants
const PAYMENT_CONFIG = {
    MIN_AMOUNTS: {
        ZESA: 1,            // USD
        AIRTIME: 100,       // ZWL
        BILLS: 50000        // ZWL
    },
    MAX_AMOUNTS: {
        ZESA: 100,          // USD
        AIRTIME: 50000,     // ZWL
        BILLS: 10000000     // ZWL (10 million)
    },
    SERVICE_FEES: {
        ZESA: 0.05,         // 5%
        AIRTIME: 0.08,      // 8%
        BILLS: 0.04         // 4%
    },
    CURRENCIES: {
        ZESA: 'USD',
        AIRTIME: 'ZWL',
        BILLS: 'ZWL'
    }
};

// Session Management Constants
const SESSION_CONFIG = {
    SESSION_TIMEOUT: 10 * 60 * 1000,           // 10 minutes
    CLEANUP_INTERVAL: 60 * 1000,               // 1 minute for sessions
    USER_ACTIVITY_CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes for user activity
    MAX_RETRY_COUNT: 3                         // 3-strike rule per step
};

// PayCode Validation Constants
const PAYCODE_CONFIG = {
    VALID_PREFIX: 'CCH',
    REQUIRED_LENGTH: 9,      // CCH + 6 digits
    NUMERIC_LENGTH: 6,
    EXPIRY_MINUTES: 10,
    SUSPICIOUS_PATTERNS: [
        /^CCH0{6}$/,
        /^CCH1{6}$/,
        /^CCH9{6}$/,
        /^CCH123456$/,
        /^CCH654321$/,
        /^CCH(\d)\1{5}$/
    ]
};

// Phone Network Prefixes
const NETWORK_PREFIXES = {
    ECONET: ['077', '078'],
    NETONE: ['071'],
    TELECEL: ['073']
};

// Airtime Networks (for selection menu)
const AIRTIME_NETWORKS = {
    '1': 'Econet',
    '2': 'NetOne',
    '3': 'Telecel'
};

// ==================== FLOW STATE CONSTANTS ====================
// UPDATED to match architecture flow states

const FLOW_STATES = {
    // Main flow types
    AIRTIME: {
        START: 'airtime_start',
        SELECT_NETWORK: 'airtime_select_network',
        ENTER_PHONE: 'airtime_enter_phone',
        ENTER_AMOUNT: 'airtime_enter_amount',
        CONFIRM_PAYMENT: 'airtime_confirm_payment'
    },
    
    ZESA: {
        START: 'zesa_start',
        ENTER_METER: 'zesa_enter_meter',
        ENTER_AMOUNT: 'zesa_enter_amount',
        SELECT_WALLET: 'zesa_select_wallet',
        CONFIRM_PAYMENT: 'zesa_confirm_payment'
    },
    
    BILL_PAYMENT: {
        START: 'bill_payment_start',
        SELECT_CATEGORY: 'bill_select_category',
        PAYCODE_OPTION: 'bill_paycode_option',
        WAIT_FOR_PAYCODE: 'bill_wait_for_paycode',  // ONLY accepts CCH123456 here
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

// Bill Categories - UPDATED to match architecture
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

// PayCode Options - UPDATED to match architecture
const PAYCODE_OPTIONS = {
    '1': 'I have a PayCode',
    '2': 'Get PayCode from website',
    '3': 'Back to Main Menu'
};

// Wallet Options - SIMPLIFIED
const WALLET_OPTIONS = {
    ZESA: {
        '1': 'EcoCash USD',
        '2': 'OneMoney USD',
        '3': 'Innbucks USD',
        '4': 'Mukuru',
        '5': 'Omari'
    },
    AIRTIME: {
        '1': 'EcoCash ZWL',
        '2': 'OneMoney ZWL',
        '3': 'Innbucks ZWL'
    }
};

// Airtime Amount Presets (ZWL)
const AIRTIME_PRESETS = {
    '1': 5000,
    '2': 10000,
    '3': 20000,
    '4': 'other'
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

// Emergency Service Constants - UPDATED to match architecture
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
// UPDATED to match architecture

const RESPONSE_MESSAGES = {
    WELCOME: `🤖 *Welcome to CCHub WhatsApp Bot!*\n\n` +
        `Please select a service:\n\n` +
        `1️⃣ *Buy Airtime* - Top up your mobile\n` +
        `2️⃣ *Buy ZESA* - Electricity tokens\n` +
        `3️⃣ *Pay Bill* - Using PayCode\n` +
        `4️⃣ *Emergency Services* - Contacts\n` +
        `5️⃣ *Help* - Assistance\n\n` +
        `📝 *Reply with the number (1-5) or service name*\n` +
        `🔄 Type *"hi"* anytime to restart`,
    
    HELP: `🆘 *CCHub Help Center*\n\n` +
        `*Available Services:*\n\n` +
        `1️⃣ *Airtime* - Mobile top-up\n` +
        `2️⃣ *ZESA* - Electricity tokens\n` +
        `3️⃣ *Bill Payment* - Using PayCode\n` +
        `4️⃣ *Emergency* - Emergency contacts\n\n` +
        `*How to use:*\n` +
        `• Type "hi" to restart anytime\n` +
        `• Follow step-by-step instructions\n` +
        `• Each step expects specific input\n` +
        `• 3 invalid attempts will lock you out temporarily\n\n` +
        `*For Bill Payments:*\n` +
        `1. Visit: https://cchub.co.zw\n` +
        `2. Get your PayCode (CCH + 6 digits)\n` +
        `3. Start bill payment flow here\n\n` +
        `📞 Support: +263 71 286 1483`,
    
    INVALID_SELECTION: '❌ Invalid selection. Please choose a number from 1-5.',
    
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
        `Meter number must be 10+ digits.\n\n` +
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
    SESSION_CONFIG,
    PAYCODE_CONFIG,
    NETWORK_PREFIXES,
    AIRTIME_NETWORKS,
    FLOW_STATES,           // UPDATED
    SERVICE_TYPES,         // UPDATED
    BILL_CATEGORIES,       // UPDATED
    PAYCODE_OPTIONS,       // NEW
    WALLET_OPTIONS,
    AIRTIME_PRESETS,
    URLS,
    RESPONSE_MESSAGES,     // UPDATED
    ERROR_MESSAGES,        // UPDATED
    EMERGENCY_CONFIG       // UPDATED
};