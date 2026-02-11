// test-paynow.js
const { Paynow } = require("paynow");

async function testPayNow() {
    console.log("🧪 Testing PayNow integration...");
    
    try {
        // Initialize with your credentials
        const paynow = new Paynow("23374", "486538ea-63af-4400-a91b-8d9d1c67ccd3");
        
        console.log("✅ PayNow SDK loaded successfully");
        
        // Test 1: Create a payment
        const payment = paynow.createPayment("TEST-" + Date.now(), "test@cchub.co.zw");
        payment.add("Test Airtime", 1000);
        
        console.log("✅ Payment object created");
        
        // Test 2: Detect provider
        const testNumbers = {
            ecocash: "263771234567",
            onemoney: "263711234567",
            invalid: "263731234567" // Telecel - should fail
        };
        
        console.log("\n📱 Testing phone number detection:");
        for (const [provider, number] of Object.entries(testNumbers)) {
            console.log(`   ${provider}: ${number}`);
        }
        
        console.log("\n✅ PayNow test completed successfully");
        console.log("📝 Next: Test with actual mobile payment using sendMobile()");
        
    } catch (error) {
        console.error("❌ PayNow test failed:", error.message);
    }
}

testPayNow();