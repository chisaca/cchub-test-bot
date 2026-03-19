// index.js - UPDATED with Interactive Message Support
// ============================================================================
// CCHUB WHATSAPP BOT - MAIN ENTRY POINT
// Handles:
// - Express server setup
// - WhatsApp webhook verification and message processing
// - PayNow webhook endpoints (for future web payments)
// - Health checks and monitoring
// - Session cleanup intervals
// - Interactive message support (buttons, lists, flows)
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
 * NOW WITH: Support for interactive messages (buttons, lists)
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
                        
                        // ====================================================================
                        // HANDLE TEXT MESSAGES
                        // ====================================================================
                        if (message.type === 'text' && message.text && message.text.body) {
                            const messageText = message.text.body.trim();
                            console.log(`📱 [MESSAGE] From ${from}: "${messageText}" (type: text)`);
                            
                            // Process the message asynchronously
                            messageHandler.processMessage(from, messageText, { type: 'text' }).catch(err => {
                                console.error(`❌ [MESSAGE] Error in messageHandler:`, err);
                            });
                        }
                        
                        // ====================================================================
                        // HANDLE INTERACTIVE MESSAGES (BUTTONS & LIST SELECTIONS)
                        // ====================================================================
                        else if (message.type === 'interactive') {
                            const interactive = message.interactive;
                            
                            // Handle button replies
                            if (interactive.type === 'button_reply') {
                                const buttonId = interactive.button_reply.id;
                                const buttonTitle = interactive.button_reply.title;
                                
                                console.log(`📱 [INTERACTIVE] Button pressed: ${buttonId} (${buttonTitle})`);
                                
                                // Process the button press as if it were text
                                messageHandler.processMessage(from, buttonId, { 
                                    type: 'interactive',
                                    subtype: 'button',
                                    title: buttonTitle 
                                }).catch(err => {
                                    console.error(`❌ [MESSAGE] Error in messageHandler:`, err);
                                });
                            }
                            
                            // Handle list replies
                            else if (interactive.type === 'list_reply') {
                                const listId = interactive.list_reply.id;
                                const listTitle = interactive.list_reply.title;
                                const listDescription = interactive.list_reply.description || '';
                                
                                console.log(`📱 [INTERACTIVE] List selected: ${listId} (${listTitle})`);
                                
                                // Process the list selection as if it were text
                                messageHandler.processMessage(from, listId, { 
                                    type: 'interactive',
                                    subtype: 'list',
                                    title: listTitle,
                                    description: listDescription
                                }).catch(err => {
                                    console.error(`❌ [MESSAGE] Error in messageHandler:`, err);
                                });
                            }
                            
                            // Handle flow responses (if you implement WhatsApp Flows)
                            else if (interactive.type === 'flow_reply') {
                                const flowResponse = interactive.flow_reply;
                                console.log(`📱 [INTERACTIVE] Flow response:`, flowResponse);
                                
                                // Process the flow response as JSON
                                try {
                                    const flowData = JSON.parse(flowResponse);
                                    messageHandler.processMessage(from, 'flow_response', { 
                                        type: 'interactive',
                                        subtype: 'flow',
                                        data: flowData
                                    }).catch(err => {
                                        console.error(`❌ [MESSAGE] Error in messageHandler:`, err);
                                    });
                                } catch (e) {
                                    console.error(`❌ [INTERACTIVE] Failed to parse flow response:`, e);
                                }
                            }
                        }
                        
                        // ====================================================================
                        // HANDLE OTHER MESSAGE TYPES
                        // ====================================================================
                        else if (message.type === 'image') {
                            console.log(`📱 [MESSAGE] From ${from}: Received image (ignoring)`);
                            // You could implement image processing here if needed
                        }
                        else if (message.type === 'voice') {
                            console.log(`📱 [MESSAGE] From ${from}: Received voice note (ignoring)`);
                            // You could implement voice-to-text here if needed
                        }
                        else if (message.type === 'document') {
                            console.log(`📱 [MESSAGE] From ${from}: Received document (ignoring)`);
                        }
                        else if (message.type === 'location') {
                            console.log(`📱 [MESSAGE] From ${from}: Received location (ignoring)`);
                        }
                        else if (message.type === 'contacts') {
                            console.log(`📱 [MESSAGE] From ${from}: Received contact (ignoring)`);
                        }
                        else {
                            console.log(`📱 [MESSAGE] Ignoring unsupported message type: ${message.type}`);
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
 * NOW UPDATES TRANSACTIONS in TiDB
 */
app.post('/webhook/paynow-result', async (req, res) => {
    console.log('💰 [PAYNOW] Received webhook');
    
    try {
        const webhookData = req.body;
        console.log('   Webhook data:', webhookData);
        
        // Import TiDB functions
        const { 
            updateAirtimeTransaction, 
            updateZesaTransaction, 
            updateBillTransaction,
            findTransactionByPayNowRef 
        } = require('./utils/tidb');
        
        // Extract data from webhook
        const {
            reference,           // Your internal reference (e.g., 'AIR20345517')
            paynowreference,     // PayNow's reference (e.g., '41086723')
            status,              // 'Paid', 'Cancelled', 'Created'
        } = webhookData;
        
        // Always return 200 immediately to acknowledge receipt
        res.sendStatus(200);
        
        // Process asynchronously after sending response
        setImmediate(async () => {
            try {
                if (!reference && !paynowreference) {
                    console.log('⚠️ [PAYNOW] Webhook missing both references');
                    return;
                }
                
                // Determine transaction type from reference prefix
                let serviceType = 'unknown';
                let transactionId = reference;
                
                if (reference) {
                    if (reference.startsWith('AIR')) serviceType = 'airtime';
                    else if (reference.startsWith('ZESA')) serviceType = 'zesa';
                    else if (reference.startsWith('BILL') || reference.includes('NYAR')) serviceType = 'nyaradzo';
                }
                
                const updates = {
                    status: status === 'Paid' ? 'completed' : 
                           status === 'Cancelled' ? 'failed' : 'pending',
                    paynow_reference: paynowreference
                };
                
                // If we have a valid reference, use it directly
                if (transactionId && serviceType !== 'unknown') {
                    console.log(`📝 [PAYNOW] Updating ${serviceType} transaction: ${transactionId} to ${updates.status}`);
                    
                    if (serviceType === 'airtime') {
                        await updateAirtimeTransaction(transactionId, updates);
                    } else if (serviceType === 'zesa') {
                        await updateZesaTransaction(transactionId, updates);
                    } else if (serviceType === 'nyaradzo') {
                        await updateBillTransaction(transactionId, updates);
                    }
                    
                    console.log(`✅ [PAYNOW] Updated transaction ${transactionId} to ${updates.status}`);
                } 
                // Otherwise try to look up by PayNow reference
                else if (paynowreference) {
                    console.log(`🔍 [PAYNOW] Looking up transaction by PayNow ref: ${paynowreference}`);
                    
                    // You'll need to add this function to tidb.js
                    const transaction = await findTransactionByPayNowRef(paynowreference);
                    
                    if (transaction) {
                        if (transaction.type === 'airtime') {
                            await updateAirtimeTransaction(transaction.transaction_id, updates);
                        } else if (transaction.type === 'zesa') {
                            await updateZesaTransaction(transaction.transaction_id, updates);
                        } else if (transaction.type === 'bill') {
                            await updateBillTransaction(transaction.transaction_id, updates);
                        }
                        console.log(`✅ [PAYNOW] Updated ${transaction.type} transaction: ${transaction.transaction_id}`);
                    } else {
                        console.log(`⚠️ [PAYNOW] No transaction found for PayNow ref: ${paynowreference}`);
                    }
                }
                
            } catch (asyncError) {
                console.error('❌ [PAYNOW] Async webhook processing error:', asyncError.message);
            }
        });
        
    } catch (error) {
        console.error('❌ [PAYNOW] Webhook error:', error.message);
        // Still return 200 to prevent PayNow from retrying
        if (!res.headersSent) {
            res.sendStatus(200);
        }
    }
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
app.get('/health', async (req, res) => {
    // Check WordPress API health
    let wordpressStatus = 'unknown';
    let wordpressServices = {};
    
    try {
        const wordpressApi = require('./utils/wordpressApi');
        const health = await wordpressApi.checkHealth();
        wordpressStatus = health.allOnline ? 'online' : health.anyOnline ? 'degraded' : 'offline';
        wordpressServices = health.services || {};
    } catch (error) {
        wordpressStatus = 'offline';
        console.error('❌ [HEALTH] WordPress health check failed:', error.message);
    }
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        services: {
            wordpress: {
                status: wordpressStatus,
                endpoints: wordpressServices
            },
            meteosource: process.env.METEOSOURCE_API_KEY ? 'configured' : 'not configured',
            hotrecharge: process.env.HOT_ACCESS_CODE ? 'configured' : 'not configured',
            paynow: {
                usd: process.env.PAYNOW_ID ? 'configured' : 'not configured',
                zig: process.env.PAYNOW_ID_ZIG ? 'configured' : 'not configured'
            }
        },
        environment: process.env.NODE_ENV || 'development'
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
    console.log(`   5. 🔥 Hot Updates (EPL, News, Weather)`);
    console.log(`   6. ❓ Help`);
    console.log(`========================================`);
    console.log(`💳 PAYMENT INTEGRATION:`);
    console.log(`   • PayNow Gateway: MOBILE ONLY`);
    console.log(`   • Methods: All 8 supported (EcoCash ZiG/USD, Zimswitch ZiG/USD, OneMoney, InnBucks)`);
    console.log(`   • Status: Polling-based (30 attempts, 3s interval)`);
    console.log(`========================================`);
    console.log(`🔥 HOT UPDATES INFO SERVICES:`);
    console.log(`   • ⚽ EPL Soccer - Standings, fixtures, results`);
    console.log(`   • 📰 Zimbabwe News - Herald, Chronicle, Newsday`);
    console.log(`   • 🌦️ Weather - 24 cities & resorts, 5-day forecast`);
    console.log(`   • Source: WordPress REST API + Sample Data Fallback`);
    console.log(`========================================`);
    console.log(`✨ NEW UI FEATURES:`);
    console.log(`   • Interactive Buttons - Tap to select`);
    console.log(`   • List Messages - Modern menus`);
    console.log(`   • Confirmation Buttons - YES/NO/EDIT`);
    console.log(`   • Personality - Jokes, facts, tips`);
    console.log(`========================================`);
    console.log(`⚙️  CONFIGURATION:`);
    console.log(`   • Session Timeout: ${SESSION_CONFIG.TIMEOUT/60000} minutes`);
    console.log(`   • Cleanup Interval: ${SESSION_CONFIG.CLEANUP_INTERVAL/1000} seconds`);
    console.log(`   • Max Retries: 3 per step`);
    console.log(`========================================`);
    console.log(`🌐 ENDPOINTS:`);
    console.log(`   • WhatsApp Webhook: ${process.env.WHATSAPP_WEBHOOK_URL || 'https://your-domain.com/webhook'}`);
    console.log(`   • Health Check: /health`);
    console.log(`   • WordPress API: ${process.env.WORDPRESS_URL || 'https://cchub.co.zw'}/wp-json/cchub/v1`);
    console.log(`========================================`);
    console.log(`✅ Ready to receive messages!`);
    console.log(`✅ Interactive buttons and lists enabled`);
    console.log(`✅ Personality features active`);
    console.log(`========================================`);
});