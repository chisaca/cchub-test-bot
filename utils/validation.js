// utils/validation.js
const { PAYCODE_CONFIG, NETWORK_PREFIXES } = require('../config/constants');

// Import session handler for rate limiting
const sessionHandler = require('../handlers/sessionHandler');
const { userActivity, RATE_LIMIT_CONFIG } = sessionHandler;

// ==================== PHONE VALIDATION ====================

function validatePhoneNumber(phone) {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Check if it's a Zimbabwean number
    let formatted = '';
    let local = '';
    let error = '';
    let valid = false;
    
    // Handle 10-digit local format (0771234567)
    if (digits.length === 10 && digits.startsWith('0')) {
        const prefix = digits.substring(0, 3);
        
        // Check if prefix is valid
        const isValidPrefix = 
            NETWORK_PREFIXES.ECONET.includes(prefix) ||
            NETWORK_PREFIXES.NETONE.includes(prefix) ||
            NETWORK_PREFIXES.TELECEL.includes(prefix);
        
        if (isValidPrefix) {
            valid = true;
            local = digits;
            formatted = '263' + digits.substring(1); // Convert to international
        } else {
            error = `Invalid network prefix: ${prefix}. Valid prefixes: 077, 078, 071, 073`;
        }
    }
    // Handle 12-digit international format (263771234567)
    else if (digits.length === 12 && digits.startsWith('263')) {
        const localPrefix = '0' + digits.substring(3, 5); // Get 0xx from 263xx
        
        const isValidPrefix = 
            NETWORK_PREFIXES.ECONET.includes(localPrefix) ||
            NETWORK_PREFIXES.NETONE.includes(localPrefix) ||
            NETWORK_PREFIXES.TELECEL.includes(localPrefix);
        
        if (isValidPrefix) {
            valid = true;
            formatted = digits;
            local = '0' + digits.substring(3); // Convert to local
        } else {
            error = `Invalid network prefix: ${localPrefix}. Valid prefixes: 077, 078, 071, 073`;
        }
    }
    // Handle 9-digit format (771234567)
    else if (digits.length === 9 && !digits.startsWith('0')) {
        const localPrefix = '0' + digits.substring(0, 2); // Get 0xx from xx
        
        const isValidPrefix = 
            NETWORK_PREFIXES.ECONET.includes(localPrefix) ||
            NETWORK_PREFIXES.NETONE.includes(localPrefix) ||
            NETWORK_PREFIXES.TELECEL.includes(localPrefix);
        
        if (isValidPrefix) {
            valid = true;
            formatted = '263' + digits;
            local = '0' + digits;
        } else {
            error = `Invalid network prefix: ${localPrefix}. Valid prefixes: 077, 078, 071, 073`;
        }
    }
    else {
        error = 'Invalid phone number format. Please use: 0771234567, 263771234567, or 771234567';
    }
    
    return {
        valid,
        formatted: valid ? formatted : '',
        local: valid ? local : '',
        error: valid ? '' : error
    };
}

// ==================== PAYCODE VALIDATION ====================

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

// ==================== KEYWORD DETECTION ====================

function detectKeywords(message) {
    const cleanMessage = message.toLowerCase().trim();
    
    if (cleanMessage.includes('airtime') || cleanMessage.includes('topup')) {
        return 'airtime';
    } else if (cleanMessage.includes('zesa') || cleanMessage.includes('electricity')) {
        return 'zesa';
    } else if (cleanMessage.includes('bill') || cleanMessage.includes('pay')) {
        return 'bill';
    } else if (cleanMessage.includes('emergency')) {
        return 'emergency';
    } else if (cleanMessage.includes('help')) {
        return 'help';
    }
    
    return null;
}

// ==================== FLOW ERROR MESSAGES ====================

function getFlowErrorMessage(flow) {
    const simpleMessages = {
        'main_menu': `❌ Invalid selection. Please choose a number from 1-5.\n\n1. 📱 Buy Airtime\n2. ⚡ Buy ZESA\n3. 🏫 Pay Bill\n4. 🚨 Emergency Services\n5. ❓ Get Help`,
        
        'zesa_meter_entry': `❌ *Sorry, number not correct*\n\nPlease send your ZESA meter number:\n\nIt should have 10 or more numbers\n\nExample meter numbers:\n• 12345678901\n• 11111111111\n\nOr type "hi" to go back to menu.`,
        
        'zesa_amount_entry': `❌ *Sorry, amount not correct*\n\nPlease enter an amount:\n\nMinimum: $1\n\nExample: 10 for $10\n\nOr type "hi" to go back to menu.`,
        
        'zesa_wallet_selection': `❌ *Sorry, choice not correct*\n\nPlease choose a wallet (1-5):\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari\n\nOr type "hi" to go back to menu.`,
        
        'airtime_recipient_entry': `❌ *Sorry, phone number not correct*\n\nPlease send a phone number:\n\n• 10 digits starting with 0 (0771234567)\n• Or 12 digits starting with 263 (263771234567)\n• Or 9 digits without 0 (771234567)\n\nValid prefixes: 077, 078, 071, 073\n\nOr type "hi" to go back to menu.`,
        
        'airtime_amount_entry': `❌ *Sorry, amount not correct*\n\nPlease enter an amount in ZWL:\n\nMinimum: ZWL 100\nMaximum: ZWL 50,000\n\nExample: 10000 for ZWL 10,000\n\nOr type "hi" to go back to menu.`,
        
        'airtime_custom_amount': `❌ *Sorry, amount not correct*\n\nPlease enter an amount in ZWL:\n\nMinimum: ZWL 100\nMaximum: ZWL 50,000\n\nExample: 15000 for ZWL 15,000\n\nOr type "hi" to go back to menu.`,
        
        'airtime_wallet_selection': `❌ *Sorry, choice not correct*\n\nPlease choose a wallet (1-6):\n\n1. EcoCash\n2. OneMoney\n3. Innbucks\n4. Mukuru\n5. Omari\n6. Telecash\n\nOr type "hi" to go back to menu.`,
        
        'bill_category_selection': `❌ *Sorry, choice not correct*\n\nPlease choose (1-5):\n\n1. 🏫 School Fees\n2. 🏛️ City Council\n3. 🛡️ Insurance\n4. 🛒 Retail/Subscriptions\n5. ← Back to Menu\n\nOr type "hi" to go back to menu.`,
        
        'bill_code_search_option': `❌ *Sorry, choice not correct*\n\nPlease choose (1-3):\n\n1. ✅ I have a PayCode\n2. 🔍 Get PayCode from website\n3. ← Choose different category\n\nOr type "hi" to go back to menu.`,
        
        'bill_amount_entry': `❌ *Sorry, amount too small*\n\nPlease enter amount:\n\nMinimum: ZWL 50,000\n\nExample: 100000 for ZWL 100,000\n\nOr type "hi" to cancel.`,
        
        'bill_payment_confirmation': `❌ *Sorry, choice not correct*\n\nPlease choose (1-3):\n\n1. ✅ Yes, pay with EcoCash\n2. ✏️ Change amount\n3. ← Start over\n\nOr type "hi" to go back to menu.`,
        
        'waiting_for_paycode': `❌ *Sorry, not a valid PayCode*\n\nPlease send a PayCode like this:\n\nCCH123456\n\nExample: CCH789012\n\nOr type "hi" to go back to menu.`,
        
        'emergency_service_select': `❌ *Sorry, choice not correct*\n\nPlease choose a service (1-11):\n\n1. 👮 Police (ZRP)\n2. 🚑 Ambulance & Medical\n3. 🚒 Fire Brigade\n4. 🛠️ Vehicle Breakdown\n5. 👶 Child Services\n6. 🏥 Hospital & Clinic\n7. ⚰️ Funeral Services\n8. ⚖️ Legal Services\n9. 🛂 Immigration Services\n10. 💡 Electricity (ZETDC)\n11. 🏛️ Municipal Services\n\nOr type "hi" to go back to menu.`,
        
        'emergency_province_select': `❌ *Sorry, choice not correct*\n\nPlease choose your province (1-10):\n\n1. Harare\n2. Bulawayo\n3. Manicaland\n4. Mashonaland Central\n5. Mashonaland East\n6. Mashonaland West\n7. Masvingo\n8. Matabeleland North\n9. Matabeleland South\n10. Midlands\n\nOr type "hi" to go back to menu.`
    };
    
    return simpleMessages[flow] || `❌ *Sorry, something went wrong*\n\nPlease try again or type "hi" to go back to menu.`;
}

// ==================== NETWORK DETECTION ====================

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
    validatePhoneNumber,        // For airtime service (supports multiple formats)
    cleanPayCode,
    extractPayCodeFromMessage,
    validatePayCode,
    detectKeywords,
    getFlowErrorMessage,
    validateAndDetectNetwork    // Alternative validation (strict 10-digit only)
};