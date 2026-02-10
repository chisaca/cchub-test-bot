// test-paynow-sdk.js
require('dotenv').config();
const { Paynow } = require("paynow");

async function testSDK() {
    console.log('🧪 Testing PayNow SDK Installation\n');
    
    // Test 1: Check if SDK is installed
    try {
        console.log('1. Checking SDK import...');
        const PaynowClass = require("paynow").Paynow;
        console.log('   ✅ SDK imported successfully');
    } catch (error) {
        console.log('   ❌ SDK import failed:', error.message);
        console.log('   💡 Run: npm install --save paynow');
        return;
    }
    
    // Test 2: Initialize with your credentials
    console.log('\n2. Initializing PayNow with your credentials...');
    
    const integrationId = process.env.PAYNOW_INTEGRATION_ID || '23374';
    const integrationKey = process.env.PAYNOW_INTEGRATION_KEY || '486538ea-63af-4400-a91b-8d9d1c67ccd3';
    
    console.log(`   Integration ID: ${integrationId}`);
    console.log(`   Integration Key: ${integrationKey ? 'SET' : 'MISSING'}`);
    
    let paynow;
    try {
        paynow = new Paynow(integrationId, integrationKey);
        console.log('   ✅ PayNow instance created');
    } catch (error) {
        console.log('   ❌ Failed to create PayNow instance:', error.message);
        return;
    }
    
    // Test 3: Create a test payment
    console.log('\n3. Creating test payment...');
    
    const reference = 'TEST' + Date.now();
    const email = 'test@cchub.co.zw';
    const phone = '263775464443'; // Test EcoCash number
    const amount = '10.00';
    
    const payment = paynow.createPayment(reference, email);
    payment.add('Test Airtime', parseFloat(amount));
    
    console.log(`   Reference: ${reference}`);
    console.log(`   Email: ${email}`);
    console.log(`   Phone: ${phone}`);
    console.log(`   Amount: ${amount}`);
    
    // Test 4: Try to send mobile payment
    console.log('\n4. Testing mobile payment (EcoCash)...');
    
    try {
        const response = await paynow.sendMobile(payment, phone, 'ecocash');
        
        console.log(`   Success: ${response.success}`);
        
        if (response.success) {
            console.log('   ✅ Mobile payment initiated!');
            console.log(`   Instructions: ${response.instructions.substring(0, 100)}...`);
            console.log(`   Poll URL: ${response.pollUrl}`);
        } else {
            console.log(`   ❌ Error: ${response.error}`);
            
            // Try to diagnose
            if (response.error.includes('integration')) {
                console.log('\n💡 Your integration credentials might be for web plugin, not QuickPay.');
                console.log('💡 Contact PayNow for QuickPay-specific credentials.');
            }
        }
        
    } catch (error) {
        console.log('   ❌ Exception:', error.message);
        
        // Check if it's a provider issue
        if (error.message.includes('mobile money method')) {
            console.log('\n💡 Try with OneMoney (NetOne number):');
            console.log('   Change phone to: 263712345678');
            console.log('   Change provider to: onemoney');
        }
    }
    
    console.log('\n📝 NEXT STEPS:');
    console.log('1. If SDK test fails, contact PayNow support');
    console.log('2. Ask: "I need QuickPay Mobile Money API credentials"');
    console.log('3. Verify: Your credentials should work with paynow.sendMobile()');
    console.log('4. Update .env with correct credentials');
}

// Run test
testSDK().catch(console.error);