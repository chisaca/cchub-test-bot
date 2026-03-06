// services/airtime.js
// ============================================================================
// AIRTIME SERVICE
// Handles the complete airtime purchase flow:
// 1. Currency selection (ZiG/USD)
// 2. Amount entry with validation
// 3. Recipient phone number with network detection
// 4. Payment method selection (all 8 methods)
// 5. Payment phone entry (if required)
// 6. Transaction confirmation
// 7. PayNow payment processing
// 8. HotRecharge fulfillment with TiDB logging
// ============================================================================

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');
const currencyGate = require('./currencyGate');
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
    VALIDATION_CONFIG
} = require('../config/constants');

class AirtimeService {
    
    // ============================================================================
    // FLOW INITIATION
    // ============================================================================
    
    /**
     * Start the airtime flow
     * Creates session and sends currency selection prompt
     * 
     * @param {string} userId - WhatsApp user ID
     */
    async startFlow(userId) {
        console.log(`🎯 [AIRTIME] Starting flow for ${userId}`);
        
        createSession(userId, 'airtime');
        await this.sendCurrencyPrompt(userId);
        updateSessionStep(userId, 'select_currency', FLOW_STATES.AIRTIME.SELECT_CURRENCY);
    }
    
    // ============================================================================
    // STEP 1: CURRENCY SELECTION
    // ============================================================================
    
    /**
     * Send currency selection prompt
     */
    async sendCurrencyPrompt(userId) {
        await messaging.sendMessage(userId, UI_MESSAGES.CURRENCY_PROMPT.AIRTIME);
    }
    
    /**
     * Handle user's currency selection
     * Validates selection and checks currency availability
     */
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
    
    // ============================================================================
    // STEP 2: AMOUNT ENTRY
    // ============================================================================
    
    /**
     * Send amount entry prompt with min/max range
     */
    async sendAmountPrompt(userId, currencyOption) {
        const { symbol, min, max } = currencyOption;
        
        const message = `💰 *Enter airtime amount*

Amount must be from ${symbol}${min} to ${symbol}${max}

────────────────

Reply with amount (e.g. 5 or 10.50). Use *.* not *,*`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle user's amount entry
     * Validates amount range and format, calculates fee
     */
    async handleAmountEntry(userId, message, session) {
        const input = message.trim();
        const { currency, currencyName, currencySymbol, minAmount, maxAmount } = session.data;
        
        const amountText = input.replace(/,/g, '');
        const amount = parseFloat(amountText);
        
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
        
        // Currency-specific validation
        if (currency === 'usd') {
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
        
        const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = parseFloat((amount * fee).toFixed(2));
        const totalAmount = parseFloat((amount + serviceFee).toFixed(2));
        
        console.log(`✅ [AIRTIME] Amount accepted: ${amount} ${currency}, fee: ${serviceFee}, total: ${totalAmount}`);
        
        updateSessionStep(userId, 'enter_recipient', FLOW_STATES.AIRTIME.ENTER_PHONE, {
            ...session.data,
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        await this.sendRecipientPrompt(userId);
    }
    
    // ============================================================================
    // STEP 3: RECIPIENT PHONE NUMBER
    // ============================================================================
    
    /**
     * Send recipient phone number prompt
     */
    async sendRecipientPrompt(userId) {
        await messaging.sendMessage(userId, `📞 *Recipient's number*

Enter phone number you want to top up

────────────────

Example: 0771234567`);
    }
    
    /**
     * Handle recipient phone entry
     * Validates number and detects network
     */
    async handleRecipientEntry(userId, message, session) {
        const phoneNumber = message.trim();
        const { currency } = session.data;
        
        let validationResult;
        
        if (currency === 'usd') {
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
    
    // ============================================================================
    // STEP 4: PAYMENT METHOD SELECTION
    // ============================================================================
    
    /**
     * Send payment method selection prompt based on currency
     */
    async sendPaymentMethodPrompt(userId, currencyType) {
        const prompt = currencyType === 'zig' 
            ? UI_MESSAGES.PAYMENT_METHOD_PROMPT.ZIG
            : UI_MESSAGES.PAYMENT_METHOD_PROMPT.USD;
        
        await messaging.sendMessage(userId, prompt);
    }
    
    /**
     * Handle user's payment method selection
     * Maps selection to payment method code and config
     */
    async handlePaymentMethodSelection(userId, message, session) {
        const selection = message.trim();
        const { currency } = session.data;
        
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
        
        let paymentMethodCode;
        if (currency === 'zig') {
            const methodMap = {
                '1': PAYMENT_PROVIDERS.ZIG.ECOCASH,
                '2': PAYMENT_PROVIDERS.ZIG.ZIMSWITCH,
                '3': PAYMENT_PROVIDERS.ZIG.ONEMONEY
            };
            paymentMethodCode = methodMap[selection];
        } else {
            const methodMap = {
                '1': PAYMENT_PROVIDERS.USD.ECOCASH,
                '2': PAYMENT_PROVIDERS.USD.ZIMSWITCH,
                '3': PAYMENT_PROVIDERS.USD.OMARI,
                '4': PAYMENT_PROVIDERS.USD.INNBUCKS
            };
            paymentMethodCode = methodMap[selection];
        }
        
        const methodConfig = PAYMENT_METHOD_CONFIG[paymentMethodCode];
        
        updateSessionStep(userId, 'payment_method_selected', FLOW_STATES.AIRTIME.SELECT_PAYMENT_METHOD, {
            ...session.data,
            paymentMethodCode: paymentMethodCode,
            paymentMethodName: methodConfig.name,
            paymentProvider: methodConfig.provider,
            requiresPaymentPhone: methodConfig.requiresPhone
        });
        
        if (methodConfig.requiresPhone) {
            updateSessionStep(userId, 'enter_payment_phone', 'airtime_enter_payment_phone', session.data);
            await this.sendPaymentPhonePrompt(userId, methodConfig);
        } else {
            updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, session.data);
            await this.showTransactionDetails(userId, session);
        }
    }
    
    // ============================================================================
    // STEP 5: PAYMENT PHONE NUMBER (if required)
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
            case 'omari':
                prompt = UI_MESSAGES.PAYMENT_PHONE_PROMPT.OMARI;
                break;
            default:
                prompt = UI_MESSAGES.PAYMENT_PHONE_PROMPT.DEFAULT;
        }
        
        await messaging.sendMessage(userId, prompt);
    }
    
    /**
     * Handle payment phone entry
     * Validates number matches the selected provider's prefixes
     */
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
    
    // ============================================================================
    // STEP 6: TRANSACTION CONFIRMATION
    // ============================================================================
    
    /**
     * Show transaction details for user confirmation
     * Displays masked phone numbers for privacy
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
            
            let displayPaymentInfo;
            if (paymentProvider === 'ecocash' || paymentProvider === 'onemoney' || paymentProvider === 'omari') {
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
            
            const message = `📱 *Confirm airtime purchase*

📱 Airtime: ${amountDisplay}
📞 Recipient: ${maskedRecipient}
📶 Network: ${network}
💳 Payment: ${paymentMethodName}
${paymentProvider !== 'zimswitch' && paymentProvider !== 'innbucks' ? `📱 Phone: ${displayPaymentInfo}` : ''}
💰 Total: ${totalDisplay} (${feePercentage}% fee)

────────────────

Type *YES* to confirm or *NO* to cancel`;
            
            await messaging.sendMessage(userId, message);
            
        } catch (error) {
            console.error(`❌ [AIRTIME] Error in showTransactionDetails:`, error.message);
            await messaging.sendMessage(userId, `❌ Error. Try again.`);
        }
    }
    
    /**
     * Handle user's confirmation response
     */
    async handleConfirmation(userId, message, session) {
        const response = message.trim().toLowerCase();
        
        if (response === 'yes' || response === 'y') {
            console.log(`✅ [AIRTIME] User confirmed payment`);
            
            try {
                console.log('🩺 [AIRTIME] Checking HotRecharge API status...');
                
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
                        console.log(`✅ [AIRTIME] HotRecharge is ONLINE (attempt ${healthAttempts})`);
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
                console.error('❌ [AIRTIME] Health check failed:', error.message);
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
    
    // ============================================================================
    // STEP 7: PAYMENT PROCESSING
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
                currencySymbol
            } = session.data;
            
            const displayRecipient = recipient.replace('263', '0');
            const reference = `AIR${Date.now().toString().slice(-8)}`;
            
            updateSessionStep(userId, 'processing_payment', 'processing_payment', {
                ...session.data,
                reference: reference,
                paymentInitiated: true
            });
            
            await messaging.sendMessage(userId, `🔄 *Connecting...*`);
            
            // Map payment provider to what PayNow expects
            let paynowMethod = paymentProvider;
            
            if (paymentProvider === 'ecocash') {
                paynowMethod = 'ecocash';
            } else if (paymentProvider === 'onemoney') {
                paynowMethod = 'onemoney';
            } else if (paymentProvider === 'omari') {
                paynowMethod = 'omari';
            } else if (paymentProvider === 'zimswitch') {
                paynowMethod = 'zimswitch';
            } else if (paymentProvider === 'innbucks') {
                paynowMethod = 'innbucks';
            }
            
            console.log(`💳 [AIRTIME] Processing payment with method: ${paynowMethod}`);
            
            const paymentData = {
                amount: totalAmount,
                reference: reference,
                phone: paymentPhone,
                method: paynowMethod,
                paymentMethodCode: paymentMethodCode,
                service: `Airtime (${currencyName}) - ${network}`,
                currency: currencyName
            };
            
            console.log(`📤 [AIRTIME] Payment data:`, paymentData);
            
            const paymentResult = await paynowService.initiateQuickPay(paymentData);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            const totalDisplay = currencyName === 'USD'
                ? `$${totalAmount?.toFixed(2)}`
                : `${totalAmount?.toLocaleString()} ${currencySymbol}`;
            
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
                
            } else if (paymentProvider === 'omari') {
                const displayPhone = paymentPhone?.toString().replace('263', '0') || 'N/A';
                statusMessage = `📱 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Phone: ${displayPhone}
Provider: Omari ${currencyName}

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
                statusMessage = `📱 *Payment Request Created*

Amount: ${totalDisplay}
Ref: ${reference}
Provider: ${paymentMethodName || paymentProvider}

${paymentResult.instructions}

⏳ Waiting for payment...`;
            }
            
            await messaging.sendMessage(userId, statusMessage);
            
            if (paymentResult.pollUrl) {
                const updatedSession = getActiveSession(userId);
                this.monitorPaymentStatus(userId, paymentResult.pollUrl, updatedSession || session);
            } else {
                console.log(`⏳ [AIRTIME] No pollUrl for ${paymentProvider}, user will complete payment manually`);
            }
            
        } catch (error) {
            console.error(`❌ [AIRTIME] PayNow error:`, error.message);
            await messaging.sendMessage(userId,
                `❌ *Payment Failed*\n\n` +
                `Unable to initiate payment: ${error.message}\n\n` +
                `Type "hi" to start over.`
            );
            deleteSession(userId);
        }
    }
    
    /**
     * Monitor payment status via polling
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { recipient, amount, reference, network, currency, currencyName } = session.data;
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
                    console.log('✅ [AIRTIME] PAYMENT CONFIRMED - Calling HotRecharge NOW!');
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
                console.error(`❌ [AIRTIME] Status check error:`, error.message);
            }
        };
        
        const intervalId = setInterval(checkStatus, pollInterval);
        setTimeout(checkStatus, 2000);
    }
    
    // ============================================================================
    // STEP 8: FULFILLMENT
    // ============================================================================
    
    /**
     * Fulfill airtime purchase via HotRecharge
     * Includes TiDB logging for transaction tracking
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
                console.log(`📤 [AIRTIME] Using modular USD service`);
                hotrechargeResult = await hotrecharge.airtime.usd.purchase({
                    recipient: recipient,
                    amount: amount,
                    userId: userId.split('@')[0].slice(-4)
                });
            } else {
                console.log(`📤 [AIRTIME] Using modular ZiG service`);
                hotrechargeResult = await hotrecharge.airtime.zig.purchase({
                    recipient: recipient,
                    amount: amount,
                    userId: userId.split('@')[0].slice(-4)
                });
            }
            
            // ========================================================================
            // TiDB TRANSACTION LOGGING
            // Logs transaction to TiDB Cloud with local queue fallback
            // ========================================================================
            const transactionData = {
                success: true,
                reference: reference,
                agentReference: hotrechargeResult.agentReference || reference,
                customerPhone: recipient,
                amount: amount,
                currency: currencyName,
                paymentMethod: paymentProvider,
                paymentMethodName: paymentMethodName,
                userId: userId,
                metadata: {
                    network: network,
                    recipient: displayRecipient,
                    hotRechargeReference: hotrechargeResult.reference,
                    pollUrl: paymentStatus.pollUrl,
                    paynowReference: paymentStatus.reference
                },
                rawResponse: hotrechargeResult
            };
            
            // Call TiDB logger (non-blocking)
            if (hotrecharge.logToTiDB) {
                hotrecharge.logToTiDB(transactionData, 'airtime');
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
                console.log(`✅ [AIRTIME] Purchase successful for ${userId}, ref: ${reference}`);
                
            } else {
                console.error(`❌ [AIRTIME] HotRecharge failed:`, hotrechargeResult.error);
                
                // Log failure to TiDB
                const failureData = {
                    success: false,
                    reference: reference,
                    agentReference: hotrechargeResult.agentReference || reference,
                    customerPhone: recipient,
                    amount: amount,
                    currency: currencyName,
                    paymentMethod: paymentProvider,
                    paymentMethodName: paymentMethodName,
                    userId: userId,
                    error: hotrechargeResult.error,
                    metadata: {
                        network: network,
                        recipient: displayRecipient,
                        pollUrl: paymentStatus.pollUrl,
                        paynowReference: paymentStatus.reference
                    },
                    rawResponse: hotrechargeResult
                };
                
                if (hotrecharge.logToTiDB) {
                    hotrecharge.logToTiDB(failureData, 'airtime');
                }
                
                await messaging.sendMessage(userId,
                    `⚠️ *Payment Successful but Airtime Failed*\n\n` +
                    `Your payment of ${currencyName === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ZiG`} was received.\n\n` +
                    `🔧 Our team has been notified and will resolve this within 15 minutes.\n\n` +
                    `Reference: ${reference}`
                );
                
                console.error(`🔧 [AIRTIME] MANUAL RECONCILIATION NEEDED:`, {
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
            console.error(`❌ [AIRTIME] Fulfillment error:`, error.message);
            
            // Log exception to TiDB
            const exceptionData = {
                success: false,
                reference: reference,
                customerPhone: recipient,
                amount: amount,
                currency: currencyName,
                paymentMethod: paymentProvider,
                paymentMethodName: paymentMethodName,
                userId: userId,
                error: error.message,
                metadata: {
                    network: network,
                    recipient: displayRecipient,
                    pollUrl: paymentStatus?.pollUrl,
                    paynowReference: paymentStatus?.reference
                }
            };
            
            if (hotrecharge.logToTiDB) {
                hotrecharge.logToTiDB(exceptionData, 'airtime');
            }
            
            await messaging.sendMessage(userId,
                `⚠️ *Payment Successful but Airtime Failed*\n\n` +
                `🔧 Our team has been notified and will resolve this within 15 minutes.\n\n` +
                `Reference: ${reference}`
            );
            
            console.error(`🔧 [AIRTIME] MANUAL RECONCILIATION NEEDED:`, {
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
    
    // ============================================================================
    // MAIN REQUEST HANDLER
    // ============================================================================
    
    /**
     * Main request handler - routes to appropriate step based on session state
     */
    async handleRequest(userId, message, session) {
        console.log(`📱 [AIRTIME] Request at step ${session.flow}: "${message}"`);
        
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
    
    // ============================================================================
    // VALIDATION HELPERS
    // ============================================================================
    
    /**
     * Validate recipient phone number
     * Supports various formats and converts to standard format
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
            case 'omari':
                allowedPrefixes = PAYMENT_PREFIXES.OMARI;
                providerName = 'Omari';
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
    
    /**
     * Detect network from phone number
     */
    detectNetworkFromPhone(phone) {
        const digits = phone.toString().replace(/\D/g, '');
        
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