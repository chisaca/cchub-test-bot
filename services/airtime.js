const paynow = require('./paynow');
const { sendMessage } = require('../utils/messaging');
const { validatePhoneNumber, validateAmount } = require('../utils/validation');
const { airtimeNetworks } = require('../config/constants');

class AirtimeService {
    constructor() {
        this.networks = airtimeNetworks;
        this.userSessions = new Map();
        this.SERVICE_FEE_PERCENTAGE = 0.05; // 5% service fee
        this.MIN_AMOUNT = 1;
        this.MAX_AMOUNT = 100;
    }

    calculateServiceFee(amount) {
        const fee = amount * this.SERVICE_FEE_PERCENTAGE;
        return Math.max(fee, 0.10); // Minimum fee of $0.10
    }

    formatCurrency(amount) {
        return `$${amount.toFixed(2)}`;
    }

    async handleAirtimeRequest(userId, message) {
        try {
            const session = this.userSessions.get(userId) || {};
            
            // Reset expired sessions (10 minutes)
            if (session.timestamp && Date.now() - session.timestamp > 600000) {
                this.userSessions.delete(userId);
                return this.startAirtimeFlow(userId);
            }

            // Start new flow or continue based on session
            if (!session.step || message.toLowerCase() === 'airtime' || message === '1') {
                return this.startAirtimeFlow(userId);
            }

            switch(session.step) {
                case 'select_network':
                    return this.handleNetworkSelection(userId, message);
                case 'enter_phone':
                    return this.handlePhoneNumber(userId, message);
                case 'enter_amount':
                    return this.handleAmount(userId, message);
                case 'confirm_payment':
                    return this.handleConfirmation(userId, message);
                default:
                    return this.startAirtimeFlow(userId);
            }

        } catch (error) {
            console.error('Airtime service error:', error);
            return this.sendErrorMessage(userId);
        }
    }

    async startAirtimeFlow(userId) {
    const message = `📱 *BUY AIRTIME*\n\n` +
                   `Select your network:\n` +
                   `1️⃣ Econet\n` +
                   `2️⃣ NetOne\n` +
                   `3️⃣ Telecel\n\n` +
                   `📝 *Service Fee: 5% (min $0.10)*\n\n` +
                   `Reply with number or network name`;
    
    this.userSessions.set(userId, {
        step: 'select_network',
        retries: 0,
        timestamp: Date.now()
    });

    // Send message directly
    await sendMessage(userId, message);
}

    handleNetworkSelection(userId, message) {
        const session = this.userSessions.get(userId);
        
        let network = '';
        const input = message.trim().toLowerCase();
        
        if (['1', 'econet'].includes(input)) network = 'Econet';
        else if (['2', 'netone'].includes(input)) network = 'NetOne';
        else if (['3', 'telecel'].includes(input)) network = 'Telecel';
        else {
            session.retries++;
            if (session.retries >= 3) {
                this.userSessions.delete(userId);
                return {
                    message: '❌ Too many invalid attempts. Please start again with "Airtime"',
                    type: 'error'
                };
            }
            
            return {
                message: `⚠️ Please select a valid network:\n1️⃣ Econet\n2️⃣ NetOne\n3️⃣ Telecel\n\nAttempt ${session.retries}/3`,
                type: 'retry'
            };
        }

        session.network = network;
        session.step = 'enter_phone';
        session.retries = 0;
        session.timestamp = Date.now();
        
        return {
            message: `📞 Enter phone number for *${network}*:\n\n` +
                    `Format: 0771234567 or 263771234567\n` +
                    `(Reply with phone number only)`,
            type: 'phone_prompt'
        };
    }

    handlePhoneNumber(userId, message) {
        const session = this.userSessions.get(userId);
        const phone = message.trim();
        
        const validation = validatePhoneNumber(phone);
        
        if (!validation.valid) {
            session.retries++;
            if (session.retries >= 3) {
                this.userSessions.delete(userId);
                return {
                    message: '❌ Too many invalid attempts. Please start again with "Airtime"',
                    type: 'error'
                };
            }
            
            return {
                message: `⚠️ ${validation.error}\n\n` +
                        `Please enter a valid Zimbabwean number:\n` +
                        `Format: 0771234567 or 263771234567\n\n` +
                        `Attempt ${session.retries}/3`,
                type: 'retry'
            };
        }

        session.phone = validation.formatted;
        session.localPhone = validation.local;
        session.step = 'enter_amount';
        session.retries = 0;
        session.timestamp = Date.now();
        
        return {
            message: `💵 Enter airtime amount in USD:\n\n` +
                    `Minimum: ${this.formatCurrency(this.MIN_AMOUNT)}\n` +
                    `Maximum: ${this.formatCurrency(this.MAX_AMOUNT)}\n\n` +
                    `📝 *Service Fee: 5% will be added*\n\n` +
                    `Reply with amount only (e.g., 10)`,
            type: 'amount_prompt'
        };
    }

    handleAmount(userId, message) {
        const session = this.userSessions.get(userId);
        const rawAmount = message.trim();
        
        // Validate input is a number
        const amount = parseFloat(rawAmount);
        if (isNaN(amount)) {
            session.retries++;
            if (session.retries >= 3) {
                this.userSessions.delete(userId);
                return {
                    message: '❌ Too many invalid attempts. Please start again with "Airtime"',
                    type: 'error'
                };
            }
            
            return {
                message: `⚠️ Please enter a valid number\n\n` +
                        `Attempt ${session.retries}/3`,
                type: 'retry'
            };
        }
        
        // Validate amount range
        if (amount < this.MIN_AMOUNT || amount > this.MAX_AMOUNT) {
            session.retries++;
            if (session.retries >= 3) {
                this.userSessions.delete(userId);
                return {
                    message: `❌ Amount must be between ${this.formatCurrency(this.MIN_AMOUNT)} and ${this.formatCurrency(this.MAX_AMOUNT)}`,
                    type: 'error'
                };
            }
            
            return {
                message: `⚠️ Amount must be between ${this.formatCurrency(this.MIN_AMOUNT)} and ${this.formatCurrency(this.MAX_AMOUNT)}\n\n` +
                        `Attempt ${session.retries}/3`,
                type: 'retry'
            };
        }

        // Calculate fees and totals
        const serviceFee = this.calculateServiceFee(amount);
        const totalAmount = amount + serviceFee;
        
        // Store in session
        session.amount = amount;
        session.serviceFee = serviceFee;
        session.totalAmount = totalAmount;
        session.step = 'confirm_payment';
        session.retries = 0;
        session.timestamp = Date.now();
        session.reference = `AIR-${Date.now()}-${userId.slice(-6)}`;
        
        // Generate payment summary with fee breakdown
        const summary = this.generatePaymentSummary(session);
        
        return {
            message: summary,
            type: 'confirmation'
        };
    }

    generatePaymentSummary(session) {
        return `✅ *PAYMENT SUMMARY*\n\n` +
               `📱 Network: ${session.network}\n` +
               `📞 Phone: ${session.localPhone}\n` +
               `💵 Airtime Amount: ${this.formatCurrency(session.amount)}\n` +
               `📝 Service Fee (5%): ${this.formatCurrency(session.serviceFee)}\n` +
               `💰 *Total to Pay: ${this.formatCurrency(session.totalAmount)}*\n` +
               `🔢 Reference: ${session.reference}\n\n` +
               `📋 *Payment Breakdown:*\n` +
               `  • ${this.formatCurrency(session.amount)} → ${session.network} Airtime\n` +
               `  • ${this.formatCurrency(session.serviceFee)} → CChub Service Fee\n` +
               `  • ${this.formatCurrency(session.totalAmount)} → Total\n\n` +
               `To proceed, reply with *YES*\n` +
               `To cancel, reply with *NO*`;
    }

    async handleConfirmation(userId, message) {
        const session = this.userSessions.get(userId);
        const confirmation = message.trim().toLowerCase();
        
        if (!['yes', 'y', '1', 'proceed'].includes(confirmation)) {
            this.userSessions.delete(userId);
            return {
                message: '❌ Payment cancelled. You can start again anytime with "Airtime"',
                type: 'cancelled'
            };
        }

        try {
            // Initiate payment with PayNow (using TOTAL amount)
            const paymentData = {
                amount: session.totalAmount, // Send total amount including fee
                reference: session.reference,
                phone: session.phone,
                service: `${session.network} Airtime + Service Fee`,
                customer: {
                    phone: session.localPhone
                }
            };

            const paymentResult = await paynow.initiatePayment(paymentData);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error);
            }

            // Store payment info
            session.payment = paymentResult;
            session.step = 'payment_pending';
            session.timestamp = Date.now();
            session.paymentInitiatedAt = new Date();
            
            // Send payment instructions with fee breakdown
            const instructions = this.generatePaymentInstructions(paymentResult, session);
            
            // Start monitoring payment status
            this.monitorPaymentStatus(userId, session);
            
            return {
                message: instructions,
                type: 'payment_instructions',
                paymentUrl: paymentResult.browserUrl,
                pollUrl: paymentResult.pollUrl
            };

        } catch (error) {
            console.error('Payment initiation error:', error);
            this.userSessions.delete(userId);
            return {
                message: '❌ Payment failed to initiate. Please try again later or contact support.',
                type: 'payment_failed'
            };
        }
    }

    generatePaymentInstructions(paymentResult, session) {
        return `🔗 *PAYMENT REQUEST CREATED*\n\n` +
               `📱 ${session.network} Airtime for ${session.localPhone}\n` +
               `💵 Airtime: ${this.formatCurrency(session.amount)}\n` +
               `📝 Service Fee: ${this.formatCurrency(session.serviceFee)}\n` +
               `💰 *Total: ${this.formatCurrency(session.totalAmount)}*\n` +
               `🔢 Reference: ${session.reference}\n\n` +
               `*Payment Instructions:*\n` +
               `1️⃣ Click: ${paymentResult.browserUrl}\n` +
               `2️⃣ Complete payment via your preferred method\n` +
               `3️⃣ Airtime will be loaded automatically\n\n` +
               `⚠️ Payment expires in 30 minutes\n` +
               `⏱️ Time: ${new Date().toLocaleTimeString('en-ZW')}\n` +
               `🔄 I'll notify you when payment is confirmed\n\n` +
               `💡 *Note:* The total amount includes a 5% service fee`;
    }

    async monitorPaymentStatus(userId, session) {
        const checkInterval = 5000; // 5 seconds
        const maxChecks = 360; // 30 minutes (5s × 360 = 30min)
        
        let checks = 0;
        
        const interval = setInterval(async () => {
            try {
                checks++;
                
                // Timeout after 30 minutes
                if (checks > maxChecks) {
                    clearInterval(interval);
                    this.userSessions.delete(userId);
                    await sendMessage(userId, '❌ Payment timeout. Please try again.');
                    return;
                }

                // Check payment status
                const status = await paynow.checkPaymentStatus(session.payment.pollUrl);
                
                if (status.paid) {
                    clearInterval(interval);
                    
                    // Load airtime to user's phone
                    const airtimeResult = await this.loadAirtime(session);
                    
                    if (airtimeResult.success) {
                        // Send success receipt with fee breakdown
                        await sendMessage(userId, this.generateReceipt(session, status, airtimeResult));
                    } else {
                        await sendMessage(userId, '❌ Airtime loading failed. Contact support with your reference.');
                    }
                    
                    this.userSessions.delete(userId);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(interval);
                    await sendMessage(userId, '❌ Payment was cancelled by user.');
                    this.userSessions.delete(userId);
                } else if (status.status === 'disputed') {
                    clearInterval(interval);
                    await sendMessage(userId, '⚠️ Payment is disputed. Please contact support.');
                    this.userSessions.delete(userId);
                }

            } catch (error) {
                console.error('Payment monitoring error:', error);
                // Continue monitoring despite errors
            }
        }, checkInterval);
    }

    async loadAirtime(session) {
        // TODO: Replace with actual airtime API integration
        console.log(`Loading airtime: ${this.formatCurrency(session.amount)} to ${session.localPhone} on ${session.network}`);
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Mock successful response
        return {
            success: true,
            transactionId: `AT-${Date.now()}`,
            loadedAt: new Date().toISOString(),
            network: session.network,
            amount: session.amount,
            phone: session.localPhone
        };
    }

    generateReceipt(session, paymentStatus, airtimeResult) {
        const now = new Date();
        return `🎉 *PAYMENT CONFIRMED!*\n\n` +
               `✅ ${session.network} Airtime loaded successfully to ${session.localPhone}\n\n` +
               `*Transaction Details:*\n` +
               `📱 Network: ${session.network}\n` +
               `📞 Phone: ${session.localPhone}\n` +
               `💵 Airtime Value: ${this.formatCurrency(session.amount)}\n` +
               `📝 Service Fee: ${this.formatCurrency(session.serviceFee)}\n` +
               `💰 Total Paid: ${this.formatCurrency(session.totalAmount)}\n\n` +
               `*Reference Numbers:*\n` +
               `🔢 CChub Ref: ${session.reference}\n` +
               `💰 PayNow Ref: ${paymentStatus.paynowref || 'N/A'}\n` +
               `📱 Airtime Ref: ${airtimeResult.transactionId}\n\n` +
               `📅 Date: ${now.toLocaleDateString('en-ZW')}\n` +
               `⏱️ Time: ${now.toLocaleTimeString('en-ZW')}\n\n` +
               `💳 Thank you for using CChub!\n` +
               `📞 Need help? Reply "HELP"\n\n` +
               `🔄 For another transaction, reply "AIRTIME"`;
    }

    sendErrorMessage(userId) {
        this.userSessions.delete(userId);
        return {
            message: '❌ Something went wrong. Please try again or contact support.\n\nReply "HELP" for assistance.',
            type: 'error'
        };
    }
}

module.exports = new AirtimeService();