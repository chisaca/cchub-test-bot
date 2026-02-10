// utils/validation.js - UPDATED to follow architecture principles

const { PAYCODE_CONFIG, NETWORK_PREFIXES } = require('../config/constants');

// ==================== PHONE VALIDATION ====================
// Used by Airtime service ONLY

function isValidPhoneNumber(phone) {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Check Zimbabwean number formats
    if (digits.length === 10 && digits.startsWith('0')) {
        // Format: 0771234567
        const prefix = digits.substring(0, 3);
        return isValidNetworkPrefix(prefix);
    }
    else if (digits.length === 12 && digits.startsWith('263')) {
        // Format: 263771234567
        const localPrefix = '0' + digits.substring(3, 5);
        return isValidNetworkPrefix(localPrefix);
    }
    else if (digits.length === 9 && !digits.startsWith('0')) {
        // Format: 771234567
        const localPrefix = '0' + digits.substring(0, 2);
        return isValidNetworkPrefix(localPrefix);
    }
    
    return false;
}

function isValidNetworkPrefix(prefix) {
    return (
        NETWORK_PREFIXES.ECONET.includes(prefix) ||
        NETWORK_PREFIXES.NETONE.includes(prefix) ||
        NETWORK_PREFIXES.TELECEL.includes(prefix)
    );
}

function formatPhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length === 10 && digits.startsWith('0')) {
        return '263' + digits.substring(1); // Convert to international
    }
    else if (digits.length === 12 && digits.startsWith('263')) {
        return digits; // Already international
    }
    else if (digits.length === 9 && !digits.startsWith('0')) {
        return '263' + digits; // Convert to international
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
    if (!cleaned.startsWith('CCH')) return false;
    
    // Must be exactly 9 characters (CCH + 6 digits)
    if (cleaned.length !== 9) return false;
    
    // Must have exactly 6 digits after CCH
    const numericPart = cleaned.slice(3);
    if (!/^\d{6}$/.test(numericPart)) return false;
    
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
    return digits.length >= 10 && /^\d+$/.test(digits);
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
    return !isNaN(num) && num >= 1 && num <= maxOption;
}

// ==================== SIMPLE KEYWORD DETECTION ====================
// Used ONLY in main menu (no session) for natural language starts

function detectServiceKeyword(message) {
    const cleanMessage = message.toLowerCase().trim();
    
    if (cleanMessage.includes('airtime') || cleanMessage.includes('topup')) {
        return 'airtime';
    }
    if (cleanMessage.includes('zesa') || cleanMessage.includes('electric')) {
        return 'zesa';
    }
    if (cleanMessage.includes('bill') || cleanMessage.includes('pay')) {
        return 'bill';
    }
    if (cleanMessage.includes('emergency')) {
        return 'emergency';
    }
    if (cleanMessage.includes('help')) {
        return 'help';
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
    return clean === 'yes' || clean === 'y' || clean === 'no' || clean === 'n';
}

function isYesResponse(input) {
    const clean = input.toLowerCase().trim();
    return clean === 'yes' || clean === 'y';
}

function isNoResponse(input) {
    const clean = input.toLowerCase().trim();
    return clean === 'no' || clean === 'n';
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