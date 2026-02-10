// services/airtime.js - COMPLETE with clean confirmation flow

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const paynowService = require('./paynow');
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
        const message = `📱 Buy Airtime\n\n` +
            `Select your network:\n\n` +
            `1. Econet\n` +
            `2. NetOne\n` +
            `3. Telecel\n\n` +
            `Reply with number (1-3)`;
        
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
                `Invalid selection. Please choose:\n\n` +
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
        // Get network-specific formats
        const formats = this.getNetworkFormats(network);
        
        const message = `📱 Buy Airtime - ${network}\n\n` +
            `Enter ${network} phone number:\n\n` +
            `Valid formats:\n` +
            `${formats}\n\n` +
            `Enter the number now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePhoneEntry(userId, message, session) {
        const phoneNumber = message.trim();
        const selectedNetwork = session.data.network;
        
        // Validate phone number for the specific network
        const validationResult = this.validatePhoneForNetwork(phoneNumber, selectedNetwork);
        
        if (!validationResult.valid) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `Invalid ${selectedNetwork} Number\n\n` +
                `${validationResult.error}\n\n` +
                `Valid ${selectedNetwork} formats:\n` +
                `${validationResult.validFormats}\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Format phone number consistently
        const formattedPhone = validationResult.formatted;
        
        // Update session with phone number
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.AIRTIME.ENTER_AMOUNT, {
            phone: formattedPhone
        });
        
        // Ask for amount
        await this.sendAmountPrompt(userId, selectedNetwork);
    }
    
    /**
     * Validate phone number for specific network
     */
    validatePhoneForNetwork(phone, network) {
        const digits = phone.replace(/\D/g, '');
        
        let valid = false;
        let formatted = '';
        let error = '';
        let validFormats = '';
        
        // Define network prefixes
        const networkPrefixes = {
            'Econet': ['077', '078'],
            'NetOne': ['071'],
            'Telecel': ['073']
        };
        
        const prefixes = networkPrefixes[network] || [];
        
        // Set valid formats message
        validFormats = this.getNetworkFormats(network);
        
        // Check 10-digit format (0771234567, 0711234567, 0731234567)
        if (digits.length === 10 && digits.startsWith('0')) {
            const prefix = digits.substring(0, 3);
            if (prefixes.includes(prefix)) {
                valid = true;
                formatted = '263' + digits.substring(1);
            } else {
                error = `Number starts with ${prefix}, but ${network} numbers must start with: ${prefixes.join(' or ')}`;
            }
        }
        // Check 12-digit format (263771234567, 263711234567, 263731234567)
        else if (digits.length === 12 && digits.startsWith('263')) {
            const localPrefix = '0' + digits.substring(3, 5); // Get 077 from 26377
            if (prefixes.includes(localPrefix)) {
                valid = true;
                formatted = digits;
            } else {
                error = `Number starts with 263${digits.substring(3,5)}, but ${network} numbers must start with: 263${prefixes.map(p => p.substring(1)).join(' or 263')}`;
            }
        }
        // Check 9-digit format (771234567, 711234567, 731234567)
        else if (digits.length === 9 && !digits.startsWith('0')) {
            const localPrefix = '0' + digits.substring(0, 2); // Get 077 from 77
            if (prefixes.includes(localPrefix)) {
                valid = true;
                formatted = '263' + digits;
            } else {
                error = `Number starts with ${digits.substring(0,2)}, but ${network} numbers must start with: ${prefixes.map(p => p.substring(1)).join(' or ')}`;
            }
        }
        else {
            error = `Invalid format. Please use 10-digit (0771234567), 12-digit (263771234567), or 9-digit (771234567) format.`;
        }
        
        return {
            valid,
            formatted,
            error,
            validFormats
        };
    }
    
    /**
     * Get valid formats for a specific network
     */
    getNetworkFormats(network) {
        const networkFormats = {
            'Econet': '• 0771234567\n• 0781234567\n• 263771234567\n• 263781234567\n• 771234567\n• 781234567',
            'NetOne': '• 0711234567\n• 263711234567\n• 711234567',
            'Telecel': '• 0731234567\n• 263731234567\n• 731234567'
        };
        
        return networkFormats[network] || 'Please enter a valid phone number';
    }
    
    /**
     * Step 3: Amount Entry
     */
    async sendAmountPrompt(userId, network) {
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.AIRTIME;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        
        const message = `📱 Buy Airtime - ${network}\n\n` +
            `Enter amount (${currency}):\n\n` +
            `Range: ${minAmount.toLocaleString()} - ${maxAmount.toLocaleString()} ${currency}\n\n` +
            `Common amounts:\n` +
            `• 5,000 ${currency}\n` +
            `• 10,000 ${currency}\n` +
            `• 20,000 ${currency}\n\n` +
            `Enter amount now:`;
        
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
        
        // Show transaction details and ask for confirmation
        await this.showTransactionDetails(userId, session);
    }
    
    /**
     * Show transaction details and ask for confirmation
     */
    async showTransactionDetails(userId, session) {
        const { network, phone, amount, serviceFee, totalAmount } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        
        // Format phone for display
        const displayPhone = phone.replace('263', '0');
        
        const message = `📋 Transaction Details\n\n` +
            `Network: ${network}\n` +
            `Phone Number: ${displayPhone}\n` +
            `Airtime Amount: ${amount.toLocaleString()} ${currency}\n` +
            `Service Fee (${(PAYMENT_CONFIG.SERVICE_FEES.AIRTIME * 100).toFixed(0)}%): ${serviceFee.toLocaleString()} ${currency}\n` +
            `Total to Pay: ${totalAmount.toLocaleString()} ${currency}\n\n` +
            `Proceed with payment? (Yes/No)`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleConfirmation(userId, message, session) {
        const response = message.trim().toLowerCase();
        
        if (response === 'yes' || response === 'y') {
            // Process payment via PayNow
            await this.processPayment(userId, session);
        } else if (response === 'no' || response === 'n') {
            // Cancel
            await messaging.sendMessage(userId, 
                `Transaction cancelled.\n\nType "hi" to start again.`
            );
            deleteSession(userId);
        } else {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            // Simple error message
            await messaging.sendMessage(userId, 
                `Please type Yes to proceed or No to cancel.`
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
        
        // Simple payment initiation message
        await messaging.sendMessage(userId,
            `Connecting to PayNow...`
        );
        
        try {
            // Initiate PayNow payment
            const paymentResult = await paynowService.initiateQuickPay({
                amount: totalAmount.toFixed(2),
                reference: reference,
                phone: phone,
                service: `Airtime - ${network}`,
                customer: {
                    phone: phone,
                    email: `${phone}@cchub.co.zw`
                }
            });
            
            if (!paymentResult.success) {
                throw new Error(paymentResult.error || 'Failed to initiate payment');
            }
            
            // Simple payment instructions
            await messaging.sendMessage(userId,
                `Payment Request Created\n\n` +
                `Amount: ${totalAmount.toLocaleString()} ${currency}\n` +
                `Reference: ${reference}\n\n` +
                `${paymentResult.instructions || 'Check your phone for payment instructions.'}`
            );
            
            // Start monitoring payment status
            this.monitorPaymentStatus(userId, paymentResult.pollUrl, session);
            
        } catch (error) {
            console.error(`❌ PayNow error for ${userId}:`, error.message);
            
            await messaging.sendMessage(userId,
                `Payment failed: ${error.message}\n\nType "hi" to try again.`
            );
            
            deleteSession(userId);
        }
    }
    
    /**
     * Monitor payment status
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { network, phone, amount, serviceFee, totalAmount, reference } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayPhone = phone.replace('263', '0');
        
        console.log(`Starting payment monitoring for ${userId}, reference: ${reference}`);
        
        let attempts = 0;
        const maxAttempts = 60;
        const pollInterval = 10000;
        
        const checkStatus = async () => {
            attempts++;
            
            // Check if session still exists
            const currentSession = getActiveSession(userId);
            if (!currentSession || currentSession.service !== 'airtime') {
                console.log(`Stopping monitoring - session ended for ${userId}`);
                clearInterval(intervalId);
                return;
            }
            
            if (attempts > maxAttempts) {
                clearInterval(intervalId);
                console.log(`Payment timeout for ${userId}, reference: ${reference}`);
                
                await messaging.sendMessage(userId,
                    `Payment timeout.\n\nType "hi" to try again.`
                );
                
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynowService.checkPaymentStatus(pollUrl);
                console.log(`Payment status for ${userId}:`, status.status);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    console.log(`Payment completed for ${userId}, reference: ${reference}`);
                    
                    // Simple receipt
                    const receiptMessage = `Payment Successful\n\n` +
                        `Reference: ${reference}\n` +
                        `Airtime: ${amount.toLocaleString()} ${currency}\n` +
                        `Phone: ${displayPhone}\n` +
                        `Network: ${network}\n\n` +
                        `Airtime will be credited within 5 minutes.\n\n` +
                        `Type "hi" for another transaction.`;
                    
                    await messaging.sendMessage(userId, receiptMessage);
                    deleteSession(userId);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    console.log(`Payment cancelled for ${userId}, reference: ${reference}`);
                    
                    await messaging.sendMessage(userId,
                        `Payment cancelled.\n\nType "hi" to try again.`
                    );
                    
                    deleteSession(userId);
                } else if (status.status === 'error') {
                    clearInterval(intervalId);
                    console.log(`Payment error for ${userId}, reference: ${reference}`);
                    
                    await messaging.sendMessage(userId,
                        `Payment error.\n\nType "hi" to try again.`
                    );
                    
                    deleteSession(userId);
                }
                // If still pending, continue polling
                
            } catch (error) {
                console.error(`Error checking payment status for ${userId}:`, error.message);
            }
        };
        
        // Start polling
        const intervalId = setInterval(checkStatus, pollInterval);
        setTimeout(checkStatus, 2000);
    }
}

// Export singleton instance
module.exports = new AirtimeService();