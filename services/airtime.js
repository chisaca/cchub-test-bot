// ============================================================================
// AIRTIME SERVICE - UPDATED with 3-Tap Maximum Architecture
// Handles the complete airtime purchase flow:
// NOW WITH: WhatsApp Flows for 2-tap experience
// 1. Launch Flow (Tap 1) → User fills form
// 2. Flow completion → Process payment (Tap 2)
// 3. Post-transaction buttons for next actions
// ============================================================================

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');
const currencyGate = require('./currencyGate');
// Import TiDB functions
const { saveAirtimeTransaction, updateAirtimeTransaction, generateTransactionId } = require('../utils/tidb');
// Import User Preferences
const { updateUserPrefs } = require('../utils/userPrefs');
// Import personality utilities
const { 
    getEncouragement, 
    addPaymentPersonality,
    getThanksMessage,
    addRandomFact
} = require('../utils/personality');
const { 
    FLOW_STATES, 
    PAYMENT_CONFIG, 
    AIRTIME_CURRENCY_OPTIONS,
    RESPONSE_MESSAGES, 
    PAYMENT_PROVIDERS,
    PAYMENT_METHOD_NAMES,
    PAYMENT_METHOD_CONFIG,
    PAYMENT_PREFIXES,
    UI_MESSAGES,
    NETWORK_PREFIXES,
    VALIDATION_CONFIG,
    INTERACTIVE_UI_CONFIG,
    WHATSAPP_CONFIG
} = require('../config/constants');

class AirtimeService {
    
    // ============================================================================
    // 3-TAP FLOW INITIATION
    // ============================================================================
    
    /**
     * Start the airtime flow - 2 taps total
     * Tap 1: User selects Airtime from menu
     * Tap 2: Flow completion → Done
     * 
     * @param {string} userId - WhatsApp user ID
     * @returns {Promise<Object>} Result with session
     */
    async startFlow(userId) {
        console.log(`🎯 [AIRTIME] Starting 2-tap flow for ${userId}`);
        
        // Create session
        const session = createSession(userId, 'airtime');
        
        // Set state to launch flow
        updateSessionStep(userId, 'launch_flow', FLOW_STATES.FLOW.AIRTIME);
        
        return {
            message: null,
            session: session
        };
    }
    
    /**
     * Launch WhatsApp Flow for airtime purchase
     * This is the 2-tap experience - user fills form and submits
     * 
     * @param {string} userId - WhatsApp user ID
     * @param {object} session - Current session
     * @returns {Promise<Object>} Flow configuration
     */
    async launchFlow(userId, session) {
        console.log(`🎯 [AIRTIME] Launching Flow for ${userId}`);
        
        // Get user's last purchase for pre-filling (optional)
        const lastPurchase = await this.getLastPurchase(userId);
        
        // Prepare flow data
        const flowConfig = {
            flowId: INTERACTIVE_UI_CONFIG.FLOW_IDS.AIRTIME,
            screen: INTERACTIVE_UI_CONFIG.FLOW_SCREENS.AIRTIME.DETAILS,
            data: {
                // Pre-fill with last purchase if available
                recipient: lastPurchase?.recipient || '',
                amount: lastPurchase?.amount || '',
                network: lastPurchase?.network || '',
                currency: lastPurchase?.currency || 'USD'
            }
        };
        
        // Update session to await flow completion
        updateSessionStep(userId, 'awaiting_flow', FLOW_STATES.FLOW.AWAITING_FLOW_COMPLETION, {
            flowId: flowConfig.flowId,
            flowStarted: Date.now()
        });
        
        return {
            flow: flowConfig,
            session: session
        };
    }
    
    /**
     * Handle flow completion - process the submitted data
     * This is called when user submits the WhatsApp Flow form
     * 
     * @param {string} userId - WhatsApp user ID
     * @param {object} flowData - Data submitted from the flow
     * @param {object} session - Current session
     * @returns {Promise<Object>} Result
     */
    async handleFlowCompletion(userId, flowData, session) {
        console.log(`✅ [AIRTIME] Flow completed for ${userId}`, flowData);
        
        try {
            // Extract data from flow response
            const {
                recipient,
                amount,
                network,
                currency,
                paymentMethod
            } = flowData;
            
            // Validate the data
            const validationResult = await this.validateFlowData({
                recipient, amount, network, currency, paymentMethod
            });
            
            if (!validationResult.valid) {
                await messaging.sendMessage(userId, 
                    `❌ *Invalid Data*\n\n${validationResult.error}\n\nPlease try again.`
                );
                deleteSession(userId);
                return { complete: true };
            }
            
            // Calculate fees
            const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
            const serviceFee = parseFloat((parseFloat(amount) * fee).toFixed(2));
            const totalAmount = parseFloat((parseFloat(amount) + serviceFee).toFixed(2));
            
            // Update session with all data
            const currencyOption = currency === 'USD' 
                ? AIRTIME_CURRENCY_OPTIONS['2']
                : AIRTIME_CURRENCY_OPTIONS['1'];
            
            // Format recipient to international format
            const formattedRecipient = this.formatPhoneToInternational(recipient);
            
            // Map payment method to provider code
            const paymentMethodCode = this.mapPaymentMethod(paymentMethod, currency);
            const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
            
            updateSessionStep(userId, 'process_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
                recipient: formattedRecipient,
                amount: parseFloat(amount),
                network: network,
                currency: currency.toLowerCase(),
                currencyName: currency,
                currencySymbol: currency === 'USD' ? '$' : 'ZiG',
                minAmount: currencyOption.min,
                maxAmount: currencyOption.max,
                serviceFee: serviceFee,
                totalAmount: totalAmount,
                paymentMethod: paymentMethod,
                paymentMethodCode: paymentMethodCode,
                paymentMethodName: methodConfig.name,
                paymentProvider: methodConfig.provider,
                requiresPaymentPhone: methodConfig.requiresPhone
            });
            
            // If payment method requires phone, ask for it
            if (methodConfig.requiresPhone) {
                updateSessionStep(userId, 'enter_payment_phone', 'airtime_enter_payment_phone', session.data);
                await this.sendPaymentPhonePrompt(userId, methodConfig);
                return { complete: false };
            }
            
            // Otherwise, process payment immediately
            await this.processPayment(userId, session);
            return { complete: false };
            
        } catch (error) {
            console.error(`❌ [AIRTIME] Flow completion error:`, error);
            await messaging.sendMessage(userId, 
                `❌ *Error*\n\nSomething went wrong. Please try again.`
            );
            deleteSession(userId);
            return { complete: true };
        }
    }
    
    /**
     * Validate data from flow submission
     */
    async validateFlowData(data) {
        const { recipient, amount, network, currency, paymentMethod } = data;
        
        // Check required fields
        if (!recipient || !amount || !network || !currency || !paymentMethod) {
            return { valid: false, error: 'All fields are required' };
        }
        
        // Validate phone number
        const phoneValidation = this.validateRecipientPhone(recipient);
        if (!phoneValidation.valid) {
            return { valid: false, error: phoneValidation.error };
        }
        
        // Validate amount
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return { valid: false, error: 'Please enter a valid amount' };
        }
        
        // Check amount range based on currency
        const currencyOption = currency === 'USD' 
            ? AIRTIME_CURRENCY_OPTIONS['2']
            : AIRTIME_CURRENCY_OPTIONS['1'];
            
        if (amountNum < currencyOption.min || amountNum > currencyOption.max) {
            return { 
                valid: false, 
                error: `Amount must be between ${currencyOption.symbol}${currencyOption.min} and ${currencyOption.symbol}${currencyOption.max}` 
            };
        }
        
        // Validate network based on currency
        if (currency === 'ZiG' && network !== 'Econet') {
            return { 
                valid: false, 
                error: 'ZiG airtime is only available for Econet numbers' 
            };
        }
        
        return { valid: true };
    }
    
    /**
     * Format phone number to international format (263...)
     */
    formatPhoneToInternational(phone) {
        const digits = phone.replace(/\D/g, '');
        
        if (digits.length === 10 && digits.startsWith('0')) {
            return '263' + digits.substring(1);
        } else if (digits.length === 12 && digits.startsWith('263')) {
            return digits;
        } else if (digits.length === 9 && !digits.startsWith('0')) {
            return '263' + digits;
        }
        return digits;
    }
    
    /**
     * Map payment method string to provider code
     */
    mapPaymentMethod(method, currency) {
        const methodMap = {
            'EcoCash': currency === 'USD' ? PAYMENT_PROVIDERS.USD.ECOCASH : PAYMENT_PROVIDERS.ZIG.ECOCASH,
            'Zimswitch': currency === 'USD' ? PAYMENT_PROVIDERS.USD.ZIMSWITCH : PAYMENT_PROVIDERS.ZIG.ZIMSWITCH,
            'OneMoney': currency === 'USD' ? null : PAYMENT_PROVIDERS.ZIG.ONEMONEY,
            'InnBucks': currency === 'USD' ? PAYMENT_PROVIDERS.USD.INNBUCKS : null
        };
        
        return methodMap[method];
    }
    
    /**
     * Get user's last airtime purchase for pre-filling
     */
    async getLastPurchase(userId) {
        try {
            const { getUserPrefs } = require('../utils/userPrefs');
            const prefs = await getUserPrefs(userId, 'airtime');
            return prefs || null;
        } catch (error) {
            console.error(`[AIRTIME] Error getting last purchase:`, error);
            return null;
        }
    }
    
    // ============================================================================
    // PAYMENT PROCESSING (from old flow)
    // ============================================================================
    
    /**
     * Process payment with PayNow
     * Initiates payment and monitors status
     */
    async processPayment(userId, session) {
        try {
            const { 
                totalAmount, 
                paymentPhone, 
                paymentProvider,
                paymentMethodCode,
                paymentMethodName,
                network, 
                recipient, 
                amount, 
                currency,
                currencyName,
                currencySymbol,
                serviceFee
            } = session.data;
            
            // Ensure totalAmount is defined
            let finalTotalAmount = totalAmount;
            if (!finalTotalAmount && amount && serviceFee) {
                finalTotalAmount = amount + serviceFee;
            } else if (!finalTotalAmount && amount) {
                const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
                finalTotalAmount = amount * (1 + fee);
            }
            
            if (!finalTotalAmount) {
                throw new Error('Could not determine total amount for payment');
            }
            
            const displayRecipient = recipient.replace('263', '0');
            const reference = `AIR${Date.now().toString().slice(-8)}`;
            
            // Create pending transaction in TiDB
            const transactionId = generateTransactionId('AIR');
            
            saveAirtimeTransaction({
                user_phone: userId.split('@')[0],
                transaction_id: transactionId,
                amount: amount,
                currency: currencyName,
                recipient_phone: recipient,
                network: network,
                status: 'pending',
                payment_method: paymentProvider,
                paynow_reference: reference,
                hotrecharge_reference: null
            });
            
            updateSessionStep(userId, 'processing_payment', 'processing_payment', {
                ...session.data,
                reference: reference,
                transactionId: transactionId,
                totalAmount: finalTotalAmount,
                paymentInitiated: true
            });
            
            await messaging.sendMessage(userId, `🔄 *Connecting...*`);
            
            // Map payment provider to what PayNow expects
            let paynowMethod = paymentProvider;
            
            const paymentData = {
                amount: finalTotalAmount,
                reference: reference,
                phone: paymentPhone,
                method: paynowMethod,
                paymentMethodCode: paymentMethodCode,
                service: `Airtime (${currencyName}) - ${network}`,
                currency: currencyName
            };
            
            const paymentResult = await paynowService.initiateQuickPay(paymentData);
            
            if (!paymentResult.success) {
                updateAirtimeTransaction(transactionId, {
                    status: 'failed',
                    error_message: paymentResult.error || 'Failed to initiate payment'
                });
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            const totalDisplay = currencyName === 'USD'
                ? `$${finalTotalAmount?.toFixed(2)}`
                : `${finalTotalAmount?.toLocaleString()} ${currencySymbol}`;
            
            let statusMessage;
            
            if (paymentProvider === 'ecocash') {
                const displayPhone = paymentPhone?.toString().replace('263', '0') || 'N/A';
                statusMessage = `📱 *Payment Request Created*\n\nAmount: ${totalDisplay}\nRef: ${reference}\nPhone: ${displayPhone}\nProvider: EcoCash ${currencyName}\n\n${paymentResult.instructions}\n\n⏳ Waiting for payment...`;
            } else if (paymentProvider === 'onemoney') {
                const displayPhone = paymentPhone?.toString().replace('263', '0') || 'N/A';
                statusMessage = `📱 *Payment Request Created*\n\nAmount: ${totalDisplay}\nRef: ${reference}\nPhone: ${displayPhone}\nProvider: OneMoney ${currencyName}\n\n${paymentResult.instructions}\n\n⏳ Waiting for payment...`;
            } else if (paymentProvider === 'zimswitch') {
                statusMessage = `💳 *Payment Request Created*\n\nAmount: ${totalDisplay}\nRef: ${reference}\nProvider: Zimswitch ${currencyName}\n\n${paymentResult.instructions}\n\n⏳ Waiting for payment...`;
            } else if (paymentProvider === 'innbucks') {
                statusMessage = `🏦 *Payment Request Created*\n\nAmount: ${totalDisplay}\nRef: ${reference}\nProvider: InnBucks USD\n\n${paymentResult.instructions}\n\n⏳ Waiting for payment...`;
            } else {
                statusMessage = `📱 *Payment Request Created*\n\nAmount: ${totalDisplay}\nRef: ${reference}\nProvider: ${paymentMethodName || paymentProvider}\n\n${paymentResult.instructions}\n\n⏳ Waiting for payment...`;
            }
            
            await messaging.sendMessage(userId, statusMessage);
            
            if (paymentResult.pollUrl) {
                const updatedSession = getActiveSession(userId);
                this.monitorPaymentStatus(userId, paymentResult.pollUrl, updatedSession || session);
            }
            
        } catch (error) {
            console.error(`❌ [AIRTIME] PayNow error:`, error.message);
            await messaging.sendMessage(userId,
                `❌ *Payment Failed*\n\nUnable to initiate payment: ${error.message}\n\nType "hi" to start over.`
            );
            deleteSession(userId);
        }
    }
    
    /**
     * Monitor payment status via polling
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { recipient, amount, reference, network, currency, currencyName, transactionId } = session.data;
        const displayRecipient = recipient.replace('263', '0');
        
        console.log(`👀 [AIRTIME] Monitoring payment for ${userId}, ref: ${reference}`);
        
        let attempts = 0;
        const maxAttempts = 60;
        const pollInterval = 10000;
        
        const checkStatus = async () => {
            attempts++;
            
            const currentSession = getActiveSession(userId);
            if (!currentSession || currentSession.service !== 'airtime') {
                clearInterval(intervalId);
                return;
            }
            
            if (attempts > maxAttempts) {
                clearInterval(intervalId);
                
                if (transactionId) {
                    updateAirtimeTransaction(transactionId, { status: 'expired' });
                }
                
                await messaging.sendMessage(userId,
                    `⏰ *Payment Timeout*\n\nReference: ${reference}\n\nType "hi" to try again.`
                );
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynowService.checkPaymentStatus(pollUrl);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    
                    if (transactionId) {
                        updateAirtimeTransaction(transactionId, {
                            status: 'payment_received',
                            paynow_reference: status.reference || reference
                        });
                    }
                    
                    await this.fulfillAirtimePurchase(userId, session, status);
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    
                    if (transactionId) {
                        updateAirtimeTransaction(transactionId, { status: 'cancelled' });
                    }
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Cancelled*\n\nReference: ${reference}\n\nType "hi" to try again.`
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
    // FULFILLMENT
    // ============================================================================
    
    /**
     * Fulfill airtime purchase via HotRecharge
     */
    async fulfillAirtimePurchase(userId, session, paymentStatus) {
        const { 
            network, 
            recipient, 
            amount, 
            reference,
            transactionId,
            currency,
            currencyName,
            currencySymbol,
            paymentMethodName,
            paymentProvider
        } = session.data;
        
        const displayRecipient = recipient.replace('263', '0');
        
        try {
            await messaging.sendMessage(userId,
                `✅ *Payment Confirmed!*\n\n` +
                `🌶️ *Getting your airtime. Please wait...*\n\n` +
                `• Amount: ${currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toLocaleString()} ${currencySymbol}`}\n` +
                `• Network: ${network}\n` +
                `• Recipient: ${displayRecipient}\n\n` +
                `⏳ *Processing...*`
            );
            
            let hotrechargeResult;
            
            if (currency === 'usd') {
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
                if (transactionId) {
                    updateAirtimeTransaction(transactionId, {
                        status: 'completed',
                        hotrecharge_reference: hotrechargeResult.reference || hotrechargeResult.agentReference,
                        completed_at: new Date()
                    });
                }
                
                // Save user preferences for quick service
                updateUserPrefs(userId, 'airtime', {
                    recipient: recipient,
                    network: network,
                    amount: amount,
                    currency: currencyName,
                    paymentMethod: paymentProvider,
                    paymentProvider: paymentProvider
                });
                
                const amountDisplay = currencyName === 'USD'
                    ? `$${amount.toFixed(2)}`
                    : `${amount.toFixed(2)} ZiG`;
                
                // Success message
                const baseReceipt = `✅ Airtime Sent!\n📞 ${displayRecipient.slice(0,5)}****${displayRecipient.slice(-3)}\n💰 ${amountDisplay}\n🔖 ${reference}`;
                
                const finalReceipt = addPaymentPersonality(baseReceipt);
                await messaging.sendMessage(userId, finalReceipt);
                
                // Add random fact
                const factMessage = addRandomFact("");
                if (factMessage) {
                    await messaging.sendMessage(userId, factMessage);
                }
                
                // NEW: Send post-transaction buttons for 1-tap next actions
                await messaging.sendPostTransactionButtons(
                    userId,
                    "What would you like to do next?"
                );
                
            } else {
                if (transactionId) {
                    updateAirtimeTransaction(transactionId, {
                        status: 'failed',
                        error_message: hotrechargeResult.error || 'HotRecharge failed'
                    });
                }
                
                await messaging.sendMessage(userId,
                    `⚠️ *Payment Successful but Airtime Failed*\n\n` +
                    `Your payment of ${currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`} was received.\n\n` +
                    `🔧 Our team has been notified and will resolve this within 15 minutes.\n\n` +
                    `Reference: ${reference}`
                );
                
                // Send post-transaction buttons even for failures
                await messaging.sendPostTransactionButtons(
                    userId,
                    "What would you like to do next?"
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
            
            await messaging.sendMessage(userId,
                `⚠️ *Payment Successful but Airtime Failed*\n\n` +
                `🔧 Our team has been notified and will resolve this within 15 minutes.\n\n` +
                `Reference: ${reference}`
            );
            
            // Send post-transaction buttons even for errors
            await messaging.sendPostTransactionButtons(
                userId,
                "What would you like to do next?"
            );
            
        } finally {
            // Delete session after transaction is complete
            deleteSession(userId);
        }
    }
    
    // ============================================================================
    // PAYMENT PHONE PROMPT (for methods that require it)
    // ============================================================================
    
    /**
     * Send payment phone prompt based on selected method
     */
    async sendPaymentPhonePrompt(userId, methodConfig) {
        let prompt;
        
        switch(methodConfig.provider) {
            case 'ecocash':
                prompt = UI_MESSAGES.PAYMENT_PHONE_PROMPT.ECOCASH;
                break;
            case 'onemoney':
                prompt = UI_MESSAGES.PAYMENT_PHONE_PROMPT.ONEMONEY;
                break;
            default:
                prompt = UI_MESSAGES.PAYMENT_PHONE_PROMPT.DEFAULT;
        }
        
        await messaging.sendMessage(userId, prompt);
    }
    
    // ============================================================================
    // VALIDATION HELPERS
    // ============================================================================
    
    /**
     * Validate recipient phone number
     */
    validateRecipientPhone(phone) {
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
     * Validate payment phone number against provider prefixes
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
                error: 'Invalid phone number. Use 0771234567 or 263771234567'
            };
        }
        
        let allowedPrefixes = [];
        let providerName = '';
        
        switch(provider) {
            case 'ecocash':
                allowedPrefixes = PAYMENT_PREFIXES.ECOCASH;
                providerName = 'EcoCash';
                break;
            case 'onemoney':
                allowedPrefixes = PAYMENT_PREFIXES.ONEMONEY;
                providerName = 'OneMoney';
                break;
            default:
                return { valid: true, formatted, display, error: null };
        }
        
        const isValidProvider = allowedPrefixes.some(prefix => 
            formatted.startsWith('263' + prefix.substring(1)) || 
            formatted.startsWith(prefix)
        );
        
        if (isValidProvider) {
            return { valid: true, formatted, display, error: null };
        }
        
        return { 
            valid: false, 
            formatted: null, 
            display: null, 
            error: `❌ ${providerName} uses ${allowedPrefixes.join(' or ')} prefixes.` 
        };
    }
    
    // ============================================================================
    // MAIN REQUEST HANDLER (for backward compatibility with old flow)
    // ============================================================================
    
    /**
     * Main request handler - supports both old flow and new flow
     */
    async handleRequest(userId, message, session) {
        console.log(`📱 [AIRTIME] Request at step ${session.flow}: "${message}"`);
        
        // If awaiting flow completion, ignore messages (flow will send webhook)
        if (session.flow === FLOW_STATES.FLOW.AWAITING_FLOW_COMPLETION) {
            await messaging.sendMessage(userId, 
                `📱 Please complete the form that opened on your phone.\n\n` +
                `Type *hi* to cancel.`
            );
            return {
                session: true,
                returnToMain: false,
                message: null
            };
        }
        
        let result = {
            session: true,
            returnToMain: false,
            message: null
        };
        
        switch(session.flow) {
            case FLOW_STATES.AIRTIME.SELECT_CURRENCY:
                await this.handleCurrencySelection(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_AMOUNT:
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_PHONE:
                await this.handleRecipientEntry(userId, message, session);
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