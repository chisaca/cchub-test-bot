// services/airtime.js - UPDATED with PayNow integration

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const paynowService = require('./paynow'); // ADDED: PayNow service import
const { FLOW_STATES, AIRTIME_NETWORKS, PAYMENT_CONFIG, RESPONSE_MESSAGES, ERROR_MESSAGES } = require('../config/constants');

class AirtimeService {
    
    /**
     * Start the airtime flow
     * Called from main menu
     */
    async startFlow(userId) {
        console.log(`📱 Starting airtime flow for ${userId}`);
        
        // Create new session for airtime service
        const session = createSession(userId, 'airtime');
        
        // Send network selection message
        await this.sendNetworkSelection(userId);
        
        // Update session to first step
        updateSessionStep(userId, 'select_network', FLOW_STATES.AIRTIME.SELECT_NETWORK);
    }
    
    /**
     * Main request handler for airtime flow
     * Follows step-by-step state-driven architecture
     */
    async handleRequest(userId, message, session) {
        console.log(`📱 Airtime request from ${userId} at step ${session.step}: "${message}"`);
        
        // Route based on current flow state
        switch(session.flow) {
            case FLOW_STATES.AIRTIME.SELECT_NETWORK:
                await this.handleNetworkSelection(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_PHONE:
                await this.handlePhoneEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.ENTER_AMOUNT:
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.AIRTIME.CONFIRM_PAYMENT:
                await this.handleConfirmation(userId, message, session);
                break;
                
            default:
                // Invalid state - reset
                console.error(`❌ Invalid flow state for ${userId}: ${session.flow}`);
                deleteSession(userId);
                await this.startFlow(userId);
        }
    }
    
    /**
     * Step 1: Network Selection
     */
    async sendNetworkSelection(userId) {
        const message = `📱 *Buy Airtime*\n\n` +
            `Select your network:\n\n` +
            `1️⃣ Econet\n` +
            `2️⃣ NetOne\n` +
            `3️⃣ Telecel\n\n` +
            `📝 Reply with number (1-3)`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleNetworkSelection(userId, message, session) {
        const selection = message.trim();
        
        // Validate network selection
        if (!AIRTIME_NETWORKS[selection]) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose:\n\n` +
                `1. Econet\n2. NetOne\n3. Telecel\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        const network = AIRTIME_NETWORKS[selection];
        
        // Update session with network choice
        updateSessionStep(userId, 'enter_phone', FLOW_STATES.AIRTIME.ENTER_PHONE, {
            network: network
        });
        
        // Ask for phone number
        await this.sendPhoneNumberPrompt(userId, network);
    }
    
    /**
     * Step 2: Phone Number Entry
     */
    async sendPhoneNumberPrompt(userId, network) {
        const message = `📱 *Buy Airtime - ${network}*\n\n` +
            `Enter recipient phone number:\n\n` +
            `📋 *Formats accepted:*\n` +
            `• 0771234567\n` +
            `• 263771234567\n\n` +
            `📝 Enter the number now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePhoneEntry(userId, message, session) {
        const phoneNumber = message.trim();
        
        // Validate phone number
        const isValidPhone = validation.isValidPhoneNumber(phoneNumber);
        
        if (!isValidPhone) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            const errorMsg = ERROR_MESSAGES.INVALID_PHONE.replace('%s', phoneNumber);
            await messaging.sendMessage(userId, 
                errorMsg + `\n\nAttempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Format phone number consistently
        const formattedPhone = phoneNumber.startsWith('263') ? phoneNumber : `263${phoneNumber.substring(1)}`;
        
        // Update session with phone number
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT, {
            phone: formattedPhone
        });
        
        // Ask for amount
        await this.sendAmountPrompt(userId, session.data.network);
    }
    
    /**
     * Step 3: Amount Entry
     */
    async sendAmountPrompt(userId, network) {
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        
        const message = `📱 *Buy Airtime - ${network}*\n\n` +
            `Enter amount (${currency}):\n\n` +
            `💰 *Range:* ${minAmount.toLocaleString()} - ${maxAmount.toLocaleString()} ${currency}\n\n` +
            `💡 *Common amounts:*\n` +
            `• 5,000 ${currency}\n` +
            `• 10,000 ${currency}\n` +
            `• 20,000 ${currency}\n\n` +
            `📝 Enter amount now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const amount = parseInt(amountText, 10);
        
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        
        // Validate amount
        if (isNaN(amount) || amount < minAmount || amount > maxAmount) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            const errorMsg = ERROR_MESSAGES.INVALID_AMOUNT(minAmount, maxAmount, currency);
            await messaging.sendMessage(userId, 
                errorMsg + `\n\nAttempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Calculate fee and total
        const fee = PAYMENT_CONFIG.SERVICE_FEES.AIRTIME;
        const serviceFee = Math.round(amount * fee);
        const totalAmount = amount + serviceFee;
        
        // Update session with amount
        updateSessionStep(userId, 'confirm_payment', FLOW_STATES.AIRTIME.CONFIRM_PAYMENT, {
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Show confirmation
        await this.sendConfirmation(userId, session);
    }
    
    /**
     * Step 4: Payment Confirmation
     */
    async sendConfirmation(userId, session) {
        const { network, phone, amount, serviceFee, totalAmount } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        
        // Format phone for display
        const displayPhone = phone.replace('263', '0');
        
        const message = `📱 *Airtime Purchase - Confirm*\n\n` +
            `📋 *Details:*\n` +
            `• Network: ${network}\n` +
            `• Phone: ${displayPhone}\n` +
            `• Amount: ${amount.toLocaleString()} ${currency}\n` +
            `• Service Fee: ${serviceFee.toLocaleString()} ${currency}\n` +
            `• *Total: ${totalAmount.toLocaleString()} ${currency}*\n\n` +
            `✅ Proceed with payment?\n\n` +
            `Type: YES or NO`;
        
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
                `❌ *Airtime purchase cancelled*\n\n` +
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
     * Process payment with PayNow integration
     */
    async processPayment(userId, session) {
        const { network, phone, amount, serviceFee, totalAmount } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayPhone = phone.replace('263', '0');
        
        // Generate unique reference
        const reference = `AIR${Date.now().toString().slice(-8)}`;
        
        // Store reference in session for later use
        updateSessionStep(userId, 'processing_payment', 'processing_payment', {
            ...session.data,
            reference: reference,
            paymentInitiated: true
        });
        
        // Send processing message
        await messaging.sendMessage(userId,
            `⏳ *Initiating payment...*\n\n` +
            `Please wait while we connect to PayNow.\n\n` +
            `• Amount: ${totalAmount.toLocaleString()} ${currency}\n` +
            `• Reference: ${reference}\n` +
            `• Network: ${network}\n` +
            `• Phone: ${displayPhone}`
        );
        
        try {
            // Initiate PayNow payment
            const paymentResult = await paynowService.initiateQuickPay({
                amount: totalAmount.toFixed(2), // PayNow expects 2 decimal places
                reference: reference,
                phone: phone, // Must be in 26377... format
                service: `Airtime - ${network}`,
                customer: {
                    phone: phone,
                    email: `${phone}@cchub.co.zw`
                }
            });
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            // Send payment instructions
            await messaging.sendMessage(userId,
                `💳 *Payment Instructions*\n\n` +
                `✅ *Payment Request Created*\n\n` +
                `📋 *Details:*\n` +
                `• Amount: ${totalAmount.toLocaleString()} ${currency}\n` +
                `• Reference: ${reference}\n` +
                `• Network: ${network}\n` +
                `• Phone: ${displayPhone}\n\n` +
                `${paymentResult.instructions || 'Check your phone for payment instructions'}\n\n` +
                `⏳ *Status:* Waiting for payment\n\n` +
                `I'll notify you when payment is confirmed.`
            );
            
            // Start monitoring payment status
            this.monitorPaymentStatus(userId, paymentResult.pollUrl, session);
            
        } catch (error) {
            console.error(`❌ PayNow error for ${userId}:`, error.message);
            
            await messaging.sendMessage(userId,
                `❌ *Payment Failed*\n\n` +
                `Unable to initiate payment: ${error.message}\n\n` +
                `Please try again or contact support.\n\n` +
                `Type "hi" to start over.`
            );
            
            deleteSession(userId);
        }
    }
    
    /**
     * Monitor payment status (using polling - webhook is better for production)
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { network, phone, amount, serviceFee, totalAmount, reference } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayPhone = phone.replace('263', '0');
        
        console.log(`🔍 Starting payment monitoring for ${userId}, reference: ${reference}`);
        
        let attempts = 0;
        const maxAttempts = 60; // 10 minutes at 10-second intervals
        const pollInterval = 10000; // Check every 10 seconds
        
        const checkStatus = async () => {
            attempts++;
            
            // Check if session still exists
            const currentSession = getActiveSession(userId);
            if (!currentSession || currentSession.service !== 'airtime') {
                console.log(`🛑 Stopping monitoring - session ended for ${userId}`);
                clearInterval(intervalId);
                return;
            }
            
            if (attempts > maxAttempts) {
                clearInterval(intervalId);
                console.log(`⏰ Payment timeout for ${userId}, reference: ${reference}`);
                
                await messaging.sendMessage(userId,
                    `⏰ *Payment Timeout*\n\n` +
                    `Payment was not completed in time.\n\n` +
                    `Reference: ${reference}\n` +
                    `Amount: ${totalAmount.toLocaleString()} ${currency}\n\n` +
                    `Type "hi" to try again.`
                );
                
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynowService.checkPaymentStatus(pollUrl);
                console.log(`🔍 Payment status for ${userId}:`, status.status);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    console.log(`✅ Payment completed for ${userId}, reference: ${reference}`);
                    
                    // Send receipt
                    const receiptMessage = `✅ *Airtime Purchase Successful!*\n\n` +
                        `📋 *Receipt:*\n` +
                        `• Transaction: ${reference}\n` +
                        `• PayNow Ref: ${status.paynowref || 'N/A'}\n` +
                        `• Network: ${network}\n` +
                        `• Phone: ${displayPhone}\n` +
                        `• Airtime Amount: ${amount.toLocaleString()} ${currency}\n` +
                        `• Service Fee: ${serviceFee.toLocaleString()} ${currency}\n` +
                        `• Total Paid: ${totalAmount.toLocaleString()} ${currency}\n` +
                        `• Date: ${new Date().toLocaleString()}\n\n` +
                        `💡 *Airtime will be credited within 5 minutes.*\n\n` +
                        `Type "hi" for another transaction.`;
                    
                    await messaging.sendMessage(userId, receiptMessage);
                    deleteSession(userId);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    console.log(`❌ Payment cancelled for ${userId}, reference: ${reference}`);
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Cancelled*\n\n` +
                        `Payment was cancelled.\n\n` +
                        `Reference: ${reference}\n` +
                        `Amount: ${totalAmount.toLocaleString()} ${currency}\n\n` +
                        `Type "hi" to try again.`
                    );
                    
                    deleteSession(userId);
                } else if (status.status === 'error') {
                    clearInterval(intervalId);
                    console.log(`❌ Payment error for ${userId}, reference: ${reference}`);
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Error*\n\n` +
                        `There was an error processing your payment.\n\n` +
                        `Error: ${status.error || 'Unknown error'}\n\n` +
                        `Please try again or contact support.`
                    );
                    
                    deleteSession(userId);
                }
                // If still pending, continue polling
                
            } catch (error) {
                console.error(`❌ Error checking payment status for ${userId}:`, error.message);
                // Continue polling on error
            }
        };
        
        // Start polling
        const intervalId = setInterval(checkStatus, pollInterval);
        // Initial check
        setTimeout(checkStatus, 2000);
    }
}

// Export singleton instance
module.exports = new AirtimeService();