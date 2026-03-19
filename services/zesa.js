// ============================================================================
// ZESA SERVICE - With Buttons and Main Menu Option
// Handles the complete ZESA token purchase flow using buttons and numbered options
// 
// 3-Tap Flow:
// Tap 1: Main Menu → ZESA
// Tap 2: Follow button prompts
// Tap 3: Confirm → Payment processed
// ============================================================================

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { saveZesaTransaction, updateZesaTransaction, generateTransactionId } = require('../utils/tidb');
const { updateUserPrefs } = require('../utils/userPrefs');
const { 
    getEncouragement, 
    addPaymentPersonality,
    addRandomFact
} = require('../utils/personality');
const { 
    FLOW_STATES, 
    PAYMENT_CONFIG, 
    ZESA_CURRENCY_OPTIONS,
    RESPONSE_MESSAGES, 
    PAYMENT_PROVIDERS,
    PAYMENT_METHOD_CONFIG,
    PAYMENT_PREFIXES,
    VALIDATION_CONFIG
} = require('../config/constants');

class ZesaService {
    
    // ============================================================================
    // FLOW INITIATION - Tap 1
    // ============================================================================
    
    /**
     * Start the ZESA flow
     * Tap 1: User selects ZESA from menu
     * 
     * @param {string} userId - WhatsApp user ID
     * @returns {Promise<Object>} Result with session
     */
    async startFlow(userId) {
        console.log(`⚡ [ZESA] Starting flow for ${userId}`);
        
        // Check if session already exists
        let session = getActiveSession(userId);
        
        if (!session) {
            // Create new session only if none exists
            session = createSession(userId, 'zesa');
            console.log(`⚡ [ZESA] Created new session for ${userId}`);
        } else {
            console.log(`⚡ [ZESA] Using existing session for ${userId}`);
        }
        
        // Send currency selection (first step) WITH BUTTONS
        await this.sendCurrencySelection(userId);
        
        updateSessionStep(userId, 'select_currency', FLOW_STATES.ZESA.SELECT_CURRENCY);
        
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
        const message = `⚡ *ZESA Token Purchase*

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
            currencyOption = ZESA_CURRENCY_OPTIONS['1'];
        } else if (selection === 'currency_usd' || selection === '2' || selection.includes('usd')) {
            currencyOption = ZESA_CURRENCY_OPTIONS['2'];
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
        
        updateSessionStep(userId, 'enter_meter', FLOW_STATES.ZESA.ENTER_METER, {
            currency: currencyOption.id,
            currencyName: currencyOption.name,
            currencySymbol: currencyOption.symbol,
            minAmount: currencyOption.min,
            maxAmount: currencyOption.max
        });
        
        await this.sendMeterPrompt(userId);
        
        return {
            session: true,
            message: null
        };
    }
    
    // ============================================================================
    // STEP 2: METER NUMBER ENTRY
    // ============================================================================
    
    /**
     * Send meter number prompt
     */
    async sendMeterPrompt(userId) {
        const message = `🔢 *ZESA Meter Number*

Enter your 11-digit ZESA meter number:

Example: *12345678901*

────────────────
Reply with the meter number
Type *hi* for main menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle meter number entry
     */
    async handleMeterEntry(userId, message, session) {
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
        
        // Validate meter number (11 digits)
        const meterNumber = message.replace(/\D/g, '');
        
        if (!/^\d{11}$/.test(meterNumber)) {
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
                `❌ Invalid meter number. Please enter 11 digits.\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}`
            );
            return {
                session: true,
                message: null
            };
        }
        
        // Send verifying message
        await messaging.sendMessage(userId, `⏳ Verifying meter number...`);
        
        // Verify meter with HotRecharge
        const verifyResult = await hotrecharge.verifyZesaMeter(meterNumber, session.data.currency);
        
        if (!verifyResult.success) {
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
                `❌ Meter verification failed: ${verifyResult.error || 'Invalid meter number'}\n\n` +
                `Attempts remaining: ${3 - (session.retries || 0)}\n\n` +
                `Please check the meter number and try again.`
            );
            return {
                session: true,
                message: null
            };
        }
        
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.ZESA.ENTER_AMOUNT, {
            meterNumber: meterNumber,
            customerName: verifyResult.customerName || 'Unknown'
        });
        
        await this.sendAmountPrompt(userId, session.data.currencyName, session.data.minAmount, session.data.maxAmount);
        
        return {
            session: true,
            message: null
        };
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

Example: *50* or *100.50*

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
                `❌ Please enter a valid number (e.g., 50 or 100.50).\n` +
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
        
        // Send encouragement
        await messaging.sendMessage(userId, getEncouragement());
        
        // Calculate fees (5%)
        const fee = PAYMENT_CONFIG.SERVICE_FEES.ZESA; // 0.05 (5%)
        const serviceFee = parseFloat((amount * fee).toFixed(2));
        const totalAmount = parseFloat((amount + serviceFee).toFixed(2));
        
        updateSessionStep(userId, 'select_payment', FLOW_STATES.ZESA.SELECT_PAYMENT_METHOD, {
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount,
            feePercentage: 5
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
                { id: "pm_innbucks", title: "🏦 InnBucks USD" },
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
            updateSessionStep(userId, 'enter_amount', FLOW_STATES.ZESA.ENTER_AMOUNT, {
                currency: session.data.currency,
                currencyName: session.data.currencyName,
                currencySymbol: session.data.currencySymbol,
                minAmount: session.data.minAmount,
                maxAmount: session.data.maxAmount,
                meterNumber: session.data.meterNumber,
                customerName: session.data.customerName
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
            } else if (selection === 'pm_innbucks' || selection === '3' || selection.includes('innbucks')) {
                paymentMethod = 'innbucks';
                paymentProvider = 'InnBucks USD';
                paymentMethodCode = PAYMENT_PROVIDERS.USD.INNBUCKS;
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
        
        updateSessionStep(userId, 'payment_phone', FLOW_STATES.ZESA.ENTER_PAYMENT_PHONE, {
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
            // Skip to notification phone for methods that don't need payment phone
            updateSessionStep(userId, 'notification_phone', FLOW_STATES.ZESA.ENTER_NOTIFICATION_PHONE, {});
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
        
        await this.sendPaymentMethodPrompt(userId, session.data.currencyName);
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
Type *hi* for main menu`;
        } else {
            // This shouldn't happen
            updateSessionStep(userId, 'notification_phone', FLOW_STATES.ZESA.ENTER_NOTIFICATION_PHONE, {});
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
        
        updateSessionStep(userId, 'notification_phone', FLOW_STATES.ZESA.ENTER_NOTIFICATION_PHONE, {
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
    // STEP 6: NOTIFICATION PHONE (for SMS token)
    // ============================================================================
    
    /**
     * Send notification phone prompt
     */
    async sendNotificationPhonePrompt(userId) {
        const message = `📲 *Token SMS Number*

Enter the phone number to receive the ZESA token via SMS:

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
        
        // IMPORTANT: Store BOTH formatted number and display version
        updateSessionStep(userId, 'confirm', FLOW_STATES.ZESA.CONFIRM_PAYMENT, {
            notifyNumber: validation.formatted,  // 263 format
            notifyDisplay: validation.display    // 0xx format for display
        });
        
        // Get updated session with new data
        const updatedSession = getActiveSession(userId);
        
        await this.sendConfirmation(userId, updatedSession);
        
        return {
            session: true,
            message: null
        };
    }
    
    /**
     * Send confirmation message with buttons
     */
    async sendConfirmation(userId, session) {
        const { 
            meterNumber,
            customerName,
            amount, 
            currencyName,
            serviceFee,
            totalAmount,
            paymentMethodName,
            paymentPhoneDisplay,
            notifyDisplay  // Make sure this is being destructured
        } = session.data;
        
        // Log to debug
        console.log(`📱 [ZESA] Confirmation data:`, {
            notifyDisplay,
            meterNumber,
            amount,
            paymentMethodName
        });
        
        const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
        const feeDisplay = currencyName === 'USD' ? `$${serviceFee.toFixed(2)}` : `${serviceFee.toFixed(2)} ZiG`;
        const totalDisplay = currencyName === 'USD' ? `$${totalAmount.toFixed(2)}` : `${totalAmount.toFixed(2)} ZiG`;
        
        let paymentInfo = `💳 Payment: *${paymentMethodName}*`;
        if (paymentPhoneDisplay) {
            paymentInfo += `\n📱 Paid with: *${paymentPhoneDisplay}*`;
        }
        
        const message = `⚡ *Confirm ZESA Purchase*

    ━━━━━━━━━━━━━━━━━━
    🔢 Meter: *${meterNumber}*
    👤 Customer: *${customerName || 'N/A'}*
    💰 Amount: *${amountDisplay}*
    ${paymentInfo}
    📲 SMS to: *${notifyDisplay || 'Not provided'}*
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
            updateSessionStep(userId, 'enter_amount', FLOW_STATES.ZESA.ENTER_AMOUNT, {
                currency: session.data.currency,
                currencyName: session.data.currencyName,
                currencySymbol: session.data.currencySymbol,
                minAmount: session.data.minAmount,
                maxAmount: session.data.maxAmount,
                meterNumber: session.data.meterNumber,
                customerName: session.data.customerName
            });
            await this.sendAmountPrompt(userId, session.data.currencyName, session.data.minAmount, session.data.maxAmount);
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
                meterNumber,
                customerName,
                amount, 
                currencyName,
                serviceFee,
                notifyNumber
            } = session.data;
            
            // CRITICAL: Ensure paymentPhone exists for mobile money methods
            if ((paymentMethod === 'ecocash' || paymentMethod === 'onemoney') && !paymentPhone) {
                throw new Error(`Phone number required for ${paymentMethod}`);
            }
            
            // Use SHORT format for transaction ID - matches PayNow reference format
            const transactionId = `ZESA${Date.now().toString().slice(-7)}`; // 11 chars total: ZESA + 7 digits
            const reference = transactionId; // Use same ID for both
            
            console.log(`📝 [TiDB] Saving ZESA transaction: ${transactionId}`);
            
            // Save pending transaction
            saveZesaTransaction({
                user_phone: userId.split('@')[0],
                transaction_id: transactionId,
                amount: amount,
                currency: currencyName,
                meter_number: meterNumber,
                customer_name: customerName,
                status: 'pending',
                payment_method: paymentMethod,
                paynow_reference: reference
            });
            
            // IMPORTANT: Update session with transactionId BEFORE any async operations
            // Get the current session first
            const currentSession = getActiveSession(userId);
            if (currentSession) {
                // Update the session data with transactionId
                currentSession.data.transactionId = transactionId;
                currentSession.data.reference = reference;
                currentSession.state = 'processing_payment';
                
                // Save the updated session
                updateSession(userId, { 
                    state: currentSession.state, 
                    data: currentSession.data 
                });
                
                console.log(`✅ [ZESA] Session updated with transactionId: ${transactionId}`);
            } else {
                console.error(`❌ [ZESA] Session lost before transactionId could be saved`);
                throw new Error('Session expired');
            }
            
            await messaging.sendMessage(userId, `🔄 *Initiating payment...*`);
            
            console.log(`💳 [PAYNOW] Initiating ${paymentMethod} payment for ZESA - ${currencyName} ${amount}`);
            
            // Initiate payment
            const paymentResult = await paynowService.initiateQuickPay({
                amount: totalAmount,
                reference: reference,
                phone: paymentPhone,
                method: paymentMethod,
                paymentMethodCode: paymentMethodCode,
                service: `ZESA (${currencyName})`,
                currency: currencyName
            });
            
            if (!paymentResult.success) {
                console.log(`❌ [PAYNOW] Failed: ${paymentResult.error}`);
                updateZesaTransaction(transactionId, {
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
            } else if (paymentMethod === 'innbucks') {
                instructionMessage = `🏦 *InnBucks Payment*

    Amount: ${totalDisplay}
    Reference: ${reference}

    ${paymentResult.instructions || 'Visit any InnBucks agent to complete payment.'}

    ⏳ After payment, your ZESA token will be sent to ${notifyDisplay || notifyNumber}`;
            } else {
                instructionMessage = `💳 *Payment Instructions*

    Amount: ${totalDisplay}
    Reference: ${reference}

    ${paymentResult.instructions || 'Complete payment using your selected method.'}

    ⏳ Waiting for payment confirmation...`;
            }
            
            await messaging.sendMessage(userId, instructionMessage);
            
            // Get the updated session AGAIN to ensure we have the latest
            const updatedSession = getActiveSession(userId);
            
            // Start monitoring payment status
            if (paymentResult.pollUrl && updatedSession) {
                console.log(`🔍 [ZESA] Starting payment monitoring for transaction: ${transactionId}`);
                this.monitorPaymentStatus(userId, paymentResult.pollUrl, updatedSession);
            } else {
                console.error(`❌ [ZESA] Cannot start monitoring:`, {
                    hasPollUrl: !!paymentResult.pollUrl,
                    hasSession: !!updatedSession,
                    transactionId
                });
            }
            
        } catch (error) {
            console.error(`❌ [ZESA] Payment error:`, error.message);
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
        
        console.log(`🔍 [ZESA] Starting payment monitoring for transaction: ${transactionId}`);
        
        if (!transactionId) {
            console.error(`❌ [ZESA] No transaction ID in session for ${userId}`);
            deleteSession(userId);
            return;
        }
        
        const { 
            meterNumber,
            customerName,
            amount, 
            reference,
            currencyName,
            notifyNumber,
            paymentMethod
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
                        updateZesaTransaction(transactionId, { status: 'expired' });
                        
                        await messaging.sendMessage(userId,
                            `⏰ *Payment Timeout*\n\nReference: ${reference}\n\nType *hi* to try again.`
                        );
                    }
                } catch (error) {
                    console.error(`❌ [ZESA] Status check error on timeout:`, error.message);
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
                            console.log(`✅ [ZESA] Payment confirmed via polling for ${transactionId}`);
                            
                            updateZesaTransaction(transactionId, {
                                status: 'payment_received',
                                paynow_reference: status.reference || reference
                            });
                            
                            // Update session with current transactionId
                            if (currentSession && currentSession.data) {
                                currentSession.data.transactionId = transactionId;
                            }
                            
                            await this.fulfillPurchase(userId, currentSession, status);
                        } else {
                            console.log(`ℹ️ [ZESA] Transaction ${transactionId} already completed via webhook, skipping fulfillment`);
                            
                            const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
                            
                            const successMessage = `✅ *ZESA Purchase Successful!*

🔢 Meter: ${meterNumber}
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
                                    { id: "zesa", title: "⚡ Another ZESA" },
                                    { id: "menu", title: "🏠 Main Menu" }
                                ]
                            );
                            
                            deleteSession(userId);
                        }
                    } catch (error) {
                        console.error(`❌ [ZESA] Error checking status after payment:`, error.message);
                    }
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    
                    try {
                        const { getTransactionStatus } = require('../utils/tidb');
                        const currentStatus = await getTransactionStatus(transactionId);
                        
                        if (currentStatus !== 'failed' && currentStatus !== 'cancelled') {
                            updateZesaTransaction(transactionId, { status: 'cancelled' });
                        }
                    } catch (error) {
                        console.error(`❌ [ZESA] Error updating cancelled status:`, error.message);
                    }
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Cancelled*\n\nReference: ${reference}\n\nType *hi* to try again.`
                    );
                    deleteSession(userId);
                }
                
            } catch (error) {
                console.error(`❌ [ZESA] Status check error:`, error.message);
            }
        };
        
        const intervalId = setInterval(checkStatus, pollInterval);
        setTimeout(checkStatus, 2000);
    }
    
    /**
     * Fulfill ZESA purchase
     */
    async fulfillPurchase(userId, session, paymentStatus) {
        // Get transactionId from session
        const transactionId = session?.data?.transactionId;
        
        if (!transactionId) {
            console.error(`❌ [ZESA] No transaction ID in session for fulfillment`);
            deleteSession(userId);
            return;
        }
        
        const { 
            meterNumber,
            customerName,
            amount, 
            reference,
            currencyName,
            notifyNumber,
            paymentMethod
        } = session.data;
        
        try {
            // Check if already completed
            const { getTransactionStatus } = require('../utils/tidb');
            const currentStatus = await getTransactionStatus(transactionId);
            
            if (currentStatus === 'completed') {
                console.log(`ℹ️ [ZESA] Transaction ${transactionId} already completed, skipping fulfillment`);
                
                const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
                
                const successMessage = `✅ *ZESA Purchase Successful!*

🔢 Meter: ${meterNumber}
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
                        { id: "zesa", title: "⚡ Another ZESA" },
                        { id: "menu", title: "🏠 Main Menu" }
                    ]
                );
                
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId,
                `✅ *Payment Confirmed!*\n\n` +
                `⚡ *Getting your ZESA token. Please wait...*`
            );
            
            // Get the appropriate ZESA service based on currency
            const zesaService = currencyName === 'USD' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
            
            // Purchase token via HotRecharge
            const tokenResult = await zesaService.purchaseToken({
                meterNumber: meterNumber,
                amount: amount,
                notifyNumber: notifyNumber,
                paymentPhone: session.data.paymentPhone,
                userId: userId.split('@')[0].slice(-4),
                customerName: customerName,
                reference: reference
            });
            
            if (tokenResult.success) {
                // Update transaction to completed
                if (transactionId) {
                    updateZesaTransaction(transactionId, {
                        status: 'completed',
                        hotrecharge_reference: tokenResult.reference || tokenResult.agentReference || null,
                        token_number: tokenResult.token,
                        units_purchased: tokenResult.units,
                        completed_at: new Date()
                    });
                }
                
                // Save for quick service
                await updateUserPrefs(userId, 'zesa', {
                    meterNumber: meterNumber,
                    customerName: customerName,
                    amount: amount,
                    currency: currencyName,
                    paymentMethod: paymentMethod
                });
                
                const amountDisplay = currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`;
                
                // COMBINED success message with buttons
                const successMessage = `✅ *ZESA Purchase Successful!*

🔢 Meter: ${meterNumber}
👤 Customer: ${customerName || 'N/A'}
💰 Amount: ${amountDisplay}
🔖 Ref: ${reference}
⚡ Units: ${tokenResult.units || 'N/A'}
🔑 Token: ${tokenResult.token || 'N/A'}

📲 Token sent to: ${notifyDisplay}

Thank you for using CCHub! 💎

────────────────
What would you like to do next?`;

                // Send ONE message with buttons
                await messaging.sendButtonMessage(
                    userId,
                    successMessage,
                    [
                        { id: "zesa", title: "⚡ Another ZESA" },
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
                    updateZesaTransaction(transactionId, {
                        status: 'failed',
                        error_message: tokenResult.error || 'Token purchase failed'
                    });
                }
                
                // COMBINED error message with buttons
                const errorMessage = `⚠️ *Payment Successful but Token Failed*

Reference: ${reference}

Our team has been notified and will resolve this within 15 minutes.

────────────────
What would you like to do next?`;

                await messaging.sendButtonMessage(
                    userId,
                    errorMessage,
                    [
                        { id: "zesa", title: "⚡ Try Again" },
                        { id: "menu", title: "🏠 Main Menu" }
                    ]
                );
            }
            
        } catch (error) {
            console.error(`❌ [ZESA] Fulfillment error:`, error.message);
            
            if (transactionId) {
                updateZesaTransaction(transactionId, {
                    status: 'failed',
                    error_message: error.message
                });
            }
            
            // COMBINED error message with buttons
            const errorMessage = `⚠️ *Payment Successful but Token Failed*

Reference: ${reference}

Our team has been notified and will resolve this within 15 minutes.

────────────────
What would you like to do next?`;

            await messaging.sendButtonMessage(
                userId,
                errorMessage,
                [
                    { id: "zesa", title: "⚡ Try Again" },
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
                formatted: '263' + digits.substring(1),  // For API
                display: digits,                           // For display (077...)
                error: null
            };
        } else if (digits.length === 12 && digits.startsWith('263')) {
            return {
                valid: true,
                formatted: digits,                          // For API
                display: '0' + digits.substring(3),        // For display (077...)
                error: null
            };
        } else if (digits.length === 9 && !digits.startsWith('0')) {
            return {
                valid: true,
                formatted: '263' + digits,                  // For API
                display: '0' + digits,                      // For display (077...)
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
        console.log(`⚡ [ZESA] Request at state ${session?.flow || 'undefined'}: "${message}"`);
        
        // Guard against undefined session
        if (!session || !session.flow) {
            console.error(`❌ [ZESA] Invalid session for ${userId}`);
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
            case FLOW_STATES.ZESA.SELECT_CURRENCY:
                await this.handleCurrencySelection(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.ENTER_METER:
                await this.handleMeterEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.ENTER_AMOUNT:
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.SELECT_PAYMENT_METHOD:
                await this.handlePaymentMethodSelection(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.ENTER_PAYMENT_PHONE:
                await this.handlePaymentPhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.ENTER_NOTIFICATION_PHONE:
                await this.handleNotificationPhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.CONFIRM_PAYMENT:
                await this.handleConfirmation(userId, message, session);
                break;
                
            default:
                console.error(`❌ [ZESA] Unknown flow state: ${session.flow}`);
                deleteSession(userId);
                result.session = false;
                result.returnToMain = true;
        }
        
        return result;
    }
}

module.exports = new ZesaService();