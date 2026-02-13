// services/zesa.js - FULLY UPDATED with InnBucks support
// Matches airtime.js - InnBucks skips phone entry, EcoCash only

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
        const { checkCurrencyAllowed } = require('./currencyGate');
        
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
        
        updateSessionStep(userId, 'enter_meter', FLOW_STATES.ZESA.ENTER_METER, {
            currency: currency,
            minAmount: minAmount,
            maxAmount: maxAmount
        });
        
        // ✅ BLOCK ZiG PAYMENTS
        const allowed = await checkCurrencyAllowed(userId, currency, session);
        if (!allowed) return;
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
            const meterInfo = await hotrecharge.verifyZesaMeter(meterNumber, session.data.currency);
            
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
     * Meter verified message
     */
    async sendMeterVerifiedMessage(userId, meterInfo) {
        const message = `✅ Meter verified: ${meterInfo.customerName || 'Registered Customer'}`;
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Step 3: Amount Entry
     */
    async sendAmountPrompt(userId, session) {
        const currency = session.data.currency;
        const minAmount = session.data.minAmount;
        const maxAmount = session.data.maxAmount;
        
        await messaging.sendMessage(userId, `💰 *Enter amount*

Enter amount in ${currency} (${minAmount}-${maxAmount})

────────────────

Reply with amount`);
    }
    
    async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const amount = parseFloat(amountText);
        
        const currency = session.data.currency;
        const minAmount = session.data.minAmount;
        const maxAmount = session.data.maxAmount;
        
        if (isNaN(amount) || amount < minAmount || amount > maxAmount) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, `❌ Amount must be ${minAmount}-${maxAmount} ${currency}.`);
            return;
        }
        
        // Calculate token units
        let tokenUnits;
        if (currency === 'ZiG') {
            tokenUnits = Math.floor(amount * 0.8);
        } else {
            tokenUnits = Math.floor(amount * 10);
        }
        
        // Calculate service fee as PERCENTAGE (3%)
        let serviceFee;
        if (currency === 'ZiG') {
            serviceFee = Math.round(amount * PAYMENT_CONFIG.ZESA.SERVICE_FEE_PERCENTAGE);
        } else {
            serviceFee = parseFloat((amount * PAYMENT_CONFIG.ZESA.SERVICE_FEE_PERCENTAGE).toFixed(2));
        }
        
        const totalAmount = amount + serviceFee;
        
        updateSessionStep(userId, 'select_payment', FLOW_STATES.ZESA.SELECT_PAYMENT, {
            ...session.data,
            amount: amount,
            tokenUnits: tokenUnits,
            serviceFee: serviceFee,
            totalAmount: totalAmount
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
        
        // ✅ INNBUCKS - Skip phone entry, go straight to confirmation
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
        
        // ✅ ECOCASH - Normal phone entry flow
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
                currency,
                tokenUnits
            } = session.data;
            
            let displayPaymentMethod = paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
            
            // Mask meter number
            const maskedMeter = meterNumber.length > 4 
                ? '****' + meterNumber.slice(-4)
                : meterNumber;
            
            // ✅ Handle payment display differently for InnBucks vs EcoCash
            let displayPaymentInfo;
            if (paymentMethod === 'ecocash') {
                displayPaymentInfo = paymentPhoneDisplay?.length > 4
                    ? paymentPhoneDisplay.slice(0, 5) + '****' + paymentPhoneDisplay.slice(-3)
                    : paymentPhoneDisplay || 'N/A';
            } else {
                displayPaymentInfo = 'InnBucks Wallet';
            }
            
            let amountDisplay, totalDisplay, feeDisplay;
            const feePercentage = PAYMENT_CONFIG.ZESA?.SERVICE_FEE_PERCENTAGE 
                ? (PAYMENT_CONFIG.ZESA.SERVICE_FEE_PERCENTAGE * 100).toFixed(0) 
                : '3';
            
            if (currency === 'USD') {
                amountDisplay = `$${amount?.toFixed(2)}`;
                feeDisplay = `$${serviceFee?.toFixed(2)}`;
                totalDisplay = `$${totalAmount?.toFixed(2)}`;
            } else {
                amountDisplay = `${amount?.toLocaleString()} ZiG`;
                feeDisplay = `${serviceFee?.toLocaleString()} ZiG`;
                totalDisplay = `${totalAmount?.toLocaleString()} ZiG`;
            }
            
            const message = `📋 *Confirm your purchase*

⚡ ZESA Tokens
📟 Meter: ${maskedMeter}
👤 ${meterOwner?.substring(0, 20) || 'Registered Customer'}
💰 Amount: ${amountDisplay} (${tokenUnits} kWh)
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
                        `⚠️ Service unavailable. Try again in 5 minutes.`
                    );
                    deleteSession(userId);
                    return;
                }
                
            } catch (error) {
                console.error('❌ [HEALTH] Health check failed:', error.message);
                await messaging.sendMessage(userId,
                    `⚠️ Service unavailable. Try again in 5 minutes.`
                );
                deleteSession(userId);
                return;
            }
            
            await this.processPayment(userId, session);
            
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
                customer: {
                    email: `${userId.split('@')[0]}@cchub.co.zw`
                }
            };
            
            // ✅ Only add phone for EcoCash
            if (data.paymentMethod === 'ecocash') {
                paymentData.phone = data.paymentPhone;
                paymentData.customer.phone = data.paymentPhone;
            }
            
            const paymentResult = await paynow.initiateQuickPay(paymentData);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Payment failed');
            }
            
            let displayProvider = data.paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
            
            const totalDisplay = data.currency === 'USD'
                ? `$${data.totalAmount?.toFixed(2)}`
                : `${data.totalAmount?.toLocaleString()} ZiG`;
            
            // ✅ Customize message based on payment method
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
        const { meterNumber, amount, reference, currency } = session.data;
        
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
            tokenUnits,
            paymentPhone
        } = session.data;
        
        try {
            const tokenResult = await hotrecharge.purchaseZesaToken({
                meterNumber: meterNumber,
                amount: amount,
                currency: currency,
                agentReference: `CCHUB-${userId.slice(-4)}-${Date.now()}`,
                userId: userId.split('@')[0].slice(-4),
                notifyNumber: paymentPhone
            });
            
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
                });
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
    async handleReconciliation(userId, session, paymentResult) {
        const data = session.data;
        
        const message = `⚠️ Payment received - token pending

Ref: ${paymentResult.paynowReference || paymentResult.reference}

You'll receive SMS within 30 minutes.`;
        
        await messaging.sendMessage(userId, message);
        
        console.log(`🔴 RECONCILIATION REQUIRED:`, {
            userId,
            meterNumber: data.meterNumber,
            amount: data.amount,
            currency: data.currency,
            paymentReference: paymentResult.reference,
            paynowReference: paymentResult.paynowReference
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
            : `${data.amount} ZiG`;
        
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
⚡ ${data.tokenUnits} kWh
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
}

module.exports = new ZesaService();