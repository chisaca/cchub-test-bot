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
    SESSION_TIMEOUT: 10 * 60 * 1000,           // 10 minutes
    CLEANUP_INTERVAL: 60 * 1000,               // 1 minute for sessions
    USER_ACTIVITY_CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes for user activity
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
    WAITING_FOR_PAYCODE: 'waiting_for_paycode',
    
    // Emergency Flow
    EMERGENCY_SERVICE_SELECT: 'emergency_service_select',
    EMERGENCY_PROVINCE_SELECT: 'emergency_province_select',
    EMERGENCY_FETCHING: 'emergency_fetching'
};

// Service Types
const SERVICE_TYPES = {
    ZESA: 'zesa',
    AIRTIME: 'airtime',
    BILL_PAYMENT: 'bill_payment',
    EMERGENCY: 'emergency_services',
    HELP: 'help'
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

// Emergency Service Constants
const EMERGENCY_CONFIG = {
    CACHE_TTL: 30 * 60 * 1000, // 30 minutes
    PROVINCE_MAPPINGS: {
        'Harare': 'harare',
        'Bulawayo': 'bulawayo',
        'Manicaland': 'manicaland',
        'Mashonaland Central': 'mashonaland-central',
        'Mashonaland East': 'mashonaland-east',
        'Mashonaland West': 'mashonaland-west',
        'Masvingo': 'masvingo',
        'Matabeleland North': 'matabeleland-north',
        'Matabeleland South': 'matabeleland-south',
        'Midlands': 'midlands'
    }
};

const EMERGENCY_DISPLAY_NAMES = {
    'zrp_police': 'Police (ZRP)',
    'ambulance_medical': 'Ambulance & Medical',
    'fire_brigade': 'Fire Brigade',
    'vehicle_breakdown': 'Vehicle Breakdown',
    'child_services': 'Child Services',
    'hospital_clinic': 'Hospital & Clinic',
    'funeral_homes': 'Funeral Services',
    'attorneys_legal': 'Legal Services',
    'immigration': 'Immigration Services',
    'zetdc_electricity': 'Electricity (ZETDC)',
    'municipal_services': 'Municipal Services'
};

const EMERGENCY_EMOJIS = {
    'zrp_police': '👮',
    'ambulance_medical': '🚑',
    'fire_brigade': '🚒',
    'vehicle_breakdown': '🛠️',
    'child_services': '👶',
    'hospital_clinic': '🏥',
    'funeral_homes': '⚰️',
    'attorneys_legal': '⚖️',
    'immigration': '🛂',
    'zetdc_electricity': '💡',
    'municipal_services': '🏛️'
};

const PROVINCES = [
    'Harare', 'Bulawayo', 'Manicaland', 'Mashonaland Central',
    'Mashonaland East', 'Mashonaland West', 'Masvingo',
    'Matabeleland North', 'Matabeleland South', 'Midlands'
];

// Response Messages (commonly used ones)
const RESPONSE_MESSAGES = {
    WELCOME: `✨ *Welcome to CChub!* ✨\n\nHow can I help you today?\n\n1. 🏫 Pay Bill\n2. ⚡ Buy ZESA\n3. 📱 Buy Airtime\n4. 🚨 Emergency Services\n5. ❓ Get Help\n\nReply with 1, 2, 3, 4, or 5.\n\n💡 *Tip:* You can also say "airtime", "zesa", "emergency", or send a PayCode (CCH123456)`,
    
    HELP: `🆘 *CChub Help Center*\n\n` +
        `✨ *What can I help you with?*\n\n` +
        `🔢 *Menu Options:*\n` +
        `1. 🏫 Pay Bill – Use a PayCode from cchub.co.zw\n` +
        `2. ⚡ Buy ZESA – Electricity tokens (simulation)\n` +
        `3. 📱 Buy Airtime – Mobile top-up\n` +
        `4. 🚨 Emergency Services – Police, ambulance, fire, etc.\n` +
        `5. ❓ Help – This menu\n\n` +
        `💡 *Emergency Services:*\n` +
        `• Say "emergency" or type 4\n` +
        `• Choose service type (police, ambulance, fire, etc.)\n` +
        `• Select your province (use numbers 1-10)\n` +
        `• Get emergency numbers instantly\n\n` +
        `💡 *Quick Tips:*\n` +
        `• Say "airtime", "zesa", "bill", or "emergency"\n` +
        `• Send a PayCode directly anytime\n` +
        `• Format: CCH + 6 digits\n` +
        `• Get PayCodes from cchub.co.zw\n\n` +
        `❓ *Having trouble?*\n` +
        `• Type "hi" anytime to restart\n` +
        `• Wrong input? Try again or type "hi"\n` +
        `• Stuck? I'll offer help after 3 tries\n\n` +
        `🚨 *National Emergency Numbers:*\n` +
        `• Police: 999 👮\n` +
        `• Ambulance: 994 🚑\n` +
        `• Fire: 993 🚒\n` +
        `• Civil Protection: 112\n\n` +
        `📞 *Support:*\n` +
        `Call: +263 71 286 1483\n` +
        `Email: support@cchub.co.zw\n\n` +
        `💬 *To return to Main Menu, say:* hi or menu`,
    
    INVALID_SELECTION: '❌ Invalid selection. Please choose a number from 1-5.\n\n1. 🏫 Pay Bill\n2. ⚡ Buy ZESA\n3. 📱 Buy Airtime\n4. 🚨 Emergency Services\n5. ❓ Get Help',
    
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
    ERROR_MESSAGES,
    EMERGENCY_CONFIG,
    EMERGENCY_DISPLAY_NAMES,
    EMERGENCY_EMOJIS,
    PROVINCES
};