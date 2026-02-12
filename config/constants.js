// ==================== RESPONSE MESSAGES ====================
const RESPONSE_MESSAGES = {
    WELCOME: `🏧 *CCHub*

1️⃣ Airtime
2️⃣ ZESA
3️⃣ Bills
4️⃣ Emergency
5️⃣ Help

Reply with a number.`,
    
    AIRTIME_CURRENCY_PROMPT: `💱 Currency?

1️⃣ ZiG (100-50,000)
2️⃣ USD ($0.50-$50)

Reply 1 or 2:`,
    
    HELP: `🆘 *Help*

• Airtime: Top up any network
• ZESA: Buy electricity tokens  
• Bills: Pay with PayCode
• Emergency: Police, ambulance, fire

Type "hi" to start over.

Support: +263 71 286 1483`,
    
    INVALID_SELECTION: '❌ That number doesn’t work. Try 1-5.',
    INVALID_CURRENCY: '❌ 1 for ZiG, 2 for USD.',
    
    SESSION_EXPIRED: '⏰ Session timed out. Type "hi" to start again.',
    
    TOO_MANY_ATTEMPTS: '❌ Too many wrong attempts. Type "hi" to restart.',
    
    PAYCODE_REQUIRED: `💳 Need a PayCode?

1. Visit: https://cchub.co.zw
2. Get your 6-digit code
3. Start here with CCH123456

Type "hi" for other services.`
};

// ==================== ERROR MESSAGES ====================
const ERROR_MESSAGES = {
    PAYCODE_FORMAT: `❌ Should be CCH plus 6 digits.

Example: CCH123456

You sent: %s`,
    
    INVALID_PHONE: `❌ That number doesn’t look right.

Try: 0771234567 or 263771234567`,
    
    INVALID_METER: `❌ Meter should be 11 digits.

You sent: %s`,
    
    INVALID_AMOUNT: (min, max, currency) => 
        `❌ Amount must be ${min}-${max} ${currency}.`,
    
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
    EMERGENCY_CONFIG,      // ✅ Added back for emergency.js
    RATE_LIMIT_CONFIG: {
        maxAttempts: 3,
        windowMs: 5 * 60 * 1000,
        lockoutDuration: 15 * 60 * 1000
    }
};