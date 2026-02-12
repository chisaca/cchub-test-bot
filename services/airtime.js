// services/airtime.js - ZIG/USD CURRENCY SELECTION FLOW
const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { 
    FLOW_STATES, 
    AIRTIME_NETWORKS, 
    PAYMENT_CONFIG, 
    AIRTIME_CURRENCY_OPTIONS,
    RESPONSE_MESSAGES, 
    ERROR_MESSAGES 
} = require('../config/constants');

// Payment methods constant (internal use only)
const PAYMENT_METHODS = {
    '1': 'ecocash',
    '2': 'onemoney'
};

class AirtimeService {
    
    /**
     * Start the airtime flow
     * Called from main menu - NOW STARTS WITH CURRENCY SELECTION
     */
    async startFlow(userId) {
        console.log(`📱 Starting airtime flow for ${userId}`);
        
        // Create new session for airtime service
        createSession(userId, 'airtime');
        
        // Send currency selection prompt first
        await this.sendCurrencyPrompt(userId);
        
        // Update session to currency selection step
        updateSessionStep(userId, 'select_currency', FLOW_STATES.AIRTIME.SELECT_CURRENCY);
    }
    
    /**
     * Step 1: Currency Selection
     */
    async sendCurrencyPrompt(userId) {
        await messaging.sendMessage(userId, RESPONSE_MESSAGES.AIRTIME_CURRENCY_PROMPT);
    }
    
    async handleCurrencySelection(userId, message, session) {
        const selection = message.trim();
        
        // Validate currency selection
        if (!AIRTIME_CURRENCY_OPTIONS[selection]) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, RESPONSE_MESSAGES.INVALID_CURRENCY + 
                `\n\nAttempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        const currencyOption = AIRTIME_CURRENCY_OPTIONS[selection];
        
        // Store currency selection and move to amount entry
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT, {
            currency: currencyOption.id,
            currencyName: currencyOption.name,
            currencySymbol: currencyOption.symbol,
            minAmount: currencyOption.min,
            maxAmount: currencyOption.max,
            hotrecharge_product_map: currencyOption.hotrecharge_product_map
        });
        
        // Send amount prompt for selected currency
        await this.sendAmountPrompt(userId, currencyOption);
    }
    
    /**
     * Step 2: Amount Entry (Currency Specific)
     */
    async sendAmountPrompt(userId, currencyOption) {
        const { name, symbol, min, max } = currencyOption;
        
        let commonAmounts = '';
        if (name === 'ZiG') {
            commonAmounts = `• 5,000 ${name}\n• 10,000 ${name}\n• 20,000 ${name}`;
        } else {
            commonAmounts = `• $1.00\n• $2.00\n• $5.00\n• $10.00`;
        }
        
        const message = `📱 *Buy Airtime (${name})*\n\n` +
            `Enter airtime amount:\n\n` +
            `💰 *Range:* ${min.toLocaleString()} - ${max.toLocaleString()} ${symbol}\n\n` +
            `💡 *Common amounts:*\n${commonAmounts}\n\n` +
            `📝 Enter amount now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const { currency, currencyName, currencySymbol, minAmount, maxAmount } = session.data;
        
        // Parse amount (handle decimals for USD)
        let amount;
        if (currency === 'usd') {
            amount = parseFloat(amountText);
        } else {
            amount = parseInt(amountText, 10);
        }
        
        // Validate amount
        if (isNaN(amount) || amount < minAmount || amount > maxAmount) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ *Invalid Amount*\n\n` +
                `Amount must be between ${minAmount} and ${maxAmount} ${currencySymbol}.\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Calculate fee and total
        const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = currency === 'usd' 
            ? parseFloat((amount * fee).toFixed(2))
            : Math.round(amount * fee);
        const totalAmount = amount + serviceFee;
        
        // Store amount and move to network selection
        updateSessionStep(userId, 'select_network', FLOW_STATES.AIRTIME.SELECT_NETWORK, {
            ...session.data,
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Ask for network selection
        await this.sendNetworkPrompt(userId);
    }
    
    /**
     * Step 3: Network Selection
     */
    async sendNetworkPrompt(userId) {
        const message = `📶 *Select Network*\n\n` +
            `Choose the recipient's mobile network:\n\n` +
            `1️⃣ Econet\n` +
            `2️⃣ NetOne\n` +
            `3️⃣ Telecel\n\n` +
            `📝 Reply with number (1-3):`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleNetworkSelection(userId, message, session) {
        const selection = message.trim();
        
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
        
        // Store network and move to recipient entry
        updateSessionStep(userId, 'enter_recipient', FLOW_STATES.AIRTIME.ENTER_PHONE, {
            ...session.data,
            network: network
        });
        
        // Ask for recipient phone number
        await this.sendRecipientPrompt(userId);
    }
    
    /**
     * Step 4: Recipient Phone Number Entry
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
        
        // Validate recipient phone number
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
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Format recipient phone number
        const formattedRecipient = validationResult.formatted;
        
        // Store recipient and move to payment method selection
        updateSessionStep(userId, 'select_payment_method', 'airtime_select_payment_method', {
            ...session.data,
            recipient: formattedRecipient
        });
        
        // Ask for payment method
        await this.sendPaymentMethodPrompt(userId);
    }
    
    /**
     * Step 5: Payment Method Selection
     */
    async sendPaymentMethodPrompt(userId) {
        const message = `💳 *Payment Method*\n\n` +
            `How would you like to pay?\n\n` +
            `1️⃣ *EcoCash* (077, 078 numbers)\n` +
            `2️⃣ *OneMoney* (071 numbers)\n\n` +
            `📝 Reply with number (1-2):`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePaymentMethodSelection(userId, message, session) {
        const selection = message.trim();
        
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
        
        updateSessionStep(userId, 'enter_payment_phone', 'airtime_enter_payment_phone', {
            ...session.data,
            paymentMethod: paymentMethod
        });
        
        await this.sendPaymentPhonePrompt(userId, paymentMethod);
    }
    
    /**
     * Step 6: Payment Phone Number Entry
     */
    async sendPaymentPhonePrompt(userId, paymentMethod) {
        let prefixMessage = '';
        if (paymentMethod === 'ecocash') {
            prefixMessage = `📱 *EcoCash Payment*\n\n` +
                `Enter your EcoCash phone number:\n\n` +
                `✅ *Valid prefixes:* 077, 078\n\n`;
        } else {
            prefixMessage = `📱 *OneMoney Payment*\n\n` +
                `Enter your OneMoney phone number:\n\n` +
                `✅ *Valid prefixes:* 071\n\n`;
        }
        
        const message = prefixMessage +
            `📋 *Formats accepted:*\n` +
            `• 0771234567\n` +
            `• 263771234567\n\n` +
            `📝 Enter your payment number:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePaymentPhoneEntry(userId, message, session) {
        const phoneNumber = message.trim();
        const { paymentMethod } = session.data;
        
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
        
        const formattedPaymentPhone = validationResult.formatted;
        
        const updatedSession = updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            ...session.data,
            paymentPhone: formattedPaymentPhone,
            paymentProvider: paymentMethod
        });
        
        await this.showTransactionDetails(userId, updatedSession || session);
    }
    
    /**
     * Step 7: Transaction Details & Confirmation
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
                paymentMethod,
                currencyName,
                currencySymbol
            } = session.data;
            
            const displayRecipient = recipient?.toString().replace('263', '0') || 'N/A';
            const displayPaymentPhone = paymentPhone?.toString().replace('263', '0') || 'N/A';
            
            const feePercentage = (PAYMENT_CONFIG.SERVICE_FEES.AIRTIME * 100).toFixed(0);
            
            let displayPaymentMethod = 'PayNow';
            if (paymentMethod === 'ecocash') displayPaymentMethod = 'EcoCash';
            if (paymentMethod === 'onemoney') displayPaymentMethod = 'OneMoney';
            
            const amountDisplay = currencyName === 'USD' 
                ? `$${amount?.toFixed(2)}` 
                : `${amount?.toLocaleString()} ${currencySymbol}`;
            
            const feeDisplay = currencyName === 'USD'
                ? `$${serviceFee?.toFixed(2)}`
                : `${serviceFee?.toLocaleString()} ${currencySymbol}`;
            
            const totalDisplay = currencyName === 'USD'
                ? `$${totalAmount?.toFixed(2)}`
                : `${totalAmount?.toLocaleString()} ${currencySymbol}`;
            
            const message = `📋 *Transaction Details*\n\n` +
                `💰 *Airtime Amount:* ${amountDisplay}\n` +
                `📈 *Service Fee (${feePercentage}%):* ${feeDisplay}\n` +
                `💵 *Total to Pay:* ${totalDisplay}\n` +
                `👤 *Recipient:* ${displayRecipient}\n` +
                `📶 *Network:* ${network}\n` +
                `💳 *Payment Method:* ${displayPaymentMethod}\n` +
                `📞 *Payment Number:* ${displayPaymentPhone}\n\n` +
                `*Proceed with payment?*\n\n` +
                `Type: YES or NO`;
            
            await messaging.sendMessage(userId, message);
            
        } catch (error) {
            console.error(`❌ Error in showTransactionDetails:`, error.message);
            await messaging.sendMessage(userId,
                `Proceed with payment? (Yes/No)`
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
                `Type "hi" to start again.`
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
     * Step 8: Process payment with PayNow
     */
    async processPayment(userId, session) {
        const { 
            totalAmount, 
            paymentPhone, 
            paymentMethod, 
            network, 
            recipient, 
            amount, 
            serviceFee,
            currency,
            currencyName,
            currencySymbol
        } = session.data;
        
        const displayRecipient = recipient.replace('263', '0');
        const displayPaymentPhone = paymentPhone.replace('263', '0');
        const reference = `AIR${Date.now().toString().slice(-8)}`;
        
        updateSessionStep(userId, 'processing_payment', 'processing_payment', {
            ...session.data,
            reference: reference,
            paymentInitiated: true
        });
        
        await messaging.sendMessage(userId, `⏳ *Connecting to PayNow...*`);
        
        try {
            // PayNow always processes in USD
            const paymentResult = await paynowService.initiateQuickPay({
                amount: totalAmount.toFixed(2),
                reference: reference,
                phone: paymentPhone,
                service: `Airtime (${currencyName}) - ${network}`,
                customer: {
                    phone: paymentPhone,
                    email: `${paymentPhone}@cchub.co.zw`
                }
            });
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            let displayProvider = paymentResult.provider.toUpperCase();
            if (displayProvider === 'ECOCASH') displayProvider = 'EcoCash';
            if (displayProvider === 'ONEMONEY') displayProvider = 'OneMoney';
            
            const totalDisplay = currencyName === 'USD'
                ? `$${totalAmount?.toFixed(2)}`
                : `${totalAmount?.toLocaleString()} ${currencySymbol}`;
            
            await messaging.sendMessage(userId,
                `💳 *Payment Instructions*\n\n` +
                `✅ *Payment Request Created*\n\n` +
                `📋 *Details:*\n` +
                `• Amount: ${totalDisplay}\n` +
                `• Reference: ${reference}\n` +
                `• Payment Number: ${displayPaymentPhone}\n` +
                `• Provider: ${displayProvider}\n\n` +
                `📱 *Instructions:*\n` +
                `${paymentResult.instructions}\n\n` +
                `⏳ *Status:* Waiting for payment\n\n` +
                `I'll notify you when payment is confirmed.`
            );
            
            if (paymentResult.pollUrl) {
                this.monitorPaymentStatus(userId, paymentResult.pollUrl, session);
            }
            
        } catch (error) {
            console.error(`❌ PayNow error:`, error.message);
            await messaging.sendMessage(userId,
                `❌ *Payment Failed*\n\n` +
                `Unable to initiate payment: ${error.message}\n\n` +
                `Type "hi" to start over.`
            );
            deleteSession(userId);
        }
    }
    
    /**
     * Monitor payment status
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { recipient, amount, reference, network, currency, currencyName } = session.data;
        const displayRecipient = recipient.replace('263', '0');
        
        console.log(`🔍 Monitoring payment for ${userId}, ref: ${reference}`);
        
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
                await messaging.sendMessage(userId,
                    `⏰ *Payment Timeout*\n\n` +
                    `Reference: ${reference}\n\n` +
                    `Type "hi" to try again.`
                );
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynowService.checkPaymentStatus(pollUrl);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    await this.fulfillAirtimePurchase(userId, session, status);
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
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
     * Step 9: Fulfill airtime via HotRecharge
     */
    async fulfillAirtimePurchase(userId, session, paymentStatus) {
        const { 
            network, 
            recipient, 
            amount, 
            serviceFee, 
            totalAmount, 
            reference,
            currency,
            currencyName,
            currencySymbol,
            hotrecharge_product_map
        } = session.data;
        
        const displayRecipient = recipient.replace('263', '0');
        
        try {
            await messaging.sendMessage(userId,
                `✅ *Payment Confirmed!*\n\n` +
                `💰 *Purchasing airtime via HotRecharge...*\n\n` +
                `• Amount: ${currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toLocaleString()} ${currencySymbol}`}\n` +
                `• Network: ${network}\n` +
                `• Recipient: ${displayRecipient}\n\n` +
                `⏳ *Processing...*`
            );
            
            // Get the correct product ID for selected currency and network
            const productId = hotrecharge_product_map[network];
            
            console.log(`🔌 [HOTRECHARGE] Calling API:`, {
                phone: recipient,
                amount: amount,
                network: network,
                currency: currencyName,
                productId: productId,
                paynowReference: reference
            });
            
            // Override the product ID in hotrecharge service
            const hotrechargeResult = await hotrecharge.purchaseAirtime({
                recipient: recipient,
                amount: amount,
                network: network,
                userId: userId.split('@')[0].slice(-4),
                productId: productId,  // Pass currency-specific product ID
                currency: currency      // Pass currency for balance check
            });
            
            console.log(`🔌 [HOTRECHARGE] Result:`, hotrechargeResult);
            
            if (hotrechargeResult.success) {
                const amountDisplay = currencyName === 'USD'
                    ? `$${amount.toFixed(2)}`
                    : `${amount.toLocaleString()} ${currencySymbol}`;
                
                const feeDisplay = currencyName === 'USD'
                    ? `$${serviceFee?.toFixed(2)}`
                    : `${serviceFee?.toLocaleString()} ${currencySymbol}`;
                
                const totalDisplay = currencyName === 'USD'
                    ? `$${totalAmount?.toFixed(2)}`
                    : `${totalAmount?.toLocaleString()} ${currencySymbol}`;
                
                const receiptMessage = `✅ *Airtime Purchase Successful!*\n\n` +
                    `📋 *Receipt:*\n` +
                    `• Transaction ID: ${reference}\n` +
                    `• PayNow Ref: ${paymentStatus.paynowref || 'N/A'}\n` +
                    `• HotRecharge ID: ${hotrechargeResult.transactionId}\n` +
                    `• Agent Reference: ${hotrechargeResult.agentReference}\n` +
                    `• Network: ${network}\n` +
                    `• Recipient: ${displayRecipient}\n` +
                    `• Currency: ${currencyName}\n` +
                    `• Airtime Amount: ${amountDisplay}\n` +
                    `• Service Fee: ${feeDisplay}\n` +
                    `• Total Paid: ${totalDisplay}\n` +
                    `• Date: ${new Date().toLocaleString()}\n\n` +
                    `🎉 *Airtime sent successfully!*\n\n` +
                    `💡 Recipient should receive it within 2 minutes.\n\n` +
                    `Type "hi" for another transaction.`;
                
                await messaging.sendMessage(userId, receiptMessage);
                
            } else {
                await messaging.sendMessage(userId,
                    `⚠️ *Airtime Processing Issue*\n\n` +
                    `✅ *Payment was successful* but airtime delivery encountered an issue.\n\n` +
                    `*Reference:* ${reference}\n` +
                    `*Error:* ${hotrechargeResult.error || 'Provider temporarily unavailable'}\n\n` +
                    `🛠️ Our team has been notified. You will receive your airtime within 15 minutes.\n\n` +
                    `Type "hi" for another transaction.`
                );
                
                console.error(`🚨 MANUAL RECONCILIATION NEEDED:`, {
                    reference,
                    recipient,
                    amount,
                    network,
                    currency,
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
                `Type "hi" for another transaction.`
            );
            
            console.error(`🚨 MANUAL RECONCILIATION NEEDED:`, {
                reference,
                recipient,
                amount,
                network,
                currency,
                error: error.message
            });
            
        } finally {
            deleteSession(userId);
        }
    }
    
    /**
     * Main request handler - UPDATED with currency step
     */
    async handleRequest(userId, message, session) {
        console.log(`📱 Airtime request at step ${session.flow}: "${message}"`);
        
        switch(session.flow) {
            case FLOW_STATES.AIRTIME.SELECT_CURRENCY:
                await this.handleCurrencySelection(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_AMOUNT:
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.SELECT_NETWORK:
                await this.handleNetworkSelection(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_PHONE:
                await this.handleRecipientEntry(userId, message, session);
                break;
                
            case 'airtime_select_payment_method':
                await this.handlePaymentMethodSelection(userId, message, session);
                break;
                
            case 'airtime_enter_payment_phone':
                await this.handlePaymentPhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.CONFIRM_PAYMENT:
                await this.handleConfirmation(userId, message, session);
                break;
                
            default:
                console.error(`❌ Invalid flow state: ${session.flow}`);
                deleteSession(userId);
                await this.startFlow(userId);
        }
    }
    
    // ==================== VALIDATION HELPERS (UNCHANGED) ====================
    
    validateRecipientPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        
        if (digits.length === 10 && digits.startsWith('0')) {
            return {
                valid: true,
                formatted: '263' + digits.substring(1),
                error: null
            };
        } else if (digits.length === 12 && digits.startsWith('263')) {
            return {
                valid: true,
                formatted: digits,
                error: null
            };
        } else if (digits.length === 9 && !digits.startsWith('0')) {
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
    
    validatePaymentPhoneForMethod(phone, paymentMethod) {
        const digits = phone.replace(/\D/g, '');
        let formatted = '';
        
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
                error: 'Invalid phone number format. Use 0771234567 or 263771234567'
            };
        }
        
        if (paymentMethod === 'ecocash') {
            if (formatted.startsWith('26377') || formatted.startsWith('26378')) {
                return { valid: true, formatted, error: null };
            } else {
                return { valid: false, formatted: null, error: 'This is not an EcoCash number. EcoCash uses 077 and 078 prefixes.' };
            }
        } else if (paymentMethod === 'onemoney') {
            if (formatted.startsWith('26371')) {
                return { valid: true, formatted, error: null };
            } else {
                return { valid: false, formatted: null, error: 'This is not a OneMoney number. OneMoney uses 071 prefixes.' };
            }
        }
        
        return { valid: false, formatted: null, error: 'Invalid payment method' };
    }
    
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