// test-products.js
require('dotenv').config();
const hotrecharge = require('./services/hotrecharge');

async function test() {
    console.log('🔍 Testing HotRecharge product fetch...');
    const result = await hotrecharge.getAllProducts();
    console.log('Test complete');
}

test().catch(console.error);