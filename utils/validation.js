// utils/validation.js
// ============================================================================
// VALIDATION UTILITIES
// Centralized validation functions used across all services
// 
// Architecture Principle: Each service uses its own validation functions
// - Airtime service: phone validation
// - ZESA service: meter validation
// - Main menu: keyword detection (natural language)
// - All services: amount validation, menu selection validation
// 
// All hardcoded values have been moved to constants.js
// ============================================================================

const { 
    NETWORK_PREFIXES,
    VALIDATION_CONFIG,
    SERVICE_KEYWORDS,
    RESPONSE_KEYWORDS
} = require('../config/constants');

// ============================================================================
// PHONE VALIDATION
// Used by Airtime service ONLY
// Validates Zimbabwean phone numbers in various formats
// ============================================================================

/**
 * Check if a phone number is a valid Zimbabwean number
 * Supports formats:
 * - Local: 0771234567 (10 digits starting with 0)
 * - International: 263771234567 (12 digits starting with 263)
 * - Short: 771234567 (9 digits, no leading 0)
 * 
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid Zimbabwean number
 */
function isValidPhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');
    
    // Format: 0771234567
    if (digits.length === VALIDATION_CONFIG.PHONE.LOCAL_LENGTH && digits.startsWith('0')) {
        const prefix = digits.substring(0, VALIDATION_CONFIG.PHONE.PREFIX_LENGTH);
        return isValidNetworkPrefix(prefix);
    }
    // Format: 263771234567
    else if (digits.length === VALIDATION_CONFIG.PHONE.INTERNATIONAL_LENGTH && digits.startsWith(VALIDATION_CONFIG.PHONE.COUNTRY_CODE)) {
        const localPrefix = '0' + digits.substring(3, 5);
        return isValidNetworkPrefix(localPrefix);
    }
    // Format: 771234567
    else if (digits.length === VALIDATION_CONFIG.PHONE.SHORT_LENGTH && !digits.startsWith('0')) {
        const localPrefix = '0' + digits.substring(0, 2);
        return isValidNetworkPrefix(localPrefix);
    }
    
    return false;
}

/**
 * Check if a 3-digit prefix belongs to a valid Zimbabwean network
 * 
 * @param {string} prefix - 3-digit prefix (e.g., '077')
 * @returns {boolean} True if prefix is valid
 */
function isValidNetworkPrefix(prefix) {
    const allPrefixes = [
        ...NETWORK_PREFIXES.ECONET.prefixes,
        ...NETWORK_PREFIXES.NETONE.prefixes,
        ...NETWORK_PREFIXES.TELECEL.prefixes
    ];
    return allPrefixes.includes(prefix);
}

/**
 * Format phone number to international format (263...)
 * 
 * @param {string} phone - Raw phone number
 * @returns {string|null} Formatted international number or null if invalid
 */
function formatPhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length === VALIDATION_CONFIG.PHONE.LOCAL_LENGTH && digits.startsWith('0')) {
        return VALIDATION_CONFIG.PHONE.COUNTRY_CODE + digits.substring(1);
    }
    else if (digits.length === VALIDATION_CONFIG.PHONE.INTERNATIONAL_LENGTH && digits.startsWith(VALIDATION_CONFIG.PHONE.COUNTRY_CODE)) {
        return digits;
    }
    else if (digits.length === VALIDATION_CONFIG.PHONE.SHORT_LENGTH && !digits.startsWith('0')) {
        return VALIDATION_CONFIG.PHONE.COUNTRY_CODE + digits;
    }
    
    return null;
}

// ============================================================================
// METER VALIDATION
// Used by ZESA service ONLY
// ============================================================================

/**
 * Validate ZESA meter number
 * Meter must be at least 10 digits (typically 11)
 * 
 * @param {string} meter - Meter number to validate
 * @returns {boolean} True if valid meter number
 */
function isValidMeterNumber(meter) {
    if (!meter || typeof meter !== 'string') return false;
    
    const digits = meter.replace(/\D/g, '');
    
    return digits.length >= VALIDATION_CONFIG.METER.MIN_LENGTH && /^\d+$/.test(digits);
}

// ============================================================================
// AMOUNT VALIDATION
// Generic amount validation used by multiple services
// ============================================================================

/**
 * Validate amount against min/max range
 * 
 * @param {string|number} amount - Amount to validate
 * @param {number} min - Minimum allowed
 * @param {number} max - Maximum allowed
 * @returns {boolean} True if amount is valid and within range
 */
function isValidAmount(amount, min, max) {
    const num = parseFloat(amount);
    return !isNaN(num) && num >= min && num <= max;
}

// ============================================================================
// MENU SELECTION VALIDATION
// Used by Main Menu and service selection steps
// ============================================================================

/**
 * Validate menu selection is within range
 * 
 * @param {string} selection - User's selection
 * @param {number} maxOption - Maximum allowed option number
 * @returns {boolean} True if selection is valid
 */
function isValidMenuSelection(selection, maxOption) {
    const num = parseInt(selection);
    return !isNaN(num) && num >= VALIDATION_CONFIG.MENU.MIN_OPTION && num <= maxOption;
}

// ============================================================================
// KEYWORD DETECTION
// Used ONLY in main menu (no session) for natural language starts
// ============================================================================

/**
 * Detect service from natural language input
 * 
 * @param {string} message - User's message
 * @returns {string|null} Service name or null if no match
 */
function detectServiceKeyword(message) {
    const cleanMessage = message.toLowerCase().trim();
    
    for (const [service, keywords] of Object.entries(SERVICE_KEYWORDS)) {
        if (keywords.some(keyword => cleanMessage.includes(keyword))) {
            return service;
        }
    }
    
    return null;
}

// ============================================================================
// INPUT CLEANING
// ============================================================================

/**
 * Clean user input by trimming whitespace
 * 
 * @param {string} input - Raw input
 * @returns {string} Cleaned input
 */
function cleanInput(input) {
    if (!input || typeof input !== 'string') return '';
    return input.trim();
}

/**
 * Remove all non-digit characters from input
 * 
 * @param {string} input - Raw input
 * @returns {string} String containing only digits
 */
function cleanNumericInput(input) {
    if (!input || typeof input !== 'string') return '';
    return input.replace(/[^\d]/g, '');
}

// ============================================================================
// RESPONSE VALIDATION
// Simple helpers for YES/NO responses
// ============================================================================

/**
 * Check if input is a valid YES or NO response
 * 
 * @param {string} input - User's input
 * @returns {boolean} True if input matches YES or NO keywords
 */
function isYesNoResponse(input) {
    const clean = input.toLowerCase().trim();
    return RESPONSE_KEYWORDS.YES.includes(clean) || RESPONSE_KEYWORDS.NO.includes(clean);
}

/**
 * Check if input is a YES response
 * 
 * @param {string} input - User's input
 * @returns {boolean} True if input matches YES keywords
 */
function isYesResponse(input) {
    const clean = input.toLowerCase().trim();
    return RESPONSE_KEYWORDS.YES.includes(clean);
}

/**
 * Check if input is a NO response
 * 
 * @param {string} input - User's input
 * @returns {boolean} True if input matches NO keywords
 */
function isNoResponse(input) {
    const clean = input.toLowerCase().trim();
    return RESPONSE_KEYWORDS.NO.includes(clean);
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    // Phone validation (Airtime service)
    isValidPhoneNumber,
    formatPhoneNumber,
    
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
