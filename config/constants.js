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
    SESSION_TIMEOUT: 10 * 60 * 1000,    // 10 minutes
    CLEANUP_INTERVAL: 60 * 1000,        // 1 minute
    USER_ACTIVITY_CLEANUP_INTERVAL: 5 * 60 * 1000,
    MAX_RETRY_COUNT: 3
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

// Flow State Constants (for session tracking)
const FLOW_STATES = {
    MAIN_MENU: 'main_menu',
    
    // ZESA Flow
    ZESA_METER_ENTRY: 'zesa_meter_entry',
    ZESA_AMOUNT_ENTRY: 'zesa_amount_entry',
    ZESA_WALLET_SELECTION: 'zesa_wallet_selection',
    
    // Airtime Flow
    AIRTIME_RECIPIENT_ENTRY: 'airtime_recipient_entry',
    AIRTIME_AMOUNT_ENTRY: 'airtime_amount_entry',
    AIRTIME_CUSTOM_AMOUNT: 'airtime_custom_amount',
    AIRTIME_WALLET_SELECTION: 'airtime_wallet_selection',
    
    // Bills Flow
    BILL_CATEGORY_SELECTION: 'bill_category_selection',
    BILL_CODE_SEARCH_OPTION: 'bill_code_search_option',
    BILL_AMOUNT_ENTRY: 'bill_amount_entry',
    BILL_PAYMENT_CONFIRMATION: 'bill_payment_confirmation',
    WAITING_FOR_PAYCODE: 'waiting_for_paycode'
};

// Service Types
const SERVICE_TYPES = {
    ZESA: 'zesa',
    AIRTIME: 'airtime',
    BILL_PAYMENT: 'bill_payment'
};

// Bill Categories
const BILL_CATEGORIES = {
    SCHOOL_FEES: 'school_fees',
    CITY_COUNCIL: 'city_council',
    INSURANCE: 'insurance',
    RETAIL_SUBSCRIPTIONS: 'retail_subscriptions'
};

// Wallet Options
const WALLET_OPTIONS = {
    ZESA: {
        '1': 'EcoCash USD',
        '2': 'OneMoney USD',
        '3': 'Innbucks USD',
        '4': 'Mukuru',
        '5': 'Omari'
    },
    AIRTIME: {
        '1': 'EcoCash',
        '2': 'OneMoney',
        '3': 'Innbucks',
        '4': 'Mukuru',
        '5': 'Omari',
        '6': 'Telecash'
    },
    BILLS: {
        '1': 'EcoCash'
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
        SCHOOL_FEES: 'https://cchub.co.zw/pay-school-fees/',
        CITY_COUNCIL: 'https://cchub.co.zw/pay-city-council/',
        INSURANCE: 'https://cchub.co.zw/pay-insurance/',
        RETAIL_SUBSCRIPTIONS: 'https://cchub.co.zw/pay-retail-subscriptions/'
    }
};

// Response Messages (commonly used ones)
const RESPONSE_MESSAGES = {
    WELCOME: `👋 *WELCOME TO CCHUB PAYMENTS*\n\nWhat would you like to do today?\n\n1. ⚡ Buy ZESA (Direct entry)\n2. 📱 Buy Airtime (Direct entry)\n3. 💳 Pay Bill (*Requires PayCode*)\n4. ❓ Help / Information\n\n*Reply with the number (1-4) of your choice.*\n\n💡 *Note:* Bill payments require a PayCode from our website.\n🔗 *Website:* https://cchub.co.zw`,
    
    HELP: `🆘 *HELP - TEST MODE*\n\nThis is a test simulation bot for CCHub.\n\n• Type "hi" to see main menu\n• Select option 1 for ZESA test\n• Select option 2 for Airtime test\n• Select option 3 for Bill Payment test\n• All transactions are simulated\n• No real payments are processed`,
    
    INVALID_SELECTION: '❌ Invalid selection. Please choose a valid option.',
    
    SESSION_EXPIRED: '⚠️ *SESSION EXPIRED*\n\nYour session has timed out. Please type "hi" to start again.',
    
    PAYCODE_REQUIRED: `💳 *BILL PAYMENTS REQUIRE PAYCODE*\n\nFor all bill payments (School, Council, Insurance, Retail):\n\n1. Visit: https://cchub.co.zw\n2. Search and select your biller\n3. Get your 6-digit PayCode\n4. Return here and send: CCH123456\n\n✅ *Example:* CCH789012\n\nOr type "hi" for ZESA or Airtime options.`
};

// Error Messages
const ERROR_MESSAGES = {
    PAYCODE_FORMAT: `❌ *PAYCODE FORMAT ERROR*\n\nPayCodes must start with "CCH".\n\nYou sent: "%s"\n\n✅ *Correct format:* CCH%s\n\n🔗 *Get valid PayCode:* https://cchub.co.zw\n\nOr type "hi" for other options.`,
    
    INVALID_PHONE: `❌ *INVALID PHONE NUMBER*\n\n%s\n\nPlease enter a valid 10-digit number:\n• Starts with 0\n• Valid prefixes: 077, 078, 071, 073\n\nExample: 0770123456\n\nOr type "hi" to go back to main menu.`,
    
    ACCOUNT_LOCKED: (minutes) => `🔒 *ACCOUNT TEMPORARILY LOCKED*\n\nToo many invalid attempts detected.\n\n⏰ *Time remaining:* ${minutes} minute(s)\n\nPlease wait or contact support.\n\nType "hi" after lockout expires.`
};

module.exports = {
    WHATSAPP_CONFIG,
    PAYMENT_CONFIG,
    SESSION_CONFIG,
    PAYCODE_CONFIG,
    NETWORK_PREFIXES,
    FLOW_STATES,
    SERVICE_TYPES,
    BILL_CATEGORIES,
    WALLET_OPTIONS,
    AIRTIME_PRESETS,
    URLS,
    RESPONSE_MESSAGES,
    ERROR_MESSAGES
};