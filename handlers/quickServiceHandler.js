// handlers/quickServiceHandler.js - UPDATED with 3-Tap Maximum Architecture
// ============================================================================
// QUICK SERVICE HANDLER
// Manages the quick service confirmation flow for 1-tap actions:
// - Quick Airtime (1 tap from main menu)
// - Quick ZESA (1 tap from main menu)
// 
// 1-Tap Flow:
// Tap 1: User selects Quick Airtime/ZESA from menu
//        → Shows confirmation with buttons
// Tap 2: User taps "Confirm & Pay" → Payment processed immediately
// ============================================================================

const { getUserPrefs } = require('../utils/userPrefs');
const { createSession, updateSessionStep, deleteSession } = require('./sessionHandlers');
const messaging = require('../utils/messaging');
const constants = require('../config/constants');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const paynowService = require('../services/paynow');
const { saveAirtimeTransaction, updateAirtimeTransaction, generateTransactionId } = require('../utils/tidb');
const { saveZesaTransaction, updateZesaTransaction } = require('../utils/tidb');

// Import personality utilities
const { 
    getEncouragement,
    getRandomResponse,
    addPaymentPersonality,
    getThanksMessage
} = require('../utils/personality');

// ============================================================================
// CONSTANTS
// ============================================================================
const UI_MESSAGES = constants.UI_MESSAGES.QUICK_SERVICE;
const FLOW_STATES = constants.FLOW_STATES.QUICK_SERVICE;
const VALID_OPTIONS = constants.VALIDATION_CONFIG.QUICK_SERVICE.CONFIRM_OPTIONS; // ['1', '2', '3']
const PAYMENT_METHOD_CONFIG = constants.PAYMENT_METHOD_CONFIG;

// ============================================================================
// MAIN HANDLER - Called from mainMenuHandler
// ============================================================================

/**
 * Start quick service flow for a user - 1 tap total
 * Tap 1: User selects Quick Airtime/ZESA from menu
 *        → Shows confirmation with buttons
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} service - 'airtime' or 'zesa'
 * @returns {Promise<Object>} Result with message and session
 */
async function startQuickFlow(userId, service) {
    console.log(`⚡ [QUICK SERVICE] Starting 1-tap quick ${service} for ${userId}`);
    
    // Clean user ID
    const cleanUserId = userId.split('@')[0];
    
    // Get user preferences
    const userPrefs = await getUserPrefs(cleanUserId);
    
    // Create session
    const session = createSession(userId, service === 'airtime' ? 'quick_airtime' : 'quick_zesa');
    session.state = FLOW_STATES.CONFIRM;
    session.data = {
        userId: userId,
        service: service,
        timestamp: Date.now()
    };
    
    // Get last transaction data
    let lastData = null;
    
    if (service === 'airtime') {
        lastData = userPrefs?.lastAirtime;
        
        // If no history, fallback to normal flow
        if (!lastData) {
            console.log(`📭 [QUICK SERVICE] No airtime history for ${cleanUserId}, falling back to normal flow`);
            deleteSession(userId);
            await airtimeService.startFlow(userId);
            return {
                message: null,
                session: null
            };
        }
        
        // Store last data in session for confirmation
        session.data.lastAirtime = lastData;
        
        // Send interactive confirmation with buttons
        await sendQuickAirtimeConfirmation(userId, lastData);
        
    } else if (service === 'zesa') {
        lastData = userPrefs?.lastZesa;
        
        // If no history, fallback to normal flow
        if (!lastData) {
            console.log(`📭 [QUICK SERVICE] No ZESA history for ${cleanUserId}, falling back to normal flow`);
            deleteSession(userId);
            await zesaService.startFlow(userId);
            return {
                message: null,
                session: null
            };
        }
        
        // Store last data in session for confirmation
        session.data.lastZesa = lastData;
        
        // Send interactive confirmation with buttons
        await sendQuickZesaConfirmation(userId, lastData);
    }
    
    // Update session with the data
    updateSessionStep(userId, session.state, session.state, session.data);
    
    return {
        message: null, // Message already sent via buttons
        session: session
    };
}

// ============================================================================
// Interactive confirmation messages
// ============================================================================

/**
 * Send quick airtime confirmation with buttons - 1-tap ready
 */
async function sendQuickAirtimeConfirmation(userId, lastData) {
    const maskedRecipient = lastData.recipient.replace('263', '0').slice(0,5) + '****' + lastData.recipient.slice(-3);
    const amountDisplay = lastData.currency === 'USD' ? `$${lastData.amount.toFixed(2)}` : `${lastData.amount.toFixed(2)} ZiG`;
    const paymentDisplay = lastData.paymentMethod ? getPaymentMethodName(lastData.paymentMethod, lastData.currency) : 'EcoCash';
    
    const message = `⏩ *Quick Airtime* - 1-Tap Payment

━━━━━━━━━━━━━━━━━━
📞 Recipient: *${maskedRecipient}*
💰 Amount: *${amountDisplay}* (${lastData.network})
💳 Payment: *${paymentDisplay}*
━━━━━━━━━━━━━━━━━━

Tap *Confirm* to pay instantly using your saved details.`;
    
    await messaging.sendButtonMessage(
        userId,
        message,
        [
            { id: "quick_confirm", title: "✅ Confirm & Pay" },
            { id: "quick_change", title: "✏️ Change Details" },
            { id: "quick_cancel", title: "❌ Cancel" }
        ]
    );
}

/**
 * Send quick ZESA confirmation with buttons - 1-tap ready
 */
async function sendQuickZesaConfirmation(userId, lastData) {
    const maskedMeter = lastData.meter.slice(0,5) + '****' + lastData.meter.slice(-3);
    const amountDisplay = lastData.currency === 'USD' ? `$${lastData.amount.toFixed(2)}` : `${lastData.amount.toFixed(2)} ZiG`;
    const paymentDisplay = lastData.paymentMethod ? getPaymentMethodName(lastData.paymentMethod, lastData.currency) : 'EcoCash';
    
    const message = `⏩ *Quick ZESA* - 1-Tap Payment

━━━━━━━━━━━━━━━━━━
⚡ Meter: *${maskedMeter}* (${lastData.customerName || 'N/A'})
💰 Amount: *${amountDisplay}*
💳 Payment: *${paymentDisplay}*
━━━━━━━━━━━━━━━━━━

Tap *Confirm* to pay instantly using your saved details.`;
    
    await messaging.sendButtonMessage(
        userId,
        message,
        [
            { id: "quick_confirm", title: "✅ Confirm & Pay" },
            { id: "quick_change", title: "✏️ Change Details" },
            { id: "quick_cancel", title: "❌ Cancel" }
        ]
    );
}

// ============================================================================
// HANDLE USER RESPONSE
// ============================================================================

/**
 * Handle user's response to quick service confirmation
 * Tap 2: User taps "Confirm & Pay" → Payment processed immediately
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {string} message - User's message or button ID
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result object for messageHandler
 */
async function handleResponse(userId, message, session) {
    console.log(`⚡ [QUICK SERVICE] Handling response: "${message}" for ${userId}`);
    
    let response = message.trim();
    const { service, lastAirtime, lastZesa } = session.data;
    
    // Handle interactive button responses
    if (response === 'quick_confirm') {
        response = '1';
    } else if (response === 'quick_change') {
        response = '2';
    } else if (response === 'quick_cancel') {
        response = '3';
    }
    
    // Validate response
    if (!VALID_OPTIONS.includes(response)) {
        // Resend the appropriate confirmation with buttons
        if (service === 'airtime') {
            await sendQuickAirtimeConfirmation(userId, lastAirtime);
        } else {
            await sendQuickZesaConfirmation(userId, lastZesa);
        }
        
        return {
            message: null,
            session: session
        };
    }
    
    // Handle response
    switch (response) {
        case '1': // Confirm & Pay - 1-tap payment processing
            console.log(`✅ [QUICK SERVICE] User confirmed, processing 1-tap payment`);
            await messaging.sendMessage(userId, getEncouragement() + " Processing your payment...");
            
            // Process the quick payment immediately
            return await processQuickPayment(userId, session);
            
        case '2': // Change Details - Start normal flow
            console.log(`🔄 [QUICK SERVICE] User wants to change details, starting normal flow`);
            
            // Delete ONLY the quick service session
            deleteSession(userId);
            
            if (service === 'airtime') {
                const result = await airtimeService.startFlow(userId);
                return {
                    message: result?.message || null,
                    session: result?.session || null
                };
            } else {
                const result = await zesaService.startFlow(userId);
                return {
                    message: result?.message || null,
                    session: result?.session || null
                };
            }
            
        case '3': // Cancel
            console.log(`❌ [QUICK SERVICE] User cancelled`);
            deleteSession(userId);
            
            const cancelMessage = `❌ *Cancelled*\n\nQuick ${service === 'airtime' ? 'airtime' : 'ZESA'} cancelled. ${getRandomResponse('goodbye')}`;
            
            return {
                message: cancelMessage,
                session: null
            };
            
        default:
            return {
                message: `❓ Invalid response. Please tap one of the buttons.`,
                session: session
            };
    }
}

// ============================================================================
// PROCESS QUICK PAYMENT - 1-Tap Execution
// ============================================================================

/**
 * Process the confirmed quick payment
 * Uses stored payment method to process payment immediately
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Object} session - Current quick service session
 * @returns {Promise<Object>} Result object
 */
async function processQuickPayment(userId, session) {
    const { service, lastAirtime, lastZesa } = session.data;
    
    // Delete the quick service session
    deleteSession(userId);
    
    if (service === 'airtime') {
        return await processQuickAirtime(userId, lastAirtime);
    } else {
        return await processQuickZesa(userId, lastZesa);
    }
}

/**
 * Process quick airtime payment
 */
async function processQuickAirtime(userId, lastData) {
    try {
        // Calculate fee and total amount
        const fee = constants.PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = lastData.amount * fee;
        const totalAmount = lastData.amount + serviceFee;
        
        // Get payment method details
        const currency = lastData.currency === 'USD' ? 'usd' : 'zig';
        const paymentMethodCode = getPaymentMethodCode(lastData.paymentMethod, lastData.currency);
        const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
        
        // Generate transaction reference
        const reference = `QAI${Date.now().toString().slice(-8)}`;
        const transactionId = generateTransactionId('AIR');
        
        // Create pending transaction in TiDB
        saveAirtimeTransaction({
            user_phone: userId.split('@')[0],
            transaction_id: transactionId,
            amount: lastData.amount,
            currency: lastData.currency,
            recipient_phone: lastData.recipient,
            network: lastData.network,
            status: 'pending',
            payment_method: lastData.paymentMethod,
            paynow_reference: reference,
            hotrecharge_reference: null
        });
        
        await messaging.sendMessage(userId, `🔄 *Processing your 1-tap payment...*`);
        
        // Initiate payment with PayNow
        const paynowResult = await paynowService.initiateQuickPay({
            amount: totalAmount,
            reference: reference,
            phone: lastData.paymentPhone, // Use stored payment phone if available
            method: lastData.paymentMethod,
            paymentMethodCode: paymentMethodCode,
            service: `Airtime (${lastData.currency}) - ${lastData.network}`,
            currency: lastData.currency
        });
        
        if (!paynowResult.success) {
            updateAirtimeTransaction(transactionId, {
                status: 'failed',
                error_message: paynowResult.error || 'Failed to initiate payment'
            });
            
            return {
                message: `❌ *Payment Failed*\n\n${paynowResult.error}\n\nPlease try again.`,
                session: null
            };
        }
        
        // For mobile money methods, show instructions and start polling
        if (lastData.paymentMethod === 'ecocash' || lastData.paymentMethod === 'onemoney') {
            const displayPhone = lastData.paymentPhone?.toString().replace('263', '0') || 'N/A';
            
            await messaging.sendMessage(userId,
                `📱 *Payment Request Sent*\n\n` +
                `Amount: ${lastData.currency === 'USD' ? `$${totalAmount.toFixed(2)}` : `${totalAmount.toFixed(2)} ZiG`}\n` +
                `Reference: ${reference}\n` +
                `Phone: ${displayPhone}\n\n` +
                `✅ Check your phone and enter PIN to complete payment.\n\n` +
                `⏳ I'll notify you when payment is confirmed...`
            );
            
            // Start polling for payment status
            setTimeout(() => pollPaymentStatus(userId, paynowResult.pollUrl, {
                type: 'airtime',
                data: lastData,
                reference,
                transactionId,
                totalAmount
            }), 2000);
            
        } else {
            // For Zimswitch/InnBucks, show instructions
            await messaging.sendMessage(userId, paynowResult.instructions);
        }
        
        return {
            message: null,
            session: null
        };
        
    } catch (error) {
        console.error(`❌ [QUICK AIRTIME] Error:`, error);
        return {
            message: `❌ *Error*\n\nSomething went wrong. Please try again.`,
            session: null
        };
    }
}

/**
 * Process quick ZESA payment
 */
async function processQuickZesa(userId, lastData) {
    try {
        // Calculate fee and total amount
        const fee = constants.PAYMENT_CONFIG.SERVICE_FEES.ZESA;
        const serviceFee = lastData.amount * fee;
        const totalAmount = lastData.amount + serviceFee;
        
        // Get payment method details
        const currency = lastData.currency === 'USD' ? 'usd' : 'zig';
        const paymentMethodCode = getPaymentMethodCode(lastData.paymentMethod, lastData.currency);
        const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
        
        // Generate transaction reference
        const reference = `QZE${Date.now().toString().slice(-8)}`;
        const transactionId = generateTransactionId('ZESA');
        
        // Create pending transaction in TiDB
        saveZesaTransaction({
            user_phone: userId.split('@')[0],
            transaction_id: transactionId,
            amount: lastData.amount,
            currency: lastData.currency,
            meter_number: lastData.meter,
            customer_name: lastData.customerName,
            status: 'pending',
            payment_method: lastData.paymentMethod,
            paynow_reference: reference,
            hotrecharge_reference: null,
            token_number: null
        });
        
        await messaging.sendMessage(userId, `🔄 *Processing your 1-tap payment...*`);
        
        // Initiate payment with PayNow
        const paynowResult = await paynowService.initiateQuickPay({
            amount: totalAmount,
            reference: reference,
            phone: lastData.paymentPhone,
            method: lastData.paymentMethod,
            paymentMethodCode: paymentMethodCode,
            service: `ZESA (${lastData.currency})`,
            currency: lastData.currency
        });
        
        if (!paynowResult.success) {
            updateZesaTransaction(transactionId, {
                status: 'failed',
                error_message: paynowResult.error || 'Failed to initiate payment'
            });
            
            return {
                message: `❌ *Payment Failed*\n\n${paynowResult.error}\n\nPlease try again.`,
                session: null
            };
        }
        
        // For mobile money methods, show instructions and start polling
        if (lastData.paymentMethod === 'ecocash' || lastData.paymentMethod === 'onemoney') {
            const displayPhone = lastData.paymentPhone?.toString().replace('263', '0') || 'N/A';
            
            await messaging.sendMessage(userId,
                `📱 *Payment Request Sent*\n\n` +
                `Amount: ${lastData.currency === 'USD' ? `$${totalAmount.toFixed(2)}` : `${totalAmount.toFixed(2)} ZiG`}\n` +
                `Reference: ${reference}\n` +
                `Phone: ${displayPhone}\n\n` +
                `✅ Check your phone and enter PIN to complete payment.\n\n` +
                `⏳ I'll notify you when payment is confirmed...`
            );
            
            // Start polling for payment status
            setTimeout(() => pollPaymentStatus(userId, paynowResult.pollUrl, {
                type: 'zesa',
                data: lastData,
                reference,
                transactionId,
                totalAmount
            }), 2000);
            
        } else {
            // For Zimswitch/InnBucks, show instructions
            await messaging.sendMessage(userId, paynowResult.instructions);
        }
        
        return {
            message: null,
            session: null
        };
        
    } catch (error) {
        console.error(`❌ [QUICK ZESA] Error:`, error);
        return {
            message: `❌ *Error*\n\nSomething went wrong. Please try again.`,
            session: null
        };
    }
}

// ============================================================================
// POLLING HELPER
// ============================================================================

/**
 * Poll payment status and fulfill when paid
 */
async function pollPaymentStatus(userId, pollUrl, transaction) {
    const { type, data, reference, transactionId, totalAmount } = transaction;
    
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 3 seconds = 90 seconds
    const pollInterval = 3000; // 3 seconds
    
    const checkStatus = async () => {
        attempts++;
        
        try {
            const status = await paynowService.checkPaymentStatus(pollUrl);
            
            if (status.paid) {
                console.log(`✅ [QUICK SERVICE] Payment confirmed for ${reference}`);
                
                // Update transaction status
                if (type === 'airtime') {
                    updateAirtimeTransaction(transactionId, {
                        status: 'payment_received',
                        paynow_reference: status.reference || reference
                    });
                    
                    await fulfillQuickAirtime(userId, data, reference, transactionId, totalAmount);
                } else {
                    updateZesaTransaction(transactionId, {
                        status: 'payment_received',
                        paynow_reference: status.reference || reference
                    });
                    
                    await fulfillQuickZesa(userId, data, reference, transactionId, totalAmount);
                }
                
                return true;
            } else if (status.status === 'cancelled') {
                await messaging.sendMessage(userId,
                    `❌ *Payment Cancelled*\n\nReference: ${reference}`
                );
                
                if (type === 'airtime') {
                    updateAirtimeTransaction(transactionId, { status: 'cancelled' });
                } else {
                    updateZesaTransaction(transactionId, { status: 'cancelled' });
                }
                
                return true;
            }
            
            if (attempts >= maxAttempts) {
                await messaging.sendMessage(userId,
                    `⏰ *Payment Timeout*\n\n` +
                    `We didn't receive payment confirmation after 90 seconds.\n` +
                    `Reference: ${reference}\n\n` +
                    `Type *hi* to try again.`
                );
                
                if (type === 'airtime') {
                    updateAirtimeTransaction(transactionId, { status: 'expired' });
                } else {
                    updateZesaTransaction(transactionId, { status: 'expired' });
                }
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error(`❌ [QUICK SERVICE] Polling error:`, error);
            
            if (attempts >= maxAttempts) {
                await messaging.sendMessage(userId,
                    `❌ *Error checking payment status*\n\n` +
                    `Reference: ${reference}\n\n` +
                    `Please contact support if payment was deducted.`
                );
                return true;
            }
            
            return false;
        }
    };
    
    // Start polling
    const intervalId = setInterval(async () => {
        const done = await checkStatus();
        if (done) {
            clearInterval(intervalId);
        }
    }, pollInterval);
    
    // Check immediately
    setTimeout(async () => {
        const done = await checkStatus();
        if (done) {
            clearInterval(intervalId);
        }
    }, 2000);
}

// ============================================================================
// FULFILLMENT HELPERS
// ============================================================================

/**
 * Fulfill quick airtime purchase
 */
async function fulfillQuickAirtime(userId, lastData, reference, transactionId, totalAmount) {
    try {
        await messaging.sendMessage(userId,
            `✅ *Payment Confirmed!*\n\n` +
            `🌶️ *Getting your airtime. Please wait...*`
        );
        
        // Purchase airtime via HotRecharge
        const hotrecharge = require('./hotrecharge');
        const currency = lastData.currency === 'USD' ? 'usd' : 'zig';
        
        let hotrechargeResult;
        if (currency === 'usd') {
            hotrechargeResult = await hotrecharge.airtime.usd.purchase({
                recipient: lastData.recipient,
                amount: lastData.amount,
                userId: userId.split('@')[0].slice(-4)
            });
        } else {
            hotrechargeResult = await hotrecharge.airtime.zig.purchase({
                recipient: lastData.recipient,
                amount: lastData.amount,
                userId: userId.split('@')[0].slice(-4)
            });
        }
        
        if (hotrechargeResult.success) {
            // Update transaction to completed
            updateAirtimeTransaction(transactionId, {
                status: 'completed',
                hotrecharge_reference: hotrechargeResult.reference || hotrechargeResult.agentReference,
                completed_at: new Date()
            });
            
            const displayRecipient = lastData.recipient.replace('263', '0');
            const amountDisplay = lastData.currency === 'USD' 
                ? `$${lastData.amount.toFixed(2)}` 
                : `${lastData.amount.toFixed(2)} ZiG`;
            
            const baseReceipt = `✅ Airtime Sent!\n📞 ${displayRecipient.slice(0,5)}****${displayRecipient.slice(-3)}\n💰 ${amountDisplay}\n🔖 ${reference}`;
            
            const finalReceipt = addPaymentPersonality(baseReceipt);
            await messaging.sendMessage(userId, finalReceipt);
            
            // Send post-transaction buttons
            await messaging.sendPostTransactionButtons(
                userId,
                "What would you like to do next?"
            );
            
        } else {
            updateAirtimeTransaction(transactionId, {
                status: 'failed',
                error_message: hotrechargeResult.error || 'HotRecharge failed'
            });
            
            await messaging.sendMessage(userId,
                `⚠️ *Payment Successful but Airtime Failed*\n\n` +
                `Reference: ${reference}\n\n` +
                `Our team has been notified and will resolve this within 15 minutes.`
            );
            
            await messaging.sendPostTransactionButtons(
                userId,
                "What would you like to do next?"
            );
        }
        
    } catch (error) {
        console.error(`❌ [QUICK AIRTIME] Fulfillment error:`, error);
        
        updateAirtimeTransaction(transactionId, {
            status: 'failed',
            error_message: error.message
        });
        
        await messaging.sendMessage(userId,
            `⚠️ *Payment Successful but Airtime Failed*\n\n` +
            `Reference: ${reference}\n\n` +
            `Our team has been notified.`
        );
        
        await messaging.sendPostTransactionButtons(
            userId,
            "What would you like to do next?"
        );
    }
}

/**
 * Fulfill quick ZESA purchase
 */
async function fulfillQuickZesa(userId, lastData, reference, transactionId, totalAmount) {
    try {
        await messaging.sendMessage(userId,
            `✅ *Payment Confirmed!*\n\n` +
            `🌶️ *Getting your ZESA token. Please wait...*`
        );
        
        // Purchase token via HotRecharge
        const hotrecharge = require('./hotrecharge');
        const currency = lastData.currency === 'USD' ? 'usd' : 'zig';
        const zesaService = currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
        
        const tokenResult = await zesaService.purchaseToken({
            meterNumber: lastData.meter,
            amount: lastData.amount,
            notifyNumber: lastData.notifyNumber || lastData.recipient,
            paymentPhone: lastData.paymentPhone,
            userId,
            customerName: lastData.customerName,
            reference
        });
        
        if (tokenResult.success) {
            updateZesaTransaction(transactionId, {
                status: 'completed',
                hotrecharge_reference: tokenResult.reference || tokenResult.agentReference,
                token_number: tokenResult.token,
                units_purchased: tokenResult.units,
                completed_at: new Date()
            });
            
            const maskedMeter = lastData.meter.slice(0,5) + '****' + lastData.meter.slice(-3);
            const amountDisplay = lastData.currency === 'USD' 
                ? `$${lastData.amount.toFixed(2)}` 
                : `${lastData.amount.toFixed(2)} ZiG`;
            
            const baseMessage = `✅ *ZESA Purchase Successful!*\n\n` +
                `Amount: ${amountDisplay}\n` +
                `Total Paid: ${lastData.currency === 'USD' ? `$${totalAmount.toFixed(2)}` : `${totalAmount.toFixed(2)} ZiG`}\n` +
                `Meter: ${maskedMeter}\n` +
                `Customer: ${lastData.customerName || 'N/A'}\n` +
                `────────────────\n` +
                `Units: ${tokenResult.units || 'N/A'}\n` +
                `Token: ${tokenResult.token || 'N/A'}\n` +
                `────────────────\n\n` +
                `📲 Token sent to: ${maskPhone(lastData.notifyNumber || lastData.recipient)}\n`;
            
            const finalMessage = addPaymentPersonality(baseMessage);
            await messaging.sendMessage(userId, finalMessage);
            
            await messaging.sendPostTransactionButtons(
                userId,
                "What would you like to do next?"
            );
            
        } else {
            updateZesaTransaction(transactionId, {
                status: 'failed',
                error_message: tokenResult.error || 'Token purchase failed'
            });
            
            await messaging.sendMessage(userId,
                `⚠️ *Payment Successful but Token Failed*\n\n` +
                `Reference: ${reference}\n\n` +
                `Our team has been notified.`
            );
            
            await messaging.sendPostTransactionButtons(
                userId,
                "What would you like to do next?"
            );
        }
        
    } catch (error) {
        console.error(`❌ [QUICK ZESA] Fulfillment error:`, error);
        
        updateZesaTransaction(transactionId, {
            status: 'failed',
            error_message: error.message
        });
        
        await messaging.sendMessage(userId,
            `⚠️ *Payment Successful but Token Failed*\n\n` +
            `Reference: ${reference}\n\n` +
            `Our team has been notified.`
        );
        
        await messaging.sendPostTransactionButtons(
            userId,
            "What would you like to do next?"
        );
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get payment method code based on provider and currency
 */
function getPaymentMethodCode(provider, currency) {
    if (currency === 'USD') {
        if (provider === 'ecocash') return constants.PAYMENT_PROVIDERS.USD.ECOCASH;
        if (provider === 'zimswitch') return constants.PAYMENT_PROVIDERS.USD.ZIMSWITCH;
        if (provider === 'innbucks') return constants.PAYMENT_PROVIDERS.USD.INNBUCKS;
        return constants.PAYMENT_PROVIDERS.USD.ECOCASH; // Default
    } else {
        if (provider === 'ecocash') return constants.PAYMENT_PROVIDERS.ZIG.ECOCASH;
        if (provider === 'zimswitch') return constants.PAYMENT_PROVIDERS.ZIG.ZIMSWITCH;
        if (provider === 'onemoney') return constants.PAYMENT_PROVIDERS.ZIG.ONEMONEY;
        return constants.PAYMENT_PROVIDERS.ZIG.ECOCASH; // Default
    }
}

/**
 * Get payment method display name
 */
function getPaymentMethodName(provider, currency) {
    if (currency === 'USD') {
        if (provider === 'ecocash') return 'EcoCash USD';
        if (provider === 'zimswitch') return 'Zimswitch USD';
        if (provider === 'innbucks') return 'InnBucks USD';
        return 'EcoCash USD'; // Default
    } else {
        if (provider === 'ecocash') return 'EcoCash ZiG';
        if (provider === 'zimswitch') return 'Zimswitch ZiG';
        if (provider === 'onemoney') return 'OneMoney ZiG';
        return 'EcoCash ZiG'; // Default
    }
}

/**
 * Mask phone number for privacy
 */
function maskPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 7) return phone;
    return cleaned.slice(0, 5) + '****' + cleaned.slice(-3);
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    startQuickFlow,
    handleResponse
};