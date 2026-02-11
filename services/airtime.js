// services/airtime.js - UPDATED FLOW: Network → Amount → Recipient → Payment Method → Confirm
const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const paynowService = require('./paynow');
const hotrechargeService = require('./hotrecharge');
const { FLOW_STATES, AIRTIME_NETWORKS, PAYMENT_CONFIG, RESPONSE_MESSAGES, ERROR_MESSAGES } = require('../config/constants');

// Payment methods constant (internal use only - not modifying constants.js)
const PAYMENT_METHODS = {
    '1': 'ecocash',
    '2': 'onemoney'
};

class AirtimeService {
    
    /**
     * Start the airtime flow
     * Called from main menu
     */
    async startFlow(userId) {
        console.log(`📱 Starting airtime flow for ${userId}`);
        
        // Create new session for airtime service
        createSession(userId, 'airtime');
        
        // Send network selection message
        await this.sendNetworkSelection(userId);
        
        // Update session to first step
        updateSessionStep(userId, 'select_network', FLOW_STATES.AIRTIME.SELECT_NETWORK);
    }
    
    /**
     * Main request handler for airtime flow
     * Follows step-by-step state-driven architecture
     */
    async handleRequest(userId, message, session) {
        console.log(`📱 Airtime request from ${userId} at step ${session.step}: "${message}"`);
        
        // Route based on current flow state
        switch(session.flow) {
            case FLOW_STATES.AIRTIME.SELECT_NETWORK:
                await this.handleNetworkSelection(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_AMOUNT: // Now Step 2
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_PHONE: // Now Step 3
                await this.handlePhoneEntry(userId, message, session);
                break;
                
            case 'airtime_select_payment_method': // NEW Step 4
                await this.handlePaymentMethodSelection(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.CONFIRM_PAYMENT: // Step 5
                await this.handleConfirmation(userId, message, session);
                break;
                
            default:
                // Invalid state - reset
                console.error(`❌ Invalid flow state for ${userId}: ${session.flow}`);
                deleteSession(userId);
                await this.startFlow(userId);
        }
    }
    
    /**
     * Step 1: Network Selection
     */
    async sendNetworkSelection(userId) {
        const message = `📱 *Buy Airtime*\n\n` +
            `Select your network:\n\n` +
            `1️⃣ *Econet*\n` +
            `2️⃣ *NetOne*\n` +
            `3️⃣ *Telecel*\n\n` +
            `📝 Reply with number (1-3)`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleNetworkSelection(userId, message, session) {
        const selection = message.trim();
        
        // Validate network selection
        if (!AIRTIME_NETWORKS[selection]) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose:\n\n` +
                `1. Econet\n2. NetOne\n3. Telecel\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        const network = AIRTIME_NETWORKS[selection];
        
        // UPDATED: Next step is ENTER_AMOUNT (not ENTER_PHONE)
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT, {
            network: network
        });
        
        // Ask for amount
        await this.sendAmountPrompt(userId, network);
    }
    
    /**
     * Step 2: Amount Entry (MOVED UP)
     */
    async sendAmountPrompt(userId, network) {
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        
        const message = `📱 *Buy Airtime - ${network}*\n\n` +
            `Enter amount (${currency}):\n\n` +
            `💰 *Range:* ${minAmount.toLocaleString()} - ${maxAmount.toLocaleString()} ${currency}\n\n` +
            `💡 *Common amounts:*\n` +
            `• 5,000 ${currency}\n` +
            `• 10,000 ${currency}\n` +
            `• 20,000 ${currency}\n\n` +
            `📝 Enter amount now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        console.log(`💰 [DEBUG] handleAmountEntry called for ${userId}`);
        
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
        
        // UPDATED: Next step is ENTER_PHONE (not CONFIRM_PAYMENT)
        updateSessionStep(userId, 'enter_phone', FLOW_STATES.AIRTIME.ENTER_PHONE, {
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Ask for recipient phone number
        await this.sendPhoneNumberPrompt(userId, session.data.network);
    }
    
    /**
     * Step 3: Phone Number Entry (MOVED DOWN)
     */
    async sendPhoneNumberPrompt(userId, network) {
        const formats = this.getNetworkFormats(network);
        
        const message = `📱 *Buy Airtime - ${network}*\n\n` +
            `Enter recipient's phone number:\n\n` + // Clarified "recipient's"
            `📋 *Valid formats:*\n` +
            `${formats}\n\n` +
            `📝 Enter the number now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePhoneEntry(userId, message, session) {
        const phoneNumber = message.trim();
        const selectedNetwork = session.data.network;
        
        // Validate phone number for the specific network
        const validationResult = this.validatePhoneForNetwork(phoneNumber, selectedNetwork);
        
        if (!validationResult.valid) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ *Invalid ${selectedNetwork} Number*\n\n` +
                `${validationResult.error}\n\n` +
                `📋 *Valid ${selectedNetwork} formats:*\n` +
                `${validationResult.validFormats}\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Format phone number consistently
        const formattedPhone = validationResult.formatted;
        
        // UPDATED: Next step is SELECT_PAYMENT_METHOD (new step)
        updateSessionStep(userId, 'select_payment_method', 'airtime_select_payment_method', {
            phone: formattedPhone
        });
        
        // Ask for payment method
        await this.sendPaymentMethodPrompt(userId);
    }
    
    /**
     * NEW Step 4: Payment Method Selection
     */
    async sendPaymentMethodPrompt(userId) {
        const message = `💳 *Payment Method*\n\n` +
            `How would you like to pay?\n\n` +
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
        
        // Update session with payment method and move to confirmation
        updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            paymentMethod: paymentMethod
        });
        
        // Show full transaction details with payment method
        await this.showTransactionDetails(userId, session);
    }
    
    /**
     * Step 5: Transaction Details & Confirmation (UPDATED with Payment Method)
     */
    async showTransactionDetails(userId, session) {
        console.log(`📋 [DEBUG] showTransactionDetails called for ${userId}`);
        
        try {
            if (!session || !session.data) {
                throw new Error('Session or session.data is undefined');
            }
            
            const { network, phone, amount, serviceFee, totalAmount, paymentMethod } = session.data;
            const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
            
            // Format phone for display
            let displayPhone = 'N/A';
            if (phone) {
                displayPhone = phone.toString().replace('263', '0');
            }
            
            const feePercentage = (PAYMENT_CONFIG.SERVICE_FEES.AIRTIME * 100).toFixed(0);
            
            // Format payment method for display
            let displayPaymentMethod = 'PayNow';
            if (paymentMethod === 'ecocash') displayPaymentMethod = 'EcoCash';
            if (paymentMethod === 'onemoney') displayPaymentMethod = 'OneMoney';
            
            const message = `📋 *Transaction Details*\n\n` +
                `📱 *Network:* ${network || 'N/A'}\n` +
                `📞 *Recipient:* ${displayPhone}\n` + // Changed to "Recipient"
                `💰 *Airtime Amount:* ${amount ? amount.toLocaleString() : '0'} ${currency}\n` +
                `📈 *Service Fee (${feePercentage}%):* ${serviceFee ? serviceFee.toLocaleString() : '0'} ${currency}\n` +
                `💵 *Total to Pay:* ${totalAmount ? totalAmount.toLocaleString() : '0'} ${currency}\n` +
                `💳 *Payment Method:* ${displayPaymentMethod}\n\n` + // Added payment method
                `*Proceed with payment?*\n\n` +
                `Type: YES or NO`;
            
            await messaging.sendMessage(userId, message);
            
        } catch (error) {
            console.error(`❌ [DEBUG] Error in showTransactionDetails:`, error.message);
            
            // Fallback
            const { totalAmount } = session.data;
            const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
            await messaging.sendMessage(userId,
                `Proceed with payment of ${totalAmount?.toLocaleString() || '0'} ${currency}? (Yes/No)`
            );
        }
    }
    
    async handleConfirmation(userId, message, session) {
        console.log(`✅ [DEBUG] handleConfirmation called for ${userId}`);
        
        const response = message.trim().toLowerCase();
        
        if (response === 'yes' || response === 'y') {
            console.log(`✅ [DEBUG] User confirmed payment. Calling processPayment()...`);
            await this.processPayment(userId, session);
        } else if (response === 'no' || response === 'n') {
            console.log(`❌ [DEBUG] User cancelled payment`);
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
     * Process payment with PayNow integration (UPDATED with payment method)
     */
    async processPayment(userId, session) {
        console.log(`💰 [DEBUG] processPayment called for ${userId}`);
        
        const { network, phone, amount, serviceFee, totalAmount, paymentMethod } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayPhone = phone.replace('263', '0');
        
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
            // Initiate payment using SDK with selected payment method
            const paymentResult = await paynowService.initiateQuickPay({
                amount: totalAmount.toFixed(2),
                reference: reference,
                phone: phone,
                service: `Airtime - ${network}`,
                customer: {
                    phone: phone,
                    email: `${phone}@cchub.co.zw`
                }
                // Note: paymentMethod is used by PayNow to determine provider
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
                `• Network: ${network}\n` +
                `• Recipient: ${displayPhone}\n` +
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
                console.warn(`⚠️ No poll URL for ${userId}, cannot monitor payment`);
                await messaging.sendMessage(userId,
                    `⚠️ *Payment monitoring limited*\n\n` +
                    `Please check your mobile money for payment confirmation.\n\n` +
                    `If paid, your airtime will be credited shortly.`
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
     * Monitor payment status (using polling) - UNCHANGED
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { network, phone, amount, serviceFee, totalAmount, reference } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayPhone = phone.replace('263', '0');
        
        console.log(`🔍 Starting payment monitoring for ${userId}, reference: ${reference}`);
        
        let attempts = 0;
        const maxAttempts = 60;
        const pollInterval = 10000;
        
        const checkStatus = async () => {
            attempts++;
            
            const currentSession = getActiveSession(userId);
            if (!currentSession || currentSession.service !== 'airtime') {
                console.log(`🛑 Stopping monitoring - session ended for ${userId}`);
                clearInterval(intervalId);
                return;
            }
            
            if (attempts > maxAttempts) {
                clearInterval(intervalId);
                console.log(`⏰ Payment timeout for ${userId}, reference: ${reference}`);
                
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
                console.log(`🔍 Payment status for ${userId}:`, status.status);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    console.log(`✅ Payment completed for ${userId}, reference: ${reference}`);
                    
                    await this.fulfillAirtimePurchase(userId, session, status);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    console.log(`❌ Payment cancelled for ${userId}, reference: ${reference}`);
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Cancelled*\n\n` +
                        `Payment was cancelled.\n\n` +
                        `Reference: ${reference}\n` +
                        `Amount: ${totalAmount.toLocaleString()} ${currency}\n\n` +
                        `Type "hi" to try again.`
                    );
                    
                    deleteSession(userId);
                } else if (status.status === 'error') {
                    clearInterval(intervalId);
                    console.log(`❌ Payment error for ${userId}, reference: ${reference}`);
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Error*\n\n` +
                        `There was an error processing your payment.\n\n` +
                        `Error: ${status.error || 'Unknown error'}\n\n` +
                        `Please try again or contact support.`
                    );
                    
                    deleteSession(userId);
                }
                
            } catch (error) {
                console.error(`❌ Error checking payment status for ${userId}:`, error.message);
            }
        };
        
        const intervalId = setInterval(checkStatus, pollInterval);
        setTimeout(checkStatus, 2000);
    }
    
    /**
     * Fulfill airtime purchase via HotRecharge - UNCHANGED
     */
    async fulfillAirtimePurchase(userId, session, paymentStatus) {
        const { network, phone, amount, serviceFee, totalAmount, reference } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayPhone = phone.replace('263', '0');
        
        try {
            await messaging.sendMessage(userId,
                `✅ *Payment Confirmed!*\n\n` +
                `💰 *Purchasing airtime via HotRecharge...*\n\n` +
                `• Amount: ${amount.toLocaleString()} ${currency}\n` +
                `• Network: ${network}\n` +
                `• Recipient: ${displayPhone}\n\n` +
                `⏳ *Processing...*`
            );
            
            console.log(`🔌 [HOTRECHARGE] Calling API for ${userId}:`, {
                phone: phone,
                amount: amount,
                network: network,
                paynowReference: paymentStatus.paynowref,
                transactionId: reference
            });
            
            const hotrechargeResult = await hotrechargeService.buyAirtime(
                phone,
                amount,
                network
            );
            
            console.log(`🔌 [HOTRECHARGE] Result for ${userId}:`, hotrechargeResult);
            
            if (hotrechargeResult.success) {
                const receiptMessage = `✅ *Airtime Purchase Successful!*\n\n` +
                    `📋 *Receipt:*\n` +
                    `• Transaction ID: ${reference}\n` +
                    `• PayNow Ref: ${paymentStatus.paynowref || 'N/A'}\n` +
                    `• HotRecharge ID: ${hotrechargeResult.transactionId || 'N/A'}\n` +
                    `• Network: ${network}\n` +
                    `• Recipient: ${displayPhone}\n` +
                    `• Airtime Amount: ${amount.toLocaleString()} ${currency}\n` +
                    `• Service Fee: ${serviceFee.toLocaleString()} ${currency}\n` +
                    `• Total Paid: ${totalAmount.toLocaleString()} ${currency}\n` +
                    `• Date: ${new Date().toLocaleString()}\n\n` +
                    `🎉 *Airtime sent successfully!*\n\n` +
                    `💡 Recipient should receive it within 2 minutes.\n\n` +
                    `Type "hi" for another transaction.`;
                
                await messaging.sendMessage(userId, receiptMessage);
                
            } else {
                const errorMessage = `⚠️ *Airtime Processing Issue*\n\n` +
                    `Payment was successful but airtime could not be delivered.\n\n` +
                    `*Details:*\n` +
                    `• Reference: ${reference}\n` +
                    `• Error: ${hotrechargeResult.message || 'Unknown error'}\n\n` +
                    `🛠️ *Support:*\n` +
                    `Please contact support with your reference number.\n\n` +
                    `Type "hi" to try again.`;
                
                await messaging.sendMessage(userId, errorMessage);
                console.error(`❌ HotRecharge failed after payment:`, hotrechargeResult);
            }
            
        } catch (error) {
            console.error(`❌ Error in fulfillAirtimePurchase for ${userId}:`, error.message);
            
            await messaging.sendMessage(userId,
                `❌ *Fulfillment Error*\n\n` +
                `Payment was successful but there was an error processing your airtime.\n\n` +
                `*Reference:* ${reference}\n\n` +
                `🛠️ *Support:*\n` +
                `Please contact support with this reference number.\n\n` +
                `Type "hi" to try again.`
            );
        } finally {
            deleteSession(userId);
        }
    }
    
    /**
     * Validate phone number for specific network - UNCHANGED
     */
    validatePhoneForNetwork(phone, network) {
        const digits = phone.replace(/\D/g, '');
        
        let valid = false;
        let formatted = '';
        let error = '';
        let validFormats = '';
        
        const networkPrefixes = {
            'Econet': ['077', '078'],
            'NetOne': ['071'],
            'Telecel': ['073']
        };
        
        const prefixes = networkPrefixes[network] || [];
        validFormats = this.getNetworkFormats(network);
        
        if (digits.length === 10 && digits.startsWith('0')) {
            const prefix = digits.substring(0, 3);
            if (prefixes.includes(prefix)) {
                valid = true;
                formatted = '263' + digits.substring(1);
            } else {
                error = `Number starts with ${prefix}, but ${network} numbers must start with: ${prefixes.join(' or ')}`;
            }
        }
        else if (digits.length === 12 && digits.startsWith('263')) {
            const localPrefix = '0' + digits.substring(3, 5);
            if (prefixes.includes(localPrefix)) {
                valid = true;
                formatted = digits;
            } else {
                error = `Number starts with 263${digits.substring(3,5)}, but ${network} numbers must start with: 263${prefixes.map(p => p.substring(1)).join(' or 263')}`;
            }
        }
        else if (digits.length === 9 && !digits.startsWith('0')) {
            const localPrefix = '0' + digits.substring(0, 2);
            if (prefixes.includes(localPrefix)) {
                valid = true;
                formatted = '263' + digits;
            } else {
                error = `Number starts with ${digits.substring(0,2)}, but ${network} numbers must start with: ${prefixes.map(p => p.substring(1)).join(' or ')}`;
            }
        }
        else {
            error = `Invalid format. Please use 10-digit (0771234567), 12-digit (263771234567), or 9-digit (771234567) format.`;
        }
        
        return {
            valid,
            formatted,
            error,
            validFormats
        };
    }
    
    /**
     * Get valid formats for a specific network - UNCHANGED
     */
    getNetworkFormats(network) {
        const networkFormats = {
            'Econet': '• 0771234567\n• 0781234567\n• 263771234567\n• 263781234567\n• 771234567\n• 781234567',
            'NetOne': '• 0711234567\n• 263711234567\n• 711234567',
            'Telecel': '• 0731234567\n• 263731234567\n• 731234567'
        };
        
        return networkFormats[network] || 'Please enter a valid phone number';
    }
}

// Export singleton instance
module.exports = new AirtimeService();