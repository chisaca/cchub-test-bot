// services/zesa.js - UPDATED with ZiG and USD modular services
// Matches airtime.js - InnBucks skips phone entry, EcoCash only
// ZiG uses zesazig.js module, USD uses zesausd.js module

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const hotrecharge = require('./hotrecharge');
const paynow = require('./paynow');
const { checkCurrencyAllowed } = require('./currencyGate');
const { 
    FLOW_STATES, 
    PAYMENT_CONFIG, 
    RESPONSE_MESSAGES, 
    ERROR_MESSAGES,
    PAYMENT_METHODS 
} = require('../config/constants');

class ZesaService {
    
    /**
     * Start the ZESA flow
     */
    async startFlow(userId) {
        console.log(`⚡ Starting ZESA flow for ${userId}`);
        
        createSession(userId, 'zesa');
        await this.sendCurrencyPrompt(userId);
        updateSessionStep(userId, 'select_currency', FLOW_STATES.ZESA.SELECT_CURRENCY);
    }
    
    /**
     * Main request handler
     */
    async handleRequest(userId, message, session) {
        console.log(`⚡ ZESA request from ${userId} at step ${session.flow}: "${message}"`);
        
        switch(session.flow) {
            case FLOW_STATES.ZESA.SELECT_CURRENCY:
                await this.handleCurrencySelection(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.ENTER_METER:
                await this.handleMeterEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.VERIFYING_METER:
                await messaging.sendMessage(userId, `⏳ Verifying meter...`);
                break;
                
            case FLOW_STATES.ZESA.ENTER_AMOUNT:
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.SELECT_PAYMENT:
                await this.handlePaymentSelection(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.ENTER_PAYMENT_PHONE:
                await this.handlePaymentPhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.CONFIRM_PAYMENT:
                await this.handleConfirmation(userId, message, session);
                break;
                
            default:
                console.error(`❌ Invalid flow state: ${session.flow}`);
                deleteSession(userId);
                await messaging.sendMessage(userId, `⚠️ Session error. Type *hi* to start again.`);
                await this.startFlow(userId);
        }
    }
    
    /**
     * Step 1: Currency Selection
     */
    async sendCurrencyPrompt(userId) {
        await messaging.sendMessage(userId, `⚡ *Currency*

1 *ZiG*
2 *USD*

────────────────

Reply 1 or 2`);
    }
    
    async handleCurrencySelection(userId, message, session) {
        const selection = message.trim();
        
        let currency, minAmount, maxAmount;
        
        if (selection === '1') {
            currency = 'ZiG';
            minAmount = PAYMENT_CONFIG.ZESA.MIN_ZIG;
            maxAmount = PAYMENT_CONFIG.ZESA.MAX_ZIG;
        } else if (selection === '2') {
            currency = 'USD';
            minAmount = PAYMENT_CONFIG.ZESA.MIN_USD;
            maxAmount = PAYMENT_CONFIG.ZESA.MAX_USD;
        } else {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, `❌ 1 or 2?`);
            return;
        }
        
        // Check if currency is allowed
        const allowed = await checkCurrencyAllowed(userId, currency, session);
        if (!allowed) return;
        
        updateSessionStep(userId, 'enter_meter', FLOW_STATES.ZESA.ENTER_METER, {
            currency: currency,
            minAmount: minAmount,
            maxAmount: maxAmount
        });
        
        await this.sendMeterPrompt(userId);
    }
    
    /**
     * Step 2: Meter Number Entry
     */
    async sendMeterPrompt(userId) {
        await messaging.sendMessage(userId, `📟 *Meter number*

Enter your 11-digit ZESA meter number

────────────────

Example: 37126096660`);
    }
    
    async handleMeterEntry(userId, message, session) {
        const meterNumber = message.trim().replace(/\s+/g, '');
        
        if (!/^\d{11}$/.test(meterNumber)) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, `❌ Must be 11 digits.

Example: 37126096660`);
            return;
        }
        
        updateSessionStep(userId, 'verifying_meter', FLOW_STATES.ZESA.VERIFYING_METER, {
            meterNumber: meterNumber
        });
        
        await messaging.sendMessage(userId, `⏳ Verifying meter...`);
        
        try {
            let meterInfo;
            
            // Route to appropriate verification service based on currency
            if (session.data.currency === 'ZiG') {
                // Use ZiG ZESA verification
                if (hotrecharge.zesa?.zig?.verifyMeter) {
                    meterInfo = await hotrecharge.zesa.zig.verifyMeter(meterNumber);
                } else {
                    meterInfo = await this.verifyMeterFallback(meterNumber, session.data.currency);
                }
            } else {
                // Use USD ZESA verification
                if (hotrecharge.zesa?.usd?.verifyMeter) {
                    meterInfo = await hotrecharge.zesa.usd.verifyMeter(meterNumber);
                } else {
                    meterInfo = await this.verifyMeterFallback(meterNumber, session.data.currency);
                }
            }
            
            if (meterInfo && meterInfo.success) {
                updateSessionStep(userId, 'enter_amount', FLOW_STATES.ZESA.ENTER_AMOUNT, {
                    ...session.data,
                    meterNumber: meterNumber,
                    meterOwner: meterInfo.customerName || 'Registered Customer',
                    meterAddress: meterInfo.address || 'Address on record',
                    meterStatus: meterInfo.status || 'Active'
                });
                
                await this.sendMeterVerifiedMessage(userId, meterInfo);
                await this.sendAmountPrompt(userId, session);
            } else {
                const isMaxRetries = incrementRetries(userId);
                
                if (isMaxRetries) {
                    await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                    deleteSession(userId);
                    return;
                }
                
                await messaging.sendMessage(userId, `❌ Meter not found. Check and try again.`);
                updateSessionStep(userId, 'enter_meter', FLOW_STATES.ZESA.ENTER_METER, session.data);
            }
        } catch (error) {
            console.error(`❌ HotRecharge meter verification error: ${error.message}`);
            
            if (process.env.NODE_ENV !== 'production') {
                console.log(`⚠️ SIMULATION: Meter verification bypassed for ${meterNumber}`);
                
                updateSessionStep(userId, 'enter_amount', FLOW_STATES.ZESA.ENTER_AMOUNT, {
                    ...session.data,
                    meterNumber: meterNumber,
                    meterOwner: 'Test Customer',
                    meterAddress: '123 Simulation St, Harare',
                    meterStatus: 'Active'
                });
                
                await this.sendMeterVerifiedMessage(userId, {
                    customerName: 'Test Customer',
                    address: '123 Simulation St, Harare',
                    status: 'Active'
                });
                
                await this.sendAmountPrompt(userId, session);
                return;
            }
            
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, `⚠️ Service unavailable. Try again in 5 minutes.`);
            updateSessionStep(userId, 'enter_meter', FLOW_STATES.ZESA.ENTER_METER, session.data);
        }
    }
    
    /**
     * Fallback meter verification (temporary fallback)
     */
    async verifyMeterFallback(meterNumber, currency) {
        console.log(`⚠️ Using fallback meter verification for ${currency}`);
        try {
            // Use the old method temporarily
            return await hotrecharge.verifyZesaMeter(meterNumber, currency);
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Meter verified message
     */
    async sendMeterVerifiedMessage(userId, meterInfo) {
        if (meterInfo.customerName && meterInfo.customerName !== 'Unknown' && meterInfo.customerName !== 'Registered Customer') {
            await messaging.sendMessage(userId, `✅ Meter verified: ${meterInfo.customerName}`);
        } else {
            await messaging.sendMessage(userId, `✅ Meter verified`);
        }
    }
    
    /**
     * Step 3: Amount Entry
     */
    async sendAmountPrompt(userId, session) {
        const currency = session.data.currency;
        const minAmount = session.data.minAmount;
        const maxAmount = session.data.maxAmount;
        
        await messaging.sendMessage(userId, `💰 *Enter amount*

Enter amount in ${currency} (${minAmount.toLocaleString()}-${maxAmount.toLocaleString()})

────────────────

Reply with amount`);
    }
    
    async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const amount = parseFloat(amountText);
        
        const currency = session.data.currency;
        const minAmount = session.data.minAmount;
        const maxAmount = session.data.maxAmount;
        
        // Basic range validation
        if (isNaN(amount) || amount < minAmount || amount > maxAmount) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, `❌ Amount must be ${minAmount.toLocaleString()}-${maxAmount.toLocaleString()} ${currency}.`);
            return;
        }
        
        // Validate amount with currency-specific rules
        if (currency === 'ZiG') {
            // Use ZiG-specific validation from modular service
            if (hotrecharge.zesa?.zig?.validateAmount) {
                const validation = hotrecharge.zesa.zig.validateAmount(amount);
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
        } else {
            // Use USD-specific validation from modular service
            if (hotrecharge.zesa?.usd?.validateAmount) {
                const validation = hotrecharge.zesa.usd.validateAmount(amount);
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
        }
        
        // Calculate service fee
        const feePercentage = PAYMENT_CONFIG.SERVICE_FEES.ZESA;
        const serviceFee = parseFloat((amount * feePercentage).toFixed(2));
        const totalAmount = parseFloat((amount + serviceFee).toFixed(2));
        
        updateSessionStep(userId, 'select_payment', FLOW_STATES.ZESA.SELECT_PAYMENT, {
            ...session.data,
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
            // tokenUnits removed - will come from API
        });
        
        await this.sendPaymentSelection(userId);
    }
    
    /**
     * Step 4: Payment Method Selection
     */
    async sendPaymentSelection(userId) {
        await messaging.sendMessage(userId, `💳 *Select payment method*

1 *EcoCash*
2 *InnBucks*

────────────────

Reply 1 or 2`);
    }
    
    async handlePaymentSelection(userId, message, session) {
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
        
        // INNBUCKS - Skip phone entry, go straight to confirmation
        if (paymentMethod === 'innbucks') {
            const updatedSession = updateSessionStep(userId, 'confirm_payment', FLOW_STATES.ZESA.CONFIRM_PAYMENT, {
                ...session.data,
                paymentMethod: 'innbucks',
                paymentProvider: 'innbucks',
                paymentPhone: 'innbucks',
                paymentPhoneDisplay: 'InnBucks Wallet'
            });
            
            await this.showTransactionDetails(userId, updatedSession || session);
            return;
        }
        
        // ECOCASH - Normal phone entry flow
        updateSessionStep(userId, 'enter_payment_phone', FLOW_STATES.ZESA.ENTER_PAYMENT_PHONE, {
            ...session.data,
            paymentMethod: paymentMethod
        });
        
        await this.sendPaymentPhonePrompt(userId, paymentMethod);
    }
    
    /**
     * Step 5: Payment Phone Entry - ECOCASH ONLY
     */
    async sendPaymentPhonePrompt(userId, paymentMethod) {
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
        
        const updatedSession = updateSessionStep(userId, 'confirm_payment', FLOW_STATES.ZESA.CONFIRM_PAYMENT, {
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
                meterNumber,
                meterOwner,
                paymentPhoneDisplay,
                paymentMethod,
                currency
            } = session.data;
            
            let displayPaymentMethod = paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
            
            // Mask meter number
            const maskedMeter = meterNumber.length > 4 
                ? '****' + meterNumber.slice(-4)
                : meterNumber;
            
            // Handle payment display differently for InnBucks vs EcoCash
            let displayPaymentInfo;
            if (paymentMethod === 'ecocash') {
                displayPaymentInfo = paymentPhoneDisplay?.length > 4
                    ? paymentPhoneDisplay.slice(0, 5) + '****' + paymentPhoneDisplay.slice(-3)
                    : paymentPhoneDisplay || 'N/A';
            } else {
                displayPaymentInfo = 'InnBucks Wallet';
            }
            
            let amountDisplay, totalDisplay;
            const feePercentage = (PAYMENT_CONFIG.SERVICE_FEES.ZESA * 100).toFixed(0);
            
            if (currency === 'USD') {
                amountDisplay = `$${amount?.toFixed(2)}`;
                totalDisplay = `$${totalAmount?.toFixed(2)}`;
            } else {
                amountDisplay = `${amount?.toFixed(2)} ZiG`;
                totalDisplay = `${totalAmount?.toFixed(2)} ZiG`;
            }
            
            const message = `📋 *Confirm your purchase*

⚡ ZESA Tokens
📟 Meter: ${maskedMeter}
👤 ${meterOwner?.substring(0, 20) || 'Registered Customer'}
💰 Amount: ${amountDisplay}
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
    
    /**
     * Step 7: Confirmation with Health Check
     */
    async handleConfirmation(userId, message, session) {
        const response = message.trim().toLowerCase();
        
        if (response === 'yes' || response === 'y') {
            console.log(`✅ User confirmed ZESA payment`);
            
            try {
                console.log('🔌 [HEALTH] Checking HotRecharge API status...');
                console.log('🔌 [HEALTH] hotrecharge.isOnline type:', typeof hotrecharge.isOnline);
                
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
                    
                    try {
                        console.log(`🔌 [HEALTH] Calling hotrecharge.isOnline() attempt ${healthAttempts}...`);
                        isOnline = await hotrecharge.isOnline();
                        console.log(`🔌 [HEALTH] Result:`, isOnline);
                    } catch (healthError) {
                        console.error(`🔌 [HEALTH] Error calling isOnline:`, healthError.message);
                        isOnline = false;
                    }
                    
                    if (isOnline) {
                        console.log(`✅ [HEALTH] HotRecharge is ONLINE (attempt ${healthAttempts})`);
                        break;
                    }
                }
                
                if (!isOnline) {
                    console.error('❌ [HEALTH] HotRecharge is OFFLINE after', maxHealthAttempts, 'attempts');
                    await messaging.sendMessage(userId,
                        `⚠️ Service temporarily unavailable. Please try again in 5 minutes.`
                    );
                    deleteSession(userId);
                    return;
                }
                
                console.log('✅ [HEALTH] Health check passed, proceeding to payment...');
                await this.processPayment(userId, session);
                
            } catch (error) {
                console.error('❌ [HEALTH] Health check failed with unexpected error:', error);
                console.error('Error stack:', error.stack);
                await messaging.sendMessage(userId,
                    `⚠️ An error occurred. Please try again.`
                );
                deleteSession(userId);
                return;
            }
            
        } else if (response === 'no' || response === 'n') {
            await messaging.sendMessage(userId, `❌ Cancelled. Type *hi* to start over.`);
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
     * Process payment with PayNow
     */
    async processPayment(userId, session) {
        const data = session.data;
        const currency = data.currency;
        const reference = `ZES${Date.now().toString().slice(-8)}`;
        
        updateSessionStep(userId, 'processing_payment', 'processing_payment', {
            ...session.data,
            reference: reference,
            paymentInitiated: true
        });
        
        await messaging.sendMessage(userId, `⏳ *Connecting to PayNow...*`);
        
        try {
            // Prepare payment data for PayNow
            const paymentData = {
                amount: data.totalAmount.toFixed(2),
                reference: reference,
                method: data.paymentMethod,
                service: `ZESA (${data.currency}) - Meter ${data.meterNumber.slice(-4)}`,
                currency: data.currency,
                customer: {
                    email: `${userId.split('@')[0]}@cchub.co.zw`
                }
            };
            
            // Only add phone for EcoCash
            if (data.paymentMethod === 'ecocash') {
                paymentData.phone = data.paymentPhone;
                paymentData.customer.phone = data.paymentPhone;
            }
            
            const paymentResult = await paynow.initiateQuickPay(paymentData);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Payment failed');
            }
            
            const totalDisplay = data.currency === 'USD'
                ? `$${data.totalAmount?.toFixed(2)}`
                : `${data.totalAmount?.toFixed(2)} ZiG`;
            
            // Customize message based on payment method
            let statusMessage;
            if (data.paymentMethod === 'ecocash') {
                const displayPhone = data.paymentPhone.toString().replace('263', '0');
                statusMessage = `💳 *Payment Request*

Amount: ${totalDisplay}
Ref: ${reference}
Phone: ${displayPhone}
Provider: EcoCash

${paymentResult.instructions}

⏳ Waiting for payment...`;
            } else {
                statusMessage = `💳 *Payment Request*

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
            
            return {
                success: true,
                reference: reference,
                paynowReference: paymentResult.pollUrl?.split('/').pop() || reference
            };
            
        } catch (error) {
            console.error(`❌ PayNow error: ${error.message}`);
            
            if (process.env.NODE_ENV !== 'production') {
                console.log(`⚠️ SIMULATION: Payment bypassed`);
                
                // Simulate successful payment for testing
                setTimeout(() => {
                    this.fulfillZesaPurchase(userId, session, { paynowref: `SIM-${Date.now()}` });
                }, 3000);
                
                return {
                    success: true,
                    reference: `SIM-${Date.now()}`,
                    paynowReference: `PAYNOW-${Date.now().toString().slice(-8)}`
                };
            }
            
            throw error;
        }
    }
    
    /**
     * Monitor payment status
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { meterNumber, amount, reference, currency, paymentPhone } = session.data;
        
        console.log(`🔍 Monitoring ZESA payment for ${userId}, ref: ${reference}`);
        
        let attempts = 0;
        const maxAttempts = 60;
        const pollInterval = 10000;
        
        const checkStatus = async () => {
            attempts++;
            
            const currentSession = getActiveSession(userId);
            if (!currentSession || currentSession.service !== 'zesa') {
                clearInterval(intervalId);
                return;
            }
            
            if (attempts > maxAttempts) {
                clearInterval(intervalId);
                await messaging.sendMessage(userId,
                    `⏰ Payment timeout. Type *hi* to try again.`
                );
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynow.checkPaymentStatus(pollUrl);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    console.log('💰 PAYMENT CONFIRMED - Calling HotRecharge NOW!');
                    await this.fulfillZesaPurchase(userId, session, status);
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    await messaging.sendMessage(userId,
                        `❌ Payment cancelled. Type *hi* to try again.`
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
     * Fulfill ZESA purchase via HotRecharge
     */
    async fulfillZesaPurchase(userId, session, paymentStatus) {
        const { 
            meterNumber, 
            amount, 
            reference,
            currency,
            paymentPhone
        } = session.data;
        
        console.log(`📞 [ZESA] Payment phone for notification:`, paymentPhone);
        
        try {
            let tokenResult;
            
            // Route to appropriate service based on currency
            if (currency === 'ZiG') {
                console.log(`📤 [ZESA ZIG] Using modular ZiG service`);
                
                if (hotrecharge.zesa?.zig?.purchaseToken) {
                    tokenResult = await hotrecharge.zesa.zig.purchaseToken({
                        meterNumber: meterNumber,
                        amount: amount,
                        notifyNumber: paymentPhone || '0771111111',
                        userId: userId.split('@')[0].slice(-4)
                    });
                } else {
                    // Fallback to old method
                    tokenResult = await hotrecharge.purchaseZesaToken({
                        meterNumber: meterNumber,
                        amount: amount,
                        currency: currency,
                        agentReference: `CCHUB-${userId.slice(-4)}-${Date.now()}`,
                        userId: userId.split('@')[0].slice(-4),
                        notifyNumber: paymentPhone
                    });
                }
            } else {
                console.log(`📤 [ZESA USD] Using modular USD service`);
                
                if (hotrecharge.zesa?.usd?.purchaseToken) {
                    tokenResult = await hotrecharge.zesa.usd.purchaseToken({
                        meterNumber: meterNumber,
                        amount: amount,
                        notifyNumber: paymentPhone || '0771111111',
                        userId: userId.split('@')[0].slice(-4)
                    });
                } else {
                    // Fallback to old method
                    tokenResult = await hotrecharge.purchaseZesaToken({
                        meterNumber: meterNumber,
                        amount: amount,
                        currency: currency,
                        agentReference: `CCHUB-${userId.slice(-4)}-${Date.now()}`,
                        userId: userId.split('@')[0].slice(-4),
                        notifyNumber: paymentPhone
                    });
                }
            }
            
            console.log(`🔌 [HOTRECHARGE] Result:`, tokenResult);
            
            if (tokenResult.success) {
                await this.sendReceipt(userId, session, {
                    paynowReference: paymentStatus.paynowref || reference,
                    reference: reference
                }, tokenResult);
            } else {
                await this.handleReconciliation(userId, session, {
                    reference: reference,
                    paynowReference: paymentStatus.paynowref || reference
                }, tokenResult.error);
            }
            
        } catch (error) {
            console.error(`❌ ZESA fulfillment error:`, error.message);
            
            await messaging.sendMessage(userId,
                `⚠️ Payment successful but token failed. You'll receive SMS within 15 min.`
            );
            
            console.error(`🚨 MANUAL RECONCILIATION NEEDED:`, {
                reference,
                meterNumber,
                amount,
                currency,
                error: error.message
            });
            
        } finally {
            deleteSession(userId);
        }
    }
    
    /**
     * Handle reconciliation
     */
    async handleReconciliation(userId, session, paymentResult, error) {
        const data = session.data;
        
        const message = `⚠️ Payment received - token pending

Ref: ${paymentResult.paynowReference || paymentResult.reference}
${error ? `Error: ${error}` : ''}

You'll receive SMS within 30 minutes.`;
        
        await messaging.sendMessage(userId, message);
        
        console.log(`🔴 RECONCILIATION REQUIRED:`, {
            userId,
            meterNumber: data.meterNumber,
            amount: data.amount,
            currency: data.currency,
            paymentReference: paymentResult.reference,
            paynowReference: paymentResult.paynowReference,
            error: error
        });
        
        deleteSession(userId);
    }
    
    /**
     * Send receipt with token
     */
    async sendReceipt(userId, session, paymentResult, tokenResult) {
        const data = session.data;
        const currency = data.currency;
        
        let amountDisplay = currency === 'USD' 
            ? `$${data.amount.toFixed(2)}` 
            : `${data.amount.toFixed(2)} ZiG`;
        
        const formattedToken = this.formatToken(tokenResult.token);
        const displayPaymentPhone = data.paymentPhoneDisplay;
        const displayPaymentMethod = data.paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
        
        // Mask meter number
        const maskedMeter = data.meterNumber.length > 4 
            ? '****' + data.meterNumber.slice(-4)
            : data.meterNumber;
        
        // Mask phone for EcoCash only
        let paymentDisplay;
        if (data.paymentMethod === 'ecocash') {
            paymentDisplay = displayPaymentPhone?.slice(0,5) + '****' + displayPaymentPhone?.slice(-3) || '';
        } else {
            paymentDisplay = 'InnBucks Wallet';
        }
        
        const message = `✅ ZESA Token Sent!

🔑 ${formattedToken}

📟 Meter: ${maskedMeter}
💰 ${amountDisplay}
⚡ ${tokenResult.units || 'N/A'} kWh
💳 ${displayPaymentMethod} ${paymentDisplay}
🆔 ${data.reference}

────────────────

Type *hi* for another transaction`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Format ZESA token
     */
    formatToken(token) {
        if (!token) return 'N/A';
        const cleanToken = token.replace(/[^0-9A-F]/gi, '');
        if (cleanToken.length >= 20) {
            return `${cleanToken.substr(0,5)}-${cleanToken.substr(5,5)}-${cleanToken.substr(10,5)}-${cleanToken.substr(15,5)}`;
        }
        return token;
    }
    
    /**
     * Validate payment phone - ECOCASH ONLY
     */
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
        
        // EcoCash ONLY - InnBucks never calls this function
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
}

module.exports = new ZesaService();