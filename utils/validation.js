// utils/validation.js
// Add the validation functions from your original code here
// This file will contain cleanPayCode, extractPayCodeFromMessage, validatePayCode, etc.
// Due to length, I'm showing the structure - you'll need to copy the functions from your original code
// At the top of validation.js
const { PAYCODE_CONFIG, NETWORK_PREFIXES } = require('../config/constants');

function cleanPayCode(rawPayCode) {
    if (!rawPayCode || typeof rawPayCode !== 'string') {
        return null;
    }
    
    // Step 1: Trim whitespace
    let cleaned = rawPayCode.trim();
    
    // Step 2: Remove all non-alphanumeric characters (spaces, dashes, dots, etc.)
    cleaned = cleaned.replace(/[^\w]/g, '');
    
    // Step 3: Convert to uppercase for consistency
    cleaned = cleaned.toUpperCase();
    
    // Step 4: Ensure CCH is at the beginning (case-insensitive)
    const cchMatch = cleaned.match(/^(CCH)(\d+)$/i);
    if (cchMatch) {
        cleaned = cchMatch[1].toUpperCase() + cchMatch[2];
    }
    
    console.log(`🧹 DEBUG - PayCode Cleaning:`);
    console.log(`  Input: "${rawPayCode}"`);
    console.log(`  Output: "${cleaned}"`);
    console.log(`  Length: ${cleaned.length}`);
    
    return cleaned;
}

function extractPayCodeFromMessage(message) {
    const cleanMessage = message.trim();
    console.log(`🔍 DEBUG - Extracting from: "${cleanMessage}"`);
    
    // Pattern 1: Standard CCH followed by 6 digits (allowing spaces/dashes)
    const standardPattern = /(CCH[\s\-\.]*\d{6})/i;
    
    // Pattern 2: "PayCode:" prefix
    const prefixedPattern = /paycode[:\s]+(CCH[\s\-\.]*\d{6})/i;
    
    // Pattern 3: cchub://pay/ format
    const urlPattern = /cchub[:\/]+pay[:\/]+(CCH[\s\-\.]*\d{6})/i;
    
    // Pattern 4: Just 6 digits (but we'll require CCH prefix later)
    const digitsOnlyPattern = /(\d{6})/;
    
    let match = null;
    
    // Try patterns in order
    if ((match = cleanMessage.match(standardPattern))) {
        console.log(`🔍 Matched standard pattern: ${match[1]}`);
        return match[1];
    } else if ((match = cleanMessage.match(prefixedPattern))) {
        console.log(`🔍 Matched prefixed pattern: ${match[1]}`);
        return match[1];
    } else if ((match = cleanMessage.match(urlPattern))) {
        console.log(`🔍 Matched URL pattern: ${match[1]}`);
        return match[1];
    } else if ((match = cleanMessage.match(digitsOnlyPattern))) {
        console.log(`🔍 Matched digits only: ${match[1]}`);
        return match[1]; // Will be validated as needing CCH prefix
    }
    
    console.log(`🔍 No PayCode pattern matched`);
    return null;
}

function validatePayCode(payCode, from) {
     console.log(`🔐 DEBUG - Validating: "${payCode}" from ${from}`);
    
    // Initialize user activity tracking
    if (!userActivity[from]) {
        userActivity[from] = {
            attempts: 0,
            lastAttempt: 0,
            lockoutUntil: 0,
            lastValidPayCode: null
        };
    }
    
    const userState = userActivity[from];
    const now = Date.now();
    
    // Check if user is locked out
    if (userState.lockoutUntil > now) {
        const remainingMinutes = Math.ceil((userState.lockoutUntil - now) / (60 * 1000));
        throw new Error(`RATE_LIMIT: Too many invalid attempts. Please try again in ${remainingMinutes} minute(s).`);
    }
    
    // Reset attempts if window expired
    if (userState.lastAttempt < now - RATE_LIMIT_CONFIG.windowMs) {
        userState.attempts = 0;
    }
    
    // Clean the PayCode first
    const cleanedPayCode = cleanPayCode(payCode);
    console.log(`🔐 DEBUG - Cleaned PayCode: "${cleanedPayCode}"`);
    
    if (!cleanedPayCode) {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: Invalid PayCode format.`);
    }
    
    // RULE 1: Must start with CCH
    if (!cleanedPayCode.startsWith('CCH')) {
        // Check if it's just 6 digits (add CCH prefix)
        if (/^\d{6}$/.test(cleanedPayCode)) {
            userState.attempts++;
            userState.lastAttempt = now;
            throw new Error(`FORMAT: PayCodes now start with "CCH". Please add "CCH" prefix: CCH${cleanedPayCode}`);
        }
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: PayCode must start with "CCH".`);
    }
    
    // RULE 2: CCH must be uppercase
    if (cleanedPayCode.slice(0, 3) !== 'CCH') {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: "CCH" must be in uppercase.`);
    }
    
    // RULE 3: Check total length (CCH + 6 digits = 9)
    if (cleanedPayCode.length !== PAYCODE_CONFIG.REQUIRED_LENGTH) {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: Invalid PayCode length. Must be exactly 9 characters (CCH + 6 digits). Got ${cleanedPayCode.length}.`);
    }
    
    // RULE 4: Check digits after CCH
    const numericPart = cleanedPayCode.slice(3);
    if (!/^\d{6}$/.test(numericPart)) {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: After "CCH", must be exactly 6 digits. Found: "${numericPart}"`);
    }
    
    // RULE 5: Check for suspicious patterns
    const suspiciousPatterns = [
        /^CCH0{6}$/,
        /^CCH1{6}$/,
        /^CCH9{6}$/,
        /^CCH123456$/,
        /^CCH654321$/,
        /^CCH(\d)\1{5}$/,
    ];
    
    for (const pattern of PAYCODE_CONFIG.SUSPICIOUS_PATTERNS) {
        if (pattern.test(cleanedPayCode)) {
            console.warn(`⚠️ Suspicious PayCode pattern detected from ${from}: ${cleanedPayCode}`);
            userState.attempts += 2;
            userState.lastAttempt = now;
            break;
        }
    }
    
    // RULE 6: Check for same PayCode as last time
    if (userState.lastValidPayCode === cleanedPayCode) {
        throw new Error(`SECURITY: This PayCode was already used recently. Each PayCode can only be used once.`);
    }
    
    // RULE 7: Check if entire message is too long (security)
    if (payCode.length > 100) {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`SECURITY: Message too long. Please send only the PayCode.`);
    }
    
    // SUCCESS: Valid PayCode
    userState.attempts = 0;
    userState.lastValidPayCode = cleanedPayCode;
    userState.lastAttempt = now;
    
    console.log(`✅ DEBUG - PayCode validation passed: ${cleanedPayCode}`);
    return cleanedPayCode;
}

function detectKeywords(message) {
    const cleanMessage = message.toLowerCase().trim();
    
    if (cleanMessage.includes('airtime')) {
        return 'airtime';
    } else if (cleanMessage.includes('zesa')) {
        return 'zesa';
    }
    
    return null;
}

function getFlowErrorMessage(flow) {
    const simpleMessages = {
        'zesa_meter_entry': `❌ *Sorry, number not correct*\n\nPlease send your ZESA meter number:\n\nIt should have 10 or more numbers\n\nExample meter numbers:\n• 12345678901\n• 11111111111\n\nOr type "hi" to go back to menu.`,
        'zesa_amount_entry': `❌ *Sorry, amount not correct*\n\nPlease enter an amount:\n\nMinimum: $1\n\nExample: 10 for $10\n\nOr type "hi" to go back to menu.`,
        'zesa_wallet_selection': `❌ *Sorry, choice not correct*\n\nPlease choose a wallet (1-5):\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari\n\nOr type "hi" to go back to menu.`,
        'airtime_recipient_entry': `❌ *Sorry, phone number not correct*\n\nPlease send a phone number:\n\n• 10 digits\n• Starts with 0\n\nExample: 0770123456\n\nOr type "hi" to go back to menu.`,
        'airtime_amount_entry': `❌ *Sorry, choice not correct*\n\nPlease choose (1-4):\n\n1. ZWL 5,000\n2. ZWL 10,000\n3. ZWL 20,000\n4. Other amount\n\nOr type "hi" to go back to menu.`,
        'airtime_custom_amount': `❌ *Sorry, amount not correct*\n\nPlease enter an amount:\n\nMinimum: ZWL 100\n\nExample: 15000 for ZWL 15,000\n\nOr type "hi" to go back to menu.`,
        'airtime_wallet_selection': `❌ *Sorry, choice not correct*\n\nPlease choose a wallet (1-6):\n\n1. EcoCash\n2. OneMoney\n3. Innbucks\n4. Mukuru\n5. Omari\n6. Telecash\n\nOr type "hi" to go back to menu.`,
        'bill_category_selection': `❌ *Sorry, choice not correct*\n\nPlease choose (1-5):\n\n1. 🏫 School Fees\n2. 🏛️ City Council\n3. 🛡️ Insurance\n4. 🛒 Retail/Subscriptions\n5. ← Back to Menu\n\nOr type "hi" to go back to menu.`,
        'bill_code_search_option': `❌ *Sorry, choice not correct*\n\nPlease choose (1-3):\n\n1. ✅ I have a PayCode\n2. 🔍 Get PayCode from website\n3. ← Choose different category\n\nOr type "hi" to go back to menu.`,
        'bill_amount_entry': `❌ *Sorry, amount too small*\n\nPlease enter amount:\n\nMinimum: ZWL 50,000\n\nExample: 100000 for ZWL 100,000\n\nOr type "hi" to cancel.`,
        'bill_payment_confirmation': `❌ *Sorry, choice not correct*\n\nPlease choose (1-3):\n\n1. ✅ Yes, pay with EcoCash\n2. ✏️ Change amount\n3. ← Start over\n\nOr type "hi" to go back to menu.`,
        'waiting_for_paycode': `❌ *Sorry, not a valid PayCode*\n\nPlease send a PayCode like this:\n\nCCH123456\n\nExample: CCH789012\n\nOr type "hi" to go back to menu.`,
        'main_menu': `❌ *Sorry, choice not correct*\n\nPlease choose (1-4):\n\n1. ⚡ Buy ZESA\n2. 📱 Buy Airtime\n3. 💳 Pay Bill\n4. ❓ Help\n\nOr type "hi" to see menu.`
    };
    
    return simpleMessages[flow] || `❌ *Sorry, something went wrong*\n\nPlease try again or type "hi" to go back to menu.`;
}

function validateAndDetectNetwork(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length !== 10) {
        return { valid: false, error: 'Phone number must be exactly 10 digits' };
    }
    
    if (!cleanNumber.startsWith('0')) {
        return { valid: false, error: 'Phone number must start with 0' };
    }
    
    let network = 'Unknown';
    if (cleanNumber.startsWith('077') || cleanNumber.startsWith('078')) {
        network = 'Econet';
    } else if (cleanNumber.startsWith('071')) {
        network = 'NetOne';
    } else if (cleanNumber.startsWith('073')) {
        network = 'Telecel';
    } else {
        return { valid: false, error: 'Invalid network. Must start with 077, 078, 071, or 073' };
    }
    
    return {
        valid: true,
        formattedNumber: cleanNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3'),
        network: network,
        original: cleanNumber
    };
}

module.exports = {
    cleanPayCode,
    extractPayCodeFromMessage,
    validatePayCode,
    detectKeywords,
    getFlowErrorMessage,
    validateAndDetectNetwork
};