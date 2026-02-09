const paynow = require('./paynow');
const { sendMessage } = require('../utils/messaging');
const { validatePhoneNumber } = require('../utils/validation');
const { FLOW_STATES, PAYMENT_CONFIG } = require('../config/constants');
const sessionHandler = require('../handlers/sessionHandler');

const { updateSession, getActiveSession, deleteSession, updateExistingSession } = sessionHandler;

class AirtimeService {
    constructor() {
        // Use constants from config
        this.SERVICE_FEE_PERCENTAGE = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME || 0.08;
        this.MIN_AMOUNT = PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME || 100;
        this.MAX_AMOUNT = 50000; // Set a max limit
        this.NETWORKS = {
            '1': 'Econet',
            '2': 'NetOne',
            '3': 'Telecel'
        };
    }

    calculateServiceFee(amount) {
        const fee = amount * this.SERVICE_FEE_PERCENTAGE;
        return Math.max(fee, 10); // Min ZWL 10 fee
    }

    formatCurrency(amount) {
        return `ZWL ${amount.toLocaleString('en-US')}`;
    }

    async handleAirtimeRequest(userId, message) {
        console.log(`📱 Airtime request: ${userId} - "${message}"`);
        
        try {
            const session = getActiveSession(userId);
            const cleanMessage = message.toLowerCase().trim();
            
            if (session && session.service === 'airtime') {
                console.log(`🔄 Continuing airtime session, step: ${session.step || session.flow}`);
                return await this.continueAirtimeFlow(userId, cleanMessage, session);
            }
            
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
        
        const sessionData = {
            flow: FLOW_STATES.AIRTIME_RECIPIENT_ENTRY,
            service: 'airtime',
            step: 'select_network',
            retries: 0
        };
        
        updateSession(userId, sessionData);
        await sendMessage(userId, message);
    }

    async continueAirtimeFlow(userId, message, session) {
        console.log(`🔄 Continue flow - flow: ${session.flow}, step: ${session.step}, message: "${message}"`);
        
        const currentStep = session.step || 'select_network';
        
        switch(currentStep) {
            case 'select_network':
                return await this.handleNetworkSelection(userId, message, session);
            case 'enter_phone':
                return await this.handlePhoneNumber(userId, message, session);
            case 'enter_amount':
                return await this.handleAmount(userId, message, session);
            case 'confirm_payment':
                return await this.handleConfirmation(userId, message, session);
            case 'payment_pending':
                await sendMessage(userId, 
                    '⏳ Your payment is still being processed.\n' +
                    'I\'ll notify you as soon as it\'s confirmed.\n\n' +
                    'Type "hi" to start a new transaction.'
                );
                return;
            default:
                console.log(`❓ Unknown step: ${currentStep}, resetting`);
                deleteSession(userId);
                return await this.startAirtimeFlow(userId);
        }
    }

    async handleNetworkSelection(userId, message, session) {
        console.log(`📡 Network selection: ${userId} - "${message}"`);
        
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
            
            updateExistingSession(userId, {
                retries: retries
            });
            
            await sendMessage(userId, 
                `⚠️ Please select a valid network:\n1️⃣ Econet\n2️⃣ NetOne\n3️⃣ Telecel\n\n` +
                `Attempt ${retries}/3`
            );
            return;
        }

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
    console.log(`📱 Phone entry: ${userId} - "${message}"`);
    console.log(`🔍 Current session flow: ${session.flow}`);
    console.log(`🔍 Current session step: ${session.step}`);
    
    const phone = message.trim();
    console.log(`🔍 Validating phone: "${phone}"`);
    
    // IMPORTANT: Check if validatePhoneNumber exists
    console.log(`🔍 validatePhoneNumber function exists: ${typeof validatePhoneNumber}`);
    
    const validation = validatePhoneNumber(phone);
    console.log(`🔍 Validation result:`, JSON.stringify(validation, null, 2));
    
    if (!validation.valid) {
        console.log(`❌ Phone validation failed: ${validation.error}`);
        const retries = (session.retries || 0) + 1;
        
        if (retries >= 3) {
            deleteSession(userId);
            await sendMessage(userId, '❌ Too many invalid attempts. Please type "hi" to start again.');
            return;
        }
        
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

    console.log(`✅ Phone validation passed:`);
    console.log(`   Local: ${validation.local}`);
    console.log(`   International: ${validation.formatted}`);
    
    // Update to amount entry - Also update flow state for message handler
    updateExistingSession(userId, {
        step: 'enter_amount',
        flow: FLOW_STATES.AIRTIME_AMOUNT_ENTRY, // Update flow state too!
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
        console.log(`💰 Amount entry: ${userId} - "${message}"`);
        
        const rawAmount = message.trim();
        const amount = parseFloat(rawAmount);
        
        if (isNaN(amount)) {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await sendMessage(userId, '❌ Too many invalid attempts. Please type "hi" to start again.');
                return;
            }
            
            updateExistingSession(userId, {
                retries: retries
            });
            
            await sendMessage(userId, 
                `⚠️ Please enter a valid number\n\n` +
                `Attempt ${retries}/3`
            );
            return;
        }
        
        if (amount < this.MIN_AMOUNT || amount > this.MAX_AMOUNT) {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await sendMessage(userId, 
                    `❌ Amount must be between ${this.formatCurrency(this.MIN_AMOUNT)} and ${this.formatCurrency(this.MAX_AMOUNT)}`
                );
                return;
            }
            
            updateExistingSession(userId, {
                retries: retries
            });
            
            await sendMessage(userId, 
                `⚠️ Amount must be between ${this.formatCurrency(this.MIN_AMOUNT)} and ${this.formatCurrency(this.MAX_AMOUNT)}\n\n` +
                `Attempt ${retries}/3`
            );
            return;
        }

        const serviceFee = this.calculateServiceFee(amount);
        const totalAmount = amount + serviceFee;
        
        updateExistingSession(userId, {
            step: 'confirm_payment',
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount,
            reference: `AIR-${Date.now()}-${userId.slice(-6)}`,
            retries: 0
        });
        
        await this.sendPaymentSummary(userId, session);
    }

    async sendPaymentSummary(userId, session) {
        const summary = `✅ *PAYMENT SUMMARY*\n\n` +
                       `📱 Network: ${session.network}\n` +
                       `📞 Phone: ${session.localPhone}\n` +
                       `💵 Airtime: ${this.formatCurrency(session.amount)}\n` +
                       `📝 Service Fee: ${this.formatCurrency(session.serviceFee)}\n` +
                       `💰 *Total: ${this.formatCurrency(session.totalAmount)}*\n` +
                       `🔢 Reference: ${session.reference}\n\n` +
                       `Type *YES* to proceed with payment\n` +
                       `Type *NO* to cancel`;
        
        await sendMessage(userId, summary);
    }

    async handleConfirmation(userId, message, session) {
        const confirmation = message.trim().toLowerCase();
        
        if (!['yes', 'y', '1', 'proceed'].includes(confirmation)) {
            deleteSession(userId);
            await sendMessage(userId, '❌ Payment cancelled. Type "hi" to start again.');
            return;
        }

        try {
            // Initiate PayNow QuickPay
            const paymentData = {
                amount: session.totalAmount,
                reference: session.reference,
                phone: session.phone, // International format: 26377...
                service: `${session.network} Airtime`,
                customer: {
                    phone: session.localPhone
                }
            };

            console.log('🚀 Initiating PayNow payment:', paymentData);
            const paymentResult = await paynow.initiateQuickPay(paymentData);
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Payment initiation failed');
            }

            // Store payment info
            updateExistingSession(userId, {
                step: 'payment_pending',
                payment: paymentResult,
                paymentInitiatedAt: new Date().toISOString()
            });
            
            // Send QuickPay instructions
            const instructions = this.generateQuickPayInstructions(paymentResult, session);
            await sendMessage(userId, instructions);
            
            // Start monitoring payment status
            this.monitorPaymentStatus(userId, session, paymentResult.pollUrl);
            
        } catch (error) {
            console.error('❌ QuickPay initiation error:', error);
            deleteSession(userId);
            await sendMessage(userId, 
                '❌ Failed to send payment request. Please try again.\n\n' +
                'Type "hi" to restart.'
            );
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

    async monitorPaymentStatus(userId, session, pollUrl) {
        const checkInterval = 5000; // 5 seconds
        const maxChecks = 360; // 30 minutes (360 * 5s = 1800s = 30min)
        
        let checks = 0;
        const intervalId = setInterval(async () => {
            try {
                checks++;
                
                if (checks > maxChecks) {
                    clearInterval(intervalId);
                    deleteSession(userId);
                    await sendMessage(userId, 
                        '❌ Payment expired. Please start again with "hi".\n' +
                        'The SMS link is no longer valid.'
                    );
                    return;
                }

                console.log(`🔍 Checking payment status (${checks}/${maxChecks})`);
                const status = await paynow.checkPaymentStatus(pollUrl);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    
                    // Simulate airtime loading (you'll need to integrate with actual API)
                    const airtimeResult = await this.loadAirtime(session);
                    
                    if (airtimeResult.success) {
                        await this.generateReceipt(userId, session, status, airtimeResult);
                    } else {
                        await sendMessage(userId, 
                            '❌ Airtime loading failed.\n' +
                            'Your payment was received but airtime not loaded.\n' +
                            `Contact support with reference: ${session.reference}`
                        );
                    }
                    
                    deleteSession(userId);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    await sendMessage(userId, '❌ Payment cancelled by user.');
                    deleteSession(userId);
                }

            } catch (error) {
                console.error('Payment monitoring error:', error);
                // Don't stop monitoring on error, just log it
            }
        }, checkInterval);
    }

    async loadAirtime(session) {
        // TODO: Integrate with actual airtime API
        // This is a mock implementation
        console.log(`📱 Loading airtime: ${session.amount} ZWL to ${session.localPhone}`);
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return {
            success: true,
            transactionId: `ATX-${Date.now()}`,
            message: 'Airtime loaded successfully'
        };
    }

    async generateReceipt(userId, session, paymentStatus, airtimeResult) {
        const receipt = `🎉 *AIR TIME RECHARGE SUCCESSFUL!*\n\n` +
                       `✅ *Transaction Completed*\n\n` +
                       `📱 Network: ${session.network}\n` +
                       `📞 Phone: ${session.localPhone}\n` +
                       `💵 Airtime: ${this.formatCurrency(session.amount)}\n` +
                       `📝 Service Fee: ${this.formatCurrency(session.serviceFee)}\n` +
                       `💰 *Total Paid: ${this.formatCurrency(session.totalAmount)}*\n` +
                       `🔢 Payment Ref: ${session.reference}\n` +
                       `🆔 Airtime TX: ${airtimeResult.transactionId}\n` +
                       `⏰ Time: ${new Date().toLocaleTimeString()}\n\n` +
                       `📧 *Receipt sent to:* ${session.localPhone}\n\n` +
                       `💬 *Thank you for using CChub!*\n\n` +
                       `Type "hi" for another transaction`;
        
        await sendMessage(userId, receipt);
    }
}

module.exports = new AirtimeService();