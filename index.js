// index.js - FULLY UPDATED for PayNow mobile payments only
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Import modules
const { cleanupOldSessions } = require('./handlers/sessionHandlers');
const messageHandler = require('./handlers/messageHandler');
const { SESSION_CONFIG } = require('./config/constants');

// ==================== WEBHOOK ENDPOINTS ====================

// WhatsApp Webhook Verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ WhatsApp webhook verified');
        res.status(200).send(challenge);
    } else {
        console.log('❌ WhatsApp webhook verification failed');
        res.sendStatus(403);
    }
});

// WhatsApp Message Webhook
app.post('/webhook', async (req, res) => {
    console.log('📨 Received WhatsApp webhook');
    
    try {
        const body = req.body;
        
        if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
                const message = body.entry[0].changes[0].value.messages[0];
                const from = message.from;
                const messageText = message.text.body.trim();

                console.log(`📱 WhatsApp message from ${from}: "${messageText}"`);
                await messageHandler.processMessage(from, messageText);
            }
        }
        
        res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        console.error('❌ Error processing WhatsApp webhook:', error);
        res.sendStatus(500);
    }
});

// ==================== PAYNOW WEBHOOK ENDPOINTS ====================
// NOTE: Webhooks are for future use with web payments
// Currently using mobile payments only (polling-based)

app.post('/webhook/paynow-result', async (req, res) => {
    console.log('💰 Received PayNow webhook');
    
    try {
        // For mobile payments, we don't validate webhooks
        // Just acknowledge receipt
        console.log('📥 PayNow webhook received - mobile payments use polling instead');
        console.log('   Webhook data:', req.body);
        
        // Always return success to PayNow
        res.sendStatus(200);
        
    } catch (error) {
        console.error('❌ Error processing PayNow webhook:', error);
        res.sendStatus(500);
    }
});

// PayNow Return URL (for browser redirects - NOT USED in mobile payments)
app.get('/payment/complete', (req, res) => {
    const { reference, status, amount } = req.query;
    
    console.log(`🔄 Payment return: ${reference} - ${status} - ${amount}`);
    console.log('   NOTE: Mobile payments do not use return URL');
    
    // Simple HTML response for browser
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Complete - CCHub</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .success { color: green; }
                .pending { color: orange; }
                .failed { color: red; }
            </style>
        </head>
        <body>
            <h1>Payment ${status === 'paid' ? 'Successful' : status === 'cancelled' ? 'Cancelled' : 'Processing'}</h1>
            <p>Reference: <strong>${reference || 'N/A'}</strong></p>
            <p>Amount: <strong>${amount || 'N/A'}</strong></p>
            <p>Status: <strong class="${status || 'pending'}">${status || 'pending'}</strong></p>
            <p>You can close this window and return to WhatsApp.</p>
            <p><small>Note: Mobile payments are processed via your phone.</small></p>
            <script>
                // Auto-close after 5 seconds
                setTimeout(() => window.close(), 5000);
            </script>
        </body>
        </html>
    `);
});

// ==================== HEALTH CHECK ENDPOINTS ====================

app.get('/', (req, res) => {
    res.json({
        service: 'CCHub WhatsApp Bot',
        status: 'running',
        version: '1.0.0',
        architecture: 'State-Driven',
        payment_method: 'PayNow Mobile Only',
        endpoints: {
            whatsapp_webhook: '/webhook',
            paynow_webhook: '/webhook/paynow-result',
            payment_return: '/payment/complete',
            health: '/health'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// ==================== SERVER START ====================

// Session cleanup
setInterval(() => {
    try {
        cleanupOldSessions();
        console.log('🧹 Session cleanup completed');
    } catch (error) {
        console.error('❌ Error in session cleanup:', error);
    }
}, SESSION_CONFIG.CLEANUP_INTERVAL);

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 CCHub WhatsApp Bot running on port ${PORT}`);
    console.log(`========================================`);
    console.log(`🎯 CORE PRINCIPLES:`);
    console.log(`   • One flow at a time`);
    console.log(`   • State-driven architecture`);
    console.log(`   • No cross-scanning`);
    console.log(`   • "hi" = universal reset`);
    console.log(`   • Strict validation per step`);
    console.log(`========================================`);
    console.log(`📋 SERVICE FLOWS:`);
    console.log(`   1. Airtime`);
    console.log(`   2. ZESA Tokens`);
    console.log(`   3. Bill Payment (PayCode)`);
    console.log(`   4. Emergency Services`);
    console.log(`   5. Help`);
    console.log(`========================================`);
    console.log(`💳 PAYMENT INTEGRATION:`);
    console.log(`   • PayNow Gateway: MOBILE ONLY`);
    console.log(`   • Methods: EcoCash, OneMoney`);
    console.log(`   • Status: Polling-based (no webhooks)`);
    console.log(`========================================`);
    console.log(`⚙️  CONFIGURATION:`);
    console.log(`   • Session Timeout: ${SESSION_CONFIG.SESSION_TIMEOUT/60000} minutes`);
    console.log(`   • Cleanup Interval: ${SESSION_CONFIG.CLEANUP_INTERVAL/1000} seconds`);
    console.log(`   • Max Retries: 3 per step`);
    console.log(`========================================`);
    console.log(`🌐 ENDPOINTS:`);
    console.log(`   • WhatsApp Webhook: ${process.env.WHATSAPP_WEBHOOK_URL || 'https://your-domain.com/webhook'}`);
    console.log(`   • Health Check: /health`);
    console.log(`========================================`);
    console.log(`✅ Ready to receive messages! Type "hi" to start.`);
    console.log(`✅ PayNow mobile payments configured for EcoCash/OneMoney`);
    console.log(`========================================`);
});