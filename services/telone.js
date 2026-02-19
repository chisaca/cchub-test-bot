// services/telone.js
// TelOne Bundle Purchase Flow Handler
// Supports 4 services: Voice (30), Broadband (31), LTE (32), VoIP (33)

const { 
    PAYMENT_CONFIG, 
    FLOW_STATES, 
    BILLERS,
    VALIDATION_CONFIG,
    PAYMENT_METHODS,
    UI_MESSAGES,
    ERROR_MESSAGES,
    MESSAGING_CONFIG
} = require('../config/constants');
const paynowService = require('./paynow');
const { formatPhoneNumber, validatePhoneNumber } = require('../utils/validation');
const { sendMessage } = require('../utils/messaging');

// Get TelOne config
const TELONE_CONFIG = BILLERS['2'];

class TelOneService {
    constructor(hotrecharge) {
        this.hotrecharge = hotrecharge;
        this.serviceName = 'TelOne';
        this.feePercentage = TELONE_CONFIG.fee;
        this.minAmount = TELONE_CONFIG.minAmount;
        this.maxAmount = TELONE_CONFIG.maxAmount;
        this.currency = TELONE_CONFIG.currency;
        
        // Product mapping from constants
        this.PRODUCTS = TELONE_CONFIG.services;
    }

    /**
     * Get the appropriate HotRecharge service
     * TelOne only uses ZiG
     */
    getHotRechargeService() {
        return this.hotrecharge.telone.zig;
    }

    /**
     * Handle incoming messages for TelOne flow
     */
    async handleMessage(userId, messageText, session) {
        // Check if user wants to cancel or go back
        if (messageText.toLowerCase() === '0' || messageText.toLowerCase() === 'cancel') {
            return {
                session: null,
                message: MESSAGING_CONFIG.WELCOME_MESSAGE
            };
        }

        // Route based on current step
        switch (session.step) {
            case 'START':
            case FLOW_STATES.BILL_PAYMENT.ENTER_ACCOUNT:
                return await this.handleAccountInput(userId, messageText, session);
                
            case FLOW_STATES.BILL_PAYMENT.SELECT_BILLER: // Using as service selection
                return await this.handleServiceSelection(userId, messageText, session);
                
            case FLOW_STATES.BILL_PAYMENT.ENTER_AMOUNT:
                return await this.handleAmountInput(userId, messageText, session);
                
            case FLOW_STATES.BILL_PAYMENT.SELECT_PAYMENT:
                return await this.handlePaymentMethod(userId, messageText, session);
                
            case FLOW_STATES.BILL_PAYMENT.ENTER_PAYMENT_PHONE:
                return await this.handlePaymentPhone(userId, messageText, session);
                
            case FLOW_STATES.BILL_PAYMENT.ENTER_NOTIFY_PHONE:
                return await this.handleNotifyPhone(userId, messageText, session);
                
            case FLOW_STATES.BILL_PAYMENT.CONFIRM_PAYMENT:
                return await this.handleConfirmation(userId, messageText, session);
                
            case 'AWAITING_INNBUCKS':
                return await this.handleInnBucksCallback(userId, session, messageText);
                
            default:
                return {
                    session: null,
                    message: MESSAGING_CONFIG.WELCOME_MESSAGE
                };
        }
    }

    /**
     * Handle account number input
     */
    async handleAccountInput(userId, messageText, session) {
        const accountNumber = messageText.trim();
        
        // Validate account format (8 digits)
        if (!/^\d{8}$/.test(accountNumber)) {
            session.retries = (session.retries || 0) + 1;
            
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            
            return {
                session,
                message: `❌ *Invalid Account Number*\n\nTelOne account number must be 8 digits.\n\nYou sent: *${accountNumber}*\n\nPlease try again:`
            };
        }

        // Update session
        session.data.accountNumber = accountNumber;
        session.step = FLOW_STATES.BILL_PAYMENT.SELECT_BILLER; // Using as service selection
        session.retries = 0;

        // Show service selection menu
        const serviceMenu = UI_MESSAGES.BILLS.TELONE.SERVICE_PROMPT;

        return {
            session,
            message: serviceMenu
        };
    }

    /**
     * Handle service/product selection
     */
    async handleServiceSelection(userId, messageText, session) {
        const selection = messageText.trim();
        
        // Validate selection (1-4)
        if (!['1', '2', '3', '4'].includes(selection)) {
            session.retries = (session.retries || 0) + 1;
            
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            
            return {
                session,
                message: `❌ *Invalid Selection*\n\nPlease reply with *1*, *2*, *3*, or *4* to select a service.`
            };
        }

        const selectedProduct = this.PRODUCTS[selection];
        
        // Update session
        session.data.productId = selectedProduct.id;
        session.data.productName = selectedProduct.name;
        session.data.productEmoji = selectedProduct.emoji;
        session.step = FLOW_STATES.BILL_PAYMENT.ENTER_AMOUNT;
        session.retries = 0;

        // Build amount prompt with service-specific emoji
        const amountPrompt = `💰 *TelOne ${selectedProduct.emoji} ${selectedProduct.name}*\n\n` +
            `Enter amount in *ZiG*\n` +
            `Min: *${this.minAmount} ZiG* | Max: *${this.maxAmount.toLocaleString()} ZiG*\n\n` +
            `────────────────\n` +
            `Reply with the amount:`;

        return {
            session,
            message: amountPrompt
        };
    }

    /**
     * Handle amount input
     */
    async handleAmountInput(userId, messageText, session) {
        // Remove any commas and trim
        const cleanAmount = messageText.trim().replace(/,/g, '');
        const amount = parseFloat(cleanAmount);
        
        // Validate amount is a number
        if (isNaN(amount)) {
            session.retries = (session.retries || 0) + 1;
            
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            
            return {
                session,
                message: `❌ *Invalid Amount*\n\nPlease enter a valid number.\n\nExample: *50* or *100.50*\n\nTry again:`
            };
        }

        // Validate amount range
        if (amount < this.minAmount || amount > this.maxAmount) {
            session.retries = (session.retries || 0) + 1;
            
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            
            return {
                session,
                message: `❌ *Invalid Amount*\n\nAmount must be *${this.minAmount} - ${this.maxAmount.toLocaleString()} ZiG*.\n\nYou entered: *${messageText}*\n\nPlease try again:`
            };
        }

        // Calculate fees (8%)
        const feeAmount = Math.round(amount * this.feePercentage * 100) / 100;
        const totalAmount = Math.round((amount + feeAmount) * 100) / 100;

        // Update session
        session.data.amount = amount;
        session.data.feeAmount = feeAmount;
        session.data.totalAmount = totalAmount;
        session.step = FLOW_STATES.BILL_PAYMENT.SELECT_PAYMENT;
        session.retries = 0;

        // Show payment method prompt with fee breakdown
        const paymentPrompt = `💳 *Payment Method*\n\n` +
            `Bundle Amount: *${amount.toLocaleString()} ZiG*\n` +
            `Fee (8%): *${feeAmount.toLocaleString()} ZiG*\n` +
            `────────────────\n` +
            `*Total: ${totalAmount.toLocaleString()} ZiG*\n` +
            `────────────────\n\n` +
            `1️⃣ EcoCash\n` +
            `2️⃣ InnBucks\n\n` +
            `────────────────\n` +
            `Reply with *1* or *2*`;

        return {
            session,
            message: paymentPrompt
        };
    }

    /**
     * Handle payment method selection
     */
    async handlePaymentMethod(userId, messageText, session) {
        if (!['1', '2'].includes(messageText)) {
            session.retries = (session.retries || 0) + 1;
            
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            
            return {
                session,
                message: `❌ *Invalid Selection*\n\nPlease reply with *1* for EcoCash or *2* for InnBucks.`
            };
        }

        const paymentMethod = messageText === '1' ? 'ecocash' : 'innbucks';
        
        // Update session
        session.data.paymentMethod = paymentMethod;
        
        if (paymentMethod === 'ecocash') {
            // EcoCash requires payment phone
            session.step = FLOW_STATES.BILL_PAYMENT.ENTER_PAYMENT_PHONE;
            session.retries = 0;
            
            return {
                session,
                message: `📱 *EcoCash Number*\n\nEnter the phone number registered with EcoCash:\n\nExample: *0771234567* or *263771234567*`
            };
        } else {
            // InnBucks doesn't require payment phone
            session.step = FLOW_STATES.BILL_PAYMENT.ENTER_NOTIFY_PHONE;
            session.retries = 0;
            
            return {
                session,
                message: `📲 *Notification Number*\n\nEnter phone number to receive confirmation:\n\nExample: *0771234567* or *263771234567*`
            };
        }
    }

    /**
     * Handle payment phone input (for EcoCash)
     */
    async handlePaymentPhone(userId, messageText, session) {
        const paymentPhone = formatPhoneNumber(messageText.trim());
        
        if (!validatePhoneNumber(paymentPhone)) {
            session.retries = (session.retries || 0) + 1;
            
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            
            return {
                session,
                message: `❌ *Invalid Phone Number*\n\nPlease enter a valid Zimbabwe number:\nExample: *0771234567* or *263771234567*`
            };
        }

        // Check if payment phone is EcoCash compatible (Econet number)
        const isEconet = paymentPhone.startsWith('26377') || paymentPhone.startsWith('077');
        if (!isEconet) {
            session.retries = (session.retries || 0) + 1;
            
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            
            return {
                session,
                message: `❌ *Invalid EcoCash Number*\n\nEcoCash requires an Econet number (*077* or *078*).\n\nYou entered: *${messageText}*\n\nPlease try again:`
            };
        }

        // Update session
        session.data.paymentPhone = paymentPhone;
        session.step = FLOW_STATES.BILL_PAYMENT.ENTER_NOTIFY_PHONE;
        session.retries = 0;

        return {
            session,
            message: `📲 *Notification Number*\n\nEnter phone number to receive confirmation:\n\nExample: *0771234567* or *263771234567*`
        };
    }

    /**
     * Handle notification phone input
     */
    async handleNotifyPhone(userId, messageText, session) {
        const notifyPhone = formatPhoneNumber(messageText.trim());
        
        if (!validatePhoneNumber(notifyPhone)) {
            session.retries = (session.retries || 0) + 1;
            
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            
            return {
                session,
                message: `❌ *Invalid Phone Number*\n\nPlease enter a valid Zimbabwe number:\nExample: *0771234567* or *263771234567*`
            };
        }

        // Update session
        session.data.notifyNumber = notifyPhone;
        session.step = FLOW_STATES.BILL_PAYMENT.CONFIRM_PAYMENT;
        session.retries = 0;

        // Build confirmation message using UI_MESSAGES
        const confirmMessage = UI_MESSAGES.BILLS.TELONE.CONFIRMATION(
            session.data.accountNumber,
            session.data.productName,
            session.data.amount,
            session.data.feeAmount,
            session.data.totalAmount,
            session.data.paymentMethod,
            session.data.paymentPhone,
            notifyPhone
        );

        return {
            session,
            message: confirmMessage
        };
    }

    /**
     * Handle confirmation response
     */
    async handleConfirmation(userId, messageText, session) {
        if (messageText === '1') {
            // User confirmed - process payment
            session.step = FLOW_STATES.BILL_PAYMENT.PROCESSING;
            
            // Send processing message
            await sendMessage(userId, UI_MESSAGES.BILLS.TELONE.PROCESSING);
            
            // Process the payment and purchase
            return await this.processPayment(userId, session);
            
        } else if (messageText === '2') {
            // User cancelled
            return {
                session: null,
                message: `❌ *Purchase Cancelled*\n\n${MESSAGING_CONFIG.WELCOME_MESSAGE}`
            };
        } else {
            session.retries = (session.retries || 0) + 1;
            
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            
            return {
                session,
                message: `❌ *Invalid Option*\n\nPlease reply with *1* to confirm or *2* to cancel.`
            };
        }
    }

    /**
     * Process payment and TelOne purchase
     */
    async processPayment(userId, session) {
        const { 
            accountNumber, 
            productId,
            productName,
            amount, 
            totalAmount, 
            paymentMethod, 
            paymentPhone, 
            notifyNumber 
        } = session.data;

        try {
            // Generate unique reference
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 1000);
            const reference = `TEL${timestamp}${random}`.slice(0, 20);

            // Initialize payment with PayNow
            const paymentResult = await paynowService.initiatePayment({
                amount: totalAmount,
                reference: reference,
                paymentMethod: paymentMethod,
                phone: paymentPhone,
                description: `TelOne ${productName} Bundle - Account: ${accountNumber}`,
                email: process.env.MERCHANT_EMAIL || 'cchisango@cchub.co.zw'
            });

            if (!paymentResult.success) {
                console.error('[TelOne] Payment initiation failed:', paymentResult.error);
                return {
                    session: null,
                    message: `❌ *Payment Failed*\n\n${paymentResult.error || 'Could not initiate payment. Please try again.'}`
                };
            }

            // Store PayNow reference in session
            session.data.paynowReference = paymentResult.reference || reference;
            session.data.pollUrl = paymentResult.pollUrl;

            // Handle based on payment method
            if (paymentMethod === 'ecocash') {
                // For EcoCash, send instructions and poll
                await sendMessage(userId, paymentResult.instructions);
                
                // Poll for payment confirmation
                const pollResult = await paynowService.pollForPayment(paymentResult.pollUrl, userId);
                
                if (!pollResult.success) {
                    console.error('[TelOne] Payment polling failed:', pollResult.error);
                    return {
                        session: null,
                        message: `❌ *Payment Failed*\n\n${pollResult.error || 'Payment was not completed.'}`
                    };
                }

                // Payment confirmed - process TelOne purchase
                return await this.processTelOnePurchase(userId, session);
                
            } else {
                // InnBucks - show auth code and instructions
                await sendMessage(userId, paymentResult.instructions);
                
                // For InnBucks, we need to wait for user to complete payment
                // Return session to await callback
                return {
                    session: {
                        ...session,
                        step: 'AWAITING_INNBUCKS',
                        data: session.data
                    },
                    message: null // Already sent instructions
                };
            }

        } catch (error) {
            console.error('[TelOne] Payment processing error:', error);
            return {
                session: null,
                message: `❌ *System Error*\n\nAn unexpected error occurred. Please try again or contact support.`
            };
        }
    }

    /**
     * Process TelOne purchase after payment confirmed
     */
    async processTelOnePurchase(userId, session) {
        const { 
            accountNumber, 
            productId,
            productName,
            amount, 
            totalAmount,
            notifyNumber,
            paynowReference 
        } = session.data;

        try {
            // Get HotRecharge service
            const hotService = this.getHotRechargeService();
            
            // Check balance first
            const balanceCheck = await hotService.checkBalance();
            if (!balanceCheck.success) {
                console.error('[TelOne] Balance check failed:', balanceCheck.error);
                // Continue anyway - let the API handle it
            } else if (balanceCheck.balance < totalAmount) {
                return {
                    session: null,
                    message: `❌ *Insufficient Balance*\n\nSystem balance insufficient for this transaction. Please contact support.`
                };
            }

            // Process the TelOne purchase
            const purchaseResult = await hotService.purchase({
                accountNumber: accountNumber,
                productId: productId,
                amount: amount,
                notifyNumber: notifyNumber,
                reference: paynowReference
            });

            if (!purchaseResult.success) {
                // Payment succeeded but voucher failed - need refund process
                console.error('[TelOne] Purchase failed after payment:', purchaseResult.error);
                return {
                    session: null,
                    message: `⚠️ *Payment Received But Bundle Failed*\n\nYour payment of *${totalAmount.toLocaleString()} ZiG* was successful but the TelOne bundle issuance failed.\n\nReference: *${paynowReference}*\n\nPlease contact support with this reference for assistance.`
                };
            }

            // Success!
            return {
                session: null,
                message: UI_MESSAGES.BILLS.TELONE.SUCCESS(
                    accountNumber,
                    productName,
                    amount,
                    totalAmount,
                    purchaseResult.reference || paynowReference,
                    notifyNumber
                )
            };

        } catch (error) {
            console.error('[TelOne] Purchase processing error:', error);
            return {
                session: null,
                message: `⚠️ *Payment Received But Processing Failed*\n\nYour payment was successful but we encountered an error. Reference: *${paynowReference}*\n\nPlease contact support.`
            };
        }
    }

    /**
     * Handle InnBucks callback (called from webhook or polling)
     */
    async handleInnBucksCallback(userId, session, paymentStatus = 'paid') {
        // This can be called from:
        // 1. Webhook when PayNotifies us
        // 2. Polling function that checks status
        // 3. Direct call when user confirms payment
        
        if (paymentStatus === 'paid' || paymentStatus === 'confirmed') {
            // Payment confirmed - process TelOne purchase
            return await this.processTelOnePurchase(userId, session);
        } else {
            return {
                session: null,
                message: `❌ *Payment Failed*\n\nYour InnBucks payment was not completed.\n\n${MESSAGING_CONFIG.WELCOME_MESSAGE}`
            };
        }
    }

    /**
     * Check transaction status (for polling)
     */
    async checkTransactionStatus(reference) {
        try {
            const hotService = this.getHotRechargeService();
            return await hotService.checkStatus(reference);
        } catch (error) {
            console.error('[TelOne] Status check error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate account number format (utility method)
     */
    validateAccount(accountNumber) {
        return /^\d{8}$/.test(accountNumber);
    }

    /**
     * Get product name from ID
     */
    getProductName(productId) {
        for (const [key, product] of Object.entries(this.PRODUCTS)) {
            if (product.id === productId) {
                return product.name;
            }
        }
        return 'Unknown';
    }

    /**
     * Format currency amount
     */
    formatAmount(amount) {
        return `${amount.toLocaleString()} ZiG`;
    }
}

module.exports = TelOneService;
