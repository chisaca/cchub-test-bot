// services/zesa.js - UPDATED to follow state-driven architecture

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
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
        
        // Send meter number prompt
        await this.sendMeterPrompt(userId);
        
        // Update session to first step
        updateSessionStep(userId, 'enter_meter', FLOW_STATES.ZESA.ENTER_METER);
    }
    
    /**
     * Main request handler for ZESA flow
     * Follows step-by-step state-driven architecture
     */
    async handleRequest(userId, message, session) {
        console.log(`⚡ ZESA request from ${userId} at step ${session.step}: "${message}"`);
        
        // Route based on current flow state
        switch(session.flow) {
            case FLOW_STATES.ZESA.ENTER_METER:
                await this.handleMeterEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.ENTER_AMOUNT:
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.SELECT_WALLET:
                await this.handleWalletSelection(userId, message, session);
                break;
                
            case FLOW_STATES.ZESA.CONFIRM_PAYMENT:
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
     * Step 1: Meter Number Entry
     */
    async sendMeterPrompt(userId) {
        const message = `⚡ *Buy ZESA Tokens*\n\n` +
            `Enter your ZESA meter number:\n\n` +
            `📋 *Requirements:*\n` +
            `• 10+ digits\n` +
            `• No spaces or special characters\n\n` +
            `📝 Enter meter number now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleMeterEntry(userId, message, session) {
        const meterNumber = message.trim();
        
        // Validate meter number (10+ digits)
        const isValidMeter = validation.isValidMeterNumber(meterNumber);
        
        if (!isValidMeter) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            const errorMsg = ERROR_MESSAGES.INVALID_METER.replace('%s', meterNumber);
            await messaging.sendMessage(userId, 
                errorMsg + `\n\nMeter must be 10+ digits.\n\nAttempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Update session with meter number
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.ZESA.ENTER_AMOUNT, {
            meterNumber: meterNumber
        });
        
        // Ask for amount
        await this.sendAmountPrompt(userId);
    }
    
    /**
     * Step 2: Amount Entry
     */
    async sendAmountPrompt(userId) {
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.ZESA;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.ZESA;
        const currency = PAYMENT_CONFIG.CURRENCIES.ZESA;
        
        const message = `⚡ *Buy ZESA Tokens*\n\n` +
            `Enter amount (${currency}):\n\n` +
            `💰 *Range:* ${minAmount} - ${maxAmount} ${currency}\n\n` +
            `💡 *Note:* Amount is in ${currency}\n` +
            `Tokens will be calculated automatically.\n\n` +
            `📝 Enter amount now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const amount = parseFloat(amountText);
        
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.ZESA;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.ZESA;
        const currency = PAYMENT_CONFIG.CURRENCIES.ZESA;
        
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
        
        // Calculate tokens (simplified: $1 = 10 units)
        const tokenUnits = Math.floor(amount * 10);
        
        // Calculate fee and total
        const fee = PAYMENT_CONFIG.SERVICE_FEES.ZESA;
        const serviceFee = parseFloat((amount * fee).toFixed(2));
        const totalAmount = parseFloat((amount + serviceFee).toFixed(2));
        
        // Update session with amount and calculations
        updateSessionStep(userId, 'select_wallet', FLOW_STATES.ZESA.SELECT_WALLET, {
            amount: amount,
            tokenUnits: tokenUnits,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Show wallet selection
        await this.sendWalletSelection(userId, amount, tokenUnits);
    }
    
    /**
     * Step 3: Wallet Selection
     */
    async sendWalletSelection(userId, amount, tokenUnits) {
        const currency = PAYMENT_CONFIG.CURRENCIES.ZESA;
        const wallets = WALLET_OPTIONS.ZESA;
        
        let walletOptions = '';
        for (const [key, value] of Object.entries(wallets)) {
            walletOptions += `${key}️⃣ ${value}\n`;
        }
        
        const message = `⚡ *Buy ZESA Tokens*\n\n` +
            `Selected: ${amount} ${currency} (${tokenUnits} units)\n\n` +
            `Select payment wallet:\n\n` +
            `${walletOptions}\n` +
            `📝 Reply with number (1-${Object.keys(wallets).length})`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleWalletSelection(userId, message, session) {
        const selection = message.trim();
        const wallets = WALLET_OPTIONS.ZESA;
        
        // Validate wallet selection
        if (!wallets[selection]) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            let optionsText = '';
            for (const [key, value] of Object.entries(wallets)) {
                optionsText += `${key}. ${value}\n`;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose:\n\n` +
                `${optionsText}\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        const wallet = wallets[selection];
        
        // Update session with wallet choice
        updateSessionStep(userId, 'confirm_payment', FLOW_STATES.ZESA.CONFIRM_PAYMENT, {
            wallet: wallet,
            walletKey: selection
        });
        
        // Show confirmation
        await this.sendConfirmation(userId, session);
    }
    
    /**
     * Step 4: Payment Confirmation
     */
    async sendConfirmation(userId, session) {
        const { meterNumber, amount, tokenUnits, serviceFee, totalAmount, wallet } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.ZESA;
        
        const message = `⚡ *ZESA Purchase - Confirm*\n\n` +
            `📋 *Details:*\n` +
            `• Meter: ${meterNumber}\n` +
            `• Amount: ${amount} ${currency}\n` +
            `• Tokens: ${tokenUnits} units\n` +
            `• Service Fee: ${serviceFee} ${currency}\n` +
            `• Payment Method: ${wallet}\n` +
            `• *Total: ${totalAmount} ${currency}*\n\n` +
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
     * Process payment and send tokens
     */
    async processPayment(userId, session) {
        const { meterNumber, amount, tokenUnits, serviceFee, totalAmount, wallet } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.ZESA;
        
        // Simulate payment processing
        await messaging.sendMessage(userId, 
            `⏳ *Processing payment...*\n\n` +
            `Please wait while we process your ${amount} ${currency} ZESA purchase.\n\n` +
            `🔗 Connecting to ${wallet}...`
        );
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Generate transaction ID and token
        const transactionId = `ZES${Date.now().toString().slice(-8)}`;
        const token = this.generateToken();
        
        // Send receipt
        const receiptMessage = `✅ *ZESA Purchase Successful!*\n\n` +
            `📋 *Receipt:*\n` +
            `• Transaction: ${transactionId}\n` +
            `• Meter: ${meterNumber}\n` +
            `• Amount: ${amount} ${currency}\n` +
            `• Tokens: ${tokenUnits} units\n` +
            `• Service Fee: ${serviceFee} ${currency}\n` +
            `• Total Paid: ${totalAmount} ${currency}\n` +
            `• Payment Method: ${wallet}\n` +
            `• Date: ${new Date().toLocaleString()}\n\n` +
            `🔑 *Your ZESA Token:*\n` +
            `\`${token}\`\n\n` +
            `💡 *How to use:*\n` +
            `1. Enter token on your ZESA meter\n` +
            `2. Press Enter/OK\n` +
            `3. Wait for confirmation\n\n` +
            `Type "hi" for another transaction.`;
        
        await messaging.sendMessage(userId, receiptMessage);
        
        // Clear session
        deleteSession(userId);
        
        // Log transaction
        console.log(`✅ ZESA purchase completed for ${userId}: ${amount} ${currency} for meter ${meterNumber}`);
    }
    
    /**
     * Generate a dummy ZESA token
     */
    generateToken() {
        const chars = '0123456789ABCDEF';
        let token = '';
        
        // Generate 20-character token (typical ZESA format)
        for (let i = 0; i < 20; i++) {
            token += chars[Math.floor(Math.random() * chars.length)];
            if ((i + 1) % 5 === 0 && i < 19) {
                token += '-';
            }
        }
        
        return token;
    }
}

// Export singleton instance
module.exports = new ZesaService();