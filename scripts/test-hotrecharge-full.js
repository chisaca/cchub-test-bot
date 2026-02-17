// scripts/test-hotrecharge-final.js
/**
 * HotRecharge API Test - Based on Official Documentation
 * 
 * From docs:
 * {
 *   "AccessCode": "0775438169",
 *   "Password": "0123"
 * }
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.HOT_API_BASE_URL || 'https://ssl.hot.co.zw/api/v3';
const ACCESS_CODE = process.env.HOT_ACCESS_CODE; // chisangocal@gmail.com
const PASSWORD = process.env.HOT_PASSWORD; // Michael@3624

console.log('🔥 HotRecharge Official API Test');
console.log('================================\n');
console.log(`API User: ${ACCESS_CODE}`);
console.log(`Base URL: ${BASE_URL}\n`);

// Step 1: Login to get token - USING EXACT DOCUMENTATION FORMAT
async function login() {
    console.log('📌 Step 1: Authentication');
    console.log('-'.repeat(50));
    
    const loginPayload = {
        AccessCode: ACCESS_CODE,  // EXACTLY as docs show: capital A, capital C
        Password: PASSWORD        // EXACTLY as docs show: capital P
    };
    
    console.log('Login payload (exactly as docs):');
    console.log(JSON.stringify(loginPayload, null, 2));
    
    try {
        const response = await axios.post(
            `${BASE_URL}/identity/login`,
            loginPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000
            }
        );
        
        console.log('\n✅ Login successful!');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
        // Extract token and refresh token as per docs
        const token = response.data.token;        // JWT Token
        const refreshToken = response.data.refreshToken; // Refresh Token
        
        if (token) {
            console.log('\n🔑 Token obtained!');
            console.log(`Token (first 20 chars): ${token.substring(0, 20)}...`);
            console.log(`Refresh Token: ${refreshToken ? refreshToken.substring(0, 20) + '...' : 'N/A'}`);
            return token;
        } else {
            console.log('❌ No token in response');
            return null;
        }
        
    } catch (error) {
        console.log('\n❌ Login failed:');
        if (error.response) {
            console.log(`Status: ${error.response.status}`);
            console.log('Error details:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
        return null;
    }
}

// Step 2: Test products endpoint
async function testProducts(token) {
    console.log('\n📌 Step 2: Fetch Products');
    console.log('-'.repeat(50));
    
    if (!token) {
        console.log('❌ No token available');
        return;
    }
    
    const endpoints = [
        {
            name: 'GET /products/0',
            request: () => axios.get(`${BASE_URL}/products/0`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        },
        {
            name: 'GET /products?ProductId=0',
            request: () => axios.get(`${BASE_URL}/products`, {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { ProductId: 0 }
            })
        },
        {
            name: 'POST /products (with ProductId)',
            request: () => axios.post(`${BASE_URL}/products`, 
                { ProductId: 0 },
                { headers: { 'Authorization': `Bearer ${token}` } }
            )
        }
    ];
    
    for (const endpoint of endpoints) {
        console.log(`\n🔄 Testing: ${endpoint.name}`);
        try {
            const response = await endpoint.request();
            console.log(`✅ Success! Status: ${response.status}`);
            console.log('Response preview:', JSON.stringify(response.data, null, 2).substring(0, 300));
            
            // If we got products, show count
            if (response.data) {
                const data = response.data;
                if (Array.isArray(data)) {
                    console.log(`📊 Found ${data.length} products`);
                } else if (data.products) {
                    console.log(`📊 Found ${data.products.length} products`);
                } else if (data.data) {
                    console.log(`📊 Found ${data.data.length} products`);
                }
            }
            
            // If this worked, we can stop testing other endpoints
            return response.data;
            
        } catch (error) {
            if (error.response) {
                console.log(`❌ Failed: ${error.response.status}`);
                if (error.response.status === 401) {
                    console.log('   Token might be invalid or expired');
                }
            } else {
                console.log(`❌ Error: ${error.message}`);
            }
        }
    }
}

// Step 3: Test balance endpoint
async function testBalance(token) {
    console.log('\n📌 Step 3: Check Account Balances');
    console.log('-'.repeat(50));
    
    if (!token) {
        console.log('❌ No token available');
        return;
    }
    
    const accountTypes = [
        { id: 1, name: 'ZiG Airtime' },
        { id: 2, name: 'ZiG ZESA' },
        { id: 3, name: 'USD Airtime' },
        { id: 4, name: 'USD ZESA' }
    ];
    
    for (const account of accountTypes) {
        try {
            const response = await axios.get(
                `${BASE_URL}/account/balance/${account.id}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );
            
            console.log(`✅ ${account.name} (${account.id}):`, 
                JSON.stringify(response.data, null, 2));
            
        } catch (error) {
            if (error.response) {
                console.log(`❌ ${account.name}: ${error.response.status}`);
            } else {
                console.log(`❌ ${account.name}: ${error.message}`);
            }
        }
    }
}

// Step 4: Test ZESA USD with correct NotifyNumber format
async function testZesaUSD(token) {
    console.log('\n📌 Step 4: Test ZESA USD Recharge');
    console.log('-'.repeat(50));
    
    if (!token) {
        console.log('❌ No token available');
        return;
    }
    
    // Test different NotifyNumber formats
    const testCases = [
        { notify: '0771234567', desc: 'Local format' },
        { notify: '263771234567', desc: 'International without +' },
        { notify: '+263771234567', desc: 'International with +' }
    ];
    
    for (const test of testCases) {
        console.log(`\n🔄 Testing NotifyNumber: ${test.desc} (${test.notify})`);
        
        const rechargePayload = {
            ProductId: 41,  // USD ZESA
            Amount: 5.00,
            Target: '10220004444',  // Test meter
            NotifyNumber: test.notify,
            AgentReference: `TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`
        };
        
        console.log('Payload:', JSON.stringify(rechargePayload, null, 2));
        
        try {
            const response = await axios.post(
                `${BASE_URL}/products/recharge`,
                rechargePayload,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            console.log('✅ Success!');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            
        } catch (error) {
            if (error.response) {
                console.log(`❌ Failed: ${error.response.status}`);
                console.log('Error details:', JSON.stringify(error.response.data, null, 2));
            } else {
                console.log('❌ Error:', error.message);
            }
        }
    }
}

// Main function
async function main() {
    console.log('🚀 Starting HotRecharge API Tests (Official Docs)');
    console.log('================================================\n');
    
    // Step 1: Login
    const token = await login();
    
    if (token) {
        // Step 2: Test products
        await testProducts(token);
        
        // Step 3: Check balances
        await testBalance(token);
        
        // Step 4: Test ZESA USD (uncomment when ready)
        // await testZesaUSD(token);
        
        console.log('\n✨ Tests completed!');
    } else {
        console.log('\n❌ Cannot proceed without valid token');
        console.log('Please check:');
        console.log('1. Your AccessCode and Password in .env file');
        console.log('2. That your API account is active');
        console.log('3. That you are using the correct API URL');
    }
}

// Run it
main().catch(console.error);