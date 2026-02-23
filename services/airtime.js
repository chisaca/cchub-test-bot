// services/airtime.js - ZIG/USD CURRENCY SELECTION FLOW WITH ALL PAYMENT METHODS
// UPDATED: Supports all 8 payment methods (EcoCash, Zimswitch, PayGo, OneMoney for ZiG)
// and (EcoCash, Zimswitch, PayGo, InnBucks for USD)

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge'); // Main orchestrator
const currencyGate = require('./currencyGate');
const { 
    FLOW_STATES, 
    PAYMENT_CONFIG, 
    AIRTIME_CURRENCY_OPTIONS,
    RESPONSE_MESSAGES, 
    PAYMENT_METHODS,
    PAYMENT_PROVIDERS,
    PAYMENT_METHOD_NAMES,
    PAYMENT_METHOD_CONFIG,
    PAYMENT_PREFIXES, 
    UI_MESSAGES,
    NETWORK_PREFIXES,
    VALIDATION_CONFIG
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
        await messaging.sendMessage(userId, UI_MESSAGES.CURRENCY_PROMPT.AIRTIME);
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
        const gateCheck = currencyGate.checkCurrency('AIRTIME', currencyOption.id, session?.data?.network);
        if (!gateCheck.allowed) {
            await messaging.sendMessage(userId, gateCheck.message || 'Currency not allowed');
            deleteSession(userId);
            return;
        }
        
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
     * Step 2: Amount Entry (Direct entry only - no presets)
     */
    async sendAmountPrompt(userId, currencyOption) {
        const { id, symbol, min, max } = currencyOption;
        
        const message = `💰 *Enter airtime amount*

Amount must be ${symbol}${min}-${symbol}${max}

----------------

Reply with amount (e.g. 5 or 10.50). Use . not ,`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        const input = message.trim();
        const { currency, currencyName, currencySymbol, minAmount, maxAmount } = session.data;
        
        // Parse amount - handle both integer and decimal
        const amountText = input.replace(/,/g, '');
        const amount = parseFloat(amountText);
        
        // Check if amount is a valid number
        if (isNaN(amount) || amount <= 0) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, `❓ Please enter a valid amount (e.g., 10 or 5.50)`);
            return;
        }
        
        // Validate amount range
        if (amount < minAmount || amount > maxAmount) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❓ Amount must be between ${currencySymbol}${minAmount} and ${currencySymbol}${maxAmount}`
            );
            return;
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
        const serviceFee = parseFloat((amount * fee).toFixed(2));
        const totalAmount = parseFloat((amount + serviceFee).toFixed(2));
        
        console.log(`✅ Amount accepted: ${amount} ${currency}, fee: ${serviceFee}, total: ${totalAmount}`);
        
        // Update session with amount data
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
            updateSessionStep(userId, 'select_payment_method', FLOW_STATES.AIRTIME.SELECT_PAYMENT_METHOD, {
                ...session.data,
                recipient: validationResult.internationalNumber,
                network: validationResult.network
            });
            
            const displayPhone = validationResult.localNumber;
            await messaging.sendMessage(userId, `✅ *${validationResult.network}* detected for ${displayPhone}`);
            await this.sendPaymentMethodPrompt(userId, 'usd');
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
            
            // Check if network is supported for ZiG (only Econet)
            if (validationResult.network !== 'Econet') {
                const isMaxRetries = incrementRetries(userId);
                
                if (isMaxRetries) {
                    await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                    deleteSession(userId);
                    return;
                }
                
                await messaging.sendMessage(userId, 
                    `❌ *Network Not Supported for ZiG*

${validationResult.network} does not support ZiG airtime.

✅ Please use:
• Econet number for ZiG
• Or select USD for all networks

────────────────

Try again or type *hi* to restart`
                );
                return;
            }
            
            // All validation passed - proceed to payment method
            updateSessionStep(userId, 'select_payment_method', FLOW_STATES.AIRTIME.SELECT_PAYMENT_METHOD, {
                ...session.data,
                recipient: validationResult.internationalNumber,
                network: validationResult.network
            });
            
            const displayPhone = validationResult.localNumber;
            await messaging.sendMessage(userId, `✅ *${validationResult.network}* detected for ${displayPhone}`);
            await this.sendPaymentMethodPrompt(userId, 'zig');
            return;
        }
    }
    
    /**
     * Step 4: Payment Method Selection
     */
    async sendPaymentMethodPrompt(userId, currencyType) {
        const prompt = currencyType === 'zig' 
            ? UI_MESSAGES.PAYMENT_METHOD_PROMPT.ZIG
            : UI_MESSAGES.PAYMENT_METHOD_PROMPT.USD;
        
        await messaging.sendMessage(userId, prompt);
    }
    
    async handlePaymentMethodSelection(userId, message, session) {
        const selection = message.trim();
        const { currency } = session.data;
        
        // Define valid options based on currency
        const validOptions = currency === 'zig' 
            ? VALIDATION_CONFIG.PAYMENT_METHOD.ZIG_OPTIONS
            : VALIDATION_CONFIG.PAYMENT_METHOD.USD_OPTIONS;
        
        if (!validOptions.includes(selection)) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, `❓ Please select 1-4`);
            return;
        }
        
        // Map selection to payment method code
        let paymentMethodCode;
        if (currency === 'zig') {
            const methodMap = {
                '1': PAYMENT_PROVIDERS.ZIG.ECOCASH,
                '2': PAYMENT_PROVIDERS.ZIG.ZIMSWITCH,
                '3': PAYMENT_PROVIDERS.ZIG.PAYGO,
                '4': PAYMENT_PROVIDERS.ZIG.ONEMONEY
            };
            paymentMethodCode = methodMap[selection];
        } else {
            const methodMap = {
                '1': PAYMENT_PROVIDERS.USD.ECOCASH,
                '2': PAYMENT_PROVIDERS.USD.ZIMSWITCH,
                '3': PAYMENT_PROVIDERS.USD.PAYGO,
                '4': PAYMENT_PROVIDERS.USD.INNBUCKS
            };
            paymentMethodCode = methodMap[selection];
        }
        
        const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
        
        // Update session with payment method
        updateSessionStep(userId, 'payment_method_selected', FLOW_STATES.AIRTIME.SELECT_PAYMENT_METHOD, {
            ...session.data,
            paymentMethodCode: paymentMethodCode,
            paymentMethodName: methodConfig.name,
            paymentProvider: methodConfig.provider,
            requiresPaymentPhone: methodConfig.requiresPhone
        });
        
        // If payment method requires phone number, ask for it
        if (methodConfig.requiresPhone) {
            updateSessionStep(userId, 'enter_payment_phone', 'airtime_enter_payment_phone', session.data);
            await this.sendPaymentPhonePrompt(userId, methodConfig);
        } else {
            // Skip phone entry, go straight to confirmation
            updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, session.data);
            await this.showTransactionDetails(userId, session);
        }
    }
    
    /**
     * Step 5: Payment Phone Number Entry
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
            case 'paygo':
                prompt = UI_MESSAGES.PAYMENT_PHONE_PROMPT.PAYGO;
                break;
            default:
                prompt = UI_MESSAGES.PAYMENT_PHONE_PROMPT.DEFAULT;
        }
        
        await messaging.sendMessage(userId, prompt);
    }
    
    async handlePaymentPhoneEntry(userId, message, session) {
        const phoneNumber = message.trim();
        const { paymentProvider } = session.data;
        
        const validationResult = this.validatePaymentPhone(phoneNumber, paymentProvider);
        
        if (!validationResult.valid) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, validationResult.error);
            return;
        }
        
        const formattedPaymentPhone = validationResult.formatted;
        const displayPaymentPhone = validationResult.display;
        
        const updatedSession = updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            ...session.data,
            paymentPhone: formattedPaymentPhone,
            paymentPhoneDisplay: displayPaymentPhone
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
                paymentPhoneDisplay,
                paymentMethodName,
                paymentProvider,
                currencyName,
                currencySymbol
            } = session.data;
            
            const displayRecipient = recipient?.toString().replace('263', '0') || 'N/A';
            const feePercentage = (PAYMENT_CONFIG.SERVICE_FEES.AIRTIME * 100).toFixed(0);
            
            // Handle payment display differently based on provider
            let displayPaymentInfo;
            if (paymentProvider === 'ecocash' || paymentProvider === 'onemoney' || paymentProvider === 'paygo') {
                const displayPhone = paymentPhoneDisplay || paymentPhone?.toString().replace('263', '0') || 'N/A';
                displayPaymentInfo = displayPhone.length > 4 
                    ? displayPhone.slice(0, 5) + '****' + displayPhone.slice(-3)
                    : displayPhone;
            } else {
                displayPaymentInfo = paymentMethodName;
            }
            
            const amountDisplay = currencyName === 'USD' 
                ? `$${amount?.toFixed(2)}` 
                : `${amount?.toFixed(2)} ZiG`;
            
            const totalDisplay = currencyName === 'USD'
                ? `$${totalAmount?.toFixed(2)}`
                : `${totalAmount?.toFixed(2)} ZiG`;
            
            const maskedRecipient = displayRecipient.length > 4 
                ? displayRecipient.slice(0, 5) + '****' + displayRecipient.slice(-3)
                : displayRecipient;
            
            const message = `✅ *Confirm your purchase*

📱 Airtime: ${amountDisplay}
📞 Recipient: ${maskedRecipient}
📶 Network: ${network}
💳 Payment: ${paymentMethodName}
${paymentProvider !== 'zimswitch' && paymentProvider !== 'innbucks' ? `📱 Phone: ${displayPaymentInfo}` : ''}
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
async function processPayment(userId, session) {
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
        
        // Map payment provider to what PayNow expects
        let paynowMethod = paymentProvider;
        
        // PayNow expects specific method names
        if (paymentProvider === 'ecocash') {
            paynowMethod = 'ecocash';
        } else if (paymentProvider === 'onemoney') {
            paynowMethod = 'onemoney';
        } else if (paymentProvider === 'paygo') {
            paynowMethod = 'paygo';
        } else if (paymentProvider === 'zimswitch') {
            paynowMethod = 'zimswitch';
        } else if (paymentProvider === 'innbucks') {
            paynowMethod = 'innbucks';
        }
        
        console.log(`💳 Processing payment with method: ${paynowMethod}, provider: ${paymentProvider}`);
        
        const paymentData = {
            amount: totalAmount,
            reference: reference,
            phone: paymentPhone,
            method: paynowMethod,
            paymentMethodCode: paymentMethodCode,
            service: `Airtime (${currencyName}) - ${network}`,
            currency: currencyName
        };
        
        console.log(`📤 Payment data:`, paymentData);
        
        const paymentResult = await paynowService.initiateQuickPay(paymentData);
        
        if (!paymentResult.success) {
            throw new Error(paymentResult.error || 'Failed to initiate payment');
        }
        
        const totalDisplay = currencyName === 'USD'
            ? `$${totalAmount?.toFixed(2)}`
            : `${totalAmount?.toLocaleString()} ${currencySymbol}`;
        
        // Get payment instructions based on provider
        let statusMessage;
        
        if (paymentProvider === 'ecocash') {
            const displayPhone = paymentPhone.toString().replace('263', '0');
            statusMessage = `📱 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Phone: ${displayPhone}
Provider: EcoCash ${currencyName}

${paymentResult.instructions}

⏳ Waiting for payment...`;
            
        } else if (paymentProvider === 'onemoney') {
            const displayPhone = paymentPhone?.toString().replace('263', '0') || 'N/A';
            statusMessage = `📱 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Phone: ${displayPhone}
Provider: OneMoney ${currencyName}

${paymentResult.instructions}

⏳ Waiting for payment...`;
            
        } else if (paymentProvider === 'paygo') {
            const displayPhone = paymentPhone?.toString().replace('263', '0') || 'N/A';
            statusMessage = `📱 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Phone: ${displayPhone}
Provider: PayGo ${currencyName}

${paymentResult.instructions}

⏳ Waiting for payment...`;
            
        } else if (paymentProvider === 'zimswitch') {
            statusMessage = `💳 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Provider: Zimswitch ${currencyName}

${paymentResult.instructions}

⏳ Waiting for payment...`;
            
        } else if (paymentProvider === 'innbucks') {
            statusMessage = `🏦 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Provider: InnBucks USD

${paymentResult.instructions}

⏳ Waiting for payment...`;
            
        } else {
            // Fallback for any other method
            statusMessage = `📱 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Provider: ${paymentMethodName || paymentProvider}

${paymentResult.instructions}

⏳ Waiting for payment...`;
        }
        
        await messaging.sendMessage(userId, statusMessage);
        
        // Start polling for payment status if we have a pollUrl
        if (paymentResult.pollUrl) {
            const updatedSession = getActiveSession(userId);
            this.monitorPaymentStatus(userId, paymentResult.pollUrl, updatedSession || session);
        } else {
            // For methods without polling (like InnBucks, Zimswitch), just keep session alive
            console.log(`⏳ No pollUrl for ${paymentProvider}, user will complete payment manually`);
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
    async fulfillAirtimePurchase(userId, session, paymentStatus) {
        const { 
            network, 
            recipient, 
            amount, 
            reference,
            currency,
            currencyName,
            currencySymbol
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
                hotrechargeResult = await hotrecharge.airtime.zig.purchase({
                    recipient: recipient,
                    amount: amount,
                    userId: userId.split('@')[0].slice(-4)
                });
            }
            
            if (hotrechargeResult.success) {
                const amountDisplay = currencyName === 'USD'
                    ? `$${amount.toFixed(2)}`
                    : `${amount.toFixed(2)} ZiG`;
                
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
        
        // Default result - session continues
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
                console.error(`❌ Invalid flow state: ${session.flow}`);
                deleteSession(userId);
                result.session = false;
                result.returnToMain = true;
        }
        
        return result;
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
        
        // Check against provider-specific prefixes
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
            case 'paygo':
                allowedPrefixes = PAYMENT_PREFIXES.PAYGO;
                providerName = 'PayGo';
                break;
            default:
                return { valid: true, formatted, display, error: null };
        }
        
        // Check if formatted number starts with any allowed prefix
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
    
    detectNetworkFromPhone(phone) {
        const digits = phone.toString().replace(/\D/g, '');
        
        // Check each network's prefixes
        for (const [network, config] of Object.entries(NETWORK_PREFIXES)) {
            const hasInternationalPrefix = config.internationalPrefixes.some(prefix => 
                digits.startsWith(prefix)
            );
            const hasLocalPrefix = config.prefixes.some(prefix => 
                digits.startsWith(prefix)
            );
            
            if (hasInternationalPrefix || hasLocalPrefix) {
                return config.name;
            }
        }
        
        return null;
    }
}

module.exports = new AirtimeService();
