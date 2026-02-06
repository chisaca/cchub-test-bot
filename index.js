// index.js
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Import modules
const sessionHandler = require('./handlers/sessionHandler');
const messageHandler = require('./handlers/messageHandler');
const { SESSION_CONFIG } = require('./config/constants');

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

                console.log(`📱 RAW Message from ${from}: "${messageText}"`);
                await messageHandler.processMessage(from, messageText);
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
    res.send('CCHub WhatsApp Bot is running with Airtight PayCode Validation');
});

// Run cleanups using config values
const { cleanupOldSessions, cleanupUserActivity } = sessionHandler;
setInterval(cleanupOldSessions, SESSION_CONFIG.CLEANUP_INTERVAL);
setInterval(cleanupUserActivity, SESSION_CONFIG.USER_ACTIVITY_CLEANUP_INTERVAL);

app.listen(PORT, () => {
    console.log(`🚀 CCHub WhatsApp Bot running on port ${PORT}`);
    console.log(`🔐 PayCode Validation: AIRTIGHT WITH CLEANING`);
    console.log(`🔒 Security Features:`);
    console.log(`   • Rate limiting: 3 attempts → 15 min lockout`);
    console.log(`   • Format validation: CCH123456 (case-sensitive)`);
    console.log(`   • Automatic cleaning of spaces/dashes/dots`);
    console.log(`   • Suspicious pattern detection`);
    console.log(`   • Single PayCode per message`);
    console.log(`🌐 WordPress API: ${process.env.WORDPRESS_API_URL || 'Not configured'}`);
    console.log(`🔑 Bot token: ${process.env.CCHUB_BOT_TOKEN ? 'Configured' : 'Missing!'}`);
    console.log(`🎯 Main menu: 1.ZESA, 2.Airtime, 3.Bill Payment (PayCode), 4.Help`);
    console.log(`💳 Bill payments: PayCode required from website`);
    console.log(`⏰ Session cleanup: every ${SESSION_CONFIG.CLEANUP_INTERVAL/1000}s`);
    console.log(`⏰ Activity cleanup: every ${SESSION_CONFIG.USER_ACTIVITY_CLEANUP_INTERVAL/60000}min`);
    console.log(`✅ Ready to receive messages!`);
});