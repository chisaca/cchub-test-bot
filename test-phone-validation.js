// test-phone-validation.js
console.log('🔍 Testing phone validation...\n');

// Test the validation function directly
const testNumbers = [
    '0771234567',
    '0781234567', 
    '0711234567',
    '0731234567',
    '263771234567',
    '263781234567',
    '263711234567',
    '263731234567',
    '771234567',
    '781234567',
    '711234567',
    '731234567',
    '0811234567', // Invalid prefix
    '1234567890', // Invalid format
    '07712345',   // Too short
];

// Load the validation module
const validation = require('./utils/validation');

console.log('Testing validatePhoneNumber function:');
testNumbers.forEach(phone => {
    try {
        const result = validation.validatePhoneNumber(phone);
        console.log(`${phone}: ${result.valid ? '✅' : '❌'} ${result.error || ''}`);
        if (result.valid) {
            console.log(`  Local: ${result.local}, International: ${result.formatted}`);
        }
    } catch (error) {
        console.log(`${phone}: ❌ ERROR: ${error.message}`);
    }
});

console.log('\n🔍 Testing validateAndDetectNetwork function:');
testNumbers.forEach(phone => {
    try {
        const result = validation.validateAndDetectNetwork(phone);
        console.log(`${phone}: ${result.valid ? '✅' : '❌'} ${result.error || ''}`);
        if (result.valid) {
            console.log(`  Network: ${result.network}, Formatted: ${result.formattedNumber}`);
        }
    } catch (error) {
        console.log(`${phone}: ❌ ERROR: ${error.message}`);
    }
});