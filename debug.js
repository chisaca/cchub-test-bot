// debug.js - Check for common issues
require('dotenv').config();

console.log('🔍 Debugging CCHub WhatsApp Bot...\n');

// 1. Check Node.js version
console.log('1. Node.js Version:', process.version);

// 2. Check environment variables
console.log('\n2. Environment Variables:');
const requiredEnvVars = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_VERIFY_TOKEN', 
    'PHONE_NUMBER_ID',
    'PAYNOW_ID',
    'PAYNOW_KEY'
];

requiredEnvVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`   ${varName}: ${value ? '✓ Set' : '✗ MISSING'}`);
});

// 3. Check if main files exist
console.log('\n3. File Structure Check:');
const requiredFiles = [
    './index.js',
    './handlers/messageHandler.js',
    './handlers/sessionHandlers.js',
    './services/airtime.js',
    './services/paynow.js',
    './config/constants.js'
];

const fs = require('fs');
requiredFiles.forEach(file => {
    const exists = fs.existsSync(file);
    console.log(`   ${file}: ${exists ? '✓ Found' : '✗ MISSING'}`);
});

// 4. Try to require main modules
console.log('\n4. Module Loading Test:');
try {
    const constants = require('./config/constants');
    console.log('   constants.js: ✓ Loaded');
} catch (error) {
    console.log('   constants.js: ✗ Error:', error.message);
}

try {
    const sessionHandlers = require('./handlers/sessionHandlers');
    console.log('   sessionHandlers.js: ✓ Loaded');
} catch (error) {
    console.log('   sessionHandlers.js: ✗ Error:', error.message);
}

try {
    const paynow = require('./services/paynow');
    console.log('   paynow.js: ✓ Loaded');
} catch (error) {
    console.log('   paynow.js: ✗ Error:', error.message);
}

console.log('\n✅ Debug check complete.');