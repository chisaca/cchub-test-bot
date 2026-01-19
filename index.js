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
    // Clean up old sessions for this number
    Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].whatsappNumber === whatsappNumber) {
            delete sessions[sessionId];
        }
    });
    
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
                const messageText = message.text.body.trim();

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
    
    // Check for active session first
    let session = getActiveSession(from);

    // ADD DEBUG LOGGING HERE:
    console.log(`🔍 DEBUG: Session exists: ${!!session}`);
    console.log(`🔍 DEBUG: Session flow: ${session?.flow}`);
    console.log(`🔍 DEBUG: messageText is digits: ${/^\d+$/.test(messageText)}`);
    console.log(`🔍 DEBUG: All sessions for ${from}:`, 
        Object.values(sessions).filter(s => s.whatsappNumber === from));
    
    // SPECIAL CASE: If message is all digits and session exists, handle based on flow
    if (session && /^\d+$/.test(messageText)) {
        if (session.flow === 'main_menu') {
            await handleMainMenuSelection(from, messageText);
            return;
        } else if (session.flow === 'zesa_wallet_selection') {
            await handleWalletSelection(from, messageText, session);
            return;
        } else if (session.flow === 'zesa_meter_entry' && messageText.length >= 10) {
            console.log(`🔍 DEBUG: Handling as meter number for session flow: ${session.flow}`);
            await handleMeterEntry(from, messageText);
            return;
        }
    }
    
    // If user has active session, handle based on flow
    if (session) {
        if (session.flow === 'zesa_meter_entry') {
            await handleMeterEntry(from, messageText);
        } else if (session.flow === 'zesa_amount_entry') {
            await handleAmountEntry(from, messageText, session);
        } else if (session.flow === 'main_menu') {
            // Check if it's a numbered selection for main menu
            if (/^\d+$/.test(messageText)) {
                await handleMainMenuSelection(from, messageText);
            } else if (messageText.toLowerCase().includes('airtime')) {
                await sendMessage(from, '🚧 Airtime test coming soon! Type "hi" to see menu options.');
            } else if (messageText.toLowerCase().includes('bill')) {
                await sendMessage(from, '🚧 Bill payment test coming soon! Type "hi" to see menu options.');
            } else if (messageText.toLowerCase().includes('zesa')) {
                await startZesaFlow(from);
            } else {
                await sendMessage(from, 'Please type "hi" to see the main menu with numbered options.');
            }
        }
        return; // Exit after handling session
    }
    
    // No active session - handle initial commands
    if (messageText.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
    } else if (messageText.toLowerCase().includes('zesa')) { // Flexible matching for ZESA
        await startZesaFlow(from);
    } else if (/^\d+$/.test(messageText) && messageText.length >= 10) {
        // Direct meter number entry - create session and handle immediately
        const sessionId = updateSession(from, {
            flow: 'zesa_meter_entry',
            service: 'zesa',
            testTransaction: true
        });
        await handleMeterEntry(from, messageText);
    } else {
        await sendMessage(from, 'Please start by typing "hi" to begin a test transaction.');
    }
}

// Handle main menu selection
async function handleMainMenuSelection(from, choice) {
    const menuOptions = {
        '1': 'buy_zesa',
        '2': 'buy_airtime',
        '3': 'pay_bill',
        '4': 'help'
    };
    
    const selectedOption = menuOptions[choice];
    
    if (!selectedOption) {
        await sendMessage(from, '❌ Invalid selection. Please choose a number from 1-4.\n\n1. Buy ZESA\n2. Buy Airtime\n3. Pay Bill\n4. Help');
        return;
    }
    
    if (selectedOption === 'buy_zesa') {
        await startZesaFlow(from);
    } else if (selectedOption === 'buy_airtime') {
        await sendMessage(from, '🚧 Airtime test coming soon! Please type "hi" to return to main menu.');
    } else if (selectedOption === 'pay_bill') {
        await sendMessage(from, '🚧 Bill payment test coming soon! Please type "hi" to return to main menu.');
    } else if (selectedOption === 'help') {
        await sendMessage(from, '🆘 *HELP - TEST MODE*\n\nThis is a test simulation bot for CCHub.\n\n• Type "hi" to see main menu\n• For ZESA test: Select option 1 from menu\n• All transactions are simulated\n• No real payments are processed');
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
    
    await sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n👤 For: ${session.customerName}\n🔢 Meter: ${session.meterNumber}\n\n💡 Token Units: $${amount.toFixed(2)}\n📈 Service Fee (5%): $${serviceFee}\n💰 *Total to Pay: $${total}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n\nSelect a test wallet:\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari\n\n*Reply with the number (1-5) of your choice.*`);
}

// Handle wallet selection
async function handleWalletSelection(from, walletChoice, session) {
    const walletOptions = {
        '1': 'EcoCash USD',
        '2': 'OneMoney USD',
        '3': 'Innbucks USD',
        '4': 'Mukuru',
        '5': 'Omari'
    };
    
    const selectedWallet = walletOptions[walletChoice];
    
    if (!selectedWallet) {
        await sendMessage(from, '❌ Invalid selection. Please choose a number from 1-5:\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari');
        return;
    }
    
    // Generate test token
    const testToken = Array.from({length: 4}, () => 
        Math.floor(1000 + Math.random() * 9000)
    ).join('-');
    
    const newUnits = (session.amount + session.previousUnits).toFixed(2);
    
    await sendMessage(from, `✅ *TEST TRANSACTION COMPLETE* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n\n👤 For: ${session.customerName}\n🔢 Meter: ${session.meterNumber}\n🔑 *Test Token:* ${testToken}\n💡 Units: $${session.amount.toFixed(2)} (+${session.previousUnits} previous = ${newUnits} total)\n📈 Service Fee: $${session.serviceFee}\n💰 Total Paid: $${session.total}\n📞 Reference: TEST-ZESA-${Date.now().toString().slice(-6)}\n💳 Paid via: ${selectedWallet}\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: TEST-ZESA-${Date.now().toString().slice(-6)}\nService: ZESA Tokens (Test Mode)\nMeter: ${session.meterNumber}\nBase Amount: $${session.amount.toFixed(2)}\nService Fee: $${session.serviceFee} (5%)\nTotal: $${session.total}\nWallet: ${selectedWallet}\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "hi" to start again.`);
    
    // Clear session
    deleteSession(from);
}

// Send welcome message
async function sendWelcomeMessage(from) {
    const sessionId = updateSession(from, { flow: 'main_menu', testTransaction: true });
    
    await sendMessage(from, `👋 *WELCOME TO CCHUB TEST BOT* ⚠️\n\n*THIS IS A TEST/SIMULATION ENVIRONMENT*\nNo real payments will be processed.\n\nWhat would you like to test today?\n\n1. ⚡ Buy ZESA\n2. 📱 Buy Airtime\n3. 🏫 Pay Bill\n4. ❓ Help\n\n*Reply with the number (1-4) of your choice.*`);
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
    
    // Find ALL active sessions for this number, return the MOST RECENT
    const activeSessions = Object.values(sessions).filter(session => 
        session.whatsappNumber === whatsappNumber && session.expiresAt > now
    );
    
    // Return the most recent session (highest createdAt)
    return activeSessions.sort((a, b) => b.createdAt - a.createdAt)[0];
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
    console.log(`🎯 Main menu options:\n   1. Buy ZESA\n   2. Buy Airtime\n   3. Pay Bill\n   4. Help`);
    console.log(`💳 Wallet options:\n   1. EcoCash USD\n   2. OneMoney USD\n   3. Innbucks USD\n   4. Mukuru\n   5. Omari`);
});