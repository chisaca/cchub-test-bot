// scripts/check-telone-stock.js
// Check available stock/bundles for TelOne products
// Run with: node scripts/check-telone-stock.js

require('dotenv').config({ path: '../.env' });
const axios = require('axios');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
    console.log('\n' + '='.repeat(80));
    log(`🔍 ${title}`, 'bright');
    console.log('='.repeat(80));
}

const HOT_API_BASE_URL = process.env.HOT_API_BASE_URL || 'https://ssl.hot.co.zw/api/v3';
const ACCESS_CODE = process.env.HOT_ACCESS_CODE;
const PASSWORD = process.env.HOT_PASSWORD;

// TelOne product IDs to check
const TELONE_PRODUCTS = [
    { id: 30, name: 'TelOne Voice' },
    { id: 31, name: 'TelOne Broadband' },
    { id: 32, name: 'TelOne LTE' },
    { id: 33, name: 'TelOne VoIP' },
    { id: 40, name: 'TelOne USD' }
];

async function getAuthToken() {
    try {
        const response = await axios.post(
            `${HOT_API_BASE_URL}/authenticate`,
            {
                AccessCode: ACCESS_CODE,
                Password: PASSWORD
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );

        if (response.data) {
            return response.data.token || response.data.accessToken || response.data.access_token;
        }
        throw new Error('No token in response');
    } catch (error) {
        log(`❌ Authentication failed: ${error.message}`, 'red');
        throw error;
    }
}

async function checkProductStock(token, product) {
    log(`\n📦 Checking stock for ${product.name} (ID: ${product.id})...`, 'yellow');
    
    // Try different possible endpoints
    const endpoints = [
        `/query/stock/${product.id}`,
        `/stock/available/${product.id}`,
        `/products/stock/${product.id}`,
        `/bundles/${product.id}`,
        `/product/${product.id}/bundles`
    ];

    for (const endpoint of endpoints) {
        try {
            const url = `${HOT_API_BASE_URL}${endpoint}`;
            log(`  Trying: ${url}`, 'cyan');

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            log(`  ✅ ${endpoint} - Status: ${response.status}`, 'green');
            
            if (response.data) {
                log('\n  📊 Response:', 'bright');
                console.log(JSON.stringify(response.data, null, 2));
                
                // If we got data, return it
                if (response.data && Object.keys(response.data).length > 0) {
                    return {
                        endpoint,
                        data: response.data
                    };
                }
            }
        } catch (error) {
            if (error.response) {
                log(`  ❌ ${endpoint} - Status: ${error.response.status}`, 'red');
                if (error.response.data) {
                    console.log('     Response:', JSON.stringify(error.response.data));
                }
            } else {
                log(`  ❌ ${endpoint} - ${error.message}`, 'red');
            }
        }
    }
    
    return null;
}

async function checkProductDetails(token, productId) {
    try {
        const url = `${HOT_API_BASE_URL}/products/${productId}`;
        log(`\n📋 Fetching product details for ID ${productId}...`, 'yellow');
        log(`  URL: ${url}`, 'cyan');

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 5000
        });

        log(`  ✅ Success`, 'green');
        console.log(JSON.stringify(response.data, null, 2));
        
        return response.data;
    } catch (error) {
        log(`  ❌ Failed: ${error.message}`, 'red');
        return null;
    }
}

async function main() {
    logSection('🔍 TELONE STOCK CHECKER');
    
    if (!ACCESS_CODE || !PASSWORD) {
        log('❌ Missing credentials! Check your .env file', 'red');
        process.exit(1);
    }

    try {
        // Get auth token
        log('🔑 Authenticating...', 'yellow');
        const token = await getAuthToken();
        log('✅ Authentication successful', 'green');

        // First, check product details for each TelOne product
        logSection('PRODUCT DETAILS');
        for (const product of TELONE_PRODUCTS) {
            await checkProductDetails(token, product.id);
        }

        // Check stock/bundles for each product
        logSection('STOCK/BUNDLES AVAILABLE');
        for (const product of TELONE_PRODUCTS) {
            const result = await checkProductStock(token, product);
            
            if (result && result.data) {
                log(`\n✅ Found stock for ${product.name}:`, 'green');
                
                // Parse the data to show available bundles clearly
                const data = result.data;
                
                if (data.stock && Array.isArray(data.stock)) {
                    log('\nAvailable Bundles:', 'bright');
                    data.stock.forEach((item, index) => {
                        log(`  ${index + 1}. Code: ${item.productCode || item.code} | Amount: ${item.amount} | Name: ${item.name || 'N/A'}`, 'cyan');
                    });
                } else if (Array.isArray(data)) {
                    log('\nAvailable Bundles:', 'bright');
                    data.forEach((item, index) => {
                        log(`  ${index + 1}. Code: ${item.productCode || item.code} | Amount: ${item.amount} | Name: ${item.name || 'N/A'}`, 'cyan');
                    });
                } else if (data.bundles && Array.isArray(data.bundles)) {
                    log('\nAvailable Bundles:', 'bright');
                    data.bundles.forEach((item, index) => {
                        log(`  ${index + 1}. Code: ${item.productCode || item.code} | Amount: ${item.amount} | Name: ${item.name || 'N/A'}`, 'cyan');
                    });
                }
            } else {
                log(`\n❌ No stock/bundles found for ${product.name}`, 'red');
            }
        }

        logSection('✅ CHECK COMPLETE');
        
    } catch (error) {
        logSection('❌ ERROR');
        log(error.message, 'red');
        process.exit(1);
    }
}

main();
