// test-hotrecharge.js
require('dotenv').config();
const hotrecharge = require('./services/hotrecharge');

async function test() {
    console.log('🔌 Testing HotRecharge V3 API...\n');
    
    // 1. Authentication
    console.log('📌 Step 1: Authentication');
    const token = await hotrecharge.authenticate();
    console.log('✅ Auth successful\n');
    
    // 2. Balance
    console.log('📌 Step 2: Balance');
    const balance = await hotrecharge.getBalance(1);
    console.log(`💰 Balance: ${balance.balance} ${balance.currency}\n`);
    
    // 3. Find Airtime Product IDs
    console.log('📌 Step 3: Finding Airtime Product IDs');
    const productDetails = await hotrecharge.getProductDetails(100);
    
    // Filter products that are airtime
    const airtimeProducts = productDetails.product.products.filter(p => 
        p.name?.toLowerCase().includes('airtime') || 
        p.description?.toLowerCase().includes('airtime') ||
        p.category?.toLowerCase().includes('airtime')
    );
    
    console.log('🎯 Airtime Products Found:');
    airtimeProducts.forEach(p => {
        console.log(`   ID: ${p.productId}, Name: ${p.name}, Network: ${p.network || 'Unknown'}, Min: ${p.minimumAmount}, Max: ${p.maximumAmount}`);
    });
    
    // Also show Econet specific
    console.log('\n📱 Econet Products:');
    productDetails.product.products
        .filter(p => p.name?.toLowerCase().includes('econet') || p.description?.toLowerCase().includes('econet'))
        .forEach(p => {
            console.log(`   ID: ${p.productId}, Name: ${p.name}, Amount: ${p.amount || 'Variable'}`);
        });
}

test().catch(console.error);