// services/airtime.js - FINAL FLOW: Amount → Recipient → Payment Method → Payment Phone → Confirm
const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge'); // ✅ KEPT ORIGINAL IMPORT
const { FLOW_STATES, AIRTIME_NETWORKS, PAYMENT_CONFIG, RESPONSE_MESSAGES, ERROR_MESSAGES } = require('../config/constants');

// Payment methods constant (internal use only)
const PAYMENT_METHODS = {
    '1': 'ecocash',
    '2': 'onemoney'
};

class AirtimeService {
    
    /**
     * Start the airtime flow
     * Called from main menu - STARTS WITH AMOUNT
     */
    async startFlow(userId) {
        console.log(`📱 Starting airtime flow for ${userId}`);
        
        // Create new session for airtime service
        createSession(userId, 'airtime');
        
        // Send amount prompt first
        await this.sendAmountPrompt(userId);
        
        // Update session to first step
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT);
    }
    
    /**
     * Main request handler for airtime flow
     */
    async handleRequest(userId, message, session) {
        console.log(`📱 Airtime request from ${userId} at step ${session.flow}: "${message}"`);
        
        // Route based on current flow state
        switch(session.flow) {
            case FLOW_STATES.AIRTIME.ENTER_AMOUNT: // Step 1
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_PHONE: // Step 2 - Recipient number
                await this.handleRecipientEntry(userId, message, session);
                break;
                
            case 'airtime_select_payment_method': // Step 3 - Payment method selection
                await this.handlePaymentMethodSelection(userId, message, session);
                break;
                
            case 'airtime_enter_payment_phone': // Step 4 - Payment phone number
                await this.handlePaymentPhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.CONFIRM_PAYMENT: // Step 5
                await this.handleConfirmation(userId, message, session);
                break;
                
            default:
                console.error(`❌ Invalid flow state for ${userId}: ${session.flow}`);
                deleteSession(userId);
                await this.startFlow(userId);
        }
    }
    
    /**
     * Step 1: Amount Entry
     */
    async sendAmountPrompt(userId) {
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        
        const message = `📱 *Buy Airtime*\n\n` +
            `Enter airtime amount (${currency}):\n\n` +
            `💰 *Range:* ${minAmount.toLocaleString()} - ${maxAmount.toLocaleString()} ${currency}\n\n` +
            `💡 *Common amounts:*\n` +
            `• 5,000 ${currency}\n` +
            `• 10,000 ${currency}\n` +
            `• 20,000 ${currency}\n\n` +
            `📝 Enter amount now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const amount = parseInt(amountText, 10);
        
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        
        // Validate amount
        if (isNaN(amount) || amount < minAmount || amount > maxAmount) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            const errorMsg = ERROR_MESSAGES.INVALID_AMOUNT(minAmount, maxAmount, currency);
            await messaging.sendMessage(userId, 
                errorMsg + `\n\nAttempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Calculate fee and total
        const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = Math.round(amount * fee);
        const totalAmount = amount + serviceFee;
        
        // Store amount and move to recipient entry
        updateSessionStep(userId, 'enter_recipient', FLOW_STATES.AIRTIME.ENTER_PHONE, {
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Ask for recipient phone number
        await this.sendRecipientPrompt(userId);
    }
    
    /**
     * Step 2: Recipient Phone Number Entry
     */
    async sendRecipientPrompt(userId) {
        const message = `👤 *Recipient Details*\n\n` +
            `Enter the phone number of the person receiving the airtime:\n\n` +
            `📋 *Valid formats:*\n` +
            `• 0771234567\n` +
            `• 263771234567\n` +
            `• 771234567\n\n` +
            `📝 Enter recipient's number:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleRecipientEntry(userId, message, session) {
        const phoneNumber = message.trim();
        
        // Validate recipient phone number (any Zimbabwean number)
        const validationResult = this.validateRecipientPhone(phoneNumber);
        
        if (!validationResult.valid) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ *Invalid Recipient Number*\n\n` +
                `${validationResult.error}\n\n` +
                `📋 *Valid formats:*\n` +
                `• 0771234567\n` +
                `• 263771234567\n` +
                `• 771234567\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Format recipient phone number
        const formattedRecipient = validationResult.formatted;
        
        // Detect network from recipient number
        const network = this.detectNetworkFromPhone(formattedRecipient);
        
        // Store recipient and move to payment method selection
        updateSessionStep(userId, 'select_payment_method', 'airtime_select_payment_method', {
            recipient: formattedRecipient,
            network: network
        });
        
        // Ask for payment method
        await this.sendPaymentMethodPrompt(userId);
    }
    
    /**
     * Step 3: Payment Method Selection
     */
    async sendPaymentMethodPrompt(userId) {
        const message = `💳 *Payment Method*\n\n` +
            `How would you like to pay?\n\n` +
            `1️⃣ *EcoCash* (077, 078 numbers)\n` +
            `2️⃣ *OneMoney* (071 numbers)\n\n` +
            `📝 Reply with number (1-2):`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Step 3 Handler: Payment Method Selection
     */
    async handlePaymentMethodSelection(userId, message, session) {
        const selection = message.trim();
        
        // Validate payment method selection
        if (!PAYMENT_METHODS[selection]) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose:\n\n` +
                `1. EcoCash\n2. OneMoney\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        const paymentMethod = PAYMENT_METHODS[selection];
        
        // Store payment method and move to payment phone entry
        updateSessionStep(userId, 'enter_payment_phone', 'airtime_enter_payment_phone', {
            ...session.data,
            paymentMethod: paymentMethod
        });
        
        // Ask for payment phone number with specific format requirements
        await this.sendPaymentPhonePrompt(userId, paymentMethod);
    }
    
    /**
     * Step 4: Payment Phone Number Entry (validated for selected payment method)
     */
    async sendPaymentPhonePrompt(userId, paymentMethod) {
        let prefixMessage = '';
        if (paymentMethod === 'ecocash') {
            prefixMessage = `📱 *EcoCash Payment*\n\n` +
                `Enter your EcoCash phone number:\n\n` +
                `✅ *Valid prefixes:* 077, 078\n` +
                `❌ *Not accepted:* 071 (OneMoney), 073 (Telecel)\n\n`;
        } else {
            prefixMessage = `📱 *OneMoney Payment*\n\n` +
                `Enter your OneMoney phone number:\n\n` +
                `✅ *Valid prefixes:* 071\n` +
                `❌ *Not accepted:* 077/078 (EcoCash), 073 (Telecel)\n\n`;
        }
        
        const message = prefixMessage +
            `📋 *Formats accepted:*\n` +
            `• 0771234567\n` +
            `• 263771234567\n` +
            `• 771234567\n\n` +
            `📝 Enter your payment number:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Step 4 Handler: Payment Phone Number Entry
     */
    async handlePaymentPhoneEntry(userId, message, session) {
        const phoneNumber = message.trim();
        const { paymentMethod } = session.data;
        
        console.log(`📱 Processing payment phone entry for ${userId}:`, {
            phoneNumber,
            paymentMethod,
            currentSessionData: session.data
        });
        
        // Validate phone number for the specific payment method
        const validationResult = this.validatePaymentPhoneForMethod(phoneNumber, paymentMethod);
        
        if (!validationResult.valid) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ *Invalid ${paymentMethod === 'ecocash' ? 'EcoCash' : 'OneMoney'} Number*\n\n` +
                `${validationResult.error}\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Format payment phone number
        const formattedPaymentPhone = validationResult.formatted;
        
        console.log(`✅ Valid payment phone: ${formattedPaymentPhone}`);
        
        // Get the current session data and merge it properly
        const currentData = session.data || {};
        
        // Store payment phone and move to confirmation
        const updatedSession = updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            ...currentData,
            paymentPhone: formattedPaymentPhone,
            paymentProvider: paymentMethod
        });
        
        console.log(`✅ Session updated with payment phone:`, {
            paymentPhone: formattedPaymentPhone,
            fullData: updatedSession?.data
        });
        
        // Show full transaction details
        await this.showTransactionDetails(userId, updatedSession || session);
    }
    
    /**
     * Step 5: Transaction Details & Confirmation
     */
    async showTransactionDetails(userId, session) {
        try {
            const { 
                amount, 
                serviceFee, 
                totalAmount, 
                recipient, 
                network, 
                paymentPhone, 
                paymentMethod 
            } = session.data;
            
            const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
            
            // Format phone numbers for display
            const displayRecipient = recipient?.toString().replace('263', '0') || 'N/A';
            const displayPaymentPhone = paymentPhone?.toString().replace('263', '0') || 'N/A';
            
            const feePercentage = (PAYMENT_CONFIG.SERVICE_FEES.AIRTIME * 100).toFixed(0);
            
            // Format payment method for display
            let displayPaymentMethod = 'PayNow';
            if (paymentMethod === 'ecocash') displayPaymentMethod = 'EcoCash';
            if (paymentMethod === 'onemoney') displayPaymentMethod = 'OneMoney';
            
            // Format network for display
            let displayNetwork = network || 'Will be detected automatically';
            
            const message = `📋 *Transaction Details*\n\n` +
                `💰 *Airtime Amount:* ${amount?.toLocaleString() || '0'} ${currency}\n` +
                `📈 *Service Fee (${feePercentage}%):* ${serviceFee?.toLocaleString() || '0'} ${currency}\n` +
                `💵 *Total to Pay:* ${totalAmount?.toLocaleString() || '0'} ${currency}\n` +
                `👤 *Recipient:* ${displayRecipient}\n` +
                `📱 *Network:* ${displayNetwork}\n` +
                `💳 *Payment Method:* ${displayPaymentMethod}\n` +
                `📞 *Payment Number:* ${displayPaymentPhone}\n\n` +
                `*Proceed with payment?*\n\n` +
                `Type: YES or NO`;
            
            await messaging.sendMessage(userId, message);
            
        } catch (error) {
            console.error(`❌ Error in showTransactionDetails:`, error.message);
            
            // Fallback
            const { totalAmount } = session.data;
            const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
            await messaging.sendMessage(userId,
                `Proceed with payment of ${totalAmount?.toLocaleString() || '0'} ${currency}? (Yes/No)`
            );
        }
    }
    
    async handleConfirmation(userId, message, session) {
        const response = message.trim().toLowerCase();
        
        if (response === 'yes' || response === 'y') {
            console.log(`✅ User confirmed payment`);
            await this.processPayment(userId, session);
        } else if (response === 'no' || response === 'n') {
            console.log(`❌ User cancelled payment`);
            await messaging.sendMessage(userId, 
                `❌ *Transaction cancelled*\n\n` +
                `Type "hi" to start again or choose another service.`
            );
            deleteSession(userId);
        } else {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Please type YES or NO\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
        }
    }
    
    /**
     * Step 6: Process payment with PayNow integration
     */
    async processPayment(userId, session) {
        const { 
            totalAmount, 
            paymentPhone, 
            paymentMethod, 
            network, 
            recipient, 
            amount, 
            serviceFee 
        } = session.data;
        
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayRecipient = recipient.replace('263', '0');
        const displayPaymentPhone = paymentPhone.replace('263', '0');
        
        // Generate unique reference
        const reference = `AIR${Date.now().toString().slice(-8)}`;
        
        // Update session
        updateSessionStep(userId, 'processing_payment', 'processing_payment', {
            ...session.data,
            reference: reference,
            paymentInitiated: true
        });
        
        // Send payment initiation message
        await messaging.sendMessage(userId, `⏳ *Connecting to PayNow...*`);
        
        try {
            // Initiate payment using SDK with payment phone number
            const paymentResult = await paynowService.initiateQuickPay({
                amount: totalAmount.toFixed(2),
                reference: reference,
                phone: paymentPhone,
                service: `Airtime - ${network || 'Mobile'}`,
                customer: {
                    phone: paymentPhone,
                    email: `${paymentPhone}@cchub.co.zw`
                }
            });
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            // Format provider name for display
            let displayProvider = paymentResult.provider.toUpperCase();
            if (displayProvider === 'ECOCASH') displayProvider = 'EcoCash';
            if (displayProvider === 'ONEMONEY') displayProvider = 'OneMoney';
            
            // Send payment instructions
            await messaging.sendMessage(userId,
                `💳 *Payment Instructions*\n\n` +
                `✅ *Payment Request Created*\n\n` +
                `📋 *Details:*\n` +
                `• Amount: ${totalAmount.toLocaleString()} ${currency}\n` +
                `• Reference: ${reference}\n` +
                `• Payment Number: ${displayPaymentPhone}\n` +
                `• Provider: ${displayProvider}\n\n` +
                `📱 *Instructions:*\n` +
                `${paymentResult.instructions}\n\n` +
                `⏳ *Status:* Waiting for payment\n\n` +
                `I'll notify you when payment is confirmed.`
            );
            
            // Start monitoring payment status
            if (paymentResult.pollUrl) {
                this.monitorPaymentStatus(userId, paymentResult.pollUrl, session);
            } else {
                console.warn(`⚠️ No poll URL for ${userId}`);
                await messaging.sendMessage(userId,
                    `⚠️ *Payment monitoring limited*\n\n` +
                    `Please check your mobile money for payment confirmation.\n\n` +
                    `If paid, airtime will be sent to ${displayRecipient}.`
                );
            }
            
        } catch (error) {
            console.error(`❌ PayNow error for ${userId}:`, error.message);
            
            await messaging.sendMessage(userId,
                `❌ *Payment Failed*\n\n` +
                `Unable to initiate payment: ${error.message}\n\n` +
                `Please try again or contact support.\n\n` +
                `Type "hi" to start over.`
            );
            
            deleteSession(userId);
        }
    }
    
    /**
     * Monitor payment status
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { recipient, amount, serviceFee, totalAmount, reference, network } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayRecipient = recipient.replace('263', '0');
        
        console.log(`🔍 Starting payment monitoring for ${userId}, reference: ${reference}`);
        
        let attempts = 0;
        const maxAttempts = 60;
        const pollInterval = 10000;
        
        const checkStatus = async () => {
            attempts++;
            
            const currentSession = getActiveSession(userId);
            if (!currentSession || currentSession.service !== 'airtime') {
                console.log(`🛑 Stopping monitoring - session ended`);
                clearInterval(intervalId);
                return;
            }
            
            if (attempts > maxAttempts) {
                clearInterval(intervalId);
                console.log(`⏰ Payment timeout for ${userId}`);
                
                await messaging.sendMessage(userId,
                    `⏰ *Payment Timeout*\n\n` +
                    `Payment was not completed in time.\n\n` +
                    `Reference: ${reference}\n` +
                    `Amount: ${totalAmount.toLocaleString()} ${currency}\n\n` +
                    `Type "hi" to try again.`
                );
                
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynowService.checkPaymentStatus(pollUrl);
                console.log(`🔍 Payment status: ${status.status}`);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    console.log(`✅ Payment completed for ${userId}`);
                    
                    await this.fulfillAirtimePurchase(userId, session, status);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    console.log(`❌ Payment cancelled`);
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Cancelled*\n\n` +
                        `Reference: ${reference}\n\n` +
                        `Type "hi" to try again.`
                    );
                    
                    deleteSession(userId);
                }
                
            } catch (error) {
                console.error(`❌ Status check error:`, error.message);
            }
        };
        
        const intervalId = setInterval(checkStatus, pollInterval);
        setTimeout(checkStatus, 2000);
    }
    
    /**
     * Step 7: Fulfill airtime purchase via HotRecharge - 🔥 ONLY SECTION CHANGED 🔥
     */
    async fulfillAirtimePurchase(userId, session, paymentStatus) {
        const { network, recipient, amount, serviceFee, totalAmount, reference } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayRecipient = recipient.replace('263', '0');
        
        try {
            await messaging.sendMessage(userId,
                `✅ *Payment Confirmed!*\n\n` +
                `💰 *Purchasing airtime via HotRecharge...*\n\n` +
                `• Amount: ${amount.toLocaleString()} ${currency}\n` +
                `• Network: ${network || 'Detecting...'}\n` +
                `• Recipient: ${displayRecipient}\n\n` +
                `⏳ *Processing...*`
            );
            
            console.log(`🔌 [HOTRECHARGE] Calling API:`, {
                phone: recipient,
                amount: amount,
                network: network,
                paynowReference: reference
            });
            
            // 🔥 REPLACED: hotrechargeService.buyAirtime with hotrecharge.purchaseAirtime 🔥
            const hotrechargeResult = await hotrecharge.purchaseAirtime({
                recipient: recipient,
                amount: parseFloat(amount),
                network: network,
                userId: userId.split('@')[0].slice(-4)
            });
            
            console.log(`🔌 [HOTRECHARGE] Result:`, hotrechargeResult);
            
            if (hotrechargeResult.success) {
                // 🔥 UPDATED RECEIPT with HotRecharge ID and Agent Reference 🔥
                const receiptMessage = `✅ *Airtime Purchase Successful!*\n\n` +
                    `📋 *Receipt:*\n` +
                    `• Transaction ID: ${reference}\n` +
                    `• PayNow Ref: ${paymentStatus.paynowref || 'N/A'}\n` +
                    `• HotRecharge ID: ${hotrechargeResult.transactionId}\n` +
                    `• Agent Reference: ${hotrechargeResult.agentReference}\n` +
                    `• Network: ${network || 'Econet'}\n` +
                    `• Recipient: ${displayRecipient}\n` +
                    `• Airtime Amount: ${amount.toLocaleString()} ${currency}\n` +
                    `• Service Fee: ${serviceFee.toLocaleString()} ${currency}\n` +
                    `• Total Paid: ${totalAmount.toLocaleString()} ${currency}\n` +
                    `• Date: ${new Date().toLocaleString()}\n\n` +
                    `🎉 *Airtime sent successfully!*\n\n` +
                    `💡 Recipient should receive it within 2 minutes.\n\n` +
                    `Type "hi" for another transaction.`;
                
                await messaging.sendMessage(userId, receiptMessage);
                
            } else {
                // 🔥 IMPROVED ERROR MESSAGE 🔥
                await messaging.sendMessage(userId,
                    `⚠️ *Airtime Processing Issue*\n\n` +
                    `✅ *Payment was successful* but airtime delivery encountered an issue.\n\n` +
                    `*Reference:* ${reference}\n` +
                    `*Error:* ${hotrechargeResult.error || 'Provider temporarily unavailable'}\n\n` +
                    `🛠️ *Don't worry!* Our team has been notified and will manually send your airtime within 15 minutes.\n\n` +
                    `Type "hi" to try another transaction.`
                );
                
                // 🔥 ADDED: Log for manual reconciliation 🔥
                console.error(`🚨 MANUAL RECONCILIATION NEEDED:`, {
                    reference,
                    recipient,
                    amount,
                    network,
                    error: hotrechargeResult.error
                });
            }
            
        } catch (error) {
            console.error(`❌ Fulfillment error:`, error.message);
            
            await messaging.sendMessage(userId,
                `❌ *Fulfillment Error*\n\n` +
                `✅ *Payment successful* but airtime failed.\n\n` +
                `*Reference:* ${reference}\n\n` +
                `🛠️ Our team has been notified. You will receive your airtime within 15 minutes.\n\n` +
                `Type "hi" to try another transaction.`
            );
            
            // 🔥 ADDED: Log for manual reconciliation 🔥
            console.error(`🚨 MANUAL RECONCILIATION NEEDED (ERROR):`, {
                reference,
                recipient,
                amount,
                network,
                error: error.message
            });
            
        } finally {
            deleteSession(userId);
        }
    }
    
    // ==================== VALIDATION HELPERS ====================
    
    /**
     * Validate recipient phone number (any Zimbabwean number)
     */
    validateRecipientPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        
        // Check 10-digit format (0771234567)
        if (digits.length === 10 && digits.startsWith('0')) {
            return {
                valid: true,
                formatted: '263' + digits.substring(1),
                error: null
            };
        }
        // Check 12-digit format (263771234567)
        else if (digits.length === 12 && digits.startsWith('263')) {
            return {
                valid: true,
                formatted: digits,
                error: null
            };
        }
        // Check 9-digit format (771234567)
        else if (digits.length === 9 && !digits.startsWith('0')) {
            return {
                valid: true,
                formatted: '263' + digits,
                error: null
            };
        }
        
        return {
            valid: false,
            formatted: null,
            error: 'Invalid Zimbabwean number. Use format: 0771234567'
        };
    }
    
    /**
     * Validate payment phone number for specific payment method
     */
    validatePaymentPhoneForMethod(phone, paymentMethod) {
        const digits = phone.replace(/\D/g, '');
        let formatted = '';
        
        // Format the number
        if (digits.length === 10 && digits.startsWith('0')) {
            formatted = '263' + digits.substring(1);
        } else if (digits.length === 12 && digits.startsWith('263')) {
            formatted = digits;
        } else if (digits.length === 9 && !digits.startsWith('0')) {
            formatted = '263' + digits;
        } else {
            return {
                valid: false,
                formatted: null,
                error: 'Invalid phone number format. Use 0771234567, 263771234567, or 771234567'
            };
        }
        
        // Check if number matches the selected payment method
        if (paymentMethod === 'ecocash') {
            if (formatted.startsWith('26377') || formatted.startsWith('26378')) {
                return {
                    valid: true,
                    formatted: formatted,
                    error: null
                };
            } else {
                return {
                    valid: false,
                    formatted: null,
                    error: 'This is not an EcoCash number. EcoCash uses 077 and 078 prefixes.'
                };
            }
        } else if (paymentMethod === 'onemoney') {
            if (formatted.startsWith('26371')) {
                return {
                    valid: true,
                    formatted: formatted,
                    error: null
                };
            } else {
                return {
                    valid: false,
                    formatted: null,
                    error: 'This is not a OneMoney number. OneMoney uses 071 prefixes.'
                };
            }
        }
        
        return {
            valid: false,
            formatted: null,
            error: 'Invalid payment method'
        };
    }
    
    /**
     * Detect network from phone number (for HotRecharge)
     */
    detectNetworkFromPhone(phone) {
        const digits = phone.toString().replace(/\D/g, '');
        
        if (digits.startsWith('26377') || digits.startsWith('26378') || 
            digits.startsWith('077') || digits.startsWith('078')) {
            return 'Econet';
        }
        
        if (digits.startsWith('26371') || digits.startsWith('071')) {
            return 'NetOne';
        }
        
        if (digits.startsWith('26373') || digits.startsWith('073')) {
            return 'Telecel';
        }
        
        return null;
    }
}

module.exports = new AirtimeService();