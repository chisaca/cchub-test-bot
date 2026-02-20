// services/baseTeloneService.js
// Base class for all TelOne services

const {
    PAYMENT_CONFIG,
    FLOW_STATES,
    PAYMENT_METHODS,
    UI_MESSAGES,
    ERROR_MESSAGES,
    MESSAGING_CONFIG
} = require('../config/constants');

const paynowService = require('./paynow');
const { formatPhoneNumber, isValidPhoneNumber } = require('../utils/validation');
const { sendMessage } = require('../utils/messaging');

class BaseTelOneService {
    constructor(hotrecharge, config) {
        this.hotrecharge = hotrecharge;
        this.config = config;
        this.serviceName = config.name;
        this.emoji = config.emoji;
        this.currency = config.currency;
        this.productId = config.productId;
        this.accountTypeId = config.accountTypeId;
        this.feePercentage = config.fee;
        this.minAmount = config.minAmount;
        this.maxAmount = config.maxAmount;
        this.requiresAccountNumber = config.requiresAccountNumber;
        this.requiresNotifyNumber = config.requiresNotifyNumber;
        this.accountLength = config.accountLength;
    }

    /**
     * Get the appropriate HotRecharge service
     */
    getHotRechargeService() {
        if (this.currency === 'USD') {
            return this.hotrecharge.telone.usd;
        }
        return this.hotrecharge.telone.zig;
    }

    /**
     * Handle incoming messages for TelOne flow
     */
    async handleMessage(userId, messageText, session) {
        // Handle START command (from submenu)
        if (messageText === 'START' || messageText === 'start') {
            // If no session provided, create one
            if (!session) {
                const { createSession } = require('../handlers/sessionHandlers');
                session = createSession(userId, this.config.key);
            }
            
            // Initialize session data
            session.step = 'ENTER_ACCOUNT';
            session.data = {
                ...session.data,
                service: this.config.key,
                serviceName: this.config.name,
                emoji: this.config.emoji,
                currency: this.config.currency,
                productId: this.config.productId,
                accountTypeId: this.config.accountTypeId,
                feePercentage: this.config.fee * 100,
                minAmount: this.config.minAmount,
                maxAmount: this.config.maxAmount,
                requiresAccountNumber: this.config.requiresAccountNumber,
                requiresNotifyNumber: this.config.requiresNotifyNumber,
                accountLength: this.config.accountLength
            };
            
            return {
                session,
                message: this.getAccountPrompt()
            };
        }
        
        // Rest of the switch statement
        switch (session?.step) {
            case 'ENTER_ACCOUNT':
                return await this.handleAccountInput(userId, messageText, session);
            case 'ENTER_AMOUNT':
                return await this.handleAmountInput(userId, messageText, session);
            case 'SELECT_PAYMENT':
                return await this.handlePaymentMethod(userId, messageText, session);
            case 'ENTER_PAYMENT_PHONE':
                return await this.handlePaymentPhone(userId, messageText, session);
            case 'ENTER_NOTIFY_PHONE':
                return await this.handleNotifyPhone(userId, messageText, session);
            case 'CONFIRM_PAYMENT':
                return await this.handleConfirmation(userId, messageText, session);
            case 'AWAITING_INNBUCKS':
                return await this.handleInnBucksCallback(userId, session, messageText);
            default:
                return {
                    session: null,
                    message: 'Session expired. Type *hi* to start again.'
                };
        }
    }

    /**
     * Get account number prompt
     */
    getAccountPrompt() {
        return `📞 *${this.config.emoji} ${this.config.name}*\n\n` +
               `Please enter your TelOne account number:\n\n` +
               `────────────────\n` +
               `Example: *12345678*`;
    }

    async handleAccountInput(userId, messageText, session) {
        const accountNumber = messageText.trim();
        
        if (!new RegExp(`^\\d{${this.accountLength}}$`).test(accountNumber)) {
            session.retries = (session.retries || 0) + 1;
            if (session.retries >= 3) {
                return {
                    session: null,
                    message: ERROR_MESSAGES.TOO_MANY_ATTEMPTS
                };
            }
            return {
                session,
                message: `❌ *Invalid Account Number*\n\n${this.serviceName} account number must be ${this.accountLength} digits.\n\nYou sent: *${accountNumber}*\n\nPlease try again:`
            };
        }

        session.data.accountNumber = accountNumber;
        session.step = 'ENTER_AMOUNT';
        session.retries = 0;

        const amountPrompt = `💰 *${this.emoji} ${this.serviceName}*\n\n` +
            `Enter amount in *${this.currency}*\n` +
            `Min: *${this.formatAmount(this.minAmount)}* | Max: *${this.formatAmount(this.maxAmount)}*\n\n` +
            `────────────────\n` +
            `Reply with the amount:`;

        return {
            session,
            message: amountPrompt
        };
    }

    async handleAmountInput(userId, messageText, session) {
        const cleanAmount = messageText.trim().replace(/,/g, '');
        const amount = parseFloat(cleanAmount);

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
                message: `❌ *Invalid Amount*\n\nAmount must be *${this.formatAmount(this.minAmount)} - ${this.formatAmount(this.maxAmount)}*.\n\nYou entered: *${messageText}*\n\nPlease try again:`
            };
        }

        const feeAmount = Math.round(amount * this.feePercentage * 100) / 100;
        const totalAmount = Math.round((amount + feeAmount) * 100) / 100;

        session.data.amount = amount;
        session.data.feeAmount = feeAmount;
        session.data.totalAmount = totalAmount;
        session.step = 'SELECT_PAYMENT';
        session.retries = 0;

        const paymentPrompt = `💳 *Payment Method*\n\n` +
            `Bundle Amount: *${this.formatAmount(amount)}*\n` +
            `Fee (${this.feePercentage*100}%): *${this.formatAmount(feeAmount)}*\n` +
            `────────────────\n` +
            `*Total: ${this.formatAmount(totalAmount)}*\n` +
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
        session.data.paymentMethod = paymentMethod;

        if (paymentMethod === 'ecocash') {
            session.step = 'ENTER_PAYMENT_PHONE';
            session.retries = 0;
            return {
                session,
                message: `📱 *EcoCash Number*\n\nEnter the phone number registered with EcoCash:\n\nExample: *0771234567* or *263771234567*`
            };
        } else {
            session.step = 'ENTER_NOTIFY_PHONE';
            session.retries = 0;
            return {
                session,
                message: `📲 *Notification Number*\n\nEnter phone number to receive confirmation:\n\nExample: *0771234567* or *263771234567*`
            };
        }
    }

    async handlePaymentPhone(userId, messageText, session) {
        const paymentPhone = formatPhoneNumber(messageText.trim());
        
        if (!isValidPhoneNumber(paymentPhone)) {
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

        session.data.paymentPhone = paymentPhone;
        session.step = 'ENTER_NOTIFY_PHONE';
        session.retries = 0;

        return {
            session,
            message: `📲 *Notification Number*\n\nEnter phone number to receive confirmation:\n\nExample: *0771234567* or *263771234567*`
        };
    }

    async handleNotifyPhone(userId, messageText, session) {
        const notifyPhone = formatPhoneNumber(messageText.trim());
        
       if (!isValidPhoneNumber(paymentPhone)) {
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

        session.data.notifyNumber = notifyPhone;
        session.step = 'CONFIRM_PAYMENT';
        session.retries = 0;

        const confirmMessage = this.buildConfirmationMessage(session.data);
        
        return {
            session,
            message: confirmMessage
        };
    }

    buildConfirmationMessage(data) {
        const methodEmoji = data.paymentMethod === 'ecocash' ? '📱' : '💳';
        const methodName = data.paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
        
        let message = `${this.emoji} *Confirm ${this.serviceName} Purchase*\n\n` +
            `Account: *${data.accountNumber}*\n` +
            `────────────────\n` +
            `Bundle Amount: *${this.formatAmount(data.amount)}*\n` +
            `Fee (${this.feePercentage*100}%): *${this.formatAmount(data.feeAmount)}*\n` +
            `────────────────\n` +
            `*Total: ${this.formatAmount(data.totalAmount)}*\n` +
            `────────────────\n` +
            `Payment: ${methodEmoji} *${methodName}*\n`;

        if (data.paymentMethod === 'ecocash' && data.paymentPhone) {
            message += `Payment Number: *${data.paymentPhone.slice(0,5)}****${data.paymentPhone.slice(-3)}*\n`;
        }
        
        message += `Notification: *${data.notifyNumber.slice(0,5)}****${data.notifyNumber.slice(-3)}*\n` +
            `────────────────\n\n` +
            `✅ *Confirm payment?*\n\n` +
            `1️⃣ Yes, proceed to payment\n` +
            `2️⃣ No, cancel\n` +
            `────────────────\n` +
            `Reply *1* or *2*`;

        return message;
    }

    async handleConfirmation(userId, messageText, session) {
        if (messageText === '1') {
            session.step = 'PROCESSING';
            await sendMessage(userId, `🌶️🌶️🌶️ Processing ${this.serviceName} purchase. Please wait...`);
            return await this.processPayment(userId, session);
        } else if (messageText === '2') {
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

    async processPayment(userId, session) {
        const { accountNumber, amount, totalAmount, paymentMethod, paymentPhone, notifyNumber } = session.data;

        try {
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 1000);
            const reference = `${this.config.key.toUpperCase()}${timestamp}${random}`.slice(0, 20);

            const paymentResult = await paynowService.initiatePayment({
                amount: totalAmount,
                reference: reference,
                paymentMethod: paymentMethod,
                phone: paymentPhone,
                description: `${this.serviceName} - Account: ${accountNumber}`,
                email: process.env.MERCHANT_EMAIL || 'cchisango@cchub.co.zw'
            });

            if (!paymentResult.success) {
                return {
                    session: null,
                    message: `❌ *Payment Failed*\n\n${paymentResult.error || 'Could not initiate payment.'}`
                };
            }

            session.data.paynowReference = paymentResult.reference || reference;
            session.data.pollUrl = paymentResult.pollUrl;

            if (paymentMethod === 'ecocash') {
                await sendMessage(userId, paymentResult.instructions);
                
                const pollResult = await paynowService.pollForPayment(paymentResult.pollUrl, userId);
                
                if (!pollResult.success) {
                    return {
                        session: null,
                        message: `❌ *Payment Failed*\n\n${pollResult.error || 'Payment was not completed.'}`
                    };
                }
                
                return await this.processPurchase(userId, session);
            } else {
                await sendMessage(userId, paymentResult.instructions);
                return {
                    session: {
                        ...session,
                        step: 'AWAITING_INNBUCKS'
                    },
                    message: null
                };
            }
        } catch (error) {
            console.error(`[${this.config.key}] Payment error:`, error);
            return {
                session: null,
                message: `❌ *System Error*\n\nAn unexpected error occurred. Please try again.`
            };
        }
    }

    async processPurchase(userId, session) {
        const { accountNumber, amount, totalAmount, notifyNumber, paynowReference } = session.data;

        try {
            const hotService = this.getHotRechargeService();
            
            const purchaseResult = await hotService.purchase({
                accountNumber: accountNumber,
                productId: this.productId,
                amount: amount,
                notifyNumber: notifyNumber,
                reference: paynowReference
            });

            if (!purchaseResult.success) {
                return {
                    session: null,
                    message: `⚠️ *Payment Received But Bundle Failed*\n\nYour payment was successful but the bundle issuance failed.\n\nReference: *${paynowReference}*\n\nPlease contact support.`
                };
            }

            return {
                session: null,
                message: this.buildSuccessMessage(session.data, purchaseResult.reference || paynowReference)
            };
        } catch (error) {
            console.error(`[${this.config.key}] Purchase error:`, error);
            return {
                session: null,
                message: `⚠️ *Payment Received But Processing Failed*\n\nReference: *${paynowReference}*\n\nPlease contact support.`
            };
        }
    }

    buildSuccessMessage(data, reference) {
        return `✅ *${this.serviceName} Purchase Successful!*\n\n` +
            `Account: *${data.accountNumber}*\n` +
            `────────────────\n` +
            `Bundle Amount: *${this.formatAmount(data.amount)}*\n` +
            `Total Paid: *${this.formatAmount(data.totalAmount)}*\n` +
            `Reference: *${reference}*\n` +
            `────────────────\n\n` +
            `📲 Confirmation sent to: *${data.notifyNumber.slice(0,5)}****${data.notifyNumber.slice(-3)}*\n\n` +
            `Thank you for using CCHub! 💎`;
    }

    formatAmount(amount) {
        if (this.currency === 'USD') {
            return `$${amount.toFixed(2)} USD`;
        }
        return `${amount.toLocaleString()} ZiG`;
    }

    async handleInnBucksCallback(userId, session, paymentStatus = 'paid') {
        if (paymentStatus === 'paid' || paymentStatus === 'confirmed') {
            return await this.processPurchase(userId, session);
        } else {
            return {
                session: null,
                message: `❌ *Payment Failed*\n\nYour InnBucks payment was not completed.\n\n${MESSAGING_CONFIG.WELCOME_MESSAGE}`
            };
        }
    }
}

module.exports = BaseTelOneService;
