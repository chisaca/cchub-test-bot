// services/airtime.js - ZIG/USD CURRENCY SELECTION FLOW
// UPDATED: Using modular HotRecharge structure with separate service files
// Now imports from hotrecharge.airtime.usd for USD purchases

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge'); // Main orchestrator
const { checkCurrencyAllowed } = require('./currencyGate');
const { 
    FLOW_STATES, 
    PAYMENT_CONFIG, 
    AIRTIME_CURRENCY_OPTIONS,
    AIRTIME_PRESETS,
    RESPONSE_MESSAGES, 
    PAYMENT_METHODS 
} = require('../config/constants');

class AirtimeService {
    
    /**
     * Start the airtime flow
     */
    async startFlow(userId) {
        console.log(`🎯 Starting airtime flow for ${userId}`);
        
        createSession(userId, 'airtime');
        await this.sendCurrencyPrompt(userId);
        updateSessionStep(userId, 'select_currency', FLOW_STATES.AIRTIME.SELECT_CURRENCY);
    }
    
    /**
     * Step 1: Currency Selection
     */
    async sendCurrencyPrompt(userId) {
        await messaging.sendMessage(userId, `💵 *Currency*

1 *ZiG*
2 *USD*

----------------

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
            
            await messaging.sendMessage(userId, `❓ 1 or 2?`);
            return;
        }
        
        const currencyOption = AIRTIME_CURRENCY_OPTIONS[selection];
        
        // ? BLOCK ZiG PAYMENTS (if still needed)
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
     * Step 2: Amount Entry (with presets)
     */
   /**
 * Step 2: Amount Entry (with presets)
 */
    async sendAmountPrompt(userId, currencyOption) {
        const { id, symbol, min, max } = currencyOption;
        
        // Build preset options dynamically from constants
        let presetsMessage = 'Quick amounts:\n';
        
        // Get the appropriate preset object from constants
        const presets = id === 'usd' ? AIRTIME_PRESETS.USD : AIRTIME_PRESETS.ZIG;
        
        // Loop through the presets and build the message
        Object.entries(presets).forEach(([key, value]) => {
            if (value === 'other') {
                presetsMessage += `${key}️⃣ Other amount\n`;
            } else {
                // Format based on currency
                const formattedAmount = id === 'usd' 
                    ? `$${value.toFixed(2)}`
                    : `${value.toFixed(2)} ZiG`;
                presetsMessage += `${key}️⃣ ${formattedAmount}\n`;
            }
        });
        
        presetsMessage += '\n----------------\n\n';
        
        const message = `💰 *Enter airtime amount*

    Amount must be ${symbol}${min}-${symbol}${max}

    ${presetsMessage}Reply with number or amount (e.g., 5 or 10.50)`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        const input = message.trim().toLowerCase();
        const { currency, currencyName, currencySymbol, minAmount, maxAmount } = session.data;
        
        let amount;
        
        // Check if user selected a preset
        if (currency === 'usd' && AIRTIME_PRESETS.USD[input]) {
            const presetValue = AIRTIME_PRESETS.USD[input];
            if (presetValue === 'other') {
                // User wants to enter custom amount - prompt again without presets
                await messaging.sendMessage(userId, `💰 Enter amount in ${currencySymbol} (${minAmount}-${maxAmount})`);
                return;
            }
            amount = presetValue;
        } else if (currency === 'zig' && AIRTIME_PRESETS.ZIG[input]) {
            const presetValue = AIRTIME_PRESETS.ZIG[input];
            if (presetValue === 'other') {
                await messaging.sendMessage(userId, `💰 Enter amount in ${currencySymbol} (${minAmount}-${maxAmount})`);
                return;
            }
            amount = presetValue;
        } else {
            // Parse custom amount
            const amountText = input.replace(/,/g, '');
            amount = currency === 'usd' ? parseFloat(amountText) : parseFloat(amountText, 10);
        }
        
        // Validate amount using the appropriate service
        if (currency === 'usd') {
            // Use USD-specific validation
            const validation = hotrecharge.airtime.usd.validateAmount(amount);
            if (!validation.valid) {
                const isMaxRetries = incrementRetries(userId);
                
                if (isMaxRetries) {
                    await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                    deleteSession(userId);
                    return;
                }
                
                await messaging.sendMessage(userId, `❓ ${validation.error}`);
                return;
            }
        } else {
            // Use ZiG-specific validation from modular service
            const validation = hotrecharge.airtime.zig.validateAmount(amount);
            if (!validation.valid) {
                const isMaxRetries = incrementRetries(userId);
                
                if (isMaxRetries) {
                    await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                    deleteSession(userId);
                    return;
                }
                
                await messaging.sendMessage(userId, `❓ ${validation.error}`);
                return;
            }
        }
        
        // Calculate fee
        const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = currency === 'usd' 
            ? parseFloat((amount * fee).toFixed(2))
            : Math.round(amount * fee);
        const totalAmount = amount + serviceFee;
        
        updateSessionStep(userId, 'enter_recipient', FLOW_STATES.AIRTIME.ENTER_PHONE, {
            ...session.data,
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Ask for recipient
        await this.sendRecipientPrompt(userId);
    }
    
    /**
     * Step 3: Recipient Phone Number Entry
     */
    async sendRecipientPrompt(userId) {
        await messaging.sendMessage(userId, `📞 *Recipient's number*

Enter phone number you want to top up

----------------

Example: 0771234567`);
    }
    
        async handleRecipientEntry(userId, message, session) {
            const phoneNumber = message.trim();
            const { currency } = session.data;
            
            // Use appropriate validation based on currency
            let validationResult;
            
            if (currency === 'usd') {
                // USD validation using modular service
                validationResult = hotrecharge.airtime.usd.validateRecipient(phoneNumber);
                if (!validationResult.valid) {
                    const isMaxRetries = incrementRetries(userId);
                    
                    if (isMaxRetries) {
                        await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                        deleteSession(userId);
                        return;
                    }
                    
                    await messaging.sendMessage(userId, `❓ ${validationResult.error}`);
                    return;
                }
                
                // All validation passed - proceed to payment method
                updateSessionStep(userId, 'select_payment_method', 'airtime_select_payment_method', {
                    ...session.data,
                    recipient: validationResult.internationalNumber,
                    network: validationResult.network
                });
                
                const displayPhone = validationResult.localNumber;
                await messaging.sendMessage(userId, `✅ *${validationResult.network}* detected for ${displayPhone}`);
                await this.sendPaymentMethodPrompt(userId);
                return;
                
            } else {
                // ZiG validation using modular service
                validationResult = hotrecharge.airtime.zig.validateRecipient(phoneNumber);
                if (!validationResult.valid) {
                    const isMaxRetries = incrementRetries(userId);
                    
                    if (isMaxRetries) {
                        await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                        deleteSession(userId);
                        return;
                    }
                    
                    await messaging.sendMessage(userId, `❓ ${validationResult.error}`);
                    return;
                }
                
                // All validation passed - proceed to payment method
                updateSessionStep(userId, 'select_payment_method', 'airtime_select_payment_method', {
                    ...session.data,
                    recipient: validationResult.internationalNumber,  // Use internationalNumber for API
                    network: validationResult.network                  // Network is already detected
                });
                
                const displayPhone = validationResult.localNumber;     // Use localNumber for display
                await messaging.sendMessage(userId, `✅ *${validationResult.network}* detected for ${displayPhone}`);
                await this.sendPaymentMethodPrompt(userId);
                return;
            }
        }
    
    /**
     * Step 4: Payment Method Selection
     */
    async sendPaymentMethodPrompt(userId) {
        await messaging.sendMessage(userId, `💳 *Select payment method*

1 *EcoCash*
2 *InnBucks*

----------------

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
            
            await messaging.sendMessage(userId, `❓ 1 or 2?`);
            return;
        }
        
        const paymentMethod = PAYMENT_METHODS[selection];
        
        // ? INNBUCKS - Skip phone entry, go straight to confirmation
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
        
        // ? ECOCASH - Normal phone entry flow
        updateSessionStep(userId, 'enter_payment_phone', 'airtime_enter_payment_phone', {
            ...session.data,
            paymentMethod: paymentMethod
        });
        
        await this.sendPaymentPhonePrompt(userId, paymentMethod);
    }
    
    /**
     * Step 5: Payment Phone Number Entry - ECOCASH ONLY
     */
    async sendPaymentPhonePrompt(userId) {
        await messaging.sendMessage(userId, `📱 *EcoCash number*

Enter the number registered with EcoCash

----------------

Example: 0771234567`);
    }
    
    async handlePaymentPhoneEntry(userId, message, session) {
        const phoneNumber = message.trim();
        
        const validationResult = this.validatePaymentPhone(phoneNumber);
        
        if (!validationResult.valid) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, `❓ That number doesn't work. Try 077...`);
            return;
        }
        
        const formattedPaymentPhone = validationResult.formatted;
        const displayPaymentPhone = validationResult.display;
        
        const updatedSession = updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            ...session.data,
            paymentPhone: formattedPaymentPhone,
            paymentPhoneDisplay: displayPaymentPhone,
            paymentProvider: 'ecocash'
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
            
            // Handle payment display differently for InnBucks vs EcoCash
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
            
            const message = `✅ *Confirm your purchase*

📱 Airtime: ${amountDisplay}
📞 Recipient: ${maskedRecipient}
📶 Network: ${network}
💳 Payment: ${displayPaymentMethod} (${displayPaymentInfo})
💰 Total: ${totalDisplay} (${feePercentage}% fee)

----------------

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
            
            // Health check
            try {
                console.log('🩺 [HEALTH] Checking HotRecharge API status...');
                
                let isOnline = false;
                let healthAttempts = 0;
                const maxHealthAttempts = 3;
                const healthRetryDelay = 3000;
                
                while (!isOnline && healthAttempts < maxHealthAttempts) {
                    healthAttempts++;
                    
                    if (healthAttempts > 1) {
                        await new Promise(resolve => setTimeout(resolve, healthRetryDelay));
                    }
                    
                    isOnline = await hotrecharge.isOnline();
                    
                    if (isOnline) {
                        console.log(`✅ [HEALTH] HotRecharge is ONLINE (attempt ${healthAttempts})`);
                        break;
                    }
                }
                
                if (!isOnline) {
                    await messaging.sendMessage(userId,
                        `🔧 *Service Temporarily Unavailable*\n\n` +
                        `Our airtime provider is currently undergoing maintenance.\n\n` +
                        `⏱️ Please try again in 5 minutes.`
                    );
                    deleteSession(userId);
                    return;
                }
                
            } catch (error) {
                console.error('❌ [HEALTH] Health check failed:', error.message);
                await messaging.sendMessage(userId,
                    `🔧 *Service Unavailable*\n\n` +
                    `⏱️ Please try again in a few minutes.`
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
            
            await messaging.sendMessage(userId, `❓ YES or NO?`);
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
        
        await messaging.sendMessage(userId, `🔄 *Connecting to PayNow...*`);
        
        try {
            // In processPayment method, update the paymentData object:
            const paymentData = {
                amount: totalAmount.toFixed(2),
                reference: reference,
                method: paymentMethod,
                service: `Airtime (${currencyName}) - ${network}`,
                currency: currencyName,  // Add this line - passes "USD" or "ZiG"
                customer: {
                    email: `${userId.split('@')[0]}@cchub.co.zw`
                }
            };
            
            if (paymentMethod === 'ecocash') {
                paymentData.phone = paymentPhone;
                paymentData.customer.phone = paymentPhone;
            }
            
            const paymentResult = await paynowService.initiateQuickPay(paymentData);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            const totalDisplay = currencyName === 'USD'
                ? `$${totalAmount?.toFixed(2)}`
                : `${totalAmount?.toLocaleString()} ${currencySymbol}`;
            
            let statusMessage;
            if (paymentMethod === 'ecocash') {
                const displayPhone = paymentPhone.toString().replace('263', '0');
                statusMessage = `📱 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Phone: ${displayPhone}
Provider: EcoCash

${paymentResult.instructions}

⏳ Waiting for payment...`;
            } else {
                statusMessage = `📱 *Payment Request Created*

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
        
        console.log(`👀 Monitoring payment for ${userId}, ref: ${reference}`);
        
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
                    console.log('✅ PAYMENT CONFIRMED - Calling HotRecharge NOW!');
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
                `⚡ *Purchasing airtime via HotRecharge...*\n\n` +
                `• Amount: ${currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toLocaleString()} ${currencySymbol}`}\n` +
                `• Network: ${network}\n` +
                `• Recipient: ${displayRecipient}\n\n` +
                `⏳ *Processing...*`
            );
            
            let hotrechargeResult;
            
            // Route to the appropriate service based on currency
            if (currency === 'usd') {
                console.log(`📤 [USD AIRTIME] Using modular USD service`);
                hotrechargeResult = await hotrecharge.airtime.usd.purchase({
                    recipient: recipient,
                    amount: amount,
                    userId: userId.split('@')[0].slice(-4)
                });
            } else {
                console.log(`📤 [ZiG AIRTIME] Using modular ZiG service`);
                // Use the new modular ZiG service
                hotrechargeResult = await hotrecharge.airtime.zig.purchase({
                    recipient: recipient,
                    amount: amount,
                    userId: userId.split('@')[0].slice(-4)
                });
            }
            
            if (hotrechargeResult.success) {
                const amountDisplay = currencyName === 'USD'
                    ? `$${amount.toFixed(2)}`
                    : `${amount.toFixed(2)} ZiG`; // Use consistent decimal format for ZiG
                
                const receiptMessage = `✅ Airtime Sent!
    📞 ${displayRecipient.slice(0,5)}****${displayRecipient.slice(-3)}
    💰 ${amountDisplay}
    🔖 ${reference}`;
                
                await messaging.sendMessage(userId, receiptMessage);
                console.log(`✅ Airtime purchase successful for ${userId}, ref: ${reference}`);
                
            } else {
                console.error(`❌ HotRecharge failed:`, hotrechargeResult.error);
                
                await messaging.sendMessage(userId,
                    `⚠️ *Payment Successful but Airtime Failed*\n\n` +
                    `Your payment of ${currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`} was received.\n\n` +
                    `🔧 Our team has been notified and will resolve this within 15 minutes.\n\n` +
                    `Reference: ${reference}`
                );
                
                console.error(`🔧 MANUAL RECONCILIATION NEEDED:`, {
                    userId,
                    reference,
                    network,
                    recipient: displayRecipient,
                    amount,
                    currency,
                    error: hotrechargeResult.error
                });
            }
            
        } catch (error) {
            console.error(`❌ Fulfillment error:`, error.message);
            
            await messaging.sendMessage(userId,
                `⚠️ *Payment Successful but Airtime Failed*\n\n` +
                `🔧 Our team has been notified and will resolve this within 15 minutes.\n\n` +
                `Reference: ${reference}`
            );
            
            console.error(`🔧 MANUAL RECONCILIATION NEEDED:`, {
                userId,
                reference,
                network,
                recipient: displayRecipient,
                amount,
                currency,
                error: error.message
            });
            
        } finally {
            deleteSession(userId);
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
    
    validatePaymentPhone(phone) {
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
        
        // EcoCash uses 077 or 078 prefixes
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