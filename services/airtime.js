const paynow = require('./paynow');
const { sendMessage } = require('../utils/messaging');
const { validatePhoneNumber } = require('../utils/validation');
const { airtimeNetworks } = require('../config/constants');
const sessionHandler = require('../handlers/sessionHandler');

const { updateSession, getActiveSession, deleteSession, updateExistingSession } = sessionHandler;

class AirtimeService {
    constructor() {
        this.networks = airtimeNetworks;
        this.SERVICE_FEE_PERCENTAGE = 0.08; // 8% from constants
        this.MIN_AMOUNT = 100;              // ZWL 100
        this.MAX_AMOUNT = 50000;            // ZWL 50,000 reasonable max
    }

    calculateServiceFee(amount) {
        const fee = amount * this.SERVICE_FEE_PERCENTAGE;
        return Math.max(fee, 10); // Minimum fee of ZWL 10
    }

    formatCurrency(amount) {
        return `ZWL ${amount.toLocaleString('en-US')}`;
    }

    async handleAirtimeRequest(userId, message) {
        console.log(`📱 Airtime request: ${userId} - "${message}"`);
        
        try {
            const session = getActiveSession(userId);
            const cleanMessage = message.toLowerCase().trim();
            
            // Check if we're in an existing airtime session
            if (session && session.service === 'airtime') {
                console.log(`🔄 Continuing airtime session, step: ${session.step}`);
                return await this.continueAirtimeFlow(userId, cleanMessage, session);
            }
            
            // Start new airtime flow
            console.log(`🚀 Starting new airtime flow`);
            return await this.startAirtimeFlow(userId);
            
        } catch (error) {
            console.error('❌ Airtime service error:', error);
            await sendMessage(userId, '❌ Something went wrong. Please try again or type "hi" to restart.');
        }
    }

    async startAirtimeFlow(userId) {
        const message = `📱 *BUY AIRTIME*\n\n` +
                       `Select your network:\n` +
                       `1️⃣ Econet\n` +
                       `2️⃣ NetOne\n` +
                       `3️⃣ Telecel\n\n` +
                       `📝 *Service Fee: 8% (min ZWL 10)*\n\n` +
                       `Reply with number or network name`;
        
        // Create NEW session - use updateSession (deletes old ones)
        const sessionData = {
            flow: 'airtime_flow',
            service: 'airtime',
            step: 'select_network',
            retries: 0
        };
        
        updateSession(userId, sessionData);
        await sendMessage(userId, message);
    }

    async continueAirtimeFlow(userId, message, session) {
        console.log(`🔄 Continue flow - step: ${session.step}, message: "${message}"`);
        
        switch(session.step) {
            case 'select_network':
                return await this.handleNetworkSelection(userId, message, session);
            case 'enter_phone':
                return await this.handlePhoneNumber(userId, message, session);
            case 'enter_amount':
                return await this.handleAmount(userId, message, session);
            case 'confirm_payment':
                return await this.handleConfirmation(userId, message, session);
            case 'payment_pending':
                // User might be checking status
                await sendMessage(userId, 
                    '⏳ Your payment is still being processed.\n' +
                    'I\'ll notify you as soon as it\'s confirmed.\n\n' +
                    'Type "hi" to start a new transaction.'
                );
                return;
            default:
                // Reset if unknown step
                console.log(`❓ Unknown step: ${session.step}, resetting`);
                deleteSession(userId);
                return await this.startAirtimeFlow(userId);
        }
    }

    async handleNetworkSelection(userId, message, session) {
        console.log(`📡 Network selection: ${userId} - "${message}", retries: ${session.retries}`);
        
        let network = '';
        const input = message.trim().toLowerCase();
        
        if (['1', 'econet'].includes(input)) network = 'Econet';
        else if (['2', 'netone'].includes(input)) network = 'NetOne';
        else if (['3', 'telecel'].includes(input)) network = 'Telecel';
        else {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await sendMessage(userId, '❌ Too many invalid attempts. Please type "hi" to start again.');
                return;
            }
            
            // Update EXISTING session with retry count - use updateExistingSession
            updateExistingSession(userId, {
                retries: retries
            });
            
            await sendMessage(userId, 
                `⚠️ Please select a valid network:\n1️⃣ Econet\n2️⃣ NetOne\n3️⃣ Telecel\n\n` +
                `Attempt ${retries}/3`
            );
            return;
        }

        // Update EXISTING session with network selection - use updateExistingSession
        updateExistingSession(userId, {
            step: 'enter_phone',
            network: network,
            retries: 0
        });
        
        await sendMessage(userId, 
            `📞 Enter phone number for *${network}*:\n\n` +
            `Format: 0771234567 or 263771234567\n` +
            `(Reply with phone number only)`
        );
    }

    async handlePhoneNumber(userId, message, session) {
        console.log(`📱 Phone entry: ${userId} - "${message}", retries: ${session.retries}`);
        
        const phone = message.trim();
        const validation = validatePhoneNumber(phone);
        
        if (!validation.valid) {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await sendMessage(userId, '❌ Too many invalid attempts. Please type "hi" to start again.');
                return;
            }
            
            // Update EXISTING session - use updateExistingSession
            updateExistingSession(userId, {
                retries: retries
            });
            
            await sendMessage(userId, 
                `⚠️ ${validation.error}\n\n` +
                `Please enter a valid Zimbabwean number:\n` +
                `Format: 0771234567 or 263771234567\n\n` +
                `Attempt ${retries}/3`
            );
            return;
        }

        // Update EXISTING session with phone - use updateExistingSession
        updateExistingSession(userId, {
            step: 'enter_amount',
            phone: validation.formatted,
            localPhone: validation.local,
            retries: 0
        });
        
        await sendMessage(userId,
            `💵 Enter airtime amount in ZWL:\n\n` +
            `Minimum: ${this.formatCurrency(this.MIN_AMOUNT)}\n` +
            `Maximum: ${this.formatCurrency(this.MAX_AMOUNT)}\n\n` +
            `📝 *Service Fee: 8% will be added*\n\n` +
            `Reply with amount only (e.g., 1000)`
        );
    }

    async handleAmount(userId, message, session) {
        console.log(`💰 Amount entry: ${userId} - "${message}", retries: ${session.retries}`);
        
        const rawAmount = message.trim();
        const amount = parseFloat(rawAmount);
        
        // Validate input is a number
        if (isNaN(amount)) {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await sendMessage(userId, '❌ Too many invalid attempts. Please type "hi" to start again.');
                return;
            }
            
            // Update EXISTING session - use updateExistingSession
            updateExistingSession(userId, {
                retries: retries
            });
            
            await sendMessage(userId, 
                `⚠️ Please enter a valid number\n\n` +
                `Attempt ${retries}/3`
            );
            return;
        }
        
        // Validate amount range
        if (amount < this.MIN_AMOUNT || amount > this.MAX_AMOUNT) {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await sendMessage(userId, 
                    `❌ Amount must be between ${this.formatCurrency(this.MIN_AMOUNT)} and ${this.formatCurrency(this.MAX_AMOUNT)}`
                );
                return;
            }
            
            // Update EXISTING session - use updateExistingSession
            updateExistingSession(userId, {
                retries: retries
            });
            
            await sendMessage(userId, 
                `⚠️ Amount must be between ${this.formatCurrency(this.MIN_AMOUNT)} and ${this.formatCurrency(this.MAX_AMOUNT)}\n\n` +
                `Attempt ${retries}/3`
            );
            return;
        }

        // Calculate fees and totals
        const serviceFee = this.calculateServiceFee(amount);
        const totalAmount = amount + serviceFee;
        
        // Update EXISTING session - use updateExistingSession
        updateExistingSession(userId, {
            step: 'confirm_payment',
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount,
            reference: `AIR-${Date.now()}-${userId.slice(-6)}`,
            retries: 0
        });
        
        // Send summary - get updated session first
        const updatedSession = getActiveSession(userId);
        await this.sendPaymentSummary(userId, updatedSession);
    }

    async sendPaymentSummary(userId, session) {
        const summary = `✅ *PAYMENT SUMMARY*\n\n` +
                       `📱 Network: ${session.network}\n` +
                       `📞 Phone: ${session.localPhone}\n` +
                       `💵 Airtime Amount: ${this.formatCurrency(session.amount)}\n` +
                       `📝 Service Fee (8%): ${this.formatCurrency(session.serviceFee)}\n` +
                       `💰 *Total to Pay: ${this.formatCurrency(session.totalAmount)}*\n` +
                       `🔢 Reference: ${session.reference}\n\n` +
                       `📋 *Payment Breakdown:*\n` +
                       `  • ${this.formatCurrency(session.amount)} → ${session.network} Airtime\n` +
                       `  • ${this.formatCurrency(session.serviceFee)} → CChub Service Fee\n` +
                       `  • ${this.formatCurrency(session.totalAmount)} → Total\n\n` +
                       `To proceed, reply with *YES*\n` +
                       `To cancel, reply with *NO*`;
        
        await sendMessage(userId, summary);
    }

    async handleConfirmation(userId, message, session) {
        console.log(`✅ Confirmation: ${userId} - "${message}"`);
        
        const confirmation = message.trim().toLowerCase();
        
        if (!['yes', 'y', '1', 'proceed'].includes(confirmation)) {
            deleteSession(userId);
            await sendMessage(userId, '❌ Payment cancelled. Type "hi" to start again.');
            return;
        }

        try {
            // Initiate QuickPay payment
            const paymentData = {
                amount: session.totalAmount,
                reference: session.reference,
                phone: session.phone,
                service: `${session.network} Airtime`,
                customer: {
                    phone: session.localPhone
                }
            };

            console.log(`💳 Initiating PayNow payment:`, paymentData);
            const paymentResult = await paynow.initiateQuickPay(paymentData);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error);
            }

            console.log(`✅ PayNow response:`, paymentResult);
            
            // Update EXISTING session with payment info - use updateExistingSession
            updateExistingSession(userId, {
                step: 'payment_pending',
                payment: paymentResult,
                paymentInitiatedAt: new Date()
            });
            
            // Send payment instructions
            await this.sendPaymentInstructions(userId, session, paymentResult);
            
            // Start monitoring payment status
            this.monitorPaymentStatus(userId, session);
            
        } catch (error) {
            console.error('❌ Payment initiation error:', error);
            deleteSession(userId);
            await sendMessage(userId, 
                '❌ Payment failed to initiate. Please try again later or contact support.\n\n' +
                'Type "hi" to restart.'
            );
        }
    }

    async sendPaymentInstructions(userId, session, paymentResult) {
        const instructions = `📱 *QUICKPAY PAYMENT REQUEST SENT!*\n\n` +
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
        
        await sendMessage(userId, instructions);
    }

    async monitorPaymentStatus(userId, session) {
        console.log(`👀 Starting payment monitoring for ${userId}`);
        
        const checkInterval = 5000; // 5 seconds
        const maxChecks = 360; // 30 minutes
        
        let checks = 0;
        
        const interval = setInterval(async () => {
            try {
                checks++;
                
                // Timeout after 30 minutes
                if (checks > maxChecks) {
                    clearInterval(interval);
                    deleteSession(userId);
                    await sendMessage(userId, 
                        '❌ Payment expired. Please start again with "hi".\n' +
                        'The SMS link is no longer valid.'
                    );
                    return;
                }

                console.log(`🔄 Checking payment status (${checks}/${maxChecks})`);
                const status = await paynow.checkPaymentStatus(session.payment.pollUrl);
                console.log(`📊 Payment status:`, status);
                
                if (status.paid) {
                    clearInterval(interval);
                    console.log(`✅ Payment confirmed for ${userId}`);
                    
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
                    
                    deleteSession(userId);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(interval);
                    await sendMessage(userId, '❌ Payment cancelled.');
                    deleteSession(userId);
                }

            } catch (error) {
                console.error('Payment monitoring error:', error);
            }
        }, checkInterval);
    }

    async loadAirtime(session) {
        console.log(`📲 Loading airtime: ${this.formatCurrency(session.amount)} to ${session.localPhone} on ${session.network}`);
        
        // TODO: Replace with actual airtime API integration
        await new Promise(resolve => setTimeout(resolve, 2000));
        
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
               `🔄 For another transaction, type "hi"`;
    }
}

module.exports = new AirtimeService();