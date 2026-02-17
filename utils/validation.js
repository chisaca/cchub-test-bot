// utils/validation.js - UPDATED to follow architecture principles
// All hardcoded values moved to constants

const { 
    PAYCODE_CONFIG, 
    NETWORK_PREFIXES,
    PHONE_PATTERN,
    VALIDATION_CONFIG,
    SERVICE_KEYWORDS,
    RESPONSE_KEYWORDS
} = require('../config/constants');

// ==================== PHONE VALIDATION ====================
// Used by Airtime service ONLY

function isValidPhoneNumber(phone) {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Check Zimbabwean number formats
    if (digits.length === VALIDATION_CONFIG.PHONE.LOCAL_LENGTH && digits.startsWith('0')) {
        // Format: 0771234567
        const prefix = digits.substring(0, VALIDATION_CONFIG.PHONE.PREFIX_LENGTH);
        return isValidNetworkPrefix(prefix);
    }
    else if (digits.length === VALIDATION_CONFIG.PHONE.INTERNATIONAL_LENGTH && digits.startsWith('263')) {
        // Format: 263771234567
        const localPrefix = '0' + digits.substring(3, 5);
        return isValidNetworkPrefix(localPrefix);
    }
    else if (digits.length === VALIDATION_CONFIG.PHONE.SHORT_LENGTH && !digits.startsWith('0')) {
        // Format: 771234567
        const localPrefix = '0' + digits.substring(0, 2);
        return isValidNetworkPrefix(localPrefix);
    }
    
    return false;
}

function isValidNetworkPrefix(prefix) {
    const allPrefixes = [
        ...NETWORK_PREFIXES.ECONET.prefixes,
        ...NETWORK_PREFIXES.NETONE.prefixes,
        ...NETWORK_PREFIXES.TELECEL.prefixes
    ];
    return allPrefixes.includes(prefix);
}

function formatPhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length === VALIDATION_CONFIG.PHONE.LOCAL_LENGTH && digits.startsWith('0')) {
        return VALIDATION_CONFIG.PHONE.COUNTRY_CODE + digits.substring(1); // Convert to international
    }
    else if (digits.length === VALIDATION_CONFIG.PHONE.INTERNATIONAL_LENGTH && digits.startsWith(VALIDATION_CONFIG.PHONE.COUNTRY_CODE)) {
        return digits; // Already international
    }
    else if (digits.length === VALIDATION_CONFIG.PHONE.SHORT_LENGTH && !digits.startsWith('0')) {
        return VALIDATION_CONFIG.PHONE.COUNTRY_CODE + digits; // Convert to international
    }
    
    return null;
}

// ==================== PAYCODE VALIDATION ====================
// Used by Bills service ONLY (NO cross-scanning!)

function isValidPayCode(paycode) {
    if (!paycode || typeof paycode !== 'string') return false;
    
    // Clean the paycode
    const cleaned = paycode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Must start with CCH
    if (!cleaned.startsWith(PAYCODE_CONFIG.PREFIX)) return false;
    
    // Must be exactly 9 characters (CCH + 6 digits)
    if (cleaned.length !== PAYCODE_CONFIG.TOTAL_LENGTH) return false;
    
    // Must have exactly 6 digits after CCH
    const numericPart = cleaned.slice(PAYCODE_CONFIG.PREFIX.length);
    if (!new RegExp(`^\\d{${PAYCODE_CONFIG.DIGIT_COUNT}}$`).test(numericPart)) return false;
    
    // Check for suspicious patterns
    for (const pattern of PAYCODE_CONFIG.SUSPICIOUS_PATTERNS) {
        if (pattern.test(cleaned)) {
            console.warn(`⚠️ Suspicious PayCode pattern detected: ${cleaned}`);
            return false;
        }
    }
    
    return cleaned;
}

// ==================== METER VALIDATION ====================
// Used by ZESA service ONLY

function isValidMeterNumber(meter) {
    if (!meter || typeof meter !== 'string') return false;
    
    // Remove all non-digits
    const digits = meter.replace(/\D/g, '');
    
    // Meter must be 10+ digits
    return digits.length >= VALIDATION_CONFIG.METER.MIN_LENGTH && /^\d+$/.test(digits);
}

// ==================== AMOUNT VALIDATION ====================
// Generic amount validation used by multiple services

function isValidAmount(amount, min, max) {
    const num = parseFloat(amount);
    return !isNaN(num) && num >= min && num <= max;
}

// ==================== MENU SELECTION VALIDATION ====================
// Used by Main Menu and service selection steps

function isValidMenuSelection(selection, maxOption) {
    const num = parseInt(selection);
    return !isNaN(num) && num >= VALIDATION_CONFIG.MENU.MIN_OPTION && num <= maxOption;
}

// ==================== SIMPLE KEYWORD DETECTION ====================
// Used ONLY in main menu (no session) for natural language starts

function detectServiceKeyword(message) {
    const cleanMessage = message.toLowerCase().trim();
    
    for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
        if (keywords.some(keyword => cleanMessage.includes(keyword))) {
            return service;
        }
    }
    
    return null;
}

// ==================== INPUT CLEANING ====================

function cleanInput(input) {
    if (!input || typeof input !== 'string') return '';
    return input.trim();
}

function cleanNumericInput(input) {
    if (!input || typeof input !== 'string') return '';
    return input.replace(/[^\d]/g, ''); // Remove all non-digits
}

// ==================== SIMPLE VALIDATION HELPERS ====================

function isYesNoResponse(input) {
    const clean = input.toLowerCase().trim();
    return RESPONSE_KEYWORDS.YES.includes(clean) || RESPONSE_KEYWORDS.NO.includes(clean);
}

function isYesResponse(input) {
    const clean = input.toLowerCase().trim();
    return RESPONSE_KEYWORDS.YES.includes(clean);
}

function isNoResponse(input) {
    const clean = input.toLowerCase().trim();
    return RESPONSE_KEYWORDS.NO.includes(clean);
}

module.exports = {
    // Phone validation (Airtime service)
    isValidPhoneNumber,
    formatPhoneNumber,
    
    // PayCode validation (Bills service ONLY)
    isValidPayCode,
    
    // Meter validation (ZESA service)
    isValidMeterNumber,
    
    // Amount validation
    isValidAmount,
    
    // Menu validation
    isValidMenuSelection,
    
    // Keyword detection (Main Menu ONLY)
    detectServiceKeyword,
    
    // Input cleaning
    cleanInput,
    cleanNumericInput,
    
    // Simple response validation
    isYesNoResponse,
    isYesResponse,
    isNoResponse
};