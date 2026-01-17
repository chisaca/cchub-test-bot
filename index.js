const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Store sessions in memory (for testing only)
const sessions = {};

// Helper function to create/update session
const updateSession = (whatsappNumber, data) => {
    const sessionId = `session_${whatsappNumber}_${Date.now()}`;
    sessions[sessionId] = {
        ...data,
        whatsappNumber,
        createdAt: Date.now(),
        expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    };
    return sessionId;
};

// Test meter numbers for simulation
const TEST_METERS = {
    '12345678901': {
        customerName: 'TEST USER - CHIDO MUTSVANGWA',
        area: 'TEST AREA - HARARE CBD',
        previousUnits: 15.50,
        isTest: true
    },
    '11111111111': {
        customerName: 'TEST USER - JOHN DOE',
        area: 'TEST AREA - BULAWAYO',
        previousUnits: 10.25,
        isTest: true
    },
    '22222222222': {
        customerName: 'TEST USER - JANE SMITH',
        area: 'TEST AREA - MUTARE',
        previousUnits: 20.75,
        isTest: true
    }
};

// Webhook verification endpoint (for Meta webhook setup)
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

// Main webhook endpoint to receive messages
app.post('/webhook', async (req, res) => {
    console.log('📨 Received webhook:', JSON.stringify(req.body, null, 2));
    
    try {
        const body = req.body;
        
        if (body.object === 'whatsapp_business_account') {
            // Handle incoming messages
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
                const message = body.entry[0].changes[0].value.messages[0];
                const from = message.from;
                const messageText = message.text.body.toLowerCase().trim();
                
                // Process the message
                await processMessage(from, messageText);
            }
        }
        
        res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.sendStatus(500);
    }
});

// Process incoming messages
async function processMessage(from, messageText) {
    console.log(`📱 Processing message from ${from}: ${messageText}`);
    
    // Check for active session or create new one
    let session = getActiveSession(from);
    
   if (!session && (messageText === 'hi' || messageText.includes('hi'))) {
        await sendWelcomeMessage(from);
    } else if (!session && messageText === 'buy zesa') {
        await startZesaFlow(from);
    } else if (session && session.flow === 'zesa_meter_entry') {
        await handleMeterEntry(from, messageText);
    } else if (session && session.flow === 'zesa_amount_entry') {
        await handleAmountEntry(from, messageText, session);
    } else if (session && session.flow === 'zesa_wallet_selection') {
        await handleWalletSelection(from, messageText, session);
    } else {
        await sendMessage(from, 'Please start by typing "hi" or "buy zesa" to begin a test transaction.');
    }
}

// Start ZESA flow
async function startZesaFlow(from) {
    const sessionId = updateSession(from, {
        flow: 'zesa_meter_entry',
        service: 'zesa',
        testTransaction: true
    });
    
    await sendMessage(from, `🔌 *TEST MODE - ZESA TOKEN PURCHASE*\n\n⚠️ *THIS IS A TEST SIMULATION*\nNo real payments will be processed.\n\nPlease enter your test meter number:\n\nTest meter numbers you can use:\n• 12345678901\n• 11111111111\n• 22222222222`);
}

// Handle meter number entry
async function handleMeterEntry(from, meterNumber) {
    if (!meterNumber || meterNumber.length < 10) {
        await sendMessage(from, 'Please enter a valid test meter number (at least 10 digits).\n\nTest numbers: 12345678901, 11111111111, 22222222222');
        return;
    }
    
    const meterData = TEST_METERS[meterNumber];
    
    if (!meterData) {
        await sendMessage(from, `❌ *TEST METER NOT FOUND*\n\nPlease use one of these test meter numbers:\n• 12345678901\n• 11111111111\n• 22222222222\n\nThis is a simulation only.`);
        return;
    }
    
    const sessionId = updateSession(from, {
        flow: 'zesa_amount_entry',
        service: 'zesa',
        testTransaction: true,
        meterNumber: meterNumber,
        customerName: meterData.customerName,
        area: meterData.area,
        previousUnits: meterData.previousUnits
    });
    
    await sendMessage(from, `✅ *TEST METER VERIFIED* ⚠️\n\n🔢 Meter: ${meterNumber}\n👤 Account: ${meterData.customerName}\n📍 Area: ${meterData.area}\n📊 Previous Units: ${meterData.previousUnits}\n\n💡 *THIS IS A TEST - NO REAL PAYMENT*\n\nHow much would you like to pay for token units?\n(Minimum: $1)\n\nExample: 10`);
}

// Handle amount entry
async function handleAmountEntry(from, amountText, session) {
    const amount = parseFloat(amountText);
    
    if (isNaN(amount) || amount < 1) {
        await sendMessage(from, 'Please enter a valid amount (minimum $1).\nExample: 10');
        return;
    }
    
    const serviceFee = (amount * 0.05).toFixed(2);
    const total = (amount + parseFloat(serviceFee)).toFixed(2);
    
    const sessionId = updateSession(from, {
        ...session,
        flow: 'zesa_wallet_selection',
        amount: amount,
        serviceFee: serviceFee,
        total: total
    });
    
    await sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n👤 For: ${session.customerName}\n🔢 Meter: ${session.meterNumber}\n\n💡 Token Units: $${amount.toFixed(2)}\n📈 Service Fee (5%): $${serviceFee}\n💰 *Total to Pay: $${total}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n\nWhich test wallet would you like to use?\n\n[EcoCash USD] [OneMoney USD] [Innbucks USD]\n[Mukuru] [Omari]\n\nReply with your choice.`);
}

// Handle wallet selection
async function handleWalletSelection(from, walletChoice, session) {
    const validWallets = ['ecocash usd', 'onemoney usd', 'innbucks usd', 'mukuru', 'omari'];
    
    if (!validWallets.includes(walletChoice.toLowerCase())) {
        await sendMessage(from, 'Please select a valid test wallet:\n\nEcoCash USD\nOneMoney USD\nInnbucks USD\nMukuru\nOmari');
        return;
    }
    
    // Generate test token
    const testToken = Array.from({length: 4}, () => 
        Math.floor(1000 + Math.random() * 9000)
    ).join('-');
    
    const newUnits = (session.amount + session.previousUnits).toFixed(2);
    
    await sendMessage(from, `✅ *TEST TRANSACTION COMPLETE* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n\n👤 For: ${session.customerName}\n🔢 Meter: ${session.meterNumber}\n🔑 *Test Token:* ${testToken}\n💡 Units: $${session.amount.toFixed(2)} (+${session.previousUnits} previous = ${newUnits} total)\n📈 Service Fee: $${session.serviceFee}\n💰 Total Paid: $${session.total}\n📞 Reference: TEST-ZESA-${Date.now().toString().slice(-6)}\n💳 Paid via: ${walletChoice.toUpperCase()}\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: TEST-ZESA-${Date.now().toString().slice(-6)}\nService: ZESA Tokens (Test Mode)\nMeter: ${session.meterNumber}\nBase Amount: $${session.amount.toFixed(2)}\nService Fee: $${session.serviceFee} (5%)\nTotal: $${session.total}\nWallet: ${walletChoice.toUpperCase()}\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "buy zesa" to run another test.`);
    
    // Clear session
    deleteSession(from);
}

// Send welcome message
async function sendWelcomeMessage(from) {
    const sessionId = updateSession(from, { flow: 'main_menu', testTransaction: true });
    
    await sendMessage(from, `👋 *WELCOME TO CCHUB TEST BOT* ⚠️\n\n*THIS IS A TEST/SIMULATION ENVIRONMENT*\nNo real payments will be processed.\n\nWhat would you like to test today?\n\n[📱 Buy Airtime] [🏫 Pay Bill] [⚡ *Buy ZESA*] [❓ Help]\n\n*Reply with your choice.*\n\nFor ZESA test, type: *buy zesa*`);
}

// Helper function to send WhatsApp message
async function sendMessage(to, text) {
    try {
        const response = await axios.post(
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
        console.log('✅ Message sent:', response.data);
    } catch (error) {
        console.error('❌ Error sending message:', error.response?.data || error.message);
    }
}

// Session management helpers
function getActiveSession(whatsappNumber) {
    // Find and clean expired sessions
    const now = Date.now();
    Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].expiresAt < now) {
            delete sessions[sessionId];
        }
    });
    
    // Find active session for this number
    return Object.values(sessions).find(session => 
        session.whatsappNumber === whatsappNumber && session.expiresAt > now
    );
}

function deleteSession(whatsappNumber) {
    Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].whatsappNumber === whatsappNumber) {
            delete sessions[sessionId];
        }
    });
}

// Health check endpoint
app.get('/', (req, res) => {
    res.send('CCHub WhatsApp Test Bot is running in TEST MODE');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Test bot server running on port ${PORT}`);
    console.log(`⚠️  RUNNING IN TEST/SIMULATION MODE`);
    console.log(`📱 Test meter numbers available: ${Object.keys(TEST_METERS).join(', ')}`);
});