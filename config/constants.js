// config/constants.js - COMPLETE CLEAN VERSION

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
        AIRTIME_USD: 0.10,
        NYARADZO: 10
        // TELONE removed
    },
    MAX_AMOUNTS: {
        AIRTIME_ZIG: 200000,
        AIRTIME_USD: 300,
        NYARADZO: 10000000
        // TELONE removed
    },
    SERVICE_FEES: {
        AIRTIME: 0.08,  // 8%
        ZESA: 0.05,      // 5%
        NYARADZO: 0.05   // 5%
        // TELONE removed
    },
    CURRENCIES: {
        AIRTIME_ZIG: 'ZiG',
        AIRTIME_USD: 'USD',
        NYARADZO: 'ZiG'
        // TELONE removed
    },
    // ZESA-specific config
    ZESA: {
        MIN_ZIG: 10000,
        MAX_ZIG: 10000000,
        MIN_USD: 5,
        MAX_USD: 10000,
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

// ==================== PAYMENT PROVIDER VALIDATION ====================
const PAYMENT_PROVIDERS = {
    ECOCASH: {
        allowedPrefixes: ['077', '078'],
        allowedInternationalPrefixes: ['26377', '26378'],
        name: 'EcoCash',
        requiresPhone: true
    },
    ONEMONEY: {
        allowedPrefixes: ['071'],
        allowedInternationalPrefixes: ['26371'],
        name: 'OneMoney',
        requiresPhone: true
    },
    INNBUCKS: {
        name: 'InnBucks',
        requiresPhone: false
    }
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
        SELECT_CURRENCY: 'SELECT_CURRENCY',
        ENTER_METER: 'ENTER_METER',
        VERIFYING_METER: 'VERIFYING_METER',
        ENTER_AMOUNT: 'ENTER_AMOUNT',
        SELECT_PAYMENT: 'SELECT_PAYMENT',
        ENTER_PAYMENT_PHONE: 'ENTER_PAYMENT_PHONE',
        ENTER_NOTIFICATION_PHONE: 'ENTER_NOTIFICATION_PHONE',
        CONFIRM_PAYMENT: 'CONFIRM_PAYMENT',
        PROCESSING: 'PROCESSING'
    },
    
    BILL_PAYMENT: {
        START: 'bill_start',
        SELECT_BILLER: 'bill_select_biller',
        ENTER_ACCOUNT: 'bill_enter_account',
        VERIFYING_ACCOUNT: 'bill_verifying_account',
        ENTER_AMOUNT: 'bill_enter_amount',
        SELECT_PAYMENT: 'bill_select_payment',
        ENTER_PAYMENT_PHONE: 'bill_enter_payment_phone',
        ENTER_NOTIFY_PHONE: 'bill_enter_notify_phone',
        CONFIRM_PAYMENT: 'bill_confirm_payment',
        PROCESSING: 'bill_processing'
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
    // TELONE removed
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
        '5': 20,
        '6': 50,
        '7': 'other'
    }
};

// ZESA Amount Presets
const ZESA_PRESETS = {
    ZIG: {
        '1': 10000,
        '2': 50000,
        '3': 100000,
        '4': 500000,
        '5': 1000000,
        '6': 'other'
    },
    USD: {
        '1': 5,
        '2': 10,
        '3': 20,
        '4': 50,
        '5': 100,
        '6': 'other'
    }
};

// ==================== UI MESSAGES ====================
const UI_MESSAGES = {
    CURRENCY_PROMPT: {
        AIRTIME: `💵 *Currency*

1 *ZiG* (Econet only)
2 *USD* (All networks)

----------------

Reply 1 or 2`,
        ZESA: `⚡ *ZESA Purchase*

Please select currency:

1️⃣ ZiG
2️⃣ USD

────────────────
Reply with *1* or *2*`
    },
    PAYMENT_METHOD_PROMPT: `💳 *Select payment method*

1 *EcoCash*
2 *InnBucks*

----------------

Reply 1 or 2`,
    PAYMENT_PHONE_PROMPT: {
        ECOCASH: `📱 *EcoCash number*

Enter the number registered with EcoCash

----------------

Example: 0771234567`,
        DEFAULT: `📱 *Payment number*

Enter the phone number for payment

----------------

Example: 0771234567`
    },
    RECIPIENT_PROMPT: {
        AIRTIME: `📞 *Recipient's number*

Enter phone number you want to top up

----------------

Example: 0771234567`,
        ZESA_NOTIFY: `📲 *Notification number*

Enter phone number to receive SMS token

----------------

Example: 0771234567`
    },
    
    BILLS: {
        BILLER_PROMPT: `📄 *Bills Payment*

Select biller:

1🌸 Nyaradzo Funeral

────────────────
Reply with *1*
Type *hi* to return to Main Menu`,
        
        NYARADZO: {
            POLICY_PROMPT: `⚰️ *Nyaradzo Funeral*

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
                `⚰️ *Confirm Nyaradzo Payment*\n\n` +
                `Policy: *${policy}*\n` +
                `Customer: *${customerName || 'N/A'}*\n` +
                `────────────────\n` +
                `Payment: *${amount.toLocaleString()} ZiG*\n` +
                `Fee (5%): *${fee.toLocaleString()} ZiG*\n` +
                `────────────────\n` +
                `*Total: ${total.toLocaleString()} ZiG*\n` +
                `────────────────\n\n` +
                `✅ *Confirm payment?*\n\n` +
                `1️⃣ Yes, proceed to payment\n` +
                `2️⃣ No, cancel\n` +
                `────────────────\n` +
                `Reply *1* or *2*`,
            
            PROCESSING: `🌶️🌶️🌶️ Hot-recharging your Nyaradzo payment. Please wait...\n\n⏳ Processing...`,
            
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
        // TELONE section completely removed
    },

    CONFIRMATION: {
        PROMPT: `✅ *Confirm payment?*\n\n1️⃣ Yes, proceed to payment\n2️⃣ No, cancel\n────────────────\nReply *1* or *2*`,
        INVALID: `⚠️ *Invalid option*\n\nPlease reply with *1* to proceed or *2* to cancel.`
    }
};

// URL Constants
const URLS = {
    MAIN_WEBSITE: 'https://cchub.co.zw'
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
    
    AIRTIME_CURRENCY_PROMPT: UI_MESSAGES.CURRENCY_PROMPT.AIRTIME,
    
    HELP: `❓ *Help*

📱 Airtime - Top up any network (USD: $0.10-$300, ZiG: 10-200,000 ZiG)
⚡ ZESA - Buy electricity tokens (ZiG: 10,000-10,000,000, USD: $5-$100)
📄 Bills - Pay Nyaradzo funeral policies
🚨 Emergency - Police, ambulance, fire

----------------

Type *hi* to start over

📞 Support: +263 71 286 1483`,
    
    INVALID_SELECTION: '❓ That number doesn\'t work. Try 1-5.',
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
    
    ACCOUNT_LOCKED: (minutes) => 
        `🔒 Locked for ${minutes} minutes.

Too many wrong attempts.

Type "hi" after lockout.`,
    
    POLICY_NOT_FOUND: (policy) => 
        `❌ Policy number *${policy}* not found in Nyaradzo database.\n\nPlease check and try again.`,
    
    VERIFICATION_FAILED: `❌ Failed to verify account. Please try again.`,
    
    // Network-specific errors
    ZIG_NETWORK_UNSUPPORTED: (network) => 
        `${network} ZiG airtime is currently unavailable. Please use USD instead.`,
    
    INSUFFICIENT_BALANCE: (currency, available, required) => 
        `Insufficient ${currency} balance. Available: ${available}, Required: ${required}`,
    
    CURRENCY_NOT_SUPPORTED: (service, currency) => 
        `${service} is only available in ZiG currency. Please select ZiG option.`
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
    
    INSTRUCTION_TEMPLATES: {
        ECOCASH: `📱 *EcoCash Payment*

A payment request has been sent to %s.

✅ *Check your phone now:*
1. Enter your EcoCash PIN when prompted
2. Confirm payment of %s
3. Wait for "Transaction Successful" message

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
    RETURN_URL: process.env.PAYNOW_RETURN_URL || 'https://cchub.co.zw/paynow/return'
};

// ==================== HOTRECHARGE CONFIG ====================
const HOTRECHARGE_CONFIG = {
    ACCOUNT_TYPES: {
        AIRTIME_ZIG: { id: 1, name: 'ZiG Airtime', apiName: 'ZWG' },
        ZESA_ZIG: { id: 2, name: 'ZiG ZESA', apiName: 'Utility ZWG' },
        NYARADZO: { id: 2, name: 'Nyaradzo', apiName: 'Nyaradzo' },
        AIRTIME_USD: { id: 3, name: 'USD Airtime', apiName: 'USD' },
        ZESA_USD: { id: 4, name: 'USD ZESA', apiName: 'Utility USD' }
        // TELONE removed
    },
    
    CURRENCY_MAP: {
        'ZWG': 'ZiG',
        'Utility ZWG': 'ZiG',
        'Nyaradzo': 'ZiG',
        'USD': 'USD',
        'Utility USD': 'USD'
        // TelOne ZiG removed
    },
    
    SERVICE_PREFIXES: {
        AIRTIME_USD: 'AIRTIME-USD',
        AIRTIME_ZIG: 'AIRTIME-ZIG',
        ZESA_USD: 'ZESA-USD',
        ZESA_ZIG: 'ZESA-ZIG',
        NYARADZO: 'NYARADZO',
        MAIN: 'MAIN'
        // TELONE removed
    },
    
    TOKEN_EXPIRY_BUFFER: 60000, // 1 minute buffer
    TOKEN_EXPIRY_MINUTES: 29,   // 29 minutes (with buffer)
    REQUEST_TIMEOUT: 10000,      // 10 seconds
    HEALTH_CHECK_INTERVAL: 60000 // 1 minute
};

// ==================== MESSAGING CONFIG ====================
const MESSAGING_CONFIG = {
    REQUEST_TIMEOUT: 10000, // 10 seconds
    TRUNCATION_SUFFIX: '\n\n[Message truncated due to length limits]',
    RECEIPT_MASK_LENGTH: 3,
    RECEIPT_PREFIX_LENGTH: 5,
    WELCOME_MESSAGE: `💎 *Welcome to CCHub*

*Please select a service:*

1 📱 *Airtime*
2 ⚡ *ZESA*
3 📄 *Bills*
4 🚨 *Emergency*
5 ❓ *Help*

────────────────

Reply with *1-5* or service name
Type *hi* anytime to restart`,
    ACCOUNT_LOCKED_TEMPLATE: `🔒 *Account Locked*\n\nToo many invalid attempts.\n\n⏰ Time remaining: %s minute(s)\n\nType "hi" after lockout expires.`,
    DEFAULT_ERROR: `❌ *Error*\n\nAn unexpected error occurred. Please type "hi" to restart.`
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
    ACCOUNT: {
        // TELONE validation removed
    },
    MENU: {
        MIN_OPTION: 1
    }
};

// ==================== SERVICE KEYWORDS ====================
const SERVICE_KEYWORDS = {
    airtime: ['airtime', 'topup', 'top up', 'bundle', 'data'],
    zesa: ['zesa', 'electric', 'token', 'power', 'meter'],
    bill: ['bill', 'pay', 'payment', 'nyaradzo', 'funeral', 'policy'],
    nyaradzo: ['nyaradzo', 'funeral', 'policy'],
    // telone keywords removed
    emergency: ['emergency', 'police', 'ambulance', 'fire', 'hospital'],
    help: ['help', 'support', 'how', 'what']
};

// ==================== RESPONSE KEYWORDS ====================
const RESPONSE_KEYWORDS = {
    YES: ['yes', 'y', 'confirm', 'ok', 'okay', 'yeah', 'yep'],
    NO: ['no', 'n', 'cancel', 'stop', 'abort']
};

module.exports = {
    WHATSAPP_CONFIG,
    PAYMENT_CONFIG,
    AIRTIME_CURRENCY_OPTIONS,
    ZESA_CURRENCY_OPTIONS,
    SESSION_CONFIG,
    NETWORK_PREFIXES,
    PAYMENT_PROVIDERS,
    AIRTIME_NETWORKS,
    FLOW_STATES,           
    SERVICE_TYPES,
    BILLERS,
    WALLET_OPTIONS,
    PAYMENT_METHODS,
    PAYMENT_PREFIXES,
    AIRTIME_PRESETS,
    ZESA_PRESETS,
    UI_MESSAGES,
    URLS,
    RESPONSE_MESSAGES,     
    ERROR_MESSAGES,        
    EMERGENCY_CONFIG,      
    RATE_LIMIT_CONFIG,
    PHONE_PATTERN,
    PAYNOW_CONFIG,
    MERCHANT_CONFIG,
    HOTRECHARGE_CONFIG,
    MESSAGING_CONFIG,
    VALIDATION_CONFIG,
    SERVICE_KEYWORDS,
    RESPONSE_KEYWORDS
};
