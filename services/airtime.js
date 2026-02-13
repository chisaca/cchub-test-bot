// services/airtime.js - ZIG/USD CURRENCY SELECTION FLOW
// FIXED: Removed duplicate function, removed network selection step

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
        await messaging.sendMessage(userId, `🔄 *Currency*

1 *ZiG*
2 *USD*

────────────────

Reply 1 or 2`);
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
            
            await messaging.sendMessage(userId, `❌ 1 or 2?`);
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
        const message = `💰 *Enter airtime amount*

Enter amount in ${symbol} (${min}-${max})

────────────────

Reply with amount`;
        
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
                `❌ Amount must be ${minAmount}-${maxAmount} ${currencySymbol}.`
            );
            return;
        }
        
        // Calculate fee and total
        const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = currency === 'usd' 
            ? parseFloat((amount * fee).toFixed(2))
            : Math.round(amount * fee);
        const totalAmount = amount + serviceFee;
        
        // Store amount and move to recipient entry (SKIP network selection)
        updateSessionStep(userId, 'enter_recipient', FLOW_STATES.AIRTIME.ENTER_PHONE, {
            ...session.data,
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Ask for recipient phone number
        await this.sendRecipientPrompt(userId);
    }
    
    /**
     * Step 3: Recipient Phone Number Entry (NOW detects network automatically)
     */
    async sendRecipientPrompt(userId) {
        await messaging.sendMessage(userId, `📱 *Recipient's number*

Enter phone number you want to top up

────────────────

Example: 0771234567`);
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
            
            await messaging.sendMessage(userId, `❌ That number doesn't look right.

Try: 0771234567`);
            return;
        }
        
        // Format recipient phone number
        const formattedRecipient = validationResult.formatted;
        
        // DETECT NETWORK FROM PHONE NUMBER
        const detectedNetwork = this.detectNetworkFromPhone(formattedRecipient);
        
        if (!detectedNetwork) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, `❌ Could not detect network.

Econet: 077/078
NetOne: 071
Telecel: 073`);
            return;
        }
        
        // Store recipient AND detected network, then move to payment method selection
        updateSessionStep(userId, 'select_payment_method', 'airtime_select_payment_method', {
            ...session.data,
            recipient: formattedRecipient,
            network: detectedNetwork  // ✅ Auto-detected!
        });
        
        // Confirm network detection to user
        await messaging.sendMessage(userId, `📱 *${detectedNetwork}* detected for ${validationResult.display || phoneNumber}`);
        
        // Ask for payment method
        await this.sendPaymentMethodPrompt(userId);
    }
    
    /**
     * Step 4: Payment Method Selection
     */
    async sendPaymentMethodPrompt(userId) {
        await messaging.sendMessage(userId, `💳 *Select payment method*

1 *EcoCash*
2 *OneMoney*

────────────────

Reply 1 or 2`);
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
            
            await messaging.sendMessage(userId, `❌ 1 or 2?`);
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
     * Step 5: Payment Phone Number Entry
     */
    async sendPaymentPhonePrompt(userId, paymentMethod) {
        const method = paymentMethod === 'ecocash' ? 'EcoCash' : 'OneMoney';
        const prefix = paymentMethod === 'ecocash' ? '077' : '071';
        
        await messaging.sendMessage(userId, `📱 *Payment number*

Enter the number registered with ${method}

────────────────

Example: ${prefix}1234567`);
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
            
            const method = paymentMethod === 'ecocash' ? '077...' : '071...';
            await messaging.sendMessage(userId, `❌ That number doesn't work. Try ${method}`);
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
     * Step 6: Transaction Details & Confirmation
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
            
            const totalDisplay = currencyName === 'USD'
                ? `$${totalAmount?.toFixed(2)}`
                : `${totalAmount?.toLocaleString()} ${currencySymbol}`;
            
            // Mask recipient and payment phone (show last 3 digits only)
            const maskedRecipient = displayRecipient.length > 4 
                ? displayRecipient.slice(0, 5) + '****' + displayRecipient.slice(-3)
                : displayRecipient;
                
            const maskedPaymentPhone = displayPaymentPhone.length > 4
                ? displayPaymentPhone.slice(0, 5) + '****' + displayPaymentPhone.slice(-3)
                : displayPaymentPhone;
            
            const message = `📋 *Confirm your purchase*

💰 Airtime: ${amountDisplay}
📱 Recipient: ${maskedRecipient}
📶 Network: ${network}
💳 Payment: ${displayPaymentMethod} (${maskedPaymentPhone})
💵 Total: ${totalDisplay} (${feePercentage}% fee)

────────────────

Type *YES* to confirm or *NO* to cancel`;
            
            await messaging.sendMessage(userId, message);
            
        } catch (error) {
            console.error(`❌ Error in showTransactionDetails:`, error.message);
            await messaging.sendMessage(userId, `❌ Error. Try again.`);
        }
    }
    
    async handleConfirmation(userId, message, session) {
        const response = message.trim().toLowerCase();
        
        if (response === 'yes' || response === 'y') {
            console.log(`✅ User confirmed payment`);
            
            // 🚨 1. CHECK HOTRECHARGE HEALTH FIRST - BEFORE PAYNOW
            try {
                console.log('🔌 [HEALTH] Checking HotRecharge API status...');
                
                let isOnline = false;
                let healthAttempts = 0;
                const maxHealthAttempts = 3;
                const healthRetryDelay = 3000;
                
                while (!isOnline && healthAttempts < maxHealthAttempts) {
                    healthAttempts++;
                    
                    if (healthAttempts > 1) {
                        console.log(`🔌 [HEALTH] Retry attempt ${healthAttempts}/${maxHealthAttempts}...`);
                        await new Promise(resolve => setTimeout(resolve, healthRetryDelay));
                    }
                    
                    isOnline = await hotrecharge.isOnline();
                    
                    if (isOnline) {
                        console.log(`✅ [HEALTH] HotRecharge is ONLINE (attempt ${healthAttempts})`);
                        break;
                    }
                }
                
                if (!isOnline) {
                    console.error('❌ [HEALTH] HotRecharge is OFFLINE - blocking payment');
                    await messaging.sendMessage(userId,
                        `⚠️ *Service Temporarily Unavailable*\n\n` +
                        `Our airtime provider is currently undergoing maintenance.\n\n` +
                        `⏳ We tried connecting 3 times but got no response.\n\n` +
                        `🔄 Please try again in 5 minutes.\n\n` +
                        `We apologise for the inconvenience.`
                    );
                    deleteSession(userId);
                    return;
                }
                
            } catch (error) {
                console.error('❌ [HEALTH] Health check failed:', error.message);
                await messaging.sendMessage(userId,
                    `⚠️ *Service Unavailable*\n\n` +
                    `Unable to verify airtime provider status.\n\n` +
                    `⏳ Please try again in a few minutes.\n\n` +
                    `We apologise for the inconvenience.`
                );
                deleteSession(userId);
                return;
            }
            
            // ✅ 2. ONLY PROCEED TO PAYNOW IF HOTRECHARGE IS ONLINE
            await this.processPayment(userId, session);
            
        } else if (response === 'no' || response === 'n') {
            await messaging.sendMessage(userId, `❌ Cancelled. Type "hi" to start over.`);
            deleteSession(userId);
        } else {
            await messaging.sendMessage(userId, `❌ YES or NO?`);
        }
    }
    
    /**
     * Step 7: Process payment with PayNow
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
        
        // Save reference to session immediately
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
                const updatedSession = getActiveSession(userId);
                this.monitorPaymentStatus(userId, paymentResult.pollUrl, updatedSession || session);
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
                
                console.log('🔍 Payment status:', status);
                console.log('✅ status.paid?:', status.paid);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    console.log('💰 PAYMENT CONFIRMED - Calling HotRecharge NOW!');
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
     * Step 8: Fulfill airtime via HotRecharge
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
        console.log('📦 Session data:', session.data);
        
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
            
            const hotrechargeResult = await hotrecharge.purchaseAirtime({
                recipient: recipient,
                amount: amount,
                network: network,
                userId: userId.split('@')[0].slice(-4),
                productId: productId,
                currency: currency
            });
            
            console.log(`🔌 [HOTRECHARGE] Result:`, hotrechargeResult);
            
            if (hotrechargeResult.success) {
                const amountDisplay = currencyName === 'USD'
                    ? `$${amount.toFixed(2)}`
                    : `${amount.toLocaleString()} ${currencySymbol}`;
                
                const receiptMessage = `✅ Airtime Sent!
📱 ${displayRecipient.slice(0,5)}****${displayRecipient.slice(-3)}
💰 ${amountDisplay}
🆔 ${reference}`;
                
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
    
    validatePaymentPhoneForMethod(phone, paymentMethod) {
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
                error: 'Invalid phone number format. Use 0771234567 or 263771234567'
            };
        }
        
        if (paymentMethod === 'ecocash') {
            if (formatted.startsWith('26377') || formatted.startsWith('26378')) {
                return { valid: true, formatted, display, error: null };
            } else {
                return { valid: false, formatted: null, display: null, error: 'This is not an EcoCash number. EcoCash uses 077 and 078 prefixes.' };
            }
        } else if (paymentMethod === 'onemoney') {
            if (formatted.startsWith('26371')) {
                return { valid: true, formatted, display, error: null };
            } else {
                return { valid: false, formatted: null, display: null, error: 'This is not a OneMoney number. OneMoney uses 071 prefixes.' };
            }
        }
        
        return { valid: false, formatted: null, display: null, error: 'Invalid payment method' };
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