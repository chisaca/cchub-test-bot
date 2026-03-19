// ============================================================================
// AIRTIME SERVICE - REVERTED to Numbered/Button Approach
// Handles the complete airtime purchase flow using numbered selections and buttons
// 
// 3-Tap Flow:
// Tap 1: Main Menu → Airtime
// Tap 2: Select currency → Enter phone → Enter amount → Select payment method
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
    UI_MESSAGES,
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
        
        // Create session
        const session = createSession(userId, 'airtime');
        
        // Send currency selection (first step)
        await this.sendCurrencySelection(userId);
        
        updateSessionStep(userId, 'select_currency', FLOW_STATES.AIRTIME.SELECT_CURRENCY);
        
        return {
            message: null,
            session: session
        };
    }
    
    // ============================================================================
    // STEP 1: CURRENCY SELECTION
    // ============================================================================
    
    /**
     * Send currency selection prompt with numbered options
     */
    async sendCurrencySelection(userId) {
        const message = `📱 *Airtime Purchase*

Please select currency:

1️⃣ *ZiG* (Econet only)
2️⃣ *USD* (All networks)

────────────────
Reply with *1* or *2*
Type *hi* to cancel`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle currency selection
     */
    async handleCurrencySelection(userId, message, session) {
        const selection = message.trim();
        
        if (selection !== '1' && selection !== '2') {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Please reply with *1* for ZiG or *2* for USD.\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return;
        }
        
        const currencyOption = selection === '1' ? AIRTIME_CURRENCY_OPTIONS['1'] : AIRTIME_CURRENCY_OPTIONS['2'];
        
        updateSessionStep(userId, 'enter_phone', FLOW_STATES.AIRTIME.ENTER_PHONE, {
            currency: currencyOption.id,
            currencyName: currencyOption.name,
            currencySymbol: currencyOption.symbol,
            minAmount: currencyOption.min,
            maxAmount: currencyOption.max,
            productMap: currencyOption.hotrecharge_product_map
        });
        
        await this.sendPhonePrompt(userId, currencyOption.name);
    }
    
    // ============================================================================
    // STEP 2: PHONE NUMBER ENTRY
    // ============================================================================
    
    /**
     * Send phone number prompt
     */
    async sendPhonePrompt(userId, currencyName) {
        const message = `📞 *Recipient's Phone Number*

Enter the phone number you want to top up:

Example: *0771234567* or *263771234567*

────────────────
Type *back* to change currency
Type *hi* to cancel`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle phone number entry
     */
    async handleRecipientEntry(userId, message, session) {
        const phone = message.trim();
        
        if (phone.toLowerCase() === 'back') {
            updateSessionStep(userId, 'select_currency', FLOW_STATES.AIRTIME.SELECT_CURRENCY, {});
            await this.sendCurrencySelection(userId);
            return;
        }
        
        const validation = this.validatePhoneNumber(phone);
        
        if (!validation.valid) {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ ${validation.error}\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return;
        }
        
        // Detect network from phone number
        const network = this.detectNetwork(validation.formatted);
        
        // Check if network is supported for selected currency
        if (session.data.currencyName === 'ZiG' && network !== 'Econet') {
            await messaging.sendMessage(userId, 
                `❌ ZiG airtime is only available for *Econet* numbers.\n\n` +
                `The number you entered (${validation.display}) appears to be ${network}.\n\n` +
                `Type *back* to choose USD instead.`
            );
            return;
        }
        
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT, {
            recipient: validation.formatted,
            recipientDisplay: validation.display,
            network: network
        });
        
        await this.sendAmountPrompt(userId, session.data.currencyName, session.data.minAmount, session.data.maxAmount);
    }
    
    // ============================================================================
    // STEP 3: AMOUNT ENTRY
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
Type *back* to change phone number
Type *hi* to cancel`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle amount entry
     */
    async handleAmountEntry(userId, message, session) {
        const amountStr = message.trim();
        
        if (amountStr.toLowerCase() === 'back') {
            updateSessionStep(userId, 'enter_phone', FLOW_STATES.AIRTIME.ENTER_PHONE, {
                currency: session.data.currency,
                currencyName: session.data.currencyName,
                currencySymbol: session.data.currencySymbol,
                minAmount: session.data.minAmount,
                maxAmount: session.data.maxAmount
            });
            await this.sendPhonePrompt(userId, session.data.currencyName);
            return;
        }
        
        const amount = parseFloat(amountStr);
        
        if (isNaN(amount) || amount <= 0) {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Please enter a valid number (e.g., 5 or 10.50).\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return;
        }
        
        if (amount < session.data.minAmount || amount > session.data.maxAmount) {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            const minDisplay = session.data.currencyName === 'USD' ? `$${session.data.minAmount}` : `${session.data.minAmount} ZiG`;
            const maxDisplay = session.data.currencyName === 'USD' ? `$${session.data.maxAmount}` : `${session.data.maxAmount} ZiG`;
            
            await messaging.sendMessage(userId, 
                `❌ Amount must be between ${minDisplay} and ${maxDisplay}.\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return;
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
    }
    
    // ============================================================================
    // STEP 4: PAYMENT METHOD SELECTION
    // ============================================================================
    
    /**
     * Send payment method prompt based on currency
     */
    async sendPaymentMethodPrompt(userId, currencyName) {
        let message;
        
        if (currencyName === 'USD') {
            message = `💳 *Select Payment Method (USD)*

1️⃣ *💰 EcoCash USD*
2️⃣ *💳 Zimswitch USD*
3️⃣ *🏦 InnBucks USD*

────────────────
Reply with *1-3*
Type *back* to change amount
Type *hi* to cancel`;
        } else {
            message = `💳 *Select Payment Method (ZiG)*

1️⃣ *💰 EcoCash ZiG*
2️⃣ *💳 Zimswitch ZiG*
3️⃣ *📱 OneMoney ZiG*

────────────────
Reply with *1-3*
Type *back* to change amount
Type *hi* to cancel`;
        }
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle payment method selection
     */
    async handlePaymentMethodSelection(userId, message, session) {
        const selection = message.trim();
        
        if (selection.toLowerCase() === 'back') {
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
            return;
        }
        
        // Map selection to payment method
        let paymentMethod, paymentProvider, paymentMethodCode;
        
        if (session.data.currencyName === 'USD') {
            switch(selection) {
                case '1':
                    paymentMethod = 'ecocash';
                    paymentProvider = 'EcoCash USD';
                    paymentMethodCode = PAYMENT_PROVIDERS.USD.ECOCASH;
                    break;
                case '2':
                    paymentMethod = 'zimswitch';
                    paymentProvider = 'Zimswitch USD';
                    paymentMethodCode = PAYMENT_PROVIDERS.USD.ZIMSWITCH;
                    break;
                case '3':
                    paymentMethod = 'innbucks';
                    paymentProvider = 'InnBucks USD';
                    paymentMethodCode = PAYMENT_PROVIDERS.USD.INNBUCKS;
                    break;
                default:
                    await this.handleInvalidPaymentMethod(userId, session);
                    return;
            }
        } else {
            switch(selection) {
                case '1':
                    paymentMethod = 'ecocash';
                    paymentProvider = 'EcoCash ZiG';
                    paymentMethodCode = PAYMENT_PROVIDERS.ZIG.ECOCASH;
                    break;
                case '2':
                    paymentMethod = 'zimswitch';
                    paymentProvider = 'Zimswitch ZiG';
                    paymentMethodCode = PAYMENT_PROVIDERS.ZIG.ZIMSWITCH;
                    break;
                case '3':
                    paymentMethod = 'onemoney';
                    paymentProvider = 'OneMoney ZiG';
                    paymentMethodCode = PAYMENT_PROVIDERS.ZIG.ONEMONEY;
                    break;
                default:
                    await this.handleInvalidPaymentMethod(userId, session);
                    return;
            }
        }
        
        const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
        
        updateSessionStep(userId, 'confirm', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            paymentMethod: paymentMethod,
            paymentProvider: paymentProvider,
            paymentMethodCode: paymentMethodCode,
            paymentMethodName: methodConfig.name,
            requiresPaymentPhone: methodConfig.requiresPhone
        });
        
        // If payment method requires phone, ask for it
        if (methodConfig.requiresPhone) {
            await this.sendPaymentPhonePrompt(userId, paymentMethod);
        } else {
            await this.sendConfirmation(userId, session);
        }
    }
    
    /**
     * Handle invalid payment method selection
     */
    async handleInvalidPaymentMethod(userId, session) {
        const retryCount = incrementRetries(userId);
        
        if (retryCount) {
            await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
            deleteSession(userId);
            return;
        }
        
        await messaging.sendMessage(userId, 
            `❌ Invalid selection. Please choose 1-3.\n` +
            `Attempts remaining: ${3 - (session.retries || 0)}`
        );
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
Type *back* to change payment method
Type *hi* to cancel`;
        } else if (paymentMethod === 'onemoney') {
            message = `📱 *OneMoney Payment Number*

Enter the phone number registered with OneMoney:

Example: *0711234567*

────────────────
Type *back* to change payment method
Type *hi* to cancel`;
        } else {
            // This shouldn't happen for methods that don't require phone
            await this.sendConfirmation(userId, getActiveSession(userId));
            return;
        }
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle payment phone entry
     */
    async handlePaymentPhoneEntry(userId, message, session) {
        const phone = message.trim();
        
        if (phone.toLowerCase() === 'back') {
            updateSessionStep(userId, 'select_payment', FLOW_STATES.AIRTIME.SELECT_PAYMENT_METHOD, {
                amount: session.data.amount,
                serviceFee: session.data.serviceFee,
                totalAmount: session.data.totalAmount
            });
            await this.sendPaymentMethodPrompt(userId, session.data.currencyName);
            return;
        }
        
        const validation = this.validatePaymentPhone(phone, session.data.paymentMethod);
        
        if (!validation.valid) {
            const retryCount = incrementRetries(userId);
            
            if (retryCount) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ ${validation.error}\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return;
        }
        
        updateSessionStep(userId, 'confirm', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            paymentPhone: validation.formatted,
            paymentPhoneDisplay: validation.display
        });
        
        await this.sendConfirmation(userId, session);
    }
    
    // ============================================================================
    // STEP 6: CONFIRMATION
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
            paymentMethodName
        } = session.data;
        
        const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
        const feeDisplay = currencyName === 'USD' ? `$${serviceFee.toFixed(2)}` : `${serviceFee.toFixed(2)} ZiG`;
        const totalDisplay = currencyName === 'USD' ? `$${totalAmount.toFixed(2)}` : `${totalAmount.toFixed(2)} ZiG`;
        
        const message = `📱 *Confirm Airtime Purchase*

━━━━━━━━━━━━━━━━━━
📞 To: *${recipientDisplay}*
📡 Network: *${network}*
💰 Amount: *${amountDisplay}*
💳 Payment: *${paymentMethodName}*
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
                { id: "confirm_no", title: "❌ Cancel" }
            ]
        );
    }
    
    /**
     * Handle confirmation response
     */
    async handleConfirmation(userId, message, session) {
        const response = message.trim().toLowerCase();
        
        if (response === 'confirm_yes' || response === 'yes' || response === '1') {
            await this.processPayment(userId, session);
        } else if (response === 'confirm_edit' || response === 'edit' || response === '2') {
            // Go back to currency selection
            updateSessionStep(userId, 'select_currency', FLOW_STATES.AIRTIME.SELECT_CURRENCY, {});
            await this.sendCurrencySelection(userId);
        } else if (response === 'confirm_no' || response === 'no' || response === '3' || response === 'cancel') {
            await messaging.sendMessage(userId, `❌ Purchase cancelled.\n\nType *hi* for main menu.`);
            deleteSession(userId);
        } else {
            // Invalid response, show confirmation again
            await this.sendConfirmation(userId, session);
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
            
            const reference = `AIR${Date.now().toString().slice(-8)}`;
            const transactionId = generateTransactionId('AIR');
            
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
            
            updateSessionStep(userId, 'processing', 'processing_payment', {
                reference: reference,
                transactionId: transactionId
            });
            
            await messaging.sendMessage(userId, `🔄 *Initiating payment...*`);
            
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

${paymentResult.instructions}

⏳ Waiting for payment confirmation...`;
            }
            
            await messaging.sendMessage(userId, instructionMessage);
            
            // Start monitoring payment status
            if (paymentResult.pollUrl) {
                this.monitorPaymentStatus(userId, paymentResult.pollUrl, session);
            }
            
        } catch (error) {
            console.error(`❌ [AIRTIME] Payment error:`, error.message);
            await messaging.sendMessage(userId,
                `❌ *Payment Failed*\n\n${error.message}\n\nType *hi* to try again.`
            );
            deleteSession(userId);
        }
    }
    
    /**
     * Monitor payment status
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { recipient, amount, reference, network, currencyName, transactionId, recipientDisplay } = session.data;
        
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
                
                updateAirtimeTransaction(transactionId, { status: 'expired' });
                
                await messaging.sendMessage(userId,
                    `⏰ *Payment Timeout*\n\nReference: ${reference}\n\nType *hi* to try again.`
                );
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynowService.checkPaymentStatus(pollUrl);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    
                    updateAirtimeTransaction(transactionId, {
                        status: 'payment_received',
                        paynow_reference: status.reference || reference
                    });
                    
                    await this.fulfillPurchase(userId, session, status);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    
                    updateAirtimeTransaction(transactionId, { status: 'cancelled' });
                    
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
            recipientDisplay
        } = session.data;
        
        try {
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
                updateAirtimeTransaction(transactionId, {
                    status: 'completed',
                    hotrecharge_reference: hotrechargeResult.reference || hotrechargeResult.agentReference,
                    completed_at: new Date()
                });
                
                // Save for quick service
                updateUserPrefs(userId, 'airtime', {
                    recipient: recipient,
                    network: network,
                    amount: amount,
                    currency: currencyName,
                    paymentMethod: session.data.paymentMethod
                });
                
                const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
                
                const successMessage = `✅ *Airtime Sent!*

📞 To: ${recipientDisplay}
💰 Amount: ${amountDisplay}
🔖 Ref: ${reference}

Thank you for using CCHub! 💎`;
                
                await messaging.sendMessage(userId, successMessage);
                
                // Post-transaction buttons
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
                    `Our team has been notified.`
                );
                
                await messaging.sendPostTransactionButtons(
                    userId,
                    "What would you like to do next?"
                );
            }
            
        } catch (error) {
            console.error(`❌ [AIRTIME] Fulfillment error:`, error.message);
            
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
        console.log(`📱 [AIRTIME] Request at state ${session.flow}: "${message}"`);
        
        let result = {
            session: true,
            returnToMain: false,
            message: null
        };
        
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
                
            case 'airtime_enter_payment_phone':
                await this.handlePaymentPhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.CONFIRM_PAYMENT:
                await this.handleConfirmation(userId, message, session);
                break;
                
            default:
                console.error(`❌ [AIRTIME] Invalid flow state: ${session.flow}`);
                deleteSession(userId);
                result.session = false;
                result.returnToMain = true;
        }
        
        return result;
    }
}

module.exports = new AirtimeService();