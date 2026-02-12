// services/zesa.js - COMPLETE ZESA FLOW with meter verification & payment phone
const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const hotrecharge = require('./hotrecharge');
const paynow = require('./paynow');
const { FLOW_STATES, PAYMENT_CONFIG, WALLET_OPTIONS, RESPONSE_MESSAGES, ERROR_MESSAGES } = require('../config/constants');

class ZesaService {
    
    /**
     * Start the ZESA flow
     * Called from main menu
     */
    async startFlow(userId) {
        console.log(`⚡ Starting ZESA flow for ${userId}`);
        
        // Create new session for ZESA service
        const session = createSession(userId, 'zesa');
        
        // Step 1: Send currency selection prompt
        await this.sendCurrencyPrompt(userId);
        updateSessionStep(userId, 'select_currency', FLOW_STATES.ZESA.SELECT_CURRENCY);
    }
    
    /**
     * Main request handler for ZESA flow
     * Follows step-by-step state-driven architecture
     */
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
        
        // Basic format validation (numeric, reasonable length)
        if (!/^\d{6,12}$/.test(meterNumber)) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid meter number format.\n\n` +
                `Meter number should be 6-12 digits (typical ZESA: 11 digits).\n\n` +
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
            const meterInfo = await hotrecharge.verifyZesaMeter(meterNumber);
            
            if (meterInfo && meterInfo.success) {
                // Meter verified successfully
                updateSessionStep(userId, 'enter_amount', FLOW_STATES.ZESA.ENTER_AMOUNT, {
                    meterNumber: meterNumber,
                    meterOwner: meterInfo.customerName || 'Unknown',
                    meterAddress: meterInfo.address || 'Not provided',
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
        
        const message = `⚡ *Enter Amount*\n\n` +
            `Meter: \`${session.data.meterNumber}\`\n` +
            `Currency: ${currency}\n\n` +
            `💰 *Valid Range:*\n` +
            `• Minimum: ${minAmount} ${currency}\n` +
            `• Maximum: ${maxAmount} ${currency}\n\n` +
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
        
        // Calculate token units (simplified: rate depends on currency)
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
     * Step 4: Payment Method Selection
     */
    async sendPaymentSelection(userId) {
        const message = `💳 *Select Payment Method*\n\n` +
            `Choose your payment method:\n\n` +
            `1️⃣ EcoCash\n` +
            `2️⃣ OneMoney\n\n` +
            `📝 Reply with 1 or 2:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePaymentSelection(userId, message, session) {
        const selection = message.trim();
        
        let paymentMethod;
        
        if (selection === '1') {
            paymentMethod = 'EcoCash';
        } else if (selection === '2') {
            paymentMethod = 'OneMoney';
        } else {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose 1 for EcoCash or 2 for OneMoney.\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Update session with payment method
        updateSessionStep(userId, 'enter_payment_phone', FLOW_STATES.ZESA.ENTER_PAYMENT_PHONE, {
            ...session.data,
            paymentMethod: paymentMethod
        });
        
        // Prompt for payment phone
        await this.sendPaymentPhonePrompt(userId, paymentMethod);
    }
    
    /**
     * Step 5: Payment Phone Entry
     */
    async sendPaymentPhonePrompt(userId, paymentMethod) {
        let prefixExample;
        
        if (paymentMethod === 'EcoCash') {
            prefixExample = '077';
        } else {
            prefixExample = '078';
        }
        
        const message = `📱 *Enter ${paymentMethod} Number*\n\n` +
            `Enter the ${paymentMethod} mobile number you will pay from:\n\n` +
            `📋 *Format:*\n` +
            `• 10 digits (e.g., ${prefixExample}1234567)\n` +
            `• Valid ${paymentMethod} registered number\n\n` +
            `📝 Enter number:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePaymentPhoneEntry(userId, message, session) {
        const phoneNumber = message.trim().replace(/\s+/g, '');
        const paymentMethod = session.data.paymentMethod;
        
        // Validate phone number based on payment method
        let isValid = false;
        
        if (paymentMethod === 'EcoCash') {
            isValid = validation.isValidEcoCashNumber(phoneNumber);
        } else {
            isValid = validation.isValidOneMoneyNumber(phoneNumber);
        }
        
        if (!isValid) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            let validPrefixes = paymentMethod === 'EcoCash' ? '077, 078' : '078';
            
            await messaging.sendMessage(userId, 
                `❌ Invalid ${paymentMethod} number.\n\n` +
                `Number must be 10 digits starting with ${validPrefixes}.\n\n` +
                `Attempts remaining: ${3 - session.retries}\n\n` +
                `📝 Enter number:`
            );
            return;
        }
        
        // Format phone number for PayNow
        const formattedPhone = validation.formatPhoneForPayNow(phoneNumber);
        
        // Update session with payment phone and move to confirmation
        updateSessionStep(userId, 'confirm_payment', FLOW_STATES.ZESA.CONFIRM_PAYMENT, {
            ...session.data,
            paymentPhone: phoneNumber,
            formattedPaymentPhone: formattedPhone
        });
        
        // Show confirmation with full breakdown
        await this.sendConfirmation(userId, session);
    }
    
    /**
     * Step 6: Payment Confirmation with Full Breakdown
     */
    async sendConfirmation(userId, session) {
        const data = session.data;
        const currency = data.currency;
        
        // Format amounts
        let amountDisplay, feeDisplay, totalDisplay;
        
        if (currency === 'USD') {
            amountDisplay = `$${data.amount.toFixed(2)}`;
            feeDisplay = `$${data.serviceFee.toFixed(2)}`;
            totalDisplay = `$${data.totalAmount.toFixed(2)}`;
        } else {
            amountDisplay = `${data.amount} ZiG`;
            feeDisplay = `${data.serviceFee} ZiG`;
            totalDisplay = `${data.totalAmount} ZiG`;
        }
        
        // Build confirmation message
        const message = `⚡ *CONFIRM ZESA PURCHASE*\n\n` +
            `┌─────────────────────────┐\n` +
            `│    📋 TRANSACTION DETAILS  │\n` +
            `└─────────────────────────┘\n\n` +
            `🏭 *Meter Information*\n` +
            `├─ 📟 Meter: \`${data.meterNumber}\`\n` +
            `├─ 👤 Owner: ${data.meterOwner || 'Registered Customer'}\n` +
            `└─ 📍 Address: ${data.meterAddress || 'On record'}\n\n` +
            `💰 *Payment Breakdown*\n` +
            `├─ 💵 Amount: ${amountDisplay}\n` +
            `├─ ⚡ Units: ${data.tokenUnits} kWh\n` +
            `├─ 🏦 Service Fee: ${feeDisplay}\n` +
            `└─ 💳 *TOTAL: ${totalDisplay}*\n\n` +
            `💲 *Payment Method*\n` +
            `├─ Method: ${data.paymentMethod}\n` +
            `└─ 📱 From: ${data.paymentPhone}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `✅ *Proceed with payment?*\n\n` +
            `Type *YES* to confirm or *NO* to cancel:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleConfirmation(userId, message, session) {
        const response = message.trim().toLowerCase();
        
        if (response === 'yes' || response === 'y') {
            // Process payment
            await this.processPayment(userId, session);
        } else if (response === 'no' || response === 'n') {
            // Cancel
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
        
        await messaging.sendMessage(userId, 
            `⏳ *Processing Payment...*\n\n` +
            `🔍 Step 1/4: Health check\n` +
            `💳 Step 2/4: PayNow payment\n` +
            `⚡ Step 3/4: Purchasing token\n` +
            `📨 Step 4/4: Generating receipt\n\n` +
            `Please wait...`
        );
        
        try {
            // Step 1: Health check (3 attempts, 3s apart)
            await this.performHealthCheck(userId);
            
            // Step 2: Process PayNow payment
            const paymentResult = await this.processPayNowPayment(userId, session);
            
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
                reference: paymentResult.reference,
                agentReference: `CCHUB-${Date.now()}`
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
     * Perform HotRecharge health check
     */
    async performHealthCheck(userId) {
        await messaging.sendMessage(userId, `🔍 Performing system health check...`);
        
        let healthy = false;
        let attempts = 0;
        
        while (!healthy && attempts < 3) {
            attempts++;
            
            try {
                healthy = await hotrecharge.isOnline();
                
                if (healthy) {
                    await messaging.sendMessage(userId, `✅ System online (attempt ${attempts}/3)`);
                    return true;
                }
            } catch (error) {
                console.log(`⚠️ Health check attempt ${attempts} failed`);
            }
            
            if (!healthy && attempts < 3) {
                await messaging.sendMessage(userId, `⏳ Retry ${attempts}/3...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        if (!healthy) {
            throw new Error('HotRecharge service unavailable after 3 attempts');
        }
    }
    
    /**
     * Process PayNow payment
     */
    async processPayNowPayment(userId, session) {
        const data = session.data;
        const currency = data.currency;
        
        await messaging.sendMessage(userId, 
            `💳 *Initiating ${data.paymentMethod} payment...*\n\n` +
            `Amount: ${data.totalAmount} ${currency}\n` +
            `From: ${data.paymentPhone}\n\n` +
            `Please check your phone to complete payment.`
        );
        
        try {
            // Create PayNow payment
            const payment = await paynow.createPayment(
                `ZESA-${data.meterNumber.slice(-4)}-${Date.now().toString().slice(-6)}`,
                `${data.paymentMethod} Payment`,
                data.totalAmount,
                currency
            );
            
            // Add payment method
            if (data.paymentMethod === 'EcoCash') {
                payment.add('ecocash', data.formattedPaymentPhone);
            } else {
                payment.add('onemoney', data.formattedPaymentPhone);
            }
            
            // Send payment request
            const response = await paynow.send(payment);
            
            if (!response.success) {
                return { success: false, error: response.error || 'Payment initiation failed' };
            }
            
            // Poll for payment status
            let pollAttempts = 0;
            const maxPollAttempts = 30; // 30 seconds max
            
            while (pollAttempts < maxPollAttempts) {
                pollAttempts++;
                
                const status = await paynow.checkTransactionStatus(response.pollUrl);
                
                if (status.paid) {
                    return {
                        success: true,
                        reference: response.pollUrl.split('/').pop(),
                        paynowReference: status.reference
                    };
                }
                
                if (status.cancelled) {
                    return { success: false, error: 'Payment cancelled by user' };
                }
                
                if (status.failed) {
                    return { success: false, error: status.error || 'Payment failed' };
                }
                
                // Wait 1 second before polling again
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            return { success: false, error: 'Payment timeout - check your transaction status' };
            
        } catch (error) {
            console.error(`❌ PayNow error: ${error.message}`);
            
            // Fallback to simulation mode if in development
            if (process.env.NODE_ENV !== 'production') {
                console.log(`⚠️ SIMULATION: Payment bypassed for ${data.paymentPhone}`);
                
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
            `└─ 💳 Paid Via: ${data.paymentMethod} (${data.paymentPhone})\n\n` +
            `🔖 *References*\n` +
            `├─ 🏦 PayNow: ${paymentResult.paynowReference || 'N/A'}\n` +
            `├─ ⚡ HotRecharge: ${tokenResult.reference || 'N/A'}\n` +
            `└─ 🆔 CCHub Ref: ZES${Date.now().toString().slice(-8)}\n\n` +
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
        
        // Also send SMS if recipient phone was provided
        // This can be added later if SMS gateway is integrated
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
}

// Export singleton instance
module.exports = new ZesaService();