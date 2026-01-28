const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Store payment sessions with cleanup
const paymentSessions = {};

// Clean up old sessions every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [phone, session] of Object.entries(paymentSessions)) {
        if (now - session.timestamp > 15 * 60 * 1000) { // 15 minutes
            delete paymentSessions[phone];
            console.log(`🧹 Cleaned up expired session for ${phone}`);
        }
    }
}, 10 * 60 * 1000);

// ==================== HELPER FUNCTIONS ====================

// A + B: Extract ALL PayCodes from free text
function extractPayCodes(message) {
    if (!message) return [];

    const normalized = message.toUpperCase().replace(/\s+/g, ' ').trim();

    // Detect CCH followed by EXACTLY 6 digits, anywhere in text
    const matches = normalized.match(/\bCCH\d{6}\b/g);

    return matches || [];
}

// Send WhatsApp message
async function sendMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error('❌ Error sending message:', error.message);
    }
}

function getServiceEmoji(serviceType) {
    return {
        schools: '🏫',
        city_council: '🏛️',
        insurance: '🛡️',
        retail: '🛒'
    }[serviceType] || '💳';
}

function getServiceDisplayName(serviceType) {
    return {
        schools: 'School Fees',
        city_council: 'City Council',
        insurance: 'Insurance',
        retail: 'Retail'
    }[serviceType] || serviceType;
}

// ==================== PAYCODE HANDLING ====================

async function handlePayCode(from, message) {
    console.log(`🔍 PayCode scan from ${from}: "${message}"`);

    const payCodes = extractPayCodes(message);

    if (payCodes.length === 0) {
        await sendMessage(
            from,
            `❌ No valid PayCode found.\n\n` +
            `Please send a valid PayCode starting with CCH followed by 6 digits.\n\n` +
            `Example: *CCH123456*`
        );
        return;
    }

    if (payCodes.length > 1) {
        await sendMessage(
            from,
            `⚠️ I found *more than one PayCode* in your message:\n` +
            `${payCodes.join(', ')}\n\n` +
            `Please send *only one PayCode* to continue.\n\n` +
            `Example:\nCCH123456`
        );
        return;
    }

    // Exactly ONE paycode
    const payCode = payCodes[0];

    try {
        console.log(`🔐 Verifying PayCode: ${payCode}`);
        console.log(`🌐 API URL: ${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/get-biller-code/${payCode}`);
        console.log(`🔑 Token present: ${!!process.env.CCHUB_BOT_TOKEN}`);
        
        // Test the API endpoint directly first
        const apiUrl = `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/get-biller-code/${payCode}`;
        console.log(`📡 Testing API endpoint: ${apiUrl}`);

        const response = await axios.get(
            apiUrl,
            {
                headers: { 
                    'X-CCHUB-TOKEN': process.env.CCHUB_BOT_TOKEN,
                    'User-Agent': 'CCHub-WhatsApp-Bot/1.0'
                },
                timeout: 10000,
                // Add axios interceptors for debugging
                transformResponse: [(data) => {
                    console.log('📥 Raw API Response:', data);
                    return data;
                }]
            }
        );

        console.log('📊 API Response Status:', response.status);
        console.log('📦 API Response Headers:', JSON.stringify(response.headers));
        console.log('📄 API Response Data:', JSON.stringify(response.data, null, 2));

        const data = response.data;

        if (!data) {
            console.error('❌ API returned empty response');
            await sendMessage(
                from,
                `⚠️ The server returned an empty response.\n\n` +
                `Please try again or contact support.`
            );
            return;
        }

        if (data.status !== 'success') {
            console.error('❌ API returned non-success status:', data.status);
            console.error('❌ Error message:', data.message || 'No error message');
            
            await sendMessage(
                from,
                `❌ This PayCode is not valid.\n\n` +
                `Status: ${data.status}\n` +
                `Message: ${data.message || 'Code may be expired or already used'}\n\n` +
                `Please generate a new PayCode from the website.`
            );
            return;
        }

        // Validate required fields
        const requiredFields = ['service_type', 'provider_name', 'biller_code'];
        const missingFields = requiredFields.filter(field => !data[field]);
        
        if (missingFields.length > 0) {
            console.error('❌ Missing required fields:', missingFields);
            await sendMessage(
                from,
                `⚠️ Incomplete PayCode data.\n\n` +
                `Missing: ${missingFields.join(', ')}\n\n` +
                `Please contact support.`
            );
            return;
        }

        paymentSessions[from] = {
            payCode,
            serviceType: data.service_type,
            providerName: data.provider_name,
            billerCode: data.biller_code,
            stage: 'amount_entry',
            transactionType: 'paycode_payment',
            timestamp: Date.now()
        };

        console.log(`✅ PayCode verified successfully for ${from}:`, {
            serviceType: data.service_type,
            providerName: data.provider_name,
            billerCode: data.biller_code
        });

        await sendMessage(
            from,
            `${getServiceEmoji(data.service_type)} *Payment detected ✅*\n\n` +
            `Service: ${getServiceDisplayName(data.service_type)}\n` +
            `Provider: ${data.provider_name}\n` +
            `Biller Code: ${data.biller_code}\n\n` +
            `Please enter the amount to pay (ZWL).\n\n` +
            `*Example:* 15000`
        );

    } catch (error) {
        console.error('❌ PayCode verification error:');
        console.error('📛 Error name:', error.name);
        console.error('📝 Error message:', error.message);
        console.error('🔗 Error URL:', error.config?.url);
        console.error('🔑 Request headers:', error.config?.headers);
        
        if (error.response) {
            console.error('📡 Response Status:', error.response.status);
            console.error('📋 Response Headers:', error.response.headers);
            console.error('📄 Response Data:', error.response.data);
        } else if (error.request) {
            console.error('🌐 No response received. Request was made but no response.');
            console.error('Request details:', error.request);
        }
        
        let errorMessage = `⚠️ Unable to verify PayCode right now.\n\n`;
        
        if (error.code === 'ECONNREFUSED') {
            errorMessage += `Cannot connect to the server. Please check if the WordPress site is running.`;
        } else if (error.code === 'ETIMEDOUT') {
            errorMessage += `Connection timeout. The server is taking too long to respond.`;
        } else if (error.response) {
            if (error.response.status === 401) {
                errorMessage += `Authentication failed. Invalid token.`;
            } else if (error.response.status === 404) {
                errorMessage += `PayCode endpoint not found. Please check the API URL.`;
            } else if (error.response.status === 500) {
                errorMessage += `Server error. Please try again later.`;
            } else {
                errorMessage += `Server returned status: ${error.response.status}`;
            }
        } else {
            errorMessage += `Please try again in a moment.`;
        }
        
        await sendMessage(from, errorMessage);
    }
}

// ==================== PAYMENT PROCESSING ====================

async function processPayment(from, amount) {
    const session = paymentSessions[from];
    
    if (!session) {
        await sendWelcomeMessage(from);
        return;
    }

    try {
        // Send payment request to your payment gateway
        const paymentResponse = await axios.post(
            `${process.env.PAYMENT_GATEWAY_URL}/process-payment`,
            {
                phone: from,
                amount: amount,
                payCode: session.payCode,
                billerCode: session.billerCode,
                serviceType: session.serviceType,
                providerName: session.providerName
            },
            {
                headers: { 'Authorization': `Bearer ${process.env.PAYMENT_API_KEY}` }
            }
        );

        if (paymentResponse.data.success) {
            await sendMessage(
                from,
                `✅ *Payment Successful!*\n\n` +
                `Amount: ZWL ${amount.toLocaleString()}\n` +
                `Service: ${getServiceDisplayName(session.serviceType)}\n` +
                `Reference: ${paymentResponse.data.reference}\n` +
                `Date: ${new Date().toLocaleString()}\n\n` +
                `Thank you for using CCHub!`
            );
        } else {
            await sendMessage(
                from,
                `❌ *Payment Failed*\n\n` +
                `Reason: ${paymentResponse.data.message || 'Payment processing failed'}\n\n` +
                `Please try again or contact support.`
            );
        }
    } catch (error) {
        console.error('Payment processing error:', error.message);
        await sendMessage(
            from,
            `⚠️ *Payment Processing Error*\n\n` +
            `We encountered an issue processing your payment.\n` +
            `Please try again in a few minutes.`
        );
    }
    
    // Clear session after payment attempt
    delete paymentSessions[from];
}

// ==================== ZESA & AIRTIME HANDLING ====================

async function handleZesaPurchase(from, message) {
    const clean = message.trim().toLowerCase();
    
    if (clean === '2') {
        paymentSessions[from] = {
            stage: 'zesa_meter_entry',
            transactionType: 'zesa_purchase',
            timestamp: Date.now()
        };
        
        await sendMessage(
            from,
            `⚡ *ZESA Purchase*\n\n` +
            `Please enter your meter number:\n\n` +
            `*Example:* 12345678901`
        );
        return;
    }
    
    const session = paymentSessions[from];
    
    if (session && session.transactionType === 'zesa_purchase') {
        if (session.stage === 'zesa_meter_entry') {
            // Validate meter number (ZESA meters are usually 11 digits)
            const meterRegex = /^\d{10,12}$/;
            if (!meterRegex.test(clean)) {
                await sendMessage(
                    from,
                    `❌ Invalid meter number.\n\n` +
                    `Please enter a valid ZESA meter number (10-12 digits).\n\n` +
                    `*Example:* 12345678901`
                );
                return;
            }
            
            paymentSessions[from].stage = 'zesa_amount_entry';
            paymentSessions[from].meterNumber = clean;
            paymentSessions[from].timestamp = Date.now();
            
            await sendMessage(
                from,
                `✅ Meter number saved: ${clean}\n\n` +
                `Now enter the amount to purchase (ZWL).\n\n` +
                `*Example:* 5000`
            );
        } else if (session.stage === 'zesa_amount_entry') {
            const amount = parseInt(clean);
            if (isNaN(amount) || amount < 50 || amount > 100000) {
                await sendMessage(
                    from,
                    `❌ Invalid amount.\n\n` +
                    `Please enter an amount between ZWL 50 and ZWL 100,000.\n\n` +
                    `*Example:* 5000`
                );
                return;
            }
            
            // Process ZESA purchase
            await processZesaPayment(from, amount, session.meterNumber);
        }
    }
}

async function processZesaPayment(from, amount, meterNumber) {
    try {
        // Call ZESA API
        await sendMessage(
            from,
            `⚡ *Processing ZESA Purchase...*\n\n` +
            `Meter: ${meterNumber}\n` +
            `Amount: ZWL ${amount.toLocaleString()}\n\n` +
            `Please wait...`
        );
        
        // Simulate payment processing (replace with actual ZESA API call)
        const zesaResponse = await axios.post(
            `${process.env.ZESA_API_URL}/purchase`,
            {
                meter: meterNumber,
                amount: amount,
                phone: from
            }
        );
        
        if (zesaResponse.data.success) {
            await sendMessage(
                from,
                `✅ *ZESA Purchase Successful!*\n\n` +
                `Meter: ${meterNumber}\n` +
                `Amount: ZWL ${amount.toLocaleString()}\n` +
                `Tokens: ${zesaResponse.data.tokens}\n` +
                `Reference: ${zesaResponse.data.reference}\n\n` +
                `Thank you for using CCHub!`
            );
        } else {
            await sendMessage(
                from,
                `❌ *ZESA Purchase Failed*\n\n` +
                `Reason: ${zesaResponse.data.message}\n\n` +
                `Please try again or contact support.`
            );
        }
    } catch (error) {
        console.error('ZESA purchase error:', error.message);
        await sendMessage(
            from,
            `⚠️ *ZESA Service Unavailable*\n\n` +
            `We're unable to process ZESA purchases at the moment.\n` +
            `Please try again later.`
        );
    }
    
    delete paymentSessions[from];
}

async function handleAirtimePurchase(from, message) {
    const clean = message.trim().toLowerCase();
    
    if (clean === '3') {
        paymentSessions[from] = {
            stage: 'airtime_amount_entry',
            transactionType: 'airtime_purchase',
            timestamp: Date.now()
        };
        
        await sendMessage(
            from,
            `📱 *Airtime Purchase*\n\n` +
            `Enter the amount of airtime to purchase (ZWL).\n\n` +
            `*Example:* 100\n\n` +
            `Note: Airtime will be sent to ${from}`
        );
        return;
    }
    
    const session = paymentSessions[from];
    
    if (session && session.transactionType === 'airtime_purchase' && session.stage === 'airtime_amount_entry') {
        const amount = parseInt(clean);
        if (isNaN(amount) || amount < 10 || amount > 50000) {
            await sendMessage(
                from,
                `❌ Invalid amount.\n\n` +
                `Please enter an amount between ZWL 10 and ZWL 50,000.\n\n` +
                `*Example:* 100`
            );
            return;
        }
        
        await processAirtimePayment(from, amount);
    }
}

async function processAirtimePayment(from, amount) {
    try {
        await sendMessage(
            from,
            `📱 *Processing Airtime Purchase...*\n\n` +
            `Phone: ${from}\n` +
            `Amount: ZWL ${amount.toLocaleString()}\n\n` +
            `Please wait...`
        );
        
        // Simulate airtime purchase (replace with actual API call)
        const airtimeResponse = await axios.post(
            `${process.env.AIRTIME_API_URL}/purchase`,
            {
                phone: from,
                amount: amount
            }
        );
        
        if (airtimeResponse.data.success) {
            await sendMessage(
                from,
                `✅ *Airtime Purchase Successful!*\n\n` +
                `Phone: ${from}\n` +
                `Amount: ZWL ${amount.toLocaleString()}\n` +
                `Reference: ${airtimeResponse.data.reference}\n\n` +
                `Your airtime should arrive shortly.`
            );
        } else {
            await sendMessage(
                from,
                `❌ *Airtime Purchase Failed*\n\n` +
                `Reason: ${airtimeResponse.data.message}\n\n` +
                `Please try again.`
            );
        }
    } catch (error) {
        console.error('Airtime purchase error:', error.message);
        await sendMessage(
            from,
            `⚠️ *Airtime Service Unavailable*\n\n` +
            `We're unable to process airtime purchases at the moment.\n` +
            `Please try again later.`
        );
    }
    
    delete paymentSessions[from];
}

// ==================== HELP FUNCTION ====================

async function sendHelpMessage(from) {
    await sendMessage(
        from,
        `❓ *CCHub Help Center*\n\n` +
        `*Available Services:*\n` +
        `1️⃣ *Pay Bill* - Pay using a PayCode from our website\n` +
        `2️⃣ *Buy ZESA* - Purchase electricity tokens\n` +
        `3️⃣ *Buy Airtime* - Top up your mobile phone\n\n` +
        `*How to use:*\n` +
        `• Send "Hi" to start\n` +
        `• Reply with 1, 2, 3 or 4\n` +
        `• Follow the prompts\n\n` +
        `*PayCode Format:* CCH followed by 6 digits\n` +
        `*Example:* CCH123456\n\n` +
        `*Support:*\n` +
        `For assistance, call +263 XXX XXX XXX\n` +
        `or email support@cchub.co.zw`
    );
}

// ==================== MAIN MENU ====================

async function sendWelcomeMessage(from) {
    delete paymentSessions[from];

    await sendMessage(
        from,
        `👋 *Welcome to CCHub*\n\n` +
        `What would you like to do?\n\n` +
        `1. Pay Bill (with PayCode)\n` +
        `2. Buy ZESA\n` +
        `3. Buy Airtime\n` +
        `4. Help\n\n` +
        `Reply with 1, 2, 3 or 4`
    );
}

// ==================== MAIN MESSAGE PROCESSOR ====================

async function processMessage(from, messageText) {
    console.log(`📩 From ${from}: "${messageText}"`);

    const clean = messageText.trim().toLowerCase();

    if (clean === 'hi' || clean === 'hello' || clean === 'menu') {
        await sendWelcomeMessage(from);
        return;
    }

    // Check for help request
    if (clean === '4' || clean === 'help') {
        await sendHelpMessage(from);
        return;
    }

    // A + B: PayCode ALWAYS takes priority
    const payCodes = extractPayCodes(messageText);
    if (payCodes.length > 0) {
        await handlePayCode(from, messageText);
        return;
    }

    const session = paymentSessions[from];

    // Handle main menu options
    if (!session) {
        switch (clean) {
            case '1':
                await sendMessage(
                    from,
                    `💳 *Pay with PayCode*\n\n` +
                    `Please send your PayCode (CCH followed by 6 digits).\n\n` +
                    `*Example:* CCH123456\n\n` +
                    `You can get a PayCode from our website.`
                );
                return;
                
            case '2':
                await handleZesaPurchase(from, '2');
                return;
                
            case '3':
                await handleAirtimePurchase(from, '3');
                return;
                
            default:
                await sendWelcomeMessage(from);
                return;
        }
    }

    // Handle existing sessions
    if (session.stage === 'amount_entry' && session.transactionType === 'paycode_payment') {
        const amount = parseInt(clean.replace(/[^0-9]/g, ''));
        if (isNaN(amount) || amount <= 0 || amount > 1000000) {
            await sendMessage(
                from,
                `❌ Please enter a valid amount between ZWL 1 and ZWL 1,000,000.\n\n` +
                `*Example:* 15000`
            );
            return;
        }

        await processPayment(from, amount);
        return;
    }

    // Handle ZESA flow
    if (session.transactionType === 'zesa_purchase') {
        await handleZesaPurchase(from, clean);
        return;
    }

    // Handle Airtime flow
    if (session.transactionType === 'airtime_purchase') {
        await handleAirtimePurchase(from, clean);
        return;
    }

    // If we get here, something went wrong
    await sendWelcomeMessage(from);
}

// ==================== WEBHOOK ====================

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
            console.log('✅ Webhook verified');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        
        // Check if this is a WhatsApp status update
        if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
            console.log('📊 Status update received');
            return res.sendStatus(200);
        }
        
        const entry = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        
        if (entry && entry.type === 'text') {
            await processMessage(entry.from, entry.text.body);
        }
        
        res.sendStatus(200);
    } catch (err) {
        console.error('Webhook error:', err);
        res.sendStatus(500);
    }
});

app.get('/', (req, res) => {
    res.send('🚀 CCHub WhatsApp Bot is running!');
});

// ==================== DEBUG/TEST ENDPOINTS ====================

app.get('/test-paycode/:paycode', async (req, res) => {
    const payCode = req.params.paycode;
    
    if (!/^CCH\d{6}$/.test(payCode.toUpperCase())) {
        return res.json({ error: 'Invalid PayCode format' });
    }
    
    try {
        const response = await axios.get(
            `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/get-biller-code/${payCode}`,
            {
                headers: { 
                    'X-CCHUB-TOKEN': process.env.CCHUB_BOT_TOKEN,
                    'User-Agent': 'CCHub-Test/1.0'
                },
                timeout: 10000
            }
        );
        
        res.json({
            status: 'success',
            request: {
                url: `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/get-biller-code/${payCode}`,
                headers: { 'X-CCHUB-TOKEN': '***HIDDEN***' }
            },
            response: {
                status: response.status,
                headers: response.headers,
                data: response.data
            }
        });
    } catch (error) {
        res.json({
            status: 'error',
            error: {
                name: error.name,
                message: error.message,
                code: error.code,
                response: error.response ? {
                    status: error.response.status,
                    data: error.response.data
                } : null,
                config: {
                    url: error.config?.url,
                    headers: { ...error.config?.headers, 'X-CCHUB-TOKEN': '***HIDDEN***' }
                }
            }
        });
    }
});

// Add this test route to your bot code
app.get('/debug/wordpress-endpoints', async (req, res) => {
    try {
        // Get ALL WordPress REST API endpoints
        const response = await axios.get('https://cchub.co.zw/wp-json/');
        
        // Filter for CCHub related endpoints
        const cchubEndpoints = {};
        for (const [route, endpoint] of Object.entries(response.data.routes)) {
            if (route.includes('cchub') || route.includes('cch')) {
                cchubEndpoints[route] = endpoint;
            }
        }
        
        res.json({
            allRoutes: Object.keys(response.data.routes).filter(r => r.includes('cch')),
            cchubEndpoints: cchubEndpoints,
            rawResponse: response.data
        });
        
    } catch (error) {
        res.json({
            error: error.message,
            details: error.response?.data || 'No response'
        });
    }
});

// ==================== SIMPLE TEST ENDPOINTS ====================

// Test environment variables
app.get('/debug/env-check', (req, res) => {
    res.json({
        port: process.env.PORT,
        hasPhoneNumberId: !!process.env.PHONE_NUMBER_ID,
        hasWhatsappToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
        hasWordpressUrl: !!process.env.WORDPRESS_API_URL,
        hasBotToken: !!process.env.CCHUB_BOT_TOKEN,
        wordpressUrl: process.env.WORDPRESS_API_URL,
        botTokenLength: process.env.CCHUB_BOT_TOKEN?.length || 0,
        botTokenFirst5: process.env.CCHUB_BOT_TOKEN?.substring(0, 5) + '...'
    });
});

// Simple test endpoint
app.get('/debug/test', (req, res) => {
    res.json({ 
        message: 'Debug endpoint is working!',
        timestamp: new Date().toISOString(),
        server: 'CCHub WhatsApp Bot'
    });
});

// Test WordPress connection with multiple endpoint patterns
app.get('/debug/test-wp-endpoints', async (req, res) => {
    const testCode = req.query.code || 'CCH123456';
    const results = [];
    
    const endpoints = [
        `https://cchub.co.zw/wp-json/cchub/v1/get-biller-code/${testCode}`,
        `https://cchub.co.zw/wp-json/cch/v1/get-biller-code/${testCode}`,
        `https://cchub.co.zw/wp-json/cchub/v1/verify/${testCode}`,
        `https://cchub.co.zw/wp-json/cchub/v1/paycode/${testCode}`,
        `https://cchub.co.zw/wp-json/cchub/v1/validate/${testCode}`,
    ];
    
    for (const endpoint of endpoints) {
        try {
            const response = await axios.get(endpoint, {
                headers: { 
                    'X-CCHUB-TOKEN': process.env.CCHUB_BOT_TOKEN || 'test-token',
                    'Accept': 'application/json'
                },
                timeout: 5000
            });
            results.push({
                endpoint: endpoint,
                status: '✅ WORKING',
                statusCode: response.status,
                data: response.data
            });
        } catch (error) {
            results.push({
                endpoint: endpoint,
                status: '❌ FAILED',
                error: error.message,
                statusCode: error.response?.status,
                details: error.response?.data || 'No response data'
            });
        }
    }
    
    res.json({
        testPayCode: testCode,
        results: results
    });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
    console.log(`🚀 CCHub Bot running on port ${PORT}`);
    console.log(`🌐 Debug endpoints available:`);
    console.log(`   http://localhost:${PORT}/debug/test`);
    console.log(`   http://localhost:${PORT}/debug/env-check`);
    console.log(`   http://localhost:${PORT}/debug/wordpress-endpoints`);
    console.log(`   http://localhost:${PORT}/debug/test-wp-endpoints?code=CCH123456`);
});
