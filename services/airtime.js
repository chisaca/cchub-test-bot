// services/airtime.js - ZIG/USD CURRENCY SELECTION FLOW
// FIXED: InnBucks skips phone entry, EcoCash only asks for phone

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { checkCurrencyAllowed } = require('./currencyGate');
const { 
    FLOW_STATES, 
    AIRTIME_NETWORKS, 
    PAYMENT_CONFIG, 
    AIRTIME_CURRENCY_OPTIONS,
    RESPONSE_MESSAGES, 
    ERROR_MESSAGES,
    PAYMENT_METHODS 
} = require('../config/constants');
const { NETONE_USD_AMOUNTS } = require('../config/constants');

class AirtimeService {
    
    /**
     * Start the airtime flow
     */
    async startFlow(userId) {
        console.log(`📱 Starting airtime flow for ${userId}`);
        
        createSession(userId, 'airtime');
        await this.sendCurrencyPrompt(userId);
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
        // ✅ BLOCK ZiG PAYMENTS
        const allowed = await checkCurrencyAllowed(userId, currencyOption.name, session);
        if (!allowed) return;
        
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT, {
            currency: currencyOption.id,
            currencyName: currencyOption.name,
            currencySymbol: currencyOption.symbol,
            minAmount: currencyOption.min,
            maxAmount: currencyOption.max,
            hotrecharge_product_map: currencyOption.hotrecharge_product_map
        });
        
        await this.sendAmountPrompt(userId, currencyOption);
    }
    
    /**
     * Step 2: Amount Entry
     */
    async sendAmountPrompt(userId, currencyOption) {
        const { symbol, min, max } = currencyOption;
        const message = `💰 *Enter airtime amount*

Enter amount in ${symbol} (${min}-${max})

────────────────

Reply with amount`;
        
        await messaging.sendMessage(userId, message);
    }
    
        async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const { currency, currencyName, currencySymbol, minAmount, maxAmount } = session.data;
        
        let amount;
        if (currency === 'usd') {
            amount = parseFloat(amountText);
        } else {
            amount = parseInt(amountText, 10);
        }
        
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
        
        // Calculate fee first (we need amount for this)
        const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = currency === 'usd' 
            ? parseFloat((amount * fee).toFixed(2))
            : Math.round(amount * fee);
        const totalAmount = amount + serviceFee;
        
        // Store amount and fee temporarily
        updateSessionStep(userId, 'temp_amount', 'temp_amount', {
            ...session.data,
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Now ask for recipient (we need network detection first)
        await this.sendRecipientPrompt(userId);
    }
    
    /**
     * Step 3: Recipient Phone Number Entry
     */
    async sendRecipientPrompt(userId) {
        await messaging.sendMessage(userId, `📱 *Recipient's number*

Enter phone number you want to top up

────────────────

Example: 0771234567`);
    }
    
        async handleRecipientEntry(userId, message, session) {
        const phoneNumber = message.trim();
        
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
        
        const formattedRecipient = validationResult.formatted;
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
        
        // ✅ NOW we have network detected - validate NetOne USD amounts
        const { currency } = session.data;
        
        if (detectedNetwork === 'NetOne' && currency === 'usd') {
            const { amount } = session.data; // Get amount from session
            
            // Check if amount is one of the fixed denominations
            if (!NETONE_USD_AMOUNTS.includes(amount)) {
                const isMaxRetries = incrementRetries(userId);
                
                if (isMaxRetries) {
                    await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                    deleteSession(userId);
                    return;
                }
                
                // Format the available amounts for display
                const amountList = NETONE_USD_AMOUNTS.map(a => `• $${a.toFixed(2)}`).join('\n');
                
                await messaging.sendMessage(userId, 
                    `⚠️ *NetOne USD requires specific amounts*

    Available amounts:
    ${amountList}

    ────────────────

    Please enter one of the above amounts.`
                );
                
                // Reset to amount entry
                updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT, session.data);
                return;
            }
        }
        
        // ✅ All validation passed - proceed to payment method
        updateSessionStep(userId, 'select_payment_method', 'airtime_select_payment_method', {
            ...session.data,
            recipient: formattedRecipient,
            network: detectedNetwork
        });
        
        await messaging.sendMessage(userId, `📱 *${detectedNetwork}* detected for ${validationResult.display || phoneNumber}`);
        await this.sendPaymentMethodPrompt(userId);
    }
    
    /**
     * Step 4: Payment Method Selection
     */
    async sendPaymentMethodPrompt(userId) {
        await messaging.sendMessage(userId, `💳 *Select payment method*

1 *EcoCash*
2 *InnBucks*

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
        
        // ✅ INNBUCKS - Skip phone entry, go straight to confirmation
        if (paymentMethod === 'innbucks') {
            const updatedSession = updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
                ...session.data,
                paymentMethod: 'innbucks',
                paymentProvider: 'innbucks',
                paymentPhone: 'innbucks',
                paymentPhoneDisplay: 'InnBucks Wallet'
            });
            
            await this.showTransactionDetails(userId, updatedSession || session);
            return;
        }
        
        // ✅ ECOCASH - Normal phone entry flow
        updateSessionStep(userId, 'enter_payment_phone', 'airtime_enter_payment_phone', {
            ...session.data,
            paymentMethod: paymentMethod
        });
        
        await this.sendPaymentPhonePrompt(userId, paymentMethod);
    }
    
    /**
     * Step 5: Payment Phone Number Entry - ECOCASH ONLY
     */
    async sendPaymentPhonePrompt(userId, paymentMethod) {
        // This function is only called for EcoCash
        await messaging.sendMessage(userId, `📱 *EcoCash number*

Enter the number registered with EcoCash

────────────────

Example: 0771234567`);
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
            
            await messaging.sendMessage(userId, `❌ That number doesn't work. Try 077...`);
            return;
        }
        
        const formattedPaymentPhone = validationResult.formatted;
        const displayPaymentPhone = validationResult.display;
        
        const updatedSession = updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            ...session.data,
            paymentPhone: formattedPaymentPhone,
            paymentPhoneDisplay: displayPaymentPhone,
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
                paymentPhoneDisplay,
                currencyName,
                currencySymbol
            } = session.data;
            
            const displayRecipient = recipient?.toString().replace('263', '0') || 'N/A';
            
            const feePercentage = (PAYMENT_CONFIG.SERVICE_FEES.AIRTIME * 100).toFixed(0);
            
            let displayPaymentMethod = paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
            
            // ✅ Handle payment display differently for InnBucks vs EcoCash
            let displayPaymentInfo;
            if (paymentMethod === 'ecocash') {
                const displayPhone = paymentPhoneDisplay || paymentPhone?.toString().replace('263', '0') || 'N/A';
                displayPaymentInfo = displayPhone.length > 4 
                    ? displayPhone.slice(0, 5) + '****' + displayPhone.slice(-3)
                    : displayPhone;
            } else {
                displayPaymentInfo = 'InnBucks Wallet';
            }
            
            const amountDisplay = currencyName === 'USD' 
                ? `$${amount?.toFixed(2)}` 
                : `${amount?.toLocaleString()} ${currencySymbol}`;
            
            const totalDisplay = currencyName === 'USD'
                ? `$${totalAmount?.toFixed(2)}`
                : `${totalAmount?.toLocaleString()} ${currencySymbol}`;
            
            const maskedRecipient = displayRecipient.length > 4 
                ? displayRecipient.slice(0, 5) + '****' + displayRecipient.slice(-3)
                : displayRecipient;
            
            const message = `📋 *Confirm your purchase*

💰 Airtime: ${amountDisplay}
📱 Recipient: ${maskedRecipient}
📶 Network: ${network}
💳 Payment: ${displayPaymentMethod} (${displayPaymentInfo})
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
            
            await this.processPayment(userId, session);
            
        } else if (response === 'no' || response === 'n') {
            await messaging.sendMessage(userId, `❌ Cancelled. Type "hi" to start over.`);
            deleteSession(userId);
        } else {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
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
        const reference = `AIR${Date.now().toString().slice(-8)}`;
        
        updateSessionStep(userId, 'processing_payment', 'processing_payment', {
            ...session.data,
            reference: reference,
            paymentInitiated: true
        });
        
        await messaging.sendMessage(userId, `⏳ *Connecting to PayNow...*`);
        
        try {
            // Prepare payment data for PayNow
            const paymentData = {
                amount: totalAmount.toFixed(2),
                reference: reference,
                method: paymentMethod,
                service: `Airtime (${currencyName}) - ${network}`,
                customer: {
                    email: `${userId.split('@')[0]}@cchub.co.zw`
                }
            };
            
            // ✅ Only add phone for EcoCash
            if (paymentMethod === 'ecocash') {
                paymentData.phone = paymentPhone;
                paymentData.customer.phone = paymentPhone;
            }
            
            const paymentResult = await paynowService.initiateQuickPay(paymentData);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            let displayProvider = paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
            
            const totalDisplay = currencyName === 'USD'
                ? `$${totalAmount?.toFixed(2)}`
                : `${totalAmount?.toLocaleString()} ${currencySymbol}`;
            
            // ✅ Customize message based on payment method
            let statusMessage;
            if (paymentMethod === 'ecocash') {
                const displayPhone = paymentPhone.toString().replace('263', '0');
                statusMessage = `💳 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Phone: ${displayPhone}
Provider: EcoCash

${paymentResult.instructions}

⏳ Waiting for payment...`;
            } else {
                statusMessage = `💳 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Provider: InnBucks

${paymentResult.instructions}

⏳ Waiting for payment...`;
            }
            
            await messaging.sendMessage(userId, statusMessage);
            
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
            
            const productId = hotrecharge_product_map[network];
            
            // Prepare HotRecharge parameters
            const hotrechargeParams = {
                recipient: recipient,
                amount: amount,
                network: network,
                userId: userId.split('@')[0].slice(-4),
                productId: productId,
                currency: currency
            };
            
            // ✅ Add productCode for NetOne USD
            if (network === 'NetOne' && currency === 'usd') {
                // Generate product code dynamically (0.50 → "NET_AIRTIME_050")
                const amountInCents = Math.round(amount * 100);
                let amountStr;
                if (amountInCents < 100) {
                    amountStr = amountInCents.toString().padStart(3, '0');
                } else {
                    amountStr = amountInCents.toString();
                }
                hotrechargeParams.productCode = `NET_AIRTIME_${amountStr}`;
                console.log(`[HotRecharge] NetOne USD productCode: ${hotrechargeParams.productCode}`);
            }
            
            const hotrechargeResult = await hotrecharge.purchaseAirtime(hotrechargeParams);
            
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
                // ... error handling
            }
        } catch (error) {
            // ... error handling
        }
    }
    
    /**
     * Main request handler
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
    
    // ==================== VALIDATION HELPERS ====================
    
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
                error: 'Invalid phone number. Use 0771234567 or 263771234567'
            };
        }
        
        // ✅ EcoCash ONLY - InnBucks never calls this function
        if (formatted.startsWith('26377') || formatted.startsWith('26378')) {
            return { valid: true, formatted, display, error: null };
        }
        
        return { 
            valid: false, 
            formatted: null, 
            display: null, 
            error: '❌ EcoCash uses 077 or 078 prefixes.' 
        };
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