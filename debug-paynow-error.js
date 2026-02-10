// debug-paynow-error.js
require('dotenv').config();
const { Paynow } = require("paynow");

async function debugPayNowError() {
    console.log('🔧 Debugging PayNow "Cannot read properties of undefined" Error\n');
    
    // Step 1: Check environment variables
    console.log('1. 📋 Checking Environment Variables:');
    console.log('   PAYNOW_ID:', process.env.PAYNOW_ID || 'NOT SET');
    console.log('   PAYNOW_KEY:', process.env.PAYNOW_KEY ? 'SET' : 'NOT SET');
    
    if (!process.env.PAYNOW_ID || !process.env.PAYNOW_KEY) {
        console.log('❌ ERROR: PayNow credentials not found in .env');
        console.log('💡 Add to .env:');
        console.log('   PAYNOW_ID=23374');
        console.log('   PAYNOW_KEY=486538ea-63af-4400-a91b-8d9d1c67ccd3');
        return;
    }
    
    // Step 2: Test SDK initialization
    console.log('\n2. 🚀 Testing SDK Initialization:');
    let paynow;
    try {
        paynow = new Paynow(process.env.PAYNOW_ID, process.env.PAYNOW_KEY);
        console.log('   ✅ SDK initialized successfully');
        
        // Check SDK properties
        console.log('   SDK Properties:');
        console.log('   - Has sendMobile method:', typeof paynow.sendMobile === 'function');
        console.log('   - Has send method:', typeof paynow.send === 'function');
        
    } catch (error) {
        console.log('   ❌ SDK initialization failed:', error.message);
        return;
    }
    
    // Step 3: Create test payment
    console.log('\n3. 💰 Creating Test Payment:');
    let payment;
    try {
        const reference = `DEBUG${Date.now()}`;
        const email = 'test@cchub.co.zw';
        
        payment = paynow.createPayment(reference, email);
        payment.add('Debug Test', 1.00);
        
        console.log('   ✅ Payment created');
        console.log('   Reference:', reference);
        console.log('   Amount: $1.00');
        
    } catch (error) {
        console.log('   ❌ Payment creation failed:', error.message);
        return;
    }
    
    // Step 4: Test with try-catch and detailed logging
    console.log('\n4. 📡 Testing sendMobile() with detailed error handling:');
    
    const testPhone = '263775464443'; // EcoCash
    const provider = 'ecocash';
    
    console.log('   Phone:', testPhone);
    console.log('   Provider:', provider);
    
    try {
        console.log('   📤 Calling paynow.sendMobile()...');
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('sendMobile timeout after 30 seconds')), 30000);
        });
        
        const sendMobilePromise = paynow.sendMobile(payment, testPhone, provider);
        
        // Race between API call and timeout
        const response = await Promise.race([sendMobilePromise, timeoutPromise]);
        
        console.log('   📥 Response received!');
        
        // Check if response is defined
        if (!response) {
            console.log('   ❌ ERROR: Response is NULL or UNDEFINED');
            console.log('   💡 This means sendMobile() returned undefined');
            return;
        }
        
        // Check response structure
        console.log('   Response type:', typeof response);
        console.log('   Response keys:', Object.keys(response));
        
        // Check for success property
        if (typeof response.success === 'undefined') {
            console.log('   ❌ ERROR: response.success is undefined');
            console.log('   Full response:', JSON.stringify(response, null, 2));
        } else {
            console.log('   ✅ response.success exists:', response.success);
            
            if (response.success) {
                console.log('   🎉 SUCCESS! QuickPay works!');
                console.log('   Instructions:', response.instructions);
                console.log('   Poll URL:', response.pollUrl);
            } else {
                console.log('   ❌ Payment failed:', response.error);
            }
        }
        
    } catch (error) {
        console.log('   ❌ EXCEPTION caught in sendMobile():');
        console.log('   Error message:', error.message);
        console.log('   Error stack:', error.stack);
        
        // Check for specific errors
        if (error.message.includes('Hashes do not match')) {
            console.log('\n   🔍 HASH MISMATCH DIAGNOSIS:');
            console.log('   1. Check that credentials are for QuickPay, not website');
            console.log('   2. Verify SDK version: npm list paynow');
            console.log('   3. Contact PayNow for QuickPay-specific credentials');
        }
        
        if (error.message.includes('timeout')) {
            console.log('\n   ⏰ TIMEOUT DIAGNOSIS:');
            console.log('   1. Network/firewall blocking PayNow API');
            console.log('   2. PayNow API might be down');
            console.log('   3. Try different network/VPN');
        }
    }
    
    // Step 5: Test alternative - try send() for web payment
    console.log('\n5. 🌐 Testing send() for web payment:');
    try {
        const webPayment = paynow.createPayment(`WEB${Date.now()}`, 'test@cchub.co.zw');
        webPayment.add('Web Test', 1.00);
        
        const webResponse = await paynow.send(webPayment);
        
        console.log('   Web response received:', typeof webResponse);
        
        if (webResponse && typeof webResponse.success !== 'undefined') {
            console.log('   ✅ Web payment works! Success:', webResponse.success);
            console.log('   This confirms your credentials are valid');
        } else {
            console.log('   ❌ Web payment also returns undefined response');
        }
        
    } catch (error) {
        console.log('   Web payment error:', error.message);
    }
    
    console.log('\n📊 DIAGNOSIS SUMMARY:');
    console.log('If sendMobile() returns undefined, it might be:');
    console.log('1. SDK bug/version issue');
    console.log('2. Network timeout (no response)');
    console.log('3. PayNow API endpoint changed');
    console.log('4. Your account not enabled for QuickPay');
}

debugPayNowError().catch(console.error);