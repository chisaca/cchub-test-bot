// ============================================================================
// AIRTIME SERVICE - With Buttons and Main Menu Option
// Handles the complete airtime purchase flow using buttons and numbered options
// 
// 3-Tap Flow:
// Tap 1: Main Menu → Airtime
// Tap 2: Follow button prompts
// Tap 3: Confirm → Payment processed
// ============================================================================

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { saveAirtimeTransaction, updateAirtimeTransaction, generateTransactionId } = require('../utils/tidb');
const { updateUserPrefs } = require('../utils/userPrefs');
const { 
    getEncouragement, 
    addPaymentPersonality,
    addRandomFact
} = require('../utils/personality');
const { 
    FLOW_STATES, 
    PAYMENT_CONFIG, 
    AIRTIME_CURRENCY_OPTIONS,
    RESPONSE_MESSAGES, 
    PAYMENT_PROVIDERS,
    PAYMENT_METHOD_CONFIG,
    PAYMENT_PREFIXES,
    VALIDATION_CONFIG
} = require('../config/constants');

class AirtimeService {
    
    // ============================================================================
    // FLOW INITIATION - Tap 1
    // ============================================================================
    
    /**
     * Start the airtime flow
     * Tap 1: User selects Airtime from menu
     * 
     * @param {string} userId - WhatsApp user ID
     * @returns {Promise<Object>} Result with session
     */
    async startFlow(userId) {
        console.log(`🎯 [AIRTIME] Starting flow for ${userId}`);
        
        // Check if session already exists
        let session = getActiveSession(userId);
        
        if (!session) {
            // Create new session only if none exists
            session = createSession(userId, 'airtime');
            console.log(`🎯 [AIRTIME] Created new session for ${userId}`);
        } else {
            console.log(`🎯 [AIRTIME] Using existing session for ${userId}`);
        }
        
        // Send currency selection (first step) WITH BUTTONS
        await this.sendCurrencySelection(userId);
        
        updateSessionStep(userId, 'select_currency', FLOW_STATES.AIRTIME.SELECT_CURRENCY);
        
        return {
            message: null,
            session: session
        };
    }
    
    // ============================================================================
    // STEP 1: CURRENCY SELECTION - WITH BUTTONS
    // ============================================================================
    
    /**
     * Send currency selection prompt with buttons
     */
    async sendCurrencySelection(userId) {
        const message = `📱 *Airtime Purchase*

Please select currency:`;
        
        await messaging.sendButtonMessage(
            userId,
            message,
            [
                { id: "currency_zig", title: "🇿🇼 ZiG" },
                { id: "currency_usd", title: "💵 USD" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
    }
    
    /**
     * Handle currency selection
     */
    async handleCurrencySelection(userId, message, session) {
        const selection = message.trim().toLowerCase();
        
        // Handle main menu
        if (selection === 'hi' || selection === 'main_menu') {
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        let currencyOption;
        
        if (selection === 'currency_zig' || selection === '1' || selection.includes('zig')) {
            currencyOption = AIRTIME_CURRENCY_OPTIONS['1'];
        } else if (selection === 'currency_usd' || selection === '2' || selection.includes('usd')) {
            currencyOption = AIRTIME_CURRENCY_OPTIONS['2'];
        } else {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return {
                    session: false,
                    returnToMain: true,
                    message: null
                };
            }
            
            await messaging.sendMessage(userId, 
                `❌ Please select a currency using the buttons below.\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            
            // Resend currency selection
            await this.sendCurrencySelection(userId);
            return {
                session: true,
                message: null
            };
        }
        
        updateSessionStep(userId, 'enter_phone', FLOW_STATES.AIRTIME.ENTER_PHONE, {
            currency: currencyOption.id,
            currencyName: currencyOption.name,
            currencySymbol: currencyOption.symbol,
            minAmount: currencyOption.min,
            maxAmount: currencyOption.max,
            productMap: currencyOption.hotrecharge_product_map
        });
        
        await this.sendPhonePrompt(userId, currencyOption.name);
        
        return {
            session: true,
            message: null
        };
    }
    
    // ============================================================================
    // STEP 2: PHONE NUMBER ENTRY - WITH BACK BUTTON
    // ============================================================================
    
    /**
     * Send phone number prompt
     */
    async sendPhonePrompt(userId, currencyName) {
        const message = `📞 *Recipient's Phone Number*

Enter the phone number you want to top up:

Example: *0771234567* or *263771234567*

────────────────
Reply with the phone number
Type *hi* for main menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle phone number entry
     */
    async handleRecipientEntry(userId, message, session) {
        const input = message.trim().toLowerCase();
        
        // Handle main menu
        if (input === 'hi' || input === 'main_menu') {
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        // Handle back
        if (input === 'back') {
            updateSessionStep(userId, 'select_currency', FLOW_STATES.AIRTIME.SELECT_CURRENCY, {});
            await this.sendCurrencySelection(userId);
            return {
                session: true,
                message: null
            };
        }
        
        const validation = this.validatePhoneNumber(message.trim());
        
        if (!validation.valid) {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return {
                    session: false,
                    returnToMain: true,
                    message: null
                };
            }
            
            await messaging.sendMessage(userId, 
                `❌ ${validation.error}\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}\n\n` +
                `Type *hi* for main menu.`
            );
            return {
                session: true,
                message: null
            };
        }
        
        // Detect network from phone number
        const network = this.detectNetwork(validation.formatted);
        
        // Check if network is supported for selected currency
        if (session.data.currencyName === 'ZiG' && network !== 'Econet') {
            await messaging.sendMessage(userId, 
                `❌ ZiG airtime is only available for *Econet* numbers.\n\n` +
                `The number you entered (${validation.display}) appears to be ${network}.\n\n` +
                `Type *hi* for main menu`
            );
            return {
                session: true,
                message: null
            };
        }
        
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT, {
            recipient: validation.formatted,
            recipientDisplay: validation.display,
            network: network
        });
        
        await this.sendAmountPrompt(userId, session.data.currencyName, session.data.minAmount, session.data.maxAmount);
        
        return {
            session: true,
            message: null
        };
    }
    
    // ============================================================================
    // STEP 3: AMOUNT ENTRY - WITH BACK BUTTON
    // ============================================================================
    
    /**
     * Send amount prompt
     */
    async sendAmountPrompt(userId, currencyName, minAmount, maxAmount) {
        const minDisplay = currencyName === 'USD' ? `$${minAmount}` : `${minAmount} ZiG`;
        const maxDisplay = currencyName === 'USD' ? `$${maxAmount}` : `${maxAmount} ZiG`;
        
        const message = `💰 *Enter Amount*

Amount must be between:
• Minimum: ${minDisplay}
• Maximum: ${maxDisplay}

Example: *5* or *10.50*

────────────────
Reply with the amount
Type *hi* for main menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle amount entry
     */
    async handleAmountEntry(userId, message, session) {
        const input = message.trim().toLowerCase();
        
        // Handle main menu
        if (input === 'hi' || input === 'main_menu') {
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        const amount = parseFloat(message.trim());
        
        if (isNaN(amount) || amount <= 0) {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return {
                    session: false,
                    returnToMain: true,
                    message: null
                };
            }
            
            await messaging.sendMessage(userId, 
                `❌ Please enter a valid number (e.g., 5 or 10.50).\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return {
                session: true,
                message: null
            };
        }
        
        if (amount < session.data.minAmount || amount > session.data.maxAmount) {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return {
                    session: false,
                    returnToMain: true,
                    message: null
                };
            }
            
            const minDisplay = session.data.currencyName === 'USD' ? `$${session.data.minAmount}` : `${session.data.minAmount} ZiG`;
            const maxDisplay = session.data.currencyName === 'USD' ? `$${session.data.maxAmount}` : `${session.data.maxAmount} ZiG`;
            
            await messaging.sendMessage(userId, 
                `❌ Amount must be between ${minDisplay} and ${maxDisplay}.\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return {
                session: true,
                message: null
            };
        }
        
        // Calculate fees
        const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = parseFloat((amount * fee).toFixed(2));
        const totalAmount = parseFloat((amount + serviceFee).toFixed(2));
        
        updateSessionStep(userId, 'select_payment', FLOW_STATES.AIRTIME.SELECT_PAYMENT_METHOD, {
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        await this.sendPaymentMethodPrompt(userId, session.data.currencyName);
        
        return {
            session: true,
            message: null
        };
    }
    
    // ============================================================================
    // STEP 4: PAYMENT METHOD SELECTION - WITH BUTTONS
    // ============================================================================

    /**
     * Send payment method prompt with buttons
     */
    async sendPaymentMethodPrompt(userId, currencyName) {
        const message = `💳 *Select Payment Method*`;
        
        let buttons = [];
        
        if (currencyName === 'USD') {
            buttons = [
                { id: "pm_ecocash_usd", title: "💰 EcoCash USD" },
                { id: "pm_zimswitch_usd", title: "💳 Zimswitch USD" },
                { id: "back", title: "🔙 Back" },
                { id: "hi", title: "🏠 Main Menu" }
            ];
        } else {
            buttons = [
                { id: "pm_ecocash_zig", title: "💰 EcoCash ZiG" },
                { id: "pm_zimswitch_zig", title: "💳 Zimswitch ZiG" },
                { id: "pm_onemoney", title: "📱 OneMoney ZiG" },
                { id: "back", title: "🔙 Back" },
                { id: "hi", title: "🏠 Main Menu" }
            ];
        }
        
        await messaging.sendButtonMessage(userId, message, buttons);
    }

    /**
     * Handle payment method selection
     */
    async handlePaymentMethodSelection(userId, message, session) {
        const selection = message.trim().toLowerCase();
        
        // Handle main menu
        if (selection === 'hi' || selection === 'main_menu') {
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        // Handle back
        if (selection === 'back') {
            updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT, {
                currency: session.data.currency,
                currencyName: session.data.currencyName,
                currencySymbol: session.data.currencySymbol,
                minAmount: session.data.minAmount,
                maxAmount: session.data.maxAmount,
                recipient: session.data.recipient,
                recipientDisplay: session.data.recipientDisplay,
                network: session.data.network
            });
            await this.sendAmountPrompt(userId, session.data.currencyName, session.data.minAmount, session.data.maxAmount);
            return {
                session: true,
                message: null
            };
        }
        
        // Map selection to payment method
        let paymentMethod, paymentProvider, paymentMethodCode, requiresPhone;
        
        if (session.data.currencyName === 'USD') {
            if (selection === 'pm_ecocash_usd' || selection === '1' || selection.includes('ecocash')) {
                paymentMethod = 'ecocash';
                paymentProvider = 'EcoCash USD';
                paymentMethodCode = PAYMENT_PROVIDERS.USD.ECOCASH;
                requiresPhone = true;
            } else if (selection === 'pm_zimswitch_usd' || selection === '2' || selection.includes('zimswitch')) {
                paymentMethod = 'zimswitch';
                paymentProvider = 'Zimswitch USD';
                paymentMethodCode = PAYMENT_PROVIDERS.USD.ZIMSWITCH;
                requiresPhone = false;
            } else {
                await this.handleInvalidPaymentMethod(userId, session);
                return {
                    session: true,
                    message: null
                };
            }
        } else {
            if (selection === 'pm_ecocash_zig' || selection === '1' || selection.includes('ecocash')) {
                paymentMethod = 'ecocash';
                paymentProvider = 'EcoCash ZiG';
                paymentMethodCode = PAYMENT_PROVIDERS.ZIG.ECOCASH;
                requiresPhone = true;
            } else if (selection === 'pm_zimswitch_zig' || selection === '2' || selection.includes('zimswitch')) {
                paymentMethod = 'zimswitch';
                paymentProvider = 'Zimswitch ZiG';
                paymentMethodCode = PAYMENT_PROVIDERS.ZIG.ZIMSWITCH;
                requiresPhone = false;
            } else if (selection === 'pm_onemoney' || selection === '3' || selection.includes('onemoney')) {
                paymentMethod = 'onemoney';
                paymentProvider = 'OneMoney ZiG';
                paymentMethodCode = PAYMENT_PROVIDERS.ZIG.ONEMONEY;
                requiresPhone = true;
            } else {
                await this.handleInvalidPaymentMethod(userId, session);
                return {
                    session: true,
                    message: null
                };
            }
        }
        
        const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
        
        updateSessionStep(userId, 'payment_phone', FLOW_STATES.AIRTIME.ENTER_PAYMENT_PHONE, {
            paymentMethod: paymentMethod,
            paymentProvider: paymentProvider,
            paymentMethodCode: paymentMethodCode,
            paymentMethodName: methodConfig?.name || paymentProvider,
            requiresPaymentPhone: requiresPhone
        });
        
        // If payment method requires phone, ask for it
        if (requiresPhone) {
            await this.sendPaymentPhonePrompt(userId, paymentMethod);
        } else {
            // Skip to confirmation
            await this.sendConfirmation(userId, session);
        }
        
        return {
            session: true,
            message: null
        };
    }
    
    // ============================================================================
    // STEP 5: PAYMENT PHONE (for mobile money methods)
    // ============================================================================
    
    /**
     * Send payment phone prompt
     */
    async sendPaymentPhonePrompt(userId, paymentMethod) {
        let message;
        
        if (paymentMethod === 'ecocash') {
            message = `📱 *EcoCash Payment Number*

Enter the phone number registered with EcoCash:

Example: *0771234567*

────────────────
Reply with the number
Type *hi* for main menu`;
        } else if (paymentMethod === 'onemoney') {
            message = `📱 *OneMoney Payment Number*

Enter the phone number registered with OneMoney:

Example: *0711234567*

────────────────
Reply with the number
Type *back* to change payment method
Type *hi* for main menu`;
        } else {
            // This shouldn't happen
            await this.sendConfirmation(userId, getActiveSession(userId));
            return;
        }
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle payment phone entry
     */
    async handlePaymentPhoneEntry(userId, message, session) {
        const input = message.trim().toLowerCase();
        
        // Handle main menu
        if (input === 'hi' || input === 'main_menu') {
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        const validation = this.validatePaymentPhone(message.trim(), session.data.paymentMethod);
        
        if (!validation.valid) {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return {
                    session: false,
                    returnToMain: true,
                    message: null
                };
            }
            
            await messaging.sendMessage(userId, 
                `❌ ${validation.error}\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return {
                session: true,
                message: null
            };
        }
        
        updateSessionStep(userId, 'confirm', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            paymentPhone: validation.formatted,
            paymentPhoneDisplay: validation.display
        });
        
        await this.sendConfirmation(userId, session);
        
        return {
            session: true,
            message: null
        };
    }
    
    // ============================================================================
    // STEP 6: CONFIRMATION - WITH BUTTONS
    // ============================================================================
    
    /**
     * Send confirmation message with buttons
     */
    async sendConfirmation(userId, session) {
        const { 
            recipientDisplay, 
            amount, 
            network, 
            currencyName,
            currencySymbol,
            serviceFee,
            totalAmount,
            paymentMethodName,
            paymentPhoneDisplay
        } = session.data;
        
        const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
        const feeDisplay = currencyName === 'USD' ? `$${serviceFee.toFixed(2)}` : `${serviceFee.toFixed(2)} ZiG`;
        const totalDisplay = currencyName === 'USD' ? `$${totalAmount.toFixed(2)}` : `${totalAmount.toFixed(2)} ZiG`;
        
        let paymentInfo = `💳 Payment: *${paymentMethodName}*`;
        if (paymentPhoneDisplay) {
            paymentInfo += `\n📱 Phone: *${paymentPhoneDisplay}*`;
        }
        
        const message = `📱 *Confirm Airtime Purchase*

━━━━━━━━━━━━━━━━━━
📞 To: *${recipientDisplay}*
📡 Network: *${network}*
💰 Amount: *${amountDisplay}*
${paymentInfo}
━━━━━━━━━━━━━━━━━━
Service Fee: ${feeDisplay}
*Total: ${totalDisplay}*
━━━━━━━━━━━━━━━━━━

Tap *Confirm* to proceed.`;
        
        await messaging.sendButtonMessage(
            userId,
            message,
            [
                { id: "confirm_yes", title: "✅ Confirm" },
                { id: "confirm_edit", title: "✏️ Edit" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
    }
    
    /**
     * Handle confirmation response
     */
    async handleConfirmation(userId, message, session) {
        const response = message.trim().toLowerCase();
        
        // Handle main menu
        if (response === 'hi' || response === 'main_menu') {
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        if (response === 'confirm_yes' || response === 'yes' || response === '1' || response === '✅ confirm') {
            await this.processPayment(userId, session);
            return {
                session: true, // Session will be deleted after payment completes
                message: null
            };
        } else if (response === 'confirm_edit' || response === 'edit' || response === '2') {
            // Go back to currency selection to edit everything
            updateSessionStep(userId, 'select_currency', FLOW_STATES.AIRTIME.SELECT_CURRENCY, {});
            await this.sendCurrencySelection(userId);
            return {
                session: true,
                message: null
            };
        } else {
            // Invalid response, show confirmation again
            await this.sendConfirmation(userId, session);
            return {
                session: true,
                message: null
            };
        }
    }
    
    // ============================================================================
    // PAYMENT PROCESSING
    // ============================================================================
    
    /**
     * Process payment with PayNow
     */
    async processPayment(userId, session) {
        try {
            const { 
                totalAmount, 
                paymentPhone, 
                paymentMethod,
                paymentMethodCode,
                paymentMethodName,
                network, 
                recipient, 
                amount, 
                currencyName,
                currencySymbol,
                serviceFee,
                recipientDisplay
            } = session.data;
            
            // CRITICAL: Ensure paymentPhone exists for mobile money methods
            if ((paymentMethod === 'ecocash' || paymentMethod === 'onemoney') && !paymentPhone) {
                throw new Error(`Phone number required for ${paymentMethod}`);
            }
            
            const reference = `AIR${Date.now().toString().slice(-8)}`;
            const transactionId = reference;
            
            console.log(`📝 [TiDB] Saving airtime transaction: ${transactionId}`);
            
            // Save pending transaction
            saveAirtimeTransaction({
                user_phone: userId.split('@')[0],
                transaction_id: transactionId,
                amount: amount,
                currency: currencyName,
                recipient_phone: recipient,
                network: network,
                status: 'pending',
                payment_method: paymentMethod,
                paynow_reference: reference
            });
            
            // IMPORTANT: Store transactionId in session for later use
            updateSessionStep(userId, 'processing', 'processing_payment', {
                reference: reference,
                transactionId: transactionId,
                paymentPhone: paymentPhone
            });
            
            await messaging.sendMessage(userId, `🔄 *Initiating payment...*`);
            
            console.log(`💳 [PAYNOW] Initiating ${paymentMethod} payment for ${currencyName} ${amount}`);
            
            // Initiate payment
            const paymentResult = await paynowService.initiateQuickPay({
                amount: totalAmount,
                reference: reference,
                phone: paymentPhone,
                method: paymentMethod,
                paymentMethodCode: paymentMethodCode,
                service: `Airtime (${currencyName}) - ${network}`,
                currency: currencyName
            });
            
            if (!paymentResult.success) {
                console.log(`❌ [PAYNOW] Failed: ${paymentResult.error}`);
                updateAirtimeTransaction(transactionId, {
                    status: 'failed',
                    error_message: paymentResult.error || 'Failed to initiate payment'
                });
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            const totalDisplay = currencyName === 'USD' ? `$${totalAmount.toFixed(2)}` : `${totalAmount.toFixed(2)} ZiG`;
            
            // Show payment instructions
            let instructionMessage;
            
            if (paymentMethod === 'ecocash' || paymentMethod === 'onemoney') {
                const displayPhone = paymentPhone?.toString().replace('263', '0') || 'N/A';
                instructionMessage = `📱 *Payment Request Sent*

    Amount: ${totalDisplay}
    Reference: ${reference}
    Phone: ${displayPhone}

    ✅ Check your phone and enter PIN to complete payment.

    ⏳ I'll notify you when payment is confirmed...`;
            } else {
                instructionMessage = `💳 *Payment Instructions*

    Amount: ${totalDisplay}
    Reference: ${reference}

    ${paymentResult.instructions || 'Complete payment using your selected method.'}

    ⏳ Waiting for payment confirmation...`;
            }
            
            await messaging.sendMessage(userId, instructionMessage);
            
            // Get the updated session with transactionId
            const updatedSession = getActiveSession(userId);
            
            // Start monitoring payment status with the transactionId
            if (paymentResult.pollUrl && updatedSession) {
                this.monitorPaymentStatus(userId, paymentResult.pollUrl, updatedSession);
            }
            
        } catch (error) {
            console.error(`❌ [AIRTIME] Payment error:`, error.message);
            await messaging.sendMessage(userId,
                `❌ *Payment Failed*\n\n${error.message}\n\nPlease try again or choose a different payment method.`
            );
            deleteSession(userId);
        }
    }
    
    // ============================================================================
// UPDATED monitorPaymentStatus in airtime.js
// ============================================================================

    /**
     * Monitor payment status
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        // Capture transactionId from session at the start
        const initialTransactionId = session?.data?.transactionId;
        const { recipient, amount, reference, network, currencyName, recipientDisplay } = session.data || {};
        
        console.log(`🔍 [AIRTIME] Starting payment monitoring for transaction: ${initialTransactionId}`);
        
        if (!initialTransactionId) {
            console.error(`❌ [AIRTIME] No transaction ID in session for ${userId}`);
            deleteSession(userId);
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts * 3 seconds = 90 seconds
        const pollInterval = 3000;
        
        const checkStatus = async () => {
            attempts++;
            
            const currentSession = getActiveSession(userId);
            if (!currentSession) {
                clearInterval(intervalId);
                return;
            }
            
            if (attempts > maxAttempts) {
                clearInterval(intervalId);
                
                // Check if transaction was already completed by webhook
                try {
                    const { getTransactionStatus } = require('../utils/tidb');
                    const currentStatus = await getTransactionStatus(initialTransactionId);
                    
                    if (currentStatus !== 'completed' && currentStatus !== 'payment_received') {
                        updateAirtimeTransaction(initialTransactionId, { status: 'expired' });
                        
                        await messaging.sendMessage(userId,
                            `⏰ *Payment Timeout*\n\nReference: ${reference}\n\nType *hi* to try again.`
                        );
                    }
                } catch (error) {
                    console.error(`❌ [AIRTIME] Status check error on timeout:`, error.message);
                }
                
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynowService.checkPaymentStatus(pollUrl);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    
                    // Check if transaction was already completed by webhook
                    try {
                        const { getTransactionStatus } = require('../utils/tidb');
                        const currentStatus = await getTransactionStatus(initialTransactionId);
                        
                        if (currentStatus !== 'completed' && currentStatus !== 'payment_received') {
                            console.log(`✅ [AIRTIME] Payment confirmed via polling for ${initialTransactionId}`);
                            
                            updateAirtimeTransaction(initialTransactionId, {
                                status: 'payment_received',
                                paynow_reference: status.reference || reference
                            });
                            
                            // Update session with current transactionId
                            if (currentSession && currentSession.data) {
                                currentSession.data.transactionId = initialTransactionId;
                            }
                            
                            await this.fulfillPurchase(userId, currentSession, status);
                        } else {
                            console.log(`ℹ️ [AIRTIME] Transaction ${initialTransactionId} already completed via webhook, skipping fulfillment`);
                            
                            const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
                            
                            const successMessage = `✅ *Airtime Sent!*

    📞 To: ${recipientDisplay}
    💰 Amount: ${amountDisplay}
    🔖 Ref: ${reference}

    Thank you for using CCHub! 💎

    ────────────────
    What would you like to do next?`;

                            await messaging.sendButtonMessage(
                                userId,
                                successMessage,
                                [
                                    { id: "airtime", title: "📱 Another Airtime" },
                                    { id: "menu", title: "🏠 Main Menu" }
                                ]
                            );
                            
                            deleteSession(userId);
                        }
                    } catch (error) {
                        console.error(`❌ [AIRTIME] Error checking status after payment:`, error.message);
                    }
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    
                    try {
                        const { getTransactionStatus } = require('../utils/tidb');
                        const currentStatus = await getTransactionStatus(initialTransactionId);
                        
                        if (currentStatus !== 'failed' && currentStatus !== 'cancelled') {
                            updateAirtimeTransaction(initialTransactionId, { status: 'cancelled' });
                        }
                    } catch (error) {
                        console.error(`❌ [AIRTIME] Error updating cancelled status:`, error.message);
                    }
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Cancelled*\n\nReference: ${reference}\n\nType *hi* to try again.`
                    );
                    deleteSession(userId);
                }
                
            } catch (error) {
                console.error(`❌ [AIRTIME] Status check error:`, error.message);
            }
        };
        
        const intervalId = setInterval(checkStatus, pollInterval);
        setTimeout(checkStatus, 2000);
    }
    // ============================================================================
    // UPDATED fulfillPurchase in airtime.js
    // ============================================================================

    /**
     * Fulfill airtime purchase
     */
    async fulfillPurchase(userId, session, paymentStatus) {
        const { 
            network, 
            recipient, 
            amount, 
            reference,
            transactionId,
            currencyName,
            recipientDisplay,
            paymentMethod,
            paymentPhone
        } = session.data;
        
        try {
            // Check if already completed (double-check to be safe)
            const { getTransactionStatus } = require('../utils/tidb');
            const currentStatus = await getTransactionStatus(transactionId);
            
            if (currentStatus === 'completed') {
                console.log(`ℹ️ [AIRTIME] Transaction ${transactionId} already completed, skipping fulfillment`);
                
                const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
                
                const successMessage = `✅ *Airtime Sent!*

    📞 To: ${recipientDisplay}
    💰 Amount: ${amountDisplay}
    🔖 Ref: ${reference}

    Thank you for using CCHub! 💎

    ────────────────
    What would you like to do next?`;

                await messaging.sendButtonMessage(
                    userId,
                    successMessage,
                    [
                        { id: "airtime", title: "📱 Another Airtime" },
                        { id: "menu", title: "🏠 Main Menu" }
                    ]
                );
                
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId,
                `✅ *Payment Confirmed!*\n\n` +
                `🌶️ *Getting your airtime. Please wait...*`
            );
            
            // Purchase via HotRecharge
            let hotrechargeResult;
            
            if (currencyName === 'USD') {
                hotrechargeResult = await hotrecharge.airtime.usd.purchase({
                    recipient: recipient,
                    amount: amount,
                    userId: userId.split('@')[0].slice(-4)
                });
            } else {
                hotrechargeResult = await hotrecharge.airtime.zig.purchase({
                    recipient: recipient,
                    amount: amount,
                    userId: userId.split('@')[0].slice(-4)
                });
            }
            
            if (hotrechargeResult.success) {
                // Update transaction to completed (only if not already done)
                if (transactionId) {
                    updateAirtimeTransaction(transactionId, {
                        status: 'completed',
                        hotrecharge_reference: hotrechargeResult.reference || hotrechargeResult.agentReference || null,
                        completed_at: new Date()
                    });
                }
                
                // Save for quick service
                await updateUserPrefs(userId, 'airtime', {
                    recipient: recipient,
                    network: network,
                    amount: amount,
                    currency: currencyName,
                    paymentMethod: paymentMethod,
                    paymentPhone: paymentPhone
                });
                
                const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
                
                // COMBINED message with buttons - NO DUPLICATION
                const successMessage = `✅ *Airtime Sent!*

    📞 To: ${recipientDisplay}
    💰 Amount: ${amountDisplay}
    🔖 Ref: ${reference}

    Thank you for using CCHub! 💎

    ────────────────
    What would you like to do next?`;

                // Send ONE message with buttons
                await messaging.sendButtonMessage(
                    userId,
                    successMessage,
                    [
                        { id: "airtime", title: "📱 Another Airtime" },
                        { id: "menu", title: "🏠 Main Menu" }
                    ]
                );
                
            } else {
                if (transactionId) {
                    updateAirtimeTransaction(transactionId, {
                        status: 'failed',
                        error_message: hotrechargeResult.error || 'HotRecharge failed'
                    });
                }
                
                // COMBINED error message with buttons
                const errorMessage = `⚠️ *Payment Successful but Airtime Failed*

    Reference: ${reference}

    Our team has been notified and will resolve this within 15 minutes.

    ────────────────
    What would you like to do next?`;

                await messaging.sendButtonMessage(
                    userId,
                    errorMessage,
                    [
                        { id: "airtime", title: "📱 Try Again" },
                        { id: "menu", title: "🏠 Main Menu" }
                    ]
                );
            }
            
        } catch (error) {
            console.error(`❌ [AIRTIME] Fulfillment error:`, error.message);
            
            if (transactionId) {
                updateAirtimeTransaction(transactionId, {
                    status: 'failed',
                    error_message: error.message
                });
            }
            
            // COMBINED error message with buttons
            const errorMessage = `⚠️ *Payment Successful but Airtime Failed*

    Reference: ${reference}

    Our team has been notified and will resolve this within 15 minutes.

    ────────────────
    What would you like to do next?`;

            await messaging.sendButtonMessage(
                userId,
                errorMessage,
                [
                    { id: "airtime", title: "📱 Try Again" },
                    { id: "menu", title: "🏠 Main Menu" }
                ]
            );
            
        } finally {
            deleteSession(userId);
        }
    }
    
    // ============================================================================
    // VALIDATION HELPERS
    // ============================================================================
    
    /**
     * Validate phone number
     */
    validatePhoneNumber(phone) {
        const digits = phone.replace(/\D/g, '');
        
        if (digits.length === 10 && digits.startsWith('0')) {
            return {
                valid: true,
                formatted: '263' + digits.substring(1),
                display: digits,
                error: null
            };
        } else if (digits.length === 12 && digits.startsWith('263')) {
            return {
                valid: true,
                formatted: digits,
                display: '0' + digits.substring(3),
                error: null
            };
        } else if (digits.length === 9 && !digits.startsWith('0')) {
            return {
                valid: true,
                formatted: '263' + digits,
                display: '0' + digits,
                error: null
            };
        }
        
        return {
            valid: false,
            formatted: null,
            display: null,
            error: 'Invalid Zimbabwean number. Use format: 0771234567'
        };
    }
    
    /**
     * Detect network from phone number
     */
    detectNetwork(phone) {
        if (phone.startsWith('26377') || phone.startsWith('077')) return 'Econet';
        if (phone.startsWith('26371') || phone.startsWith('071')) return 'NetOne';
        if (phone.startsWith('26373') || phone.startsWith('073')) return 'Telecel';
        return 'Unknown';
    }
    
    /**
     * Validate payment phone against provider
     */
    validatePaymentPhone(phone, provider) {
        const digits = phone.replace(/\D/g, '');
        let formatted = '';
        let display = '';
        
        if (digits.length === 10 && digits.startsWith('0')) {
            formatted = '263' + digits.substring(1);
            display = digits;
        } else if (digits.length === 12 && digits.startsWith('263')) {
            formatted = digits;
            display = '0' + digits.substring(3);
        } else if (digits.length === 9 && !digits.startsWith('0')) {
            formatted = '263' + digits;
            display = '0' + digits;
        } else {
            return {
                valid: false,
                formatted: null,
                display: null,
                error: 'Invalid phone number. Use 0771234567'
            };
        }
        
        // Check provider prefixes
        if (provider === 'ecocash') {
            if (!formatted.startsWith('26377') && !formatted.startsWith('26378')) {
                return {
                    valid: false,
                    formatted: null,
                    display: null,
                    error: 'EcoCash uses 077 or 078 prefixes'
                };
            }
        } else if (provider === 'onemoney') {
            if (!formatted.startsWith('26371')) {
                return {
                    valid: false,
                    formatted: null,
                    display: null,
                    error: 'OneMoney uses 071 prefix'
                };
            }
        }
        
        return { valid: true, formatted, display, error: null };
    }
    
    // ============================================================================
    // MAIN REQUEST HANDLER
    // ============================================================================
    
    /**
     * Main request handler
     */
    async handleRequest(userId, message, session) {
        console.log(`📱 [AIRTIME] Request at state ${session?.flow || 'undefined'}: "${message}"`);
        
        // Guard against undefined session
        if (!session || !session.flow) {
            console.error(`❌ [AIRTIME] Invalid session for ${userId}`);
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        let result = {
            session: true,
            returnToMain: false,
            message: null
        };
        
        // Route based on current flow state
        switch(session.flow) {
            case FLOW_STATES.AIRTIME.SELECT_CURRENCY:
                await this.handleCurrencySelection(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_PHONE:
                await this.handleRecipientEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_AMOUNT:
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.SELECT_PAYMENT_METHOD:
                await this.handlePaymentMethodSelection(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_PAYMENT_PHONE:
                await this.handlePaymentPhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.CONFIRM_PAYMENT:
                await this.handleConfirmation(userId, message, session);
                break;
                
            default:
                console.error(`❌ [AIRTIME] Unknown flow state: ${session.flow}`);
                deleteSession(userId);
                result.session = false;
                result.returnToMain = true;
        }
        
        return result;
    }
}

module.exports = new AirtimeService();