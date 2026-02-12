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