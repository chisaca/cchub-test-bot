// ============================================================================
// NYARADZO FUNERAL PAYMENT FLOW - UPDATED with Airtime Pattern
// Handles the complete Nyaradzo policy payment flow:
// 
// 3-Tap Flow:
// Tap 1: Main Menu → Bills → Nyaradzo
// Tap 2: Follow button prompts
// Tap 3: Confirm → Payment processed
// 
// Currency: ZiG only (as per business rules)
// Fee: 5% service fee
// ============================================================================

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { saveBillTransaction, updateBillTransaction, generateTransactionId } = require('../utils/tidb');
const { updateUserPrefs } = require('../utils/userPrefs');
const { 
    getEncouragement, 
    addPaymentPersonality,
    addRandomFact
} = require('../utils/personality');
const { 
    FLOW_STATES, 
    PAYMENT_CONFIG, 
    BILLERS,
    RESPONSE_MESSAGES, 
    PAYMENT_PROVIDERS,
    PAYMENT_METHOD_CONFIG,
    PAYMENT_PREFIXES,
    VALIDATION_CONFIG
} = require('../config/constants');

class NyaradzoService {
    
    // ============================================================================
    // FLOW INITIATION - Tap 1
    // ============================================================================
    
    /**
     * Start the Nyaradzo flow
     * Tap 1: User selects Nyaradzo from Bills menu
     * 
     * @param {string} userId - WhatsApp user ID
     * @returns {Promise<Object>} Result with session
     */
    async startFlow(userId) {
        console.log(`🌸 [NYARADZO] Starting flow for ${userId}`);
        
        // Check if session already exists
        let session = getActiveSession(userId);
        
        if (!session) {
            // Create new session only if none exists
            session = createSession(userId, 'nyaradzo');
            console.log(`🌸 [NYARADZO] Created new session for ${userId}`);
        } else {
            console.log(`🌸 [NYARADZO] Using existing session for ${userId}`);
        }
        
        const nyaradzo = BILLERS['1']; // Nyaradzo is biller 1
        
        // Initialize session with Nyaradzo config
        updateSessionStep(userId, 'enter_policy', FLOW_STATES.BILL_PAYMENT.ENTER_ACCOUNT, {
            biller: nyaradzo.key,
            billerName: nyaradzo.name,
            productId: nyaradzo.productId,
            accountTypeId: nyaradzo.accountTypeId,
            currency: nyaradzo.currency,
            currencyName: 'ZiG',
            minAmount: nyaradzo.minAmount,
            maxAmount: nyaradzo.maxAmount
        });
        
        // Send policy number prompt
        await this.sendPolicyPrompt(userId);
        
        return {
            message: null,
            session: session
        };
    }
    
    // ============================================================================
    // STEP 1: POLICY NUMBER ENTRY
    // ============================================================================
    
    /**
     * Send policy number prompt
     */
    async sendPolicyPrompt(userId) {
        const message = `🌸 *Nyaradzo Policy Number*

Enter your 8-digit Nyaradzo policy number:

Example: *12345678*

────────────────
Reply with the policy number
Type *hi* for main menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle policy number entry
     */
    async handlePolicyEntry(userId, message, session) {
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
        
        // Validate policy number (8 digits)
        const policyNumber = message.replace(/\D/g, '');
        
        if (!/^\d{8}$/.test(policyNumber)) {
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
                `❌ Invalid policy number. Please enter 8 digits.\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return {
                session: true,
                message: null
            };
        }
        
        // Send verifying message
        await messaging.sendMessage(userId, `⏳ Verifying policy number...`);
        
        // Verify policy with HotRecharge
        const verifyResult = await hotrecharge.nyaradzo.verifyPolicy(policyNumber);
        
        if (!verifyResult.success) {
            await messaging.sendMessage(userId, 
                `❌ Policy verification failed: ${verifyResult.error || 'Policy not found'}\n\n` +
                `Please check the policy number and try again.`
            );
            return {
                session: true,
                message: null
            };
        }
        
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.BILL_PAYMENT.ENTER_AMOUNT, {
            policyNumber: policyNumber,
            customerName: verifyResult.customerName || 'Unknown'
        });
        
        await this.sendAmountPrompt(userId, session.data.minAmount, session.data.maxAmount);
        
        return {
            session: true,
            message: null
        };
    }
    
    // ============================================================================
    // STEP 2: AMOUNT ENTRY
    // ============================================================================
    
    /**
     * Send amount prompt
     */
    async sendAmountPrompt(userId, minAmount, maxAmount) {
        const message = `💰 *Enter Amount*

Amount must be between:
• Minimum: ${minAmount.toLocaleString()} ZiG
• Maximum: ${maxAmount.toLocaleString()} ZiG

Example: *500* or *1000*

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
        
        const amount = parseFloat(message.replace(/,/g, ''));
        
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
                `❌ Please enter a valid amount (e.g., 500 or 1000).\n` +
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
            
            await messaging.sendMessage(userId, 
                `❌ Amount must be between ${session.data.minAmount.toLocaleString()} and ${session.data.maxAmount.toLocaleString()} ZiG.\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return {
                session: true,
                message: null
            };
        }
        
        // Send encouragement
        await messaging.sendMessage(userId, getEncouragement());
        
        // Calculate fees (5%)
        const fee = PAYMENT_CONFIG.SERVICE_FEES.NYARADZO; // 0.05 (5%)
        const serviceFee = parseFloat((amount * fee).toFixed(2));
        const totalAmount = parseFloat((amount + serviceFee).toFixed(2));
        
        updateSessionStep(userId, 'select_payment', FLOW_STATES.BILL_PAYMENT.SELECT_PAYMENT_METHOD, {
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount,
            feePercentage: 5
        });
        
        await this.sendPaymentMethodPrompt(userId);
        
        return {
            session: true,
            message: null
        };
    }
    
    // ============================================================================
    // STEP 3: PAYMENT METHOD SELECTION - WITH BUTTONS
    // ============================================================================

    /**
     * Send payment method prompt with buttons (ZiG only)
     */
    async sendPaymentMethodPrompt(userId) {
        const message = `💳 *Select Payment Method (ZiG)*`;
        
        await messaging.sendButtonMessage(
            userId,
            message,
            [
                { id: "pm_ecocash_zig", title: "💰 EcoCash ZiG" },
                { id: "pm_zimswitch_zig", title: "💳 Zimswitch ZiG" },
                { id: "pm_onemoney", title: "📱 OneMoney ZiG" },
                { id: "back", title: "🔙 Back" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
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
            updateSessionStep(userId, 'enter_amount', FLOW_STATES.BILL_PAYMENT.ENTER_AMOUNT, {
                policyNumber: session.data.policyNumber,
                customerName: session.data.customerName,
                minAmount: session.data.minAmount,
                maxAmount: session.data.maxAmount
            });
            await this.sendAmountPrompt(userId, session.data.minAmount, session.data.maxAmount);
            return {
                session: true,
                message: null
            };
        }
        
        // Map selection to payment method
        let paymentMethod, paymentProvider, paymentMethodCode, requiresPhone;
        
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
        
        const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
        
        updateSessionStep(userId, 'payment_phone', FLOW_STATES.BILL_PAYMENT.ENTER_PAYMENT_PHONE, {
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
            // Skip to notification phone
            updateSessionStep(userId, 'notification_phone', FLOW_STATES.BILL_PAYMENT.ENTER_NOTIFY_PHONE, {});
            await this.sendNotificationPhonePrompt(userId);
        }
        
        return {
            session: true,
            message: null
        };
    }
    
    /**
     * Handle invalid payment method
     */
    async handleInvalidPaymentMethod(userId, session) {
        const retryCount = incrementRetries(userId);
        
        if (retryCount) {
            await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
            deleteSession(userId);
            return;
        }
        
        await messaging.sendMessage(userId, 
            `❌ Please select a valid payment method using the buttons.\n` +
            `Attempts remaining: ${3 - (session.retries || 0)}`
        );
        
        await this.sendPaymentMethodPrompt(userId);
    }
    
    // ============================================================================
    // STEP 4: PAYMENT PHONE (for mobile money methods)
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
Type *hi* for main menu`;
        } else {
            // This shouldn't happen
            updateSessionStep(userId, 'notification_phone', FLOW_STATES.BILL_PAYMENT.ENTER_NOTIFY_PHONE, {});
            await this.sendNotificationPhonePrompt(userId);
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
        
        updateSessionStep(userId, 'notification_phone', FLOW_STATES.BILL_PAYMENT.ENTER_NOTIFY_PHONE, {
            paymentPhone: validation.formatted,
            paymentPhoneDisplay: validation.display
        });
        
        await this.sendNotificationPhonePrompt(userId);
        
        return {
            session: true,
            message: null
        };
    }
    
    // ============================================================================
    // STEP 5: NOTIFICATION PHONE (for SMS receipt)
    // ============================================================================
    
    /**
     * Send notification phone prompt
     */
    async sendNotificationPhonePrompt(userId) {
        const message = `📲 *SMS Receipt Number*

Enter the phone number to receive payment confirmation via SMS:

Example: *0771234567*

────────────────
Reply with the number
Type *hi* for main menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle notification phone entry
     */
    async handleNotificationPhoneEntry(userId, message, session) {
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
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return {
                session: true,
                message: null
            };
        }
        
        updateSessionStep(userId, 'confirm', FLOW_STATES.BILL_PAYMENT.CONFIRM_PAYMENT, {
            notifyNumber: validation.formatted,
            notifyDisplay: validation.display
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
            policyNumber,
            customerName,
            amount, 
            serviceFee,
            totalAmount,
            paymentMethodName,
            paymentPhoneDisplay,
            notifyDisplay,
            billerName
        } = session.data;
        
        const amountDisplay = `${amount.toLocaleString()} ZiG`;
        const feeDisplay = `${serviceFee.toLocaleString()} ZiG`;
        const totalDisplay = `${totalAmount.toLocaleString()} ZiG`;
        
        let paymentInfo = `💳 Payment: *${paymentMethodName}*`;
        if (paymentPhoneDisplay) {
            paymentInfo += `\n📱 Paid with: *${paymentPhoneDisplay}*`;
        }
        
        const message = `🌸 *Confirm ${billerName} Payment*

━━━━━━━━━━━━━━━━━━
🔢 Policy: *${policyNumber}*
👤 Customer: *${customerName || 'N/A'}*
💰 Amount: *${amountDisplay}*
${paymentInfo}
📲 SMS to: *${notifyDisplay}*
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
            // Go back to amount entry
            updateSessionStep(userId, 'enter_amount', FLOW_STATES.BILL_PAYMENT.ENTER_AMOUNT, {
                policyNumber: session.data.policyNumber,
                customerName: session.data.customerName,
                minAmount: session.data.minAmount,
                maxAmount: session.data.maxAmount
            });
            await this.sendAmountPrompt(userId, session.data.minAmount, session.data.maxAmount);
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
                policyNumber,
                customerName,
                amount, 
                serviceFee,
                notifyNumber,
                billerName
            } = session.data;
            
            // CRITICAL: Ensure paymentPhone exists for mobile money methods
            if ((paymentMethod === 'ecocash' || paymentMethod === 'onemoney') && !paymentPhone) {
                throw new Error(`Phone number required for ${paymentMethod}`);
            }
            
            // Use SHORT format for transaction ID - matches PayNow reference format
            const transactionId = `NYR${Date.now().toString().slice(-7)}`; // 11 chars total: NYR + 7 digits
            const reference = transactionId; // Use same ID for both
            
            console.log(`📝 [TiDB] Saving Nyaradzo transaction: ${transactionId}`);
            
            // Save pending transaction
            saveBillTransaction({
                user_phone: userId.split('@')[0],
                transaction_id: transactionId,
                biller_type: 'Nyaradzo',
                amount: amount,
                currency: 'ZiG',
                account_number: policyNumber,
                customer_name: customerName,
                status: 'pending',
                payment_method: paymentMethod,
                paynow_reference: reference
            });
            
            updateSessionStep(userId, 'processing', 'processing_payment', {
                reference: reference,
                transactionId: transactionId
            });
            
            await messaging.sendMessage(userId, `🔄 *Initiating payment...*`);
            
            console.log(`💳 [PAYNOW] Initiating ${paymentMethod} payment for Nyaradzo - ${amount} ZiG`);
            
            // Initiate payment
            const paymentResult = await paynowService.initiateQuickPay({
                amount: totalAmount,
                reference: reference,
                phone: paymentPhone,
                method: paymentMethod,
                paymentMethodCode: paymentMethodCode,
                service: `Nyaradzo Funeral`,
                currency: 'ZiG'
            });
            
            if (!paymentResult.success) {
                console.log(`❌ [PAYNOW] Failed: ${paymentResult.error}`);
                updateBillTransaction(transactionId, {
                    status: 'failed',
                    error_message: paymentResult.error || 'Failed to initiate payment'
                });
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            const totalDisplay = `${totalAmount.toLocaleString()} ZiG`;
            
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
            
            // Start monitoring payment status
            if (paymentResult.pollUrl) {
                this.monitorPaymentStatus(userId, paymentResult.pollUrl, session);
            }
            
        } catch (error) {
            console.error(`❌ [NYARADZO] Payment error:`, error.message);
            await messaging.sendMessage(userId,
                `❌ *Payment Failed*\n\n${error.message}\n\nPlease try again or choose a different payment method.`
            );
            deleteSession(userId);
        }
    }
    
    /**
     * Monitor payment status
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        // Get transactionId from session - this is the SHORT format
        const transactionId = session?.data?.transactionId;
        
        console.log(`🔍 [NYARADZO] Starting payment monitoring for transaction: ${transactionId}`);
        
        if (!transactionId) {
            console.error(`❌ [NYARADZO] No transaction ID in session for ${userId}`);
            deleteSession(userId);
            return;
        }
        
        const { 
            policyNumber,
            customerName,
            amount, 
            reference,
            notifyNumber,
            paymentMethod,
            billerName
        } = session.data;
        
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
                    const currentStatus = await getTransactionStatus(transactionId);
                    
                    if (currentStatus !== 'completed' && currentStatus !== 'payment_received') {
                        updateBillTransaction(transactionId, { status: 'expired' });
                        
                        await messaging.sendMessage(userId,
                            `⏰ *Payment Timeout*\n\nReference: ${reference}\n\nType *hi* to try again.`
                        );
                    }
                } catch (error) {
                    console.error(`❌ [NYARADZO] Status check error on timeout:`, error.message);
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
                        const currentStatus = await getTransactionStatus(transactionId);
                        
                        if (currentStatus !== 'completed' && currentStatus !== 'payment_received') {
                            console.log(`✅ [NYARADZO] Payment confirmed via polling for ${transactionId}`);
                            
                            updateBillTransaction(transactionId, {
                                status: 'payment_received',
                                paynow_reference: status.reference || reference
                            });
                            
                            // Update session with current transactionId
                            if (currentSession && currentSession.data) {
                                currentSession.data.transactionId = transactionId;
                            }
                            
                            await this.fulfillPurchase(userId, currentSession, status);
                        } else {
                            console.log(`ℹ️ [NYARADZO] Transaction ${transactionId} already completed via webhook, skipping fulfillment`);
                            
                            const amountDisplay = `${amount.toLocaleString()} ZiG`;
                            
                            const successMessage = `✅ *Nyaradzo Payment Successful!*

🔢 Policy: ${policyNumber}
👤 Customer: ${customerName || 'N/A'}
💰 Amount: ${amountDisplay}
🔖 Ref: ${reference}

Thank you for using CCHub! 💎

────────────────
What would you like to do next?`;

                            await messaging.sendButtonMessage(
                                userId,
                                successMessage,
                                [
                                    { id: "bills_nyaradzo", title: "🌸 Another Payment" },
                                    { id: "menu", title: "🏠 Main Menu" }
                                ]
                            );
                            
                            deleteSession(userId);
                        }
                    } catch (error) {
                        console.error(`❌ [NYARADZO] Error checking status after payment:`, error.message);
                    }
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    
                    try {
                        const { getTransactionStatus } = require('../utils/tidb');
                        const currentStatus = await getTransactionStatus(transactionId);
                        
                        if (currentStatus !== 'failed' && currentStatus !== 'cancelled') {
                            updateBillTransaction(transactionId, { status: 'cancelled' });
                        }
                    } catch (error) {
                        console.error(`❌ [NYARADZO] Error updating cancelled status:`, error.message);
                    }
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Cancelled*\n\nReference: ${reference}\n\nType *hi* to try again.`
                    );
                    deleteSession(userId);
                }
                
            } catch (error) {
                console.error(`❌ [NYARADZO] Status check error:`, error.message);
            }
        };
        
        const intervalId = setInterval(checkStatus, pollInterval);
        setTimeout(checkStatus, 2000);
    }
    
    /**
     * Fulfill Nyaradzo purchase
     */
    async fulfillPurchase(userId, session, paymentStatus) {
        // Get transactionId from session
        const transactionId = session?.data?.transactionId;
        
        if (!transactionId) {
            console.error(`❌ [NYARADZO] No transaction ID in session for fulfillment`);
            deleteSession(userId);
            return;
        }
        
        const { 
            policyNumber,
            customerName,
            amount, 
            reference,
            notifyNumber,
            paymentMethod,
            billerName
        } = session.data;
        
        try {
            // Check if already completed
            const { getTransactionStatus } = require('../utils/tidb');
            const currentStatus = await getTransactionStatus(transactionId);
            
            if (currentStatus === 'completed') {
                console.log(`ℹ️ [NYARADZO] Transaction ${transactionId} already completed, skipping fulfillment`);
                
                const amountDisplay = `${amount.toLocaleString()} ZiG`;
                
                const successMessage = `✅ *Nyaradzo Payment Successful!*

🔢 Policy: ${policyNumber}
👤 Customer: ${customerName || 'N/A'}
💰 Amount: ${amountDisplay}
🔖 Ref: ${reference}

Thank you for using CCHub! 💎

────────────────
What would you like to do next?`;

                await messaging.sendButtonMessage(
                    userId,
                    successMessage,
                    [
                        { id: "bills_nyaradzo", title: "🌸 Another Payment" },
                        { id: "menu", title: "🏠 Main Menu" }
                    ]
                );
                
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId,
                `✅ *Payment Confirmed!*\n\n` +
                `🌸 *Processing Nyaradzo payment. Please wait...*`
            );
            
            // Process Nyaradzo payment via HotRecharge
            const paymentResult = await hotrecharge.nyaradzo.purchase({
                policyNumber,
                amount,
                notifyNumber,
                paymentPhone: session.data.paymentPhone,
                userId,
                customerName,
                reference
            });
            
            if (paymentResult.success) {
                // Update transaction to completed
                if (transactionId) {
                    updateBillTransaction(transactionId, {
                        status: 'completed',
                        hotrecharge_reference: paymentResult.transactionId || paymentResult.reference || null,
                        receipt_number: paymentResult.receiptNumber || paymentResult.transactionId,
                        completed_at: new Date()
                    });
                }
                
                // Save for quick service
                await updateUserPrefs(userId, 'nyaradzo', {
                    policyNumber: policyNumber,
                    customerName: customerName,
                    amount: amount,
                    currency: 'ZiG',
                    paymentMethod: paymentMethod
                });
                
                const amountDisplay = `${amount.toLocaleString()} ZiG`;
                
                // COMBINED success message with buttons
                const successMessage = `✅ *Nyaradzo Payment Successful!*

🔢 Policy: ${policyNumber}
👤 Customer: ${customerName || 'N/A'}
💰 Amount: ${amountDisplay}
🔖 Ref: ${reference}
📋 Receipt: ${paymentResult.receiptNumber || paymentResult.transactionId || reference}

Thank you for using CCHub! 💎

────────────────
What would you like to do next?`;

                // Send ONE message with buttons
                await messaging.sendButtonMessage(
                    userId,
                    successMessage,
                    [
                        { id: "bills_nyaradzo", title: "🌸 Another Payment" },
                        { id: "menu", title: "🏠 Main Menu" }
                    ]
                );
                
                // Add random fact
                const factMessage = addRandomFact("");
                if (factMessage) {
                    await messaging.sendMessage(userId, factMessage);
                }
                
            } else {
                if (transactionId) {
                    updateBillTransaction(transactionId, {
                        status: 'failed',
                        error_message: paymentResult.error || 'Nyaradzo payment failed'
                    });
                }
                
                // COMBINED error message with buttons
                const errorMessage = `⚠️ *Payment Successful but Processing Failed*

Reference: ${reference}

Our team has been notified and will resolve this within 15 minutes.

────────────────
What would you like to do next?`;

                await messaging.sendButtonMessage(
                    userId,
                    errorMessage,
                    [
                        { id: "bills_nyaradzo", title: "🌸 Try Again" },
                        { id: "menu", title: "🏠 Main Menu" }
                    ]
                );
            }
            
        } catch (error) {
            console.error(`❌ [NYARADZO] Fulfillment error:`, error.message);
            
            if (transactionId) {
                updateBillTransaction(transactionId, {
                    status: 'failed',
                    error_message: error.message
                });
            }
            
            // COMBINED error message with buttons
            const errorMessage = `⚠️ *Payment Successful but Processing Failed*

Reference: ${reference}

Our team has been notified and will resolve this within 15 minutes.

────────────────
What would you like to do next?`;

            await messaging.sendButtonMessage(
                userId,
                errorMessage,
                [
                    { id: "bills_nyaradzo", title: "🌸 Try Again" },
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
        console.log(`🌸 [NYARADZO] Request at state ${session?.flow || 'undefined'}: "${message}"`);
        
        // Guard against undefined session
        if (!session || !session.flow) {
            console.error(`❌ [NYARADZO] Invalid session for ${userId}`);
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
            case FLOW_STATES.BILL_PAYMENT.ENTER_ACCOUNT:
                await this.handlePolicyEntry(userId, message, session);
                break;
                
            case FLOW_STATES.BILL_PAYMENT.ENTER_AMOUNT:
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.BILL_PAYMENT.SELECT_PAYMENT_METHOD:
                await this.handlePaymentMethodSelection(userId, message, session);
                break;
                
            case FLOW_STATES.BILL_PAYMENT.ENTER_PAYMENT_PHONE:
                await this.handlePaymentPhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.BILL_PAYMENT.ENTER_NOTIFY_PHONE:
                await this.handleNotificationPhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.BILL_PAYMENT.CONFIRM_PAYMENT:
                await this.handleConfirmation(userId, message, session);
                break;
                
            default:
                console.error(`❌ [NYARADZO] Unknown flow state: ${session.flow}`);
                deleteSession(userId);
                result.session = false;
                result.returnToMain = true;
        }
        
        return result;
    }
}

module.exports = new NyaradzoService();