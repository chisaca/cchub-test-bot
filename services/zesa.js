// services/zesa.js - FULLY UPDATED with all design cues
// Matches airtime.js design language
// UPDATED: ZESA fee now 3% (no flat fee), fee only shown at confirmation

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const hotrecharge = require('./hotrecharge');
const paynow = require('./paynow');
const { 
    FLOW_STATES, 
    PAYMENT_CONFIG, 
    RESPONSE_MESSAGES, 
    ERROR_MESSAGES 
} = require('../config/constants');

// Payment methods constant - MUST MATCH AIRTIME
const PAYMENT_METHODS = {
    '1': 'ecocash',
    '2': 'onemoney'
};

class ZesaService {
    
    /**
     * Start the ZESA flow
     * Called from main menu
     */
    async startFlow(userId) {
        console.log(`⚡ Starting ZESA flow for ${userId}`);
        
        createSession(userId, 'zesa');
        await this.sendCurrencyPrompt(userId);
        updateSessionStep(userId, 'select_currency', FLOW_STATES.ZESA.SELECT_CURRENCY);
    }
    
    /**
     * Main request handler for ZESA flow
     */
    async handleRequest(userId, message, session) {
        console.log(`⚡ ZESA request from ${userId} at step ${session.step}: "${message}"`);
        console.log(`   📍 Current flow state: ${session.flow}`);
        
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
                console.error(`❌ Invalid flow state for ${userId}: ${session.flow}`);
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
     * Meter verified message - clean, one line
     */
    async sendMeterVerifiedMessage(userId, meterInfo) {
        const message = `✅ Meter verified: ${meterInfo.customerName || 'Registered Customer'}`;
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Step 3: Amount Entry - NO FEE SHOWN HERE
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
        
        // Calculate token units (standard conversion)
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
     * Step 4: Payment Method Selection - EXACT MATCH WITH AIRTIME
     */
    async sendPaymentSelection(userId) {
        await messaging.sendMessage(userId, `💳 *Select payment method*

1 *EcoCash*
2 *OneMoney*

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
        
        updateSessionStep(userId, 'enter_payment_phone', FLOW_STATES.ZESA.ENTER_PAYMENT_PHONE, {
            ...session.data,
            paymentMethod: paymentMethod
        });
        
        await this.sendPaymentPhonePrompt(userId, paymentMethod);
    }
    
    /**
     * Step 5: Payment Phone Entry - EXACT MATCH WITH AIRTIME
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
     * Step 6: Transaction Details & Confirmation - Shows fee here only
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
            
            let displayPaymentMethod = paymentMethod === 'ecocash' ? 'EcoCash' : 'OneMoney';
            
            // Mask meter number (show last 4 digits only)
            const maskedMeter = meterNumber.length > 4 
                ? '****' + meterNumber.slice(-4)
                : meterNumber;
            
            // Mask payment phone
            const maskedPaymentPhone = paymentPhoneDisplay?.length > 4
                ? paymentPhoneDisplay.slice(0, 5) + '****' + paymentPhoneDisplay.slice(-3)
                : paymentPhoneDisplay || 'N/A';
            
            let amountDisplay, totalDisplay, feeDisplay;
            const feePercentage = PAYMENT_CONFIG.ZESA?.SERVICE_FEE_PERCENTAGE 
            ? (PAYMENT_CONFIG.ZESA.SERVICE_FEE_PERCENTAGE * 100).toFixed(0) 
            : '3'; // Fallback to 3%
            
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
    
    /**
     * Step 7: Confirmation with Health Check - EXACT MATCH WITH AIRTIME
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
     * Process payment and purchase ZESA token
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
            const paymentResult = await this.processPayNowPayment(userId, session, reference);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Payment failed');
            }
            
            await messaging.sendMessage(userId, `✅ *Payment confirmed!* Purchasing token...`);
            
            const tokenResult = await hotrecharge.purchaseZesaToken({
                meterNumber: data.meterNumber,
                amount: data.amount,
                currency: currency,
                agentReference: `CCHUB-${Date.now()}`,
                userId: userId.split('@')[0].slice(-4),
                notifyNumber: data.paymentPhone
            });
            
            if (!tokenResult.success) {
                await this.handleReconciliation(userId, session, paymentResult);
                return;
            }
            
            await this.sendReceipt(userId, session, paymentResult, tokenResult);
            deleteSession(userId);
            
            console.log(`✅ ZESA purchase completed for ${userId}: ${data.amount} ${currency} for meter ${data.meterNumber}`);
            
        } catch (error) {
            console.error(`❌ ZESA payment processing error: ${error.message}`);
            
            await messaging.sendMessage(userId,
                `❌ Transaction failed. Type *hi* to start over.`
            );
            
            deleteSession(userId);
        }
    }
    
    /**
     * Process PayNow payment
     */
    async processPayNowPayment(userId, session, reference) {
        const data = session.data;
        const paymentPhone = data.paymentPhone;
        const paymentMethod = data.paymentMethod;
        
        try {
            const paymentResult = await paynow.initiateQuickPay({
                amount: data.totalAmount.toFixed(2),
                reference: reference,
                phone: paymentPhone,
                service: `ZESA (${data.currency}) - Meter ${data.meterNumber.slice(-4)}`,
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
            
            const totalDisplay = data.currency === 'USD'
                ? `$${data.totalAmount?.toFixed(2)}`
                : `${data.totalAmount?.toLocaleString()} ZiG`;
            
            await messaging.sendMessage(userId,
                `💳 *Payment Request*

Amount: ${totalDisplay}
Ref: ${reference}
From: ${paymentPhone.toString().replace('263', '0')}
Provider: ${displayProvider}

${paymentResult.instructions}

⏳ Waiting for payment...`
            );
            
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
                console.log(`⚠️ SIMULATION: Payment bypassed for ${paymentPhone}`);
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
        
        const displayMeter = meterNumber;
        console.log('📦 ZESA session data:', session.data);
        
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
     * Handle reconciliation scenario
     */
    async handleReconciliation(userId, session, paymentResult) {
        const data = session.data;
        const currency = data.currency;
        
        const message = `⚠️ Payment received - token pending

Ref: ${paymentResult.paynowReference || paymentResult.reference}

You'll receive SMS within 30 minutes.`;
        
        await messaging.sendMessage(userId, message);
        
        console.log(`🔴 RECONCILIATION REQUIRED:`, {
            userId,
            meterNumber: data.meterNumber,
            amount: data.amount,
            currency,
            paymentReference: paymentResult.reference,
            paynowReference: paymentResult.paynowReference,
            timestamp: new Date().toISOString()
        });
        
        deleteSession(userId);
    }
    
    /**
     * Send receipt with token - CLEAN, matches airtime style
     */
    async sendReceipt(userId, session, paymentResult, tokenResult) {
        const data = session.data;
        const currency = data.currency;
        
        let amountDisplay = currency === 'USD' 
            ? `$${data.amount.toFixed(2)}` 
            : `${data.amount} ZiG`;
        
        const formattedToken = this.formatToken(tokenResult.token);
        const displayPaymentPhone = data.paymentPhoneDisplay;
        const displayPaymentMethod = data.paymentMethod === 'ecocash' ? 'EcoCash' : 'OneMoney';
        
        // Mask meter number for receipt
        const maskedMeter = data.meterNumber.length > 4 
            ? '****' + data.meterNumber.slice(-4)
            : data.meterNumber;
        
        const message = `✅ ZESA Token Sent!

🔑 ${formattedToken}

📟 Meter: ${maskedMeter}
💰 ${amountDisplay}
⚡ ${data.tokenUnits} kWh
💳 ${displayPaymentMethod} ${displayPaymentPhone?.slice(0,5)}****${displayPaymentPhone?.slice(-3) || ''}
🆔 ${data.reference}

────────────────

Type *hi* for another transaction`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Format ZESA token for readability (xxxxx-xxxxx-xxxxx-xxxxx)
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
     * Validate payment phone - EXACT COPY FROM AIRTIME
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
}

module.exports = new ZesaService();