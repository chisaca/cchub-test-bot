// index.js
// ============================================================================
// CCHUB WHATSAPP BOT - MAIN ENTRY POINT
// Handles:
// - Express server setup
// - WhatsApp webhook verification and message processing
// - PayNow webhook endpoints (for future web payments)
// - Health checks and monitoring
// - Session cleanup intervals
// 
// Architecture: State-driven with one flow at a time
// Payment Method: PayNow mobile payments only (polling-based)
// ============================================================================

const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================================================
// MODULE IMPORTS
// ============================================================================
const { cleanupOldSessions } = require('./handlers/sessionHandlers');
const messageHandler = require('./handlers/messageHandler');
const { SESSION_CONFIG } = require('./config/constants');

// ============================================================================
// LOGS DIRECTORY SETUP
// For WordPress transaction queue when API is unreachable
// ============================================================================
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    try {
        fs.mkdirSync(logsDir, { recursive: true, mode: 0o755 });
        console.log('✅ [LOGS] Directory created at:', logsDir);
    } catch (error) {
        console.error('❌ [LOGS] Failed to create logs directory:', error.message);
    }
} else {
    console.log('✅ [LOGS] Directory already exists at:', logsDir);
}

// Verify directory is writable
try {
    fs.accessSync(logsDir, fs.constants.W_OK);
    console.log('✅ [LOGS] Directory is writable');
} catch (error) {
    console.error('❌ [LOGS] Directory is NOT writable:', error.message);
}

// ============================================================================
// WHATSAPP WEBHOOK ENDPOINTS
// ============================================================================

/**
 * WhatsApp Webhook Verification (GET)
 * Called by Meta when setting up the webhook
 * Verifies the webhook using the verify token from environment
 */
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ [WEBHOOK] WhatsApp webhook verified');
        res.status(200).send(challenge);
    } else {
        console.log('❌ [WEBHOOK] WhatsApp webhook verification failed');
        res.sendStatus(403);
    }
});

/**
 * WhatsApp Message Webhook (POST)
 * Receives all incoming messages from WhatsApp
 * Always responds with 200 immediately, then processes asynchronously
 */
app.post('/webhook', async (req, res) => {
    console.log('📨 [WEBHOOK] Received WhatsApp webhook');
    
    try {
        const body = req.body;
        
        // Always acknowledge receipt immediately (WhatsApp requires this)
        res.status(200).send('EVENT_RECEIVED');
        
        // Verify this is a WhatsApp business account event
        if (body.object !== 'whatsapp_business_account') {
            return;
        }
        
        // Process each entry in the webhook payload
        for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
                const value = change.value;
                
                // ====================================================================
                // HANDLE INCOMING MESSAGES
                // ====================================================================
                if (value.messages && value.messages.length > 0) {
                    for (const message of value.messages) {
                        const from = message.from;
                        
                        // Only process text messages (ignore images, audio, etc.)
                        if (message.type === 'text' && message.text && message.text.body) {
                            const messageText = message.text.body.trim();
                            console.log(`📱 [MESSAGE] From ${from}: "${messageText}"`);
                            
                            // Process the message asynchronously (don't await)
                            messageHandler.processMessage(from, messageText).catch(err => {
                                console.error(`❌ [MESSAGE] Error in messageHandler:`, err);
                            });
                        } else {
                            console.log(`📱 [MESSAGE] Ignoring non-text message type: ${message.type}`);
                        }
                    }
                }
                
                // ====================================================================
                // HANDLE MESSAGE STATUS UPDATES (delivery receipts, read receipts)
                // ====================================================================
                if (value.statuses && value.statuses.length > 0) {
                    for (const status of value.statuses) {
                        console.log(`📱 [STATUS] Message ${status.id} -> ${status.status}`);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('❌ [WEBHOOK] Error processing webhook:', error);
        // Don't send error response if we already sent 200
    }
});

// ============================================================================
// PAYNOW WEBHOOK ENDPOINTS
// NOTE: Webhooks are for future use with web payments
// Currently using mobile payments only (polling-based)
// ============================================================================

/**
 * PayNow Result Webhook
 * Receives payment status updates from PayNow
 * For mobile payments, we use polling instead, so this is informational only
 */
app.post('/webhook/paynow-result', async (req, res) => {
    console.log('💰 [PAYNOW] Received webhook');
    console.log('   NOTE: Mobile payments use polling, webhook is informational only');
    console.log('   Webhook data:', req.body);
    
    // Always return success to PayNow
    res.sendStatus(200);
});

/**
 * PayNow Return URL
 * For browser redirects after payment (NOT USED in mobile payments)
 * Mobile payments happen entirely on the user's phone
 */
app.get('/payment/complete', (req, res) => {
    const { reference, status, amount } = req.query;
    
    console.log(`🔄 [PAYNOW] Payment return: ${reference} - ${status} - ${amount}`);
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

// ============================================================================
// HEALTH CHECK ENDPOINTS
// ============================================================================

/**
 * Root endpoint - Service information
 */
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

/**
 * Health check endpoint - For monitoring services
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

// Start session cleanup interval
setInterval(() => {
    try {
        cleanupOldSessions();
        console.log('🧹 [CLEANUP] Session cleanup completed');
    } catch (error) {
        console.error('❌ [CLEANUP] Error in session cleanup:', error);
    }
}, SESSION_CONFIG.CLEANUP_INTERVAL);

// Start the server
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 CCHub WhatsApp Bot running on port ${PORT}`);
    console.log(`========================================`);
    console.log(`🎯 CORE PRINCIPLES:`);
    console.log(`   • One flow at a time`);
    console.log(`   • State-driven architecture`);
    console.log(`   • "hi" = universal reset`);
    console.log(`   • Strict validation per step`);
    console.log(`========================================`);
    console.log(`📋 SERVICE FLOWS:`);
    console.log(`   1. 📱 Airtime (ZiG/USD)`);
    console.log(`   2. ⚡ ZESA Tokens (ZiG/USD)`);
    console.log(`   3. 📄 Bill Payment (Nyaradzo only)`);
    console.log(`   4. 🚨 Emergency Services`);
    console.log(`   5. ❓ Help`);
    console.log(`========================================`);
    console.log(`💳 PAYMENT INTEGRATION:`);
    console.log(`   • PayNow Gateway: MOBILE ONLY`);
    console.log(`   • Methods: All 8 supported (EcoCash, Zimswitch, PayGo, OneMoney, InnBucks)`);
    console.log(`   • Status: Polling-based (30 attempts, 3s interval)`);
    console.log(`========================================`);
    console.log(`⚙️  CONFIGURATION:`);
    console.log(`   • Session Timeout: ${SESSION_CONFIG.TIMEOUT/60000} minutes`);
    console.log(`   • Cleanup Interval: ${SESSION_CONFIG.CLEANUP_INTERVAL/1000} seconds`);
    console.log(`   • Max Retries: 3 per step`);
    console.log(`========================================`);
    console.log(`🌐 ENDPOINTS:`);
    console.log(`   • WhatsApp Webhook: ${process.env.WHATSAPP_WEBHOOK_URL || 'https://your-domain.com/webhook'}`);
    console.log(`   • Health Check: /health`);
    console.log(`========================================`);
    console.log(`✅ Ready to receive messages! Type "hi" to start.`);
    console.log(`✅ Active Services: Airtime, ZESA, Nyaradzo, Emergency`);
    console.log(`✅ PayNow mobile payments configured for all 8 methods`);
    console.log(`========================================`);
});
