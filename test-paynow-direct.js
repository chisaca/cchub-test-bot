// test-paynow-direct.js
require('dotenv').config();
const { Paynow } = require("paynow");

async function testPayNow() {
    console.log("🧪 Testing PayNow Direct with CORRECT email...\n");
    
    try {
        // ✅ Use EXACT same credentials as your working paynow.js
        const integrationId = process.env.PAYNOW_ID || "23374";
        const integrationKey = process.env.PAYNOW_KEY || "486538ea-63af-4400-a91b-8d9d1c67ccd3";
        
        // ✅ CRITICAL: Must use EXACT registered merchant email
        const merchantEmail = "cchisango@cchub.co.zw";  // EXACT match
        
        console.log(`📋 Integration ID: ${integrationId}`);
        console.log(`📋 Merchant Email: ${merchantEmail}\n`);
        
        // ✅ Initialize PayNow with URLs (REQUIRED)
        const paynow = new Paynow(integrationId, integrationKey);
        paynow.resultUrl = "https://cchub.co.zw/paynow/result";
        paynow.returnUrl = "https://cchub.co.zw/paynow/return";
        
        console.log("✅ PayNow initialized with result/return URLs\n");
        
        // ✅ Create payment with EXACT merchant email
        const reference = "TEST-" + Date.now().toString().slice(-8);
        const payment = paynow.createPayment(reference, merchantEmail);  // ← CRITICAL
        payment.add("Airtime Test", 1.00);
        
        console.log(`📝 Payment created:`);
        console.log(`   Reference: ${reference}`);
        console.log(`   Amount: $1.00`);
        console.log(`   Email: ${merchantEmail}\n`);
        
        // ✅ Format phone to LOCAL format (077...)
        const phone = "0773333333";  // Local format, NOT 263...
        const provider = "ecocash";
        
        console.log(`📱 Sending to: ${phone} (${provider})...\n`);
        
        // ✅ Send mobile payment
        const response = await paynow.sendMobile(
            payment,
            phone,
            provider
        );
        
        console.log("✅ SUCCESS! Response received:\n");
        console.log(JSON.stringify(response, null, 2));
        
        if (response.pollUrl) {
            console.log(`\n🔍 Poll URL: ${response.pollUrl}`);
        }
        
    } catch (error) {
        console.error("❌ ERROR:", error.message);
        if (error.response) {
            console.error("   Response data:", error.response.data);
        }
        console.error("   Full error:", error);
    }
}

testPayNow();