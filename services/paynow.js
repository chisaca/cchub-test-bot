const paynow = require('./paynow');
const { sendMessage } = require('../utils/messaging');
const { validatePhoneNumber } = require('../utils/validation');
const { airtimeNetworks } = require('../config/constants');

class AirtimeService {
    constructor() {
        this.networks = airtimeNetworks;
        this.userSessions = new Map();
        this.SERVICE_FEE_PERCENTAGE = 0.05;
        this.MIN_AMOUNT = 1;
        this.MAX_AMOUNT = 100;
    }

    calculateServiceFee(amount) {
        const fee = amount * this.SERVICE_FEE_PERCENTAGE;
        return Math.max(fee, 0.10);
    }

    formatCurrency(amount) {
        return `$${amount.toFixed(2)}`;
    }

    async handleAirtimeRequest(userId, message) {
        // ... [keep previous session logic] ...
    }

    async handleConfirmation(userId, message) {
        const session = this.userSessions.get(userId);
        const confirmation = message.trim().toLowerCase();
        
        if (!['yes', 'y', '1', 'proceed'].includes(confirmation)) {
            this.userSessions.delete(userId);
            return {
                message: '❌ Payment cancelled. Type "AIRTIME" to start again.',
                type: 'cancelled'
            };
        }

        try {
            // Initiate QuickPay (SMS will be sent)
            const paymentData = {
                amount: session.totalAmount,
                reference: session.reference,
                phone: session.phone, // International format: 26377...
                service: `${session.network} Airtime`,
                customer: {
                    phone: session.localPhone
                }
            };

            const paymentResult = await paynow.initiateQuickPay(paymentData);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error);
            }

            // Store payment info
            session.payment = paymentResult;
            session.step = 'payment_pending';
            session.timestamp = Date.now();
            session.paymentInitiatedAt = new Date();
            
            // Send QuickPay instructions
            const instructions = this.generateQuickPayInstructions(paymentResult, session);
            
            // Start monitoring
            this.monitorPaymentStatus(userId, session);
            
            return {
                message: instructions,
                type: 'quickpay_instructions',
                pollUrl: paymentResult.pollUrl
            };

        } catch (error) {
            console.error('QuickPay initiation error:', error);
            this.userSessions.delete(userId);
            return {
                message: '❌ Failed to send payment request. Please try again.',
                type: 'payment_failed'
            };
        }
    }

    generateQuickPayInstructions(paymentResult, session) {
        return `📱 *QUICKPAY PAYMENT REQUEST SENT!*\n\n` +
               `✅ SMS sent to: *${session.localPhone}*\n\n` +
               `*Payment Details:*\n` +
               `📱 ${session.network} Airtime for ${session.localPhone}\n` +
               `💵 Airtime: ${this.formatCurrency(session.amount)}\n` +
               `📝 Service Fee: ${this.formatCurrency(session.serviceFee)}\n` +
               `💰 *Total: ${this.formatCurrency(session.totalAmount)}*\n` +
               `🔢 Reference: ${session.reference}\n\n` +
               `*Next Steps:*\n` +
               `1️⃣ Check SMS on ${session.localPhone}\n` +
               `2️⃣ Click payment link in SMS\n` +
               `3️⃣ Complete payment (Ecocash/Card/Bank)\n` +
               `4️⃣ Return here for confirmation\n\n` +
               `⏱️ Payment link expires in 30 minutes\n` +
               `🔄 I'll notify you when payment is confirmed\n\n` +
               `📞 *No SMS received?*\n` +
               `• Wait 1 minute\n` +
               `• Check message requests/spam\n` +
               `• Reply "RETRY" to resend`;
    }

    async monitorPaymentStatus(userId, session) {
        const checkInterval = 5000; // 5 seconds
        const maxChecks = 360; // 30 minutes
        
        let checks = 0;
        
        const interval = setInterval(async () => {
            try {
                checks++;
                
                if (checks > maxChecks) {
                    clearInterval(interval);
                    this.userSessions.delete(userId);
                    await sendMessage(userId, 
                        '❌ Payment expired. Please start again with "AIRTIME".\n' +
                        'The SMS link is no longer valid.'
                    );
                    return;
                }

                const status = await paynow.checkPaymentStatus(session.payment.pollUrl);
                
                if (status.paid) {
                    clearInterval(interval);
                    
                    // Load airtime
                    const airtimeResult = await this.loadAirtime(session);
                    
                    if (airtimeResult.success) {
                        await sendMessage(userId, this.generateReceipt(session, status, airtimeResult));
                    } else {
                        await sendMessage(userId, 
                            '❌ Airtime loading failed.\n' +
                            'Your payment was received but airtime not loaded.\n' +
                            `Contact support with reference: ${session.reference}`
                        );
                    }
                    
                    this.userSessions.delete(userId);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(interval);
                    await sendMessage(userId, '❌ Payment cancelled.');
                    this.userSessions.delete(userId);
                }

            } catch (error) {
                console.error('Payment monitoring error:', error);
            }
        }, checkInterval);
    }

    // ... [rest of the methods remain same] ...
}

module.exports = new AirtimeService();