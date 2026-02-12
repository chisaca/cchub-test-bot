// services/zesa.js - COMPLETE ZESA FLOW with meter verification & payment phone
// UPDATED to match airtime payment flow EXACTLY
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
        
        // Create new session for ZESA service
        createSession(userId, 'zesa');
        
        // Step 1: Send currency selection prompt
        await this.sendCurrencyPrompt(userId);
        updateSessionStep(userId, 'select_currency', FLOW_STATES.ZESA.SELECT_CURRENCY);
    }
    
    /**
     * Main request handler for ZESA flow
     * Follows step-by-step state-driven architecture
     */
    async handleRequest(userId, message, session) {
        console.log(`⚡ ZESA request from ${userId} at step ${session.step}: "${message}"`);
        console.log(`   📍 Current flow state: ${session.flow}`);
        
        // Route based on current flow state (session.flow, NOT session.flowState)
        switch(session.flow) {
            case FLOW_STATES.ZESA.SELECT_CURRENCY:
                await this.handleCurrencySelection(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.ENTER_METER:
                await this.handleMeterEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.VERIFYING_METER:
                await messaging.sendMessage(userId, 
                    `⏳ Verifying meter number... Please wait.`
                );
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
                console.error(`❌ Invalid flow state for ${userId}: ${session.flow} (type: ${typeof session.flow})`);
                console.log(`   Available ZESA states:`, Object.keys(FLOW_STATES.ZESA));
                
                // Reset session
                deleteSession(userId);
                
                // Inform user
                await messaging.sendMessage(userId, 
                    `⚠️ *Session error*\n\n` +
                    `Your session was in an invalid state.\n\n` +
                    `Type "hi" to start again.`
                );
                
                // Restart flow
                await this.startFlow(userId);
        }
    }
    
    /**
     * Step 1: Currency Selection
     */
    async sendCurrencyPrompt(userId) {
        const message = `⚡ *Buy ZESA Tokens*\n\n` +
            `Select currency:\n\n` +
            `1️⃣ ZiG (50 - 50,000 ZiG)\n` +
            `2️⃣ USD ($1 - $100)\n\n` +
            `📝 Reply with 1 or 2:`;
        
        await messaging.sendMessage(userId, message);
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
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose 1 for ZiG or 2 for USD.\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Update session with currency
        updateSessionStep(userId, 'enter_meter', FLOW_STATES.ZESA.ENTER_METER, {
            currency: currency,
            minAmount: minAmount,
            maxAmount: maxAmount
        });
        
        // Send meter prompt
        await this.sendMeterPrompt(userId, currency);
    }
    
    /**
     * Step 2: Meter Number Entry
     */
    async sendMeterPrompt(userId, currency) {
        const message = `⚡ *Buy ZESA Tokens*\n\n` +
            `Currency: ${currency}\n\n` +
            `Enter your ZESA prepaid meter number:\n\n` +
            `📋 *Format:*\n` +
            `• 11-digit number\n` +
            `• No spaces or special characters\n` +
            `• Found on your meter or receipt\n\n` +
            `📝 Enter meter number now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleMeterEntry(userId, message, session) {
        const meterNumber = message.trim().replace(/\s+/g, '');
        
        // Basic format validation (numeric, 11 digits for ZESA)
        if (!/^\d{11}$/.test(meterNumber)) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid meter number format.\n\n` +
                `ZESA meter number must be exactly 11 digits.\n\n` +
                `Attempts remaining: ${3 - session.retries}\n\n` +
                `📝 Try again:`
            );
            return;
        }
        
        // Update session to verifying state
        updateSessionStep(userId, 'verifying_meter', FLOW_STATES.ZESA.VERIFYING_METER, {
            meterNumber: meterNumber
        });
        
        // Send verification in progress message
        await messaging.sendMessage(userId, 
            `🔍 *Verifying meter number...*\n\n` +
            `Please wait while we validate ${meterNumber} with ZESA...`
        );
        
        // Call HotRecharge to verify meter
        try {
            const meterInfo = await hotrecharge.verifyZesaMeter(meterNumber, session.data.currency);
            
            if (meterInfo && meterInfo.success) {
                // Meter verified successfully
                updateSessionStep(userId, 'enter_amount', FLOW_STATES.ZESA.ENTER_AMOUNT, {
                    ...session.data,
                    meterNumber: meterNumber,
                    meterOwner: meterInfo.customerName || 'Registered Customer',
                    meterAddress: meterInfo.address || 'Address on record',
                    meterStatus: meterInfo.status || 'Active'
                });
                
                // Send success message with meter owner details
                await this.sendMeterVerifiedMessage(userId, meterInfo, session);
                
                // Prompt for amount
                await this.sendAmountPrompt(userId, session);
            } else {
                // Meter verification failed
                const isMaxRetries = incrementRetries(userId);
                
                if (isMaxRetries) {
                    await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                    deleteSession(userId);
                    return;
                }
                
                await messaging.sendMessage(userId, 
                    `❌ *Meter verification failed*\n\n` +
                    `The meter number ${meterNumber} could not be verified.\n\n` +
                    `Possible reasons:\n` +
                    `• Invalid meter number\n` +
                    `• Meter not registered for prepaid\n` +
                    `• ZESA system temporarily unavailable\n\n` +
                    `Attempts remaining: ${3 - session.retries}\n\n` +
                    `📝 Enter a different meter number:`
                );
                
                // Reset to meter entry state
                updateSessionStep(userId, 'enter_meter', FLOW_STATES.ZESA.ENTER_METER, session.data);
            }
        } catch (error) {
            console.error(`❌ HotRecharge meter verification error: ${error.message}`);
            
            // For development/testing - simulate successful verification
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
                }, session);
                
                await this.sendAmountPrompt(userId, session);
                return;
            }
            
            // Production error handling
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `⚠️ *Service temporarily unavailable*\n\n` +
                `Unable to verify meter at this time. Please try again in 5 minutes.\n\n` +
                `Attempts remaining: ${3 - session.retries}\n\n` +
                `📝 Enter meter number or type "menu" to cancel:`
            );
            
            updateSessionStep(userId, 'enter_meter', FLOW_STATES.ZESA.ENTER_METER, session.data);
        }
    }
    
    /**
     * Send beautifully formatted meter verification success message
     */
    async sendMeterVerifiedMessage(userId, meterInfo, session) {
        const meterNumber = session.data.meterNumber;
        const currency = session.data.currency;
        
        const message = `✅ *Meter Verified Successfully!*\n\n` +
            `┌─────────────────────────┐\n` +
            `│   🔋 ZESA METER DETAILS   │\n` +
            `└─────────────────────────┘\n\n` +
            `📟 *Meter Number:* \`${meterNumber}\`\n` +
            `👤 *Customer:* ${meterInfo.customerName || 'Registered Customer'}\n` +
            `📍 *Address:* ${meterInfo.address || 'Address on record'}\n` +
            `⚡ *Status:* ✅ Active\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `💰 *Currency:* ${currency}\n\n` +
            `Ready to purchase tokens for this meter.`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Step 3: Amount Entry
     */
    async sendAmountPrompt(userId, session) {
        const currency = session.data.currency;
        const minAmount = session.data.minAmount;
        const maxAmount = session.data.maxAmount;
        
        // Service fee info
        let serviceFee = 0;
        let serviceFeeText = '';
        
        if (currency === 'ZiG') {
            serviceFee = PAYMENT_CONFIG.ZESA.SERVICE_FEE_ZIG;
            serviceFeeText = `${serviceFee} ZiG`;
        } else {
            serviceFee = PAYMENT_CONFIG.ZESA.SERVICE_FEE_USD;
            serviceFeeText = `$${serviceFee}`;
        }
        
        // Common amounts based on currency
        let commonAmounts = '';
        if (currency === 'ZiG') {
            commonAmounts = `• 100 ZiG\n• 200 ZiG\n• 500 ZiG\n• 1000 ZiG`;
        } else {
            commonAmounts = `• $5\n• $10\n• $20\n• $50`;
        }
        
        const message = `⚡ *Enter Amount*\n\n` +
            `Meter: \`${session.data.meterNumber}\`\n` +
            `Currency: ${currency}\n\n` +
            `💰 *Valid Range:*\n` +
            `• Minimum: ${minAmount} ${currency}\n` +
            `• Maximum: ${maxAmount} ${currency}\n\n` +
            `💡 *Common amounts:*\n${commonAmounts}\n\n` +
            `💵 *Service Fee:* ${serviceFeeText}\n` +
            `(Included in total)\n\n` +
            `📝 Enter amount:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const amount = parseFloat(amountText);
        
        const currency = session.data.currency;
        const minAmount = session.data.minAmount;
        const maxAmount = session.data.maxAmount;
        
        // Calculate service fee and total
        let serviceFee, totalAmount;
        
        if (currency === 'ZiG') {
            serviceFee = PAYMENT_CONFIG.ZESA.SERVICE_FEE_ZIG;
        } else {
            serviceFee = PAYMENT_CONFIG.ZESA.SERVICE_FEE_USD;
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
                `❌ Invalid amount.\n\n` +
                `Amount must be between ${minAmount} and ${maxAmount} ${currency}.\n\n` +
                `Attempts remaining: ${3 - session.retries}\n\n` +
                `📝 Enter amount:`
            );
            return;
        }
        
        // Calculate token units
        let tokenUnits;
        if (currency === 'ZiG') {
            tokenUnits = Math.floor(amount * 0.8); // 1 ZiG = 0.8 units (example rate)
        } else {
            tokenUnits = Math.floor(amount * 10); // $1 = 10 units
        }
        
        totalAmount = amount + serviceFee;
        
        // Update session with amount details
        updateSessionStep(userId, 'select_payment', FLOW_STATES.ZESA.SELECT_PAYMENT, {
            ...session.data,
            amount: amount,
            tokenUnits: tokenUnits,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Show payment method selection
        await this.sendPaymentSelection(userId);
    }
    
    /**
     * Step 4: Payment Method Selection - EXACT MATCH WITH AIRTIME
     */
    async sendPaymentSelection(userId) {
        const message = `💳 *Payment Method*\n\n` +
            `How would you like to pay?\n\n` +
            `1️⃣ *EcoCash* (077, 078 numbers)\n` +
            `2️⃣ *OneMoney* (071 numbers)\n\n` +
            `📝 Reply with number (1-2):`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePaymentSelection(userId, message, session) {
        const selection = message.trim();
        
        // ✅ USE PAYMENT_METHODS constant like airtime
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
        
        // ✅ Store as 'ecocash' or 'onemoney' - NOT 'EcoCash' or 'OneMoney'
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
    
    // ✅ Validate phone number
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
    
    const formattedPaymentPhone = validationResult.formatted; // 26377xxxxxxx
    const displayPaymentPhone = validationResult.display || '0' + formattedPaymentPhone.substring(3); // 077xxxxxxx
    
    // ✅ IMPORTANT: Store BOTH formats in session
    const updatedSession = updateSessionStep(userId, 'confirm_payment', FLOW_STATES.ZESA.CONFIRM_PAYMENT, {
        ...session.data,
        paymentPhone: formattedPaymentPhone,      // For PayNow API (263 format)
        paymentPhoneDisplay: displayPaymentPhone, // For user display (0 format)
        paymentProvider: paymentMethod
    });
    
    // ✅ Show full breakdown with phone number
    await this.showTransactionDetails(userId, updatedSession || session);
}
    
    /**
     * Step 6: Transaction Details & Confirmation - EXACT MATCH WITH AIRTIME
     */
    async showTransactionDetails(userId, session) {
    try {
        const { 
            amount, 
            serviceFee, 
            totalAmount, 
            meterNumber,
            meterOwner,
            meterAddress,
            paymentPhoneDisplay,  // ✅ Use display format
            paymentMethod,
            currency,
            tokenUnits
        } = session.data;
        
        const displayMeter = meterNumber || 'N/A';
        const displayOwner = meterOwner || 'Registered Customer';
        const displayAddress = meterAddress || 'Address on record';
        
        // ✅ Use the display phone number
        const displayPaymentPhone = paymentPhoneDisplay || 'N/A';
        
        let displayPaymentMethod = 'PayNow';
        if (paymentMethod === 'ecocash') displayPaymentMethod = 'EcoCash';
        if (paymentMethod === 'onemoney') displayPaymentMethod = 'OneMoney';
        
        // Format amounts based on currency
        let amountDisplay, feeDisplay, totalDisplay;
        
        if (currency === 'USD') {
            amountDisplay = `$${amount?.toFixed(2)}`;
            feeDisplay = `$${serviceFee?.toFixed(2)}`;
            totalDisplay = `$${totalAmount?.toFixed(2)}`;
        } else {
            amountDisplay = `${amount?.toLocaleString()} ZiG`;
            feeDisplay = `${serviceFee?.toLocaleString()} ZiG`;
            totalDisplay = `${totalAmount?.toLocaleString()} ZiG`;
        }
        
        const message = `⚡ *ZESA Transaction Details*\n\n` +
            `┌─────────────────────────┐\n` +
            `│   📋 TRANSACTION DETAILS  │\n` +
            `└─────────────────────────┘\n\n` +
            `🏭 *Meter Information*\n` +
            `├─ 📟 Meter: \`${displayMeter}\`\n` +
            `├─ 👤 Owner: ${displayOwner}\n` +
            `└─ 📍 Address: ${displayAddress}\n\n` +
            `💰 *Payment Breakdown*\n` +
            `├─ 💵 Amount: ${amountDisplay}\n` +
            `├─ ⚡ Units: ${tokenUnits} kWh\n` +
            `├─ 🏦 Service Fee: ${feeDisplay}\n` +
            `└─ 💳 *TOTAL: ${totalDisplay}*\n\n` +
            `💲 *Payment Method*\n` +
            `├─ Method: ${displayPaymentMethod}\n` +
            `└─ 📱 From: *${displayPaymentPhone}*\n\n` +  // ✅ Bold and visible
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `✅ *Proceed with payment?*\n\n` +
            `Type *YES* to confirm or *NO* to cancel:`;
        
        await messaging.sendMessage(userId, message);
        
    } catch (error) {
        console.error(`❌ Error in showTransactionDetails:`, error.message);
        await messaging.sendMessage(userId,
            `Proceed with payment? (Yes/No)`
        );
    }
}
    
    /**
     * Step 7: Confirmation with Health Check - EXACT MATCH WITH AIRTIME
     */
    async handleConfirmation(userId, message, session) {
        const response = message.trim().toLowerCase();
        
        if (response === 'yes' || response === 'y') {
            console.log(`✅ User confirmed ZESA payment`);
            
            // 🚨 1. CHECK HOTRECHARGE HEALTH FIRST - BEFORE PAYNOW
            try {
                console.log('🔌 [HEALTH] Checking HotRecharge API status...');
                
                let isOnline = false;
                let healthAttempts = 0;
                const maxHealthAttempts = 3;
                const healthRetryDelay = 3000; // 3 seconds
                
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
                    } else {
                        console.warn(`⚠️ [HEALTH] HotRecharge is OFFLINE (attempt ${healthAttempts}/${maxHealthAttempts})`);
                    }
                }
                
                if (!isOnline) {
                    console.error('❌ [HEALTH] HotRecharge is OFFLINE - blocking payment');
                    await messaging.sendMessage(userId,
                        `⚠️ *Service Temporarily Unavailable*\n\n` +
                        `Our ZESA provider is currently undergoing maintenance.\n\n` +
                        `⏳ We tried connecting 3 times but got no response.\n\n` +
                        `🔄 Please try again in 5 minutes.\n\n` +
                        `We apologise for the inconvenience.`
                    );
                    deleteSession(userId);
                    return; // 🛑 STOP - No PayNow, no payment
                }
                
            } catch (error) {
                console.error('❌ [HEALTH] Health check failed:', error.message);
                await messaging.sendMessage(userId,
                    `⚠️ *Service Unavailable*\n\n` +
                    `Unable to verify ZESA provider status.\n\n` +
                    `⏳ Please try again in a few minutes.\n\n` +
                    `We apologise for the inconvenience.`
                );
                deleteSession(userId);
                return; // 🛑 STOP - No PayNow, no payment
            }
            
            // ✅ 2. ONLY PROCEED TO PAYNOW IF HOTRECHARGE IS ONLINE
            await this.processPayment(userId, session);
            
        } else if (response === 'no' || response === 'n') {
            await messaging.sendMessage(userId, 
                `❌ *ZESA purchase cancelled*\n\n` +
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
     * Process payment and purchase ZESA token
     */
    async processPayment(userId, session) {
        const data = session.data;
        const currency = data.currency;
        const reference = `ZES${Date.now().toString().slice(-8)}`;
        
        // Save reference to session immediately
        updateSessionStep(userId, 'processing_payment', 'processing_payment', {
            ...session.data,
            reference: reference,
            paymentInitiated: true
        });
        
        await messaging.sendMessage(userId, 
            `⏳ *Connecting to PayNow...*`
        );
        
        try {
            // Step 2: Process PayNow payment
            const paymentResult = await this.processPayNowPayment(userId, session, reference);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Payment failed');
            }
            
            // Step 3: Purchase token from HotRecharge
            await messaging.sendMessage(userId, 
                `✅ *Payment Confirmed!*\n\n` +
                `⚡ Purchasing ZESA token for meter ${data.meterNumber}...`
            );
            
            const tokenResult = await hotrecharge.purchaseZesaToken({
                meterNumber: data.meterNumber,
                amount: data.amount,
                currency: currency,
                agentReference: `CCHUB-${Date.now()}`,
                userId: userId.split('@')[0].slice(-4),
                notifyNumber: data.paymentPhone
            });
            
            if (!tokenResult.success) {
                // Payment succeeded but token purchase failed - needs reconciliation
                await this.handleReconciliation(userId, session, paymentResult);
                return;
            }
            
            // Step 4: Send receipt with token
            await this.sendReceipt(userId, session, paymentResult, tokenResult);
            
            // Clear session
            deleteSession(userId);
            
            console.log(`✅ ZESA purchase completed for ${userId}: ${data.amount} ${currency} for meter ${data.meterNumber}`);
            
        } catch (error) {
            console.error(`❌ ZESA payment processing error: ${error.message}`);
            
            await messaging.sendMessage(userId, 
                `❌ *Transaction Failed*\n\n` +
                `Sorry, we couldn't complete your ZESA purchase.\n\n` +
                `Error: ${error.message || 'Unknown error'}\n\n` +
                `Please try again in a few minutes.\n\n` +
                `Type "hi" to start over.`
            );
            
            deleteSession(userId);
        }
    }
    
    /**
     * Process PayNow payment
     */
    async processPayNowPayment(userId, session, reference) {
        const data = session.data;
        const currency = data.currency;
        const paymentPhone = data.paymentPhone;
        const paymentMethod = data.paymentMethod;
        
        await messaging.sendMessage(userId, 
            `💳 *Initiating ${paymentMethod === 'ecocash' ? 'EcoCash' : 'OneMoney'} payment...*\n\n` +
            `Amount: ${data.totalAmount} ${currency}\n` +
            `From: ${paymentPhone.toString().replace('263', '0')}\n\n` +
            `Please check your phone to complete payment.`
        );
        
        try {
            // PayNow always processes in USD for now
            const paymentResult = await paynow.initiateQuickPay({
                amount: data.totalAmount.toFixed(2),
                reference: reference,
                phone: paymentPhone,
                service: `ZESA (${currency}) - Meter ${data.meterNumber.slice(-4)}`,
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
            
            const totalDisplay = currency === 'USD'
                ? `$${data.totalAmount?.toFixed(2)}`
                : `${data.totalAmount?.toLocaleString()} ZiG`;
            
            await messaging.sendMessage(userId,
                `💳 *Payment Instructions*\n\n` +
                `✅ *Payment Request Created*\n\n` +
                `📋 *Details:*\n` +
                `• Amount: ${totalDisplay}\n` +
                `• Reference: ${reference}\n` +
                `• Payment Number: ${paymentPhone.toString().replace('263', '0')}\n` +
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
            
            return {
                success: true,
                reference: reference,
                paynowReference: paymentResult.pollUrl?.split('/').pop() || reference
            };
            
        } catch (error) {
            console.error(`❌ PayNow error: ${error.message}`);
            
            // Fallback to simulation mode if in development
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
                    `⏰ *Payment Timeout*\n\n` +
                    `Reference: ${reference}\n\n` +
                    `Type "hi" to try again.`
                );
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynow.checkPaymentStatus(pollUrl);
                
                console.log('🔍 Payment status:', status);
                console.log('✅ status.paid?:', status.paid);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    console.log('💰 PAYMENT CONFIRMED - Calling HotRecharge NOW!');
                    await this.fulfillZesaPurchase(userId, session, status);
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
     * Fulfill ZESA purchase via HotRecharge
     */
    async fulfillZesaPurchase(userId, session, paymentStatus) {
        const { 
            meterNumber, 
            amount, 
            serviceFee, 
            totalAmount, 
            reference,
            currency,
            tokenUnits,
            paymentPhone
        } = session.data;
        
        const displayMeter = meterNumber;
        console.log('📦 ZESA session data:', session.data);
        
        try {
            await messaging.sendMessage(userId,
                `✅ *Payment Confirmed!*\n\n` +
                `💰 *Purchasing ZESA token via HotRecharge...*\n\n` +
                `• Amount: ${currency === 'USD' ? `$${amount.toFixed(2)}` : `${amount.toLocaleString()} ZiG`}\n` +
                `• Meter: ${displayMeter}\n` +
                `• Units: ${tokenUnits} kWh\n\n` +
                `⏳ *Processing...*`
            );
            
            console.log(`🔌 [HOTRECHARGE] Calling ZESA purchase API:`, {
                meter: meterNumber,
                amount: amount,
                currency: currency,
                reference: reference
            });
            
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
                `❌ *Fulfillment Error*\n\n` +
                `✅ *Payment successful* but ZESA token failed.\n\n` +
                `*Reference:* ${reference}\n\n` +
                `🛠️ Our team has been notified. You will receive your token within 15 minutes.\n\n` +
                `Type "hi" for another transaction.`
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
     * Handle reconciliation scenario (payment succeeded but token purchase failed)
     */
    async handleReconciliation(userId, session, paymentResult) {
        const data = session.data;
        const currency = data.currency;
        
        const message = `⚠️ *Payment Received - Token Pending*\n\n` +
            `Your payment of ${data.totalAmount} ${currency} was successful.\n\n` +
            `However, we're experiencing a delay with ZESA token generation.\n\n` +
            `📋 *Transaction Reference:*\n` +
            `PayNow: ${paymentResult.paynowReference || paymentResult.reference}\n\n` +
            `🔧 *What happens next:*\n` +
            `1. Your transaction has been logged\n` +
            `2. Our system will retry token purchase\n` +
            `3. You'll receive SMS with token within 30 minutes\n\n` +
            `📞 *Need help?*\n` +
            `Contact support with the reference above.`;
        
        await messaging.sendMessage(userId, message);
        
        // Log for manual reconciliation
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
     * Send successful receipt with token
     */
    async sendReceipt(userId, session, paymentResult, tokenResult) {
    const data = session.data;
    const currency = data.currency;
    
    // Format amounts
    let amountDisplay, totalDisplay;
    
    if (currency === 'USD') {
        amountDisplay = `$${data.amount.toFixed(2)}`;
        totalDisplay = `$${data.totalAmount.toFixed(2)}`;
    } else {
        amountDisplay = `${data.amount} ZiG`;
        totalDisplay = `${data.totalAmount} ZiG`;
    }
    
    // Format token for display
    const formattedToken = this.formatToken(tokenResult.token);
    
    // ✅ Use display phone number
    const displayPaymentPhone = data.paymentPhoneDisplay || data.paymentPhone?.toString().replace('263', '0') || 'N/A';
    const displayPaymentMethod = data.paymentMethod === 'ecocash' ? 'EcoCash' : 'OneMoney';
    
    const message = `✅ *ZESA TOKEN PURCHASE SUCCESSFUL!*\n\n` +
        `┌─────────────────────────┐\n` +
        `│   ⚡ OFFICIAL RECEIPT    │\n` +
        `└─────────────────────────┘\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔑 *YOUR ZESA TOKEN*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `\`${formattedToken}\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📋 *Transaction Details*\n` +
        `├─ 📟 Meter: \`${data.meterNumber}\`\n` +
        `├─ 👤 Owner: ${data.meterOwner || 'Registered Customer'}\n` +
        `├─ 💵 Amount: ${amountDisplay}\n` +
        `├─ ⚡ Units: ${data.tokenUnits} kWh\n` +
        `├─ 💰 Total Paid: ${totalDisplay}\n` +
        `└─ 💳 Paid Via: ${displayPaymentMethod} (*${displayPaymentPhone}*)\n\n` +  // ✅ Phone shown here
        `🔖 *References*\n` +
        `├─ 🏦 PayNow: ${paymentResult.paynowReference || 'N/A'}\n` +
        `├─ ⚡ HotRecharge: ${tokenResult.reference || 'N/A'}\n` +
        `└─ 🆔 CCHub Ref: ${data.reference || `ZES${Date.now().toString().slice(-8)}`}\n\n` +
        `📅 ${new Date().toLocaleString()}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💡 *How to use your token:*\n` +
        `1️⃣ Press blue button on meter\n` +
        `2️⃣ Key in token number\n` +
        `3️⃣ Press Enter/OK\n` +
        `4️⃣ Wait for "ACCEPTED" message\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Type *hi* for another transaction or *menu* for main menu.`;
    
    await messaging.sendMessage(userId, message);
}
    
    /**
     * Format ZESA token for readability (xxxxx-xxxxx-xxxxx-xxxxx)
     */
    formatToken(token) {
        if (!token) return 'N/A';
        
        // Remove any existing formatting
        const cleanToken = token.replace(/[^0-9A-F]/gi, '');
        
        // Format as 5-5-5-5
        if (cleanToken.length >= 20) {
            return `${cleanToken.substr(0,5)}-${cleanToken.substr(5,5)}-${cleanToken.substr(10,5)}-${cleanToken.substr(15,5)}`;
        }
        
        // Return as is if can't format
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
        formatted = '263' + digits.substring(1); // 26377xxxxxx
        display = digits; // 077xxxxxxx
    } else if (digits.length === 12 && digits.startsWith('263')) {
        formatted = digits; // 26377xxxxxx
        display = '0' + digits.substring(3); // 077xxxxxxx
    } else if (digits.length === 9 && !digits.startsWith('0')) {
        formatted = '263' + digits; // 26377xxxxxx
        display = '0' + digits; // 077xxxxxxx
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
            return { 
                valid: true, 
                formatted, 
                display, 
                error: null 
            };
        } else {
            return { 
                valid: false, 
                formatted: null, 
                display: null, 
                error: 'This is not an EcoCash number. EcoCash uses 077 and 078 prefixes.' 
            };
        }
    } else if (paymentMethod === 'onemoney') {
        if (formatted.startsWith('26371')) {
            return { 
                valid: true, 
                formatted, 
                display, 
                error: null 
            };
        } else {
            return { 
                valid: false, 
                formatted: null, 
                display: null, 
                error: 'This is not a OneMoney number. OneMoney uses 071 prefixes.' 
            };
        }
    }
    
    return { 
        valid: false, 
        formatted: null, 
        display: null, 
        error: 'Invalid payment method' 
    };
}
}

// Export singleton instance
module.exports = new ZesaService();
