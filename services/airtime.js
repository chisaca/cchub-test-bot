// services/airtime.js - REVISED FLOW: Amount → Recipient → Payment Phone → Payment Method → Confirm
const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const paynowService = require('./paynow');
const hotrechargeService = require('./hotrecharge');
const { FLOW_STATES, AIRTIME_NETWORKS, PAYMENT_CONFIG, RESPONSE_MESSAGES, ERROR_MESSAGES } = require('../config/constants');

// Payment methods constant (internal use only)
const PAYMENT_METHODS = {
    '1': 'ecocash',
    '2': 'onemoney'
};

class AirtimeService {
    
    /**
     * Start the airtime flow
     * Called from main menu - NOW STARTS WITH AMOUNT
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
                
            case 'airtime_enter_payment_phone': // Step 3 - Payment phone number (NEW)
                await this.handlePaymentPhoneEntry(userId, message, session);
                break;
                
            case 'airtime_select_payment_method': // Step 4
                await this.handlePaymentMethodSelection(userId, message, session);
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
        const message = `📱 *Recipient Details*\n\n` +
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
        
        // Validate phone number (general validation, not network-specific yet)
        const validationResult = this.validateRecipientPhone(phoneNumber);
        
        if (!validationResult.valid) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ *Invalid Phone Number*\n\n` +
                `${validationResult.error}\n\n` +
                `📋 *Valid formats:*\n` +
                `• 0771234567\n` +
                `• 263771234567\n` +
                `• 771234567\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Format phone number for HotRecharge
        const formattedRecipient = validationResult.formatted;
        
        // Detect network from recipient number
        const network = this.detectNetworkFromPhone(formattedRecipient);
        
        // Store recipient and network, move to payment phone entry
        updateSessionStep(userId, 'enter_payment_phone', 'airtime_enter_payment_phone', {
            recipient: formattedRecipient,
            network: network
        });
        
        // Ask for payment phone number
        await this.sendPaymentPhonePrompt(userId);
    }
    
    /**
     * Step 3: Payment Phone Number Entry (NEW)
     */
    async sendPaymentPhonePrompt(userId) {
        const message = `💳 *Payment Details*\n\n` +
            `Enter the phone number you will use to pay via EcoCash/OneMoney:\n\n` +
            `📋 *Valid formats:*\n` +
            `• 0771234567\n` +
            `• 263771234567\n` +
            `• 771234567\n\n` +
            `📝 Enter your payment number:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePaymentPhoneEntry(userId, message, session) {
        const phoneNumber = message.trim();
        
        // Validate phone number for payment (must be EcoCash or OneMoney)
        const validationResult = this.validatePaymentPhone(phoneNumber);
        
        if (!validationResult.valid) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ *Invalid Payment Number*\n\n` +
                `${validationResult.error}\n\n` +
                `📋 *Supported providers:*\n` +
                `• EcoCash: 077, 078\n` +
                `• OneMoney: 071\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Format payment phone number
        const formattedPaymentPhone = validationResult.formatted;
        
        // Detect payment provider
        const paymentProvider = this.detectMobileProvider(formattedPaymentPhone);
        
        // Store payment phone and move to payment method selection
        updateSessionStep(userId, 'select_payment_method', 'airtime_select_payment_method', {
            paymentPhone: formattedPaymentPhone,
            paymentProvider: paymentProvider
        });
        
        // Ask for payment method confirmation
        await this.sendPaymentMethodPrompt(userId, paymentProvider);
    }
    
    /**
     * Step 4: Payment Method Selection
     */
    async sendPaymentMethodPrompt(userId, detectedProvider) {
        let message = `💳 *Payment Method*\n\n`;
        
        if (detectedProvider) {
            message += `✅ We detected ${detectedProvider === 'ecocash' ? 'EcoCash' : 'OneMoney'} from your number.\n\n`;
        }
        
        message += `How would you like to pay?\n\n` +
            `1️⃣ *EcoCash*\n` +
            `2️⃣ *OneMoney*\n\n` +
            `📝 Reply with number (1-2):`;
        
        await messaging.sendMessage(userId, message);
    }
    
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
        
        // Verify payment method matches phone provider (optional warning)
        const { paymentProvider } = session.data;
        if (paymentProvider && paymentProvider !== paymentMethod) {
            console.log(`⚠️ Payment method mismatch: Phone=${paymentProvider}, Selected=${paymentMethod}`);
            // Still proceed, but log it
        }
        
        // Move to confirmation
        updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            paymentMethod: paymentMethod
        });
        
        // Show full transaction details
        await this.showTransactionDetails(userId, session);
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
            let displayNetwork = network || 'Not detected';
            
            const message = `📋 *Transaction Details*\n\n` +
                `📱 *Network:* ${displayNetwork}\n` +
                `👤 *Recipient:* ${displayRecipient}\n` +
                `💰 *Airtime Amount:* ${amount?.toLocaleString() || '0'} ${currency}\n` +
                `📈 *Service Fee (${feePercentage}%):* ${serviceFee?.toLocaleString() || '0'} ${currency}\n` +
                `💵 *Total to Pay:* ${totalAmount?.toLocaleString() || '0'} ${currency}\n` +
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
     * Process payment with PayNow integration
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
                phone: paymentPhone, // Use payment phone for PayNow
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
     * Monitor payment status - UNCHANGED
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
     * Fulfill airtime purchase via HotRecharge
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
                paynowReference: paymentStatus.paynowref
            });
            
            const hotrechargeResult = await hotrechargeService.buyAirtime(
                recipient,
                amount,
                network
            );
            
            console.log(`🔌 [HOTRECHARGE] Result:`, hotrechargeResult);
            
            if (hotrechargeResult.success) {
                const receiptMessage = `✅ *Airtime Purchase Successful!*\n\n` +
                    `📋 *Receipt:*\n` +
                    `• Transaction ID: ${reference}\n` +
                    `• PayNow Ref: ${paymentStatus.paynowref || 'N/A'}\n` +
                    `• HotRecharge ID: ${hotrechargeResult.transactionId || 'N/A'}\n` +
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
                await messaging.sendMessage(userId,
                    `⚠️ *Airtime Processing Issue*\n\n` +
                    `Payment was successful but airtime could not be delivered.\n\n` +
                    `*Reference:* ${reference}\n` +
                    `🛠️ Please contact support.\n\n` +
                    `Type "hi" to try again.`
                );
            }
            
        } catch (error) {
            console.error(`❌ Fulfillment error:`, error.message);
            
            await messaging.sendMessage(userId,
                `❌ *Fulfillment Error*\n\n` +
                `Payment successful but airtime failed.\n\n` +
                `*Reference:* ${reference}\n\n` +
                `🛠️ Please contact support.\n\n` +
                `Type "hi" to try again.`
            );
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
     * Validate payment phone number (must be EcoCash or OneMoney)
     */
    validatePaymentPhone(phone) {
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
                error: 'Invalid phone number format'
            };
        }
        
        // Check if supported for payment
        const provider = this.detectMobileProvider(formatted);
        
        if (!provider) {
            return {
                valid: false,
                formatted: null,
                error: 'Only EcoCash (077/078) and OneMoney (071) are supported'
            };
        }
        
        return {
            valid: true,
            formatted: formatted,
            error: null,
            provider: provider
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
        
        return null; // Unknown - HotRecharge will detect
    }
    
    /**
     * Detect mobile money provider (for PayNow)
     */
    detectMobileProvider(phone) {
        const cleanPhone = phone.toString().replace(/\D/g, '');
        
        if (cleanPhone.startsWith('26377') || cleanPhone.startsWith('26378') || 
            cleanPhone.startsWith('077') || cleanPhone.startsWith('078') ||
            cleanPhone.startsWith('77') || cleanPhone.startsWith('78')) {
            return 'ecocash';
        }
        
        if (cleanPhone.startsWith('26371') || cleanPhone.startsWith('071') || 
            cleanPhone.startsWith('71')) {
            return 'onemoney';
        }
        
        return null;
    }
}

module.exports = new AirtimeService();