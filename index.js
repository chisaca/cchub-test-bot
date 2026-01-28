const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Store payment sessions
const paymentSessions = {};

// ==================== HELPER FUNCTIONS ====================

// Extract PayCode from message
function extractPayCode(message) {
    const cleanMessage = message.trim().toUpperCase();
    
    // Pattern: CCH followed by 6 digits
    const match = cleanMessage.match(/CCH(\d{6})/);
    if (match) {
        return 'CCH' + match[1];
    }
    
    return null;
}

// Clean and validate PayCode
function cleanPayCode(payCode) {
    if (!payCode) return null;
    
    let cleaned = payCode.trim().toUpperCase();
    cleaned = cleaned.replace(/[^A-Z0-9]/g, '');
    
    // If just 6 digits, add CCH prefix
    if (/^\d{6}$/.test(cleaned)) {
        cleaned = 'CCH' + cleaned;
    }
    
    // Final validation
    if (!/^CCH\d{6}$/.test(cleaned)) {
        return null;
    }
    
    return cleaned;
}

// Send WhatsApp message
async function sendMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
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
        console.log('✅ Message sent to', to);
    } catch (error) {
        console.error('❌ Error sending message:', error.message);
    }
}

// Get emoji for service type
function getServiceEmoji(serviceType) {
    const emojis = {
        'schools': '🏫',
        'city_council': '🏛️',
        'insurance': '🛡️',
        'retail': '🛒'
    };
    return emojis[serviceType] || '💳';
}

// Get display name for service
function getServiceDisplayName(serviceType) {
    const names = {
        'schools': 'School Fees',
        'city_council': 'City Council',
        'insurance': 'Insurance',
        'retail': 'Retail'
    };
    return names[serviceType] || serviceType;
}

// ==================== PAYCODE HANDLING ====================

async function handlePayCode(from, message) {
    console.log(`🔍 Processing PayCode from ${from}: "${message}"`);
    
    // Extract PayCode
    const rawPayCode = extractPayCode(message);
    if (!rawPayCode) {
        await sendMessage(from, `❌ No PayCode found\n\nPlease send a PayCode like this:\nCCH123456\n\nExample: CCH789012`);
        return;
    }
    
    // Clean and validate
    const payCode = cleanPayCode(rawPayCode);
    if (!payCode) {
        await sendMessage(from, `❌ PayCode format not correct\n\nShould be: CCH123456\n\nExample: CCH789012`);
        return;
    }
    
    // Verify PayCode with WordPress
    try {
        console.log(`🔐 Verifying PayCode: ${payCode}`);
        
        const response = await axios.get(
            `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/get-biller-code/${payCode}`,
            {
                headers: {
                    'X-CCHUB-TOKEN': process.env.CCHUB_BOT_TOKEN
                },
                timeout: 10000
            }
        );
        
        const data = response.data;
        
        if (data.status !== 'success') {
            await sendMessage(from, `❌ PayCode not valid\n\nPossible reasons:\n• Already used\n• Expired\n• Wrong PayCode\n\nGet a new PayCode from our website.`);
            return;
        }
        
        // Save session
        paymentSessions[from] = {
            payCode: payCode,
            serviceType: data.service_type,
            providerName: data.provider_name,
            billerCode: data.biller_code,
            stage: 'amount_entry',
            timestamp: Date.now()
        };
        
        const emoji = getServiceEmoji(data.service_type);
        const serviceName = getServiceDisplayName(data.service_type);
        
        await sendMessage(from, 
            `${emoji} *Payment detected ✅*\n\n` +
            `Service: ${serviceName}\n` +
            `Provider: ${data.provider_name}\n` +
            `Biller Code: ${data.biller_code}\n\n` +
            `Please enter the amount to pay.`
        );
        
    } catch (error) {
        console.error('❌ Error verifying PayCode:', error.message);
        
        if (error.response?.status === 404) {
            await sendMessage(from, `❌ PayCode not found\n\nThis PayCode doesn't exist.\n\nGet a new PayCode from our website.`);
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            await sendMessage(from, `⚠️ Connection problem\n\nPlease try again in 1 minute.`);
        } else {
            await sendMessage(from, `⚠️ System busy\n\nPlease try again in 2 minutes.`);
        }
    }
}

// ==================== BILL PAYMENT FLOW ====================

async function processBillAmount(from, amountText) {
    const session = paymentSessions[from];
    if (!session || session.stage !== 'amount_entry') {
        await sendWelcomeMessage(from);
        return;
    }
    
    const amount = parseInt(amountText);
    
    if (isNaN(amount) || amount <= 0) {
        await sendMessage(from, `❌ Amount not valid\n\nPlease enter a valid amount.\n\nExample: 100000 for ZWL 100,000`);
        return;
    }
    
    // Calculate service fee (4%)
    const serviceFee = Math.round(amount * 0.04);
    const total = amount + serviceFee;
    
    // Update session
    paymentSessions[from] = {
        ...session,
        amount: amount,
        serviceFee: serviceFee,
        total: total,
        stage: 'confirmation'
    };
    
    const emoji = getServiceEmoji(session.serviceType);
    const serviceName = getServiceDisplayName(session.serviceType);
    
    await sendMessage(from,
        `📋 *Payment Summary*\n\n` +
        `${emoji} ${serviceName}\n` +
        `Provider: ${session.providerName}\n` +
        `Biller Code: ${session.billerCode}\n\n` +
        `Amount: ZWL ${amount.toLocaleString()}\n` +
        `Service Fee: ZWL ${serviceFee.toLocaleString()}\n` +
        `Total: ZWL ${total.toLocaleString()}\n` +
        `Payment Method: EcoCash\n\n` +
        `1. Confirm Payment\n` +
        `2. Cancel`
    );
}

async function confirmPayment(from, choice) {
    const session = paymentSessions[from];
    if (!session || session.stage !== 'confirmation') {
        await sendWelcomeMessage(from);
        return;
    }
    
    if (choice === '1') {
        // Simulate payment processing
        const transactionId = 'EC' + Date.now().toString().slice(-8);
        
        const emoji = getServiceEmoji(session.serviceType);
        const serviceName = getServiceDisplayName(session.serviceType);
        
        await sendMessage(from,
            `✅ *Payment successful*\n\n` +
            `${emoji} ${serviceName}\n` +
            `Provider: ${session.providerName}\n` +
            `Reference: ${transactionId}\n` +
            `Amount: ZWL ${session.amount.toLocaleString()}\n` +
            `Payment Method: EcoCash\n\n` +
            `Thank you for using CCHub!`
        );
        
        // Clear session
        delete paymentSessions[from];
        
    } else if (choice === '2') {
        await sendMessage(from, `Payment cancelled.\n\nGoing back to main menu.`);
        delete paymentSessions[from];
        await sendWelcomeMessage(from);
    } else {
        await sendMessage(from, `Please choose:\n1. Confirm Payment\n2. Cancel`);
    }
}

// ==================== ZESA FLOW ====================

async function startZesaFlow(from) {
    paymentSessions[from] = {
        service: 'zesa',
        stage: 'meter_entry'
    };
    
    await sendMessage(from,
        `⚡ *Buy ZESA*\n\n` +
        `Please enter your ZESA meter number.\n\n` +
        `Example: 12345678901\n\n` +
        `Or type "hi" to go back.`
    );
}

async function processZesaMeter(from, meterNumber) {
    const session = paymentSessions[from];
    if (!session || session.service !== 'zesa') {
        await sendWelcomeMessage(from);
        return;
    }
    
    if (!/^\d{10,}$/.test(meterNumber)) {
        await sendMessage(from, `❌ Meter number not valid\n\nPlease enter 10 or more digits.\n\nExample: 12345678901`);
        return;
    }
    
    // Save meter and move to amount
    paymentSessions[from] = {
        ...session,
        meterNumber: meterNumber,
        stage: 'zesa_amount'
    };
    
    await sendMessage(from,
        `✅ Meter number received\n\n` +
        `Meter: ${meterNumber}\n\n` +
        `How much would you like to pay?\n\n` +
        `Example: 10 for $10\n\n` +
        `Minimum: $1`
    );
}

async function processZesaAmount(from, amountText) {
    const session = paymentSessions[from];
    if (!session || session.service !== 'zesa' || session.stage !== 'zesa_amount') {
        await sendWelcomeMessage(from);
        return;
    }
    
    const amount = parseFloat(amountText);
    
    if (isNaN(amount) || amount < 1) {
        await sendMessage(from, `❌ Amount not valid\n\nPlease enter amount (minimum $1).\n\nExample: 10 for $10`);
        return;
    }
    
    // Calculate service fee (5%)
    const serviceFee = (amount * 0.05).toFixed(2);
    const total = (amount + parseFloat(serviceFee)).toFixed(2);
    
    // Generate test token
    const token = Array.from({length: 4}, () => 
        Math.floor(1000 + Math.random() * 9000)
    ).join('-');
    
    await sendMessage(from,
        `📋 *ZESA Payment*\n\n` +
        `Meter: ${session.meterNumber}\n` +
        `Token: ${token}\n\n` +
        `Amount: $${amount.toFixed(2)}\n` +
        `Service Fee: $${serviceFee}\n` +
        `Total: $${total}\n` +
        `Payment Method: EcoCash\n\n` +
        `1. Confirm Payment\n` +
        `2. Cancel`
    );
    
    // Update session for confirmation
    paymentSessions[from] = {
        ...session,
        amount: amount,
        serviceFee: serviceFee,
        total: total,
        token: token,
        stage: 'zesa_confirm'
    };
}

async function confirmZesaPayment(from, choice) {
    const session = paymentSessions[from];
    if (!session || session.service !== 'zesa' || session.stage !== 'zesa_confirm') {
        await sendWelcomeMessage(from);
        return;
    }
    
    if (choice === '1') {
        const reference = 'ZESA-' + Date.now().toString().slice(-6);
        
        await sendMessage(from,
            `✅ *ZESA payment successful*\n\n` +
            `Meter: ${session.meterNumber}\n` +
            `Token: ${session.token}\n` +
            `Amount: $${session.amount.toFixed(2)}\n` +
            `Reference: ${reference}\n` +
            `Payment Method: EcoCash\n\n` +
            `Thank you for using CCHub!`
        );
        
        delete paymentSessions[from];
        
    } else if (choice === '2') {
        await sendMessage(from, `Payment cancelled.\n\nGoing back to main menu.`);
        delete paymentSessions[from];
        await sendWelcomeMessage(from);
    } else {
        await sendMessage(from, `Please choose:\n1. Confirm Payment\n2. Cancel`);
    }
}

// ==================== AIRTIME FLOW ====================

async function startAirtimeFlow(from) {
    paymentSessions[from] = {
        service: 'airtime',
        stage: 'phone_entry'
    };
    
    await sendMessage(from,
        `📱 *Buy Airtime*\n\n` +
        `Please enter the phone number to receive airtime.\n\n` +
        `Format: 0770123456\n` +
        `(10 digits, starts with 0)\n\n` +
        `Or type "hi" to go back.`
    );
}

async function processAirtimePhone(from, phoneNumber) {
    const session = paymentSessions[from];
    if (!session || session.service !== 'airtime') {
        await sendWelcomeMessage(from);
        return;
    }
    
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    if (cleanPhone.length !== 10 || !cleanPhone.startsWith('0')) {
        await sendMessage(from, `❌ Phone number not valid\n\nPlease enter 10 digits starting with 0.\n\nExample: 0770123456`);
        return;
    }
    
    // Detect network
    let network = 'Unknown';
    if (cleanPhone.startsWith('077') || cleanPhone.startsWith('078')) {
        network = 'Econet';
    } else if (cleanPhone.startsWith('071')) {
        network = 'NetOne';
    } else if (cleanPhone.startsWith('073')) {
        network = 'Telecel';
    } else {
        await sendMessage(from, `❌ Network not supported\n\nPlease use numbers starting with: 077, 078, 071, or 073`);
        return;
    }
    
    paymentSessions[from] = {
        ...session,
        phoneNumber: cleanPhone,
        network: network,
        stage: 'airtime_amount'
    };
    
    await sendMessage(from,
        `✅ Phone number received\n\n` +
        `To: ${cleanPhone}\n` +
        `Network: ${network}\n\n` +
        `How much airtime would you like?\n\n` +
        `1. ZWL 5,000\n` +
        `2. ZWL 10,000\n` +
        `3. ZWL 20,000\n` +
        `4. Other amount\n\n` +
        `Choose 1, 2, 3 or 4`
    );
}

async function processAirtimeAmountChoice(from, choice) {
    const session = paymentSessions[from];
    if (!session || session.service !== 'airtime' || session.stage !== 'airtime_amount') {
        await sendWelcomeMessage(from);
        return;
    }
    
    const options = {
        '1': 5000,
        '2': 10000,
        '3': 20000,
        '4': 'other'
    };
    
    if (!options[choice]) {
        await sendMessage(from, `Please choose 1, 2, 3 or 4.`);
        return;
    }
    
    if (choice === '4') {
        paymentSessions[from].stage = 'airtime_custom';
        await sendMessage(from, `Please enter your amount (minimum ZWL 100):\n\nExample: 15000 for ZWL 15,000`);
    } else {
        await processAirtimeAmount(from, options[choice]);
    }
}

async function processAirtimeAmount(from, amount) {
    const session = paymentSessions[from];
    if (!session || session.service !== 'airtime') {
        await sendWelcomeMessage(from);
        return;
    }
    
    const amountValue = typeof amount === 'string' ? parseInt(amount) : amount;
    
    if (isNaN(amountValue) || amountValue < 100) {
        await sendMessage(from, `❌ Amount not valid\n\nMinimum: ZWL 100\n\nExample: 15000 for ZWL 15,000`);
        return;
    }
    
    // Calculate service fee (8%)
    const serviceFee = (amountValue * 0.08).toFixed(2);
    const total = (amountValue + parseFloat(serviceFee)).toFixed(2);
    
    await sendMessage(from,
        `📋 *Airtime Payment*\n\n` +
        `To: ${session.phoneNumber}\n` +
        `Network: ${session.network}\n\n` +
        `Airtime: ZWL ${amountValue.toLocaleString()}\n` +
        `Service Fee: ZWL ${serviceFee}\n` +
        `Total: ZWL ${total}\n` +
        `Payment Method: EcoCash\n\n` +
        `1. Confirm Payment\n` +
        `2. Cancel`
    );
    
    paymentSessions[from] = {
        ...session,
        amount: amountValue,
        serviceFee: serviceFee,
        total: total,
        stage: 'airtime_confirm'
    };
}

async function confirmAirtimePayment(from, choice) {
    const session = paymentSessions[from];
    if (!session || session.service !== 'airtime' || session.stage !== 'airtime_confirm') {
        await sendWelcomeMessage(from);
        return;
    }
    
    if (choice === '1') {
        const reference = 'AIR-' + Date.now().toString().slice(-8);
        
        await sendMessage(from,
            `✅ *Airtime sent successfully*\n\n` +
            `To: ${session.phoneNumber}\n` +
            `Amount: ZWL ${session.amount.toLocaleString()}\n` +
            `Network: ${session.network}\n` +
            `Reference: ${reference}\n` +
            `Payment Method: EcoCash\n\n` +
            `Thank you for using CCHub!`
        );
        
        delete paymentSessions[from];
        
    } else if (choice === '2') {
        await sendMessage(from, `Payment cancelled.\n\nGoing back to main menu.`);
        delete paymentSessions[from];
        await sendWelcomeMessage(from);
    } else {
        await sendMessage(from, `Please choose:\n1. Confirm Payment\n2. Cancel`);
    }
}

// ==================== MAIN MENU ====================

async function sendWelcomeMessage(from) {
    // Clear any existing session
    delete paymentSessions[from];
    
    await sendMessage(from,
        `👋 *Welcome to CCHub*\n\n` +
        `What would you like to do?\n\n` +
        `1. Pay Bill (with PayCode)\n` +
        `2. Buy ZESA\n` +
        `3. Buy Airtime\n` +
        `4. Help\n\n` +
        `Reply with 1, 2, 3 or 4`
    );
}

async function showHelp(from) {
    await sendMessage(from,
        `❓ *Help*\n\n` +
        `*Pay Bill:*\n` +
        `1. Get PayCode from website\n` +
        `2. Send PayCode here\n` +
        `3. Enter amount\n` +
        `4. Confirm payment\n\n` +
        `*PayCode format:* CCH123456\n\n` +
        `*ZESA:*\n` +
        `Enter meter number and amount\n\n` +
        `*Airtime:*\n` +
        `Enter phone number and amount\n\n` +
        `🔗 *Website:* https://cchub.co.zw\n\n` +
        `Type "hi" to see main menu.`
    );
}

// ==================== MAIN MESSAGE PROCESSING ====================

async function processMessage(from, messageText) {
    console.log(`📱 Message from ${from}: "${messageText}"`);
    
    const cleanMessage = messageText.trim().toLowerCase();
    
    // Always respond to "hi"
    if (cleanMessage === 'hi' || cleanMessage === 'hello') {
        await sendWelcomeMessage(from);
        return;
    }
    
    // Check for PayCode first (always priority)
    if (extractPayCode(messageText)) {
        await handlePayCode(from, messageText);
        return;
    }
    
    // Get current session
    const session = paymentSessions[from];
    
    // Handle number choices
    if (/^\d+$/.test(cleanMessage)) {
        const choice = cleanMessage;
        
        // Main menu choices
        if (!session) {
            if (choice === '1') {
                await sendMessage(from,
                    `💳 *Pay Bill*\n\n` +
                    `To continue, please get a PayCode from our website.\n\n` +
                    `Once you have the PayCode, send it here.\n\n` +
                    `*PayCode format:* CCH123456\n\n` +
                    `🔗 *Website:* https://cchub.co.zw`
                );
            } else if (choice === '2') {
                await startZesaFlow(from);
            } else if (choice === '3') {
                await startAirtimeFlow(from);
            } else if (choice === '4') {
                await showHelp(from);
            } else {
                await sendMessage(from, `Please choose 1, 2, 3 or 4.`);
            }
            return;
        }
        
        // Handle confirmations
        if (session.stage === 'confirmation') {
            await confirmPayment(from, choice);
            return;
        }
        
        if (session.stage === 'zesa_confirm') {
            await confirmZesaPayment(from, choice);
            return;
        }
        
        if (session.stage === 'airtime_confirm') {
            await confirmAirtimePayment(from, choice);
            return;
        }
        
        // Handle airtime amount choice
        if (session.service === 'airtime' && session.stage === 'airtime_amount') {
            await processAirtimeAmountChoice(from, choice);
            return;
        }
    }
    
    // Handle amount entries
    if (session) {
        if (session.stage === 'amount_entry') {
            await processBillAmount(from, cleanMessage);
            return;
        }
        
        if (session.stage === 'zesa_amount') {
            await processZesaAmount(from, cleanMessage);
            return;
        }
        
        if (session.stage === 'airtime_custom') {
            await processAirtimeAmount(from, cleanMessage);
            return;
        }
        
        // Handle ZESA meter entry
        if (session.service === 'zesa' && session.stage === 'meter_entry') {
            await processZesaMeter(from, cleanMessage);
            return;
        }
        
        // Handle airtime phone entry
        if (session.service === 'airtime' && session.stage === 'phone_entry') {
            await processAirtimePhone(from, cleanMessage);
            return;
        }
    }
    
    // Default: show welcome message
    await sendWelcomeMessage(from);
}

// ==================== WEBHOOK ENDPOINTS ====================

// Webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ Webhook verified');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        res.sendStatus(403);
    }
});

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
    console.log('📨 Received webhook');
    
    try {
        const body = req.body;
        
        if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
                const message = body.entry[0].changes[0].value.messages[0];
                const from = message.from;
                const messageText = message.text.body;

                await processMessage(from, messageText);
            }
        }
        
        res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.sendStatus(500);
    }
});

// ==================== SERVER START ====================

app.get('/', (req, res) => {
    res.send('CCHub WhatsApp Bot - Simplified Logic');
});

app.listen(PORT, () => {
    console.log(`🚀 CCHub WhatsApp Bot running on port ${PORT}`);
    console.log(`💳 Bill Payment: PayCode only (CCH123456)`);
    console.log(`⚡ ZESA: Direct entry`);
    console.log(`📱 Airtime: Direct entry`);
    console.log(`🎯 All payments: EcoCash only`);
    console.log(`✅ Ready to receive messages!`);
});
