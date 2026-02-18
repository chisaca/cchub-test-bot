// services/bills.js - UPDATED to use BILLERS from constants
// Now supports Nyaradzo as the primary biller

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const { FLOW_STATES, BILLERS, PAYCODE_OPTIONS, PAYMENT_CONFIG, RESPONSE_MESSAGES, ERROR_MESSAGES, URLS } = require('../config/constants');

class BillsService {
    
    /**
     * Start the bill payment flow
     * Called from main menu
     */
   /**
 * Start the bill payment flow
 * Called from main menu
 */
async startFlow(userId) {
    console.log(`💳 Starting bill payment flow for ${userId}`);
    
    // Create new session for bill payment service
    const session = createSession(userId, 'bill_payment');
    
    // Send biller selection message
    await this.sendBillerSelection(userId);
    
    // Update session to first step
    updateSessionStep(userId, 'select_biller', FLOW_STATES.BILL_PAYMENT.SELECT_BILLER);
    
    // Return result object to keep session alive
    return {
        hasMessage: true,
        hasSession: true,
        newState: FLOW_STATES.BILL_PAYMENT.SELECT_BILLER
    };
}
    
    /**
     * Handle direct PayCode entry from main menu
     */
    async handleDirectPayCodeEntry(userId, paycode) {
        console.log(`💳 Direct PayCode entry from ${userId}: ${paycode}`);
        
        // Validate PayCode format
        if (!validation.isValidPayCode(paycode)) {
            await messaging.sendMessage(userId, 
                ERROR_MESSAGES.PAYCODE_FORMAT.replace('%s', paycode)
            );
            return;
        }
        
        // Create session for bill payment
        createSession(userId, 'bill_payment');
        
        // Update session to wait for amount
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.BILL_PAYMENT.ENTER_AMOUNT, {
            paycode: paycode,
            directEntry: true
        });
        
        // Ask for amount
        await this.sendAmountPrompt(userId);
    }
    
    /**
     * Main request handler for bill payment flow
     * Follows step-by-step state-driven architecture
     */
    async handleRequest(userId, message, session) {
        console.log(`💳 Bill payment request from ${userId} at step ${session.flow}: "${message}"`);
        
        // Route based on current flow state
        switch(session.flow) {
            case FLOW_STATES.BILL_PAYMENT.SELECT_BILLER:
                await this.handleBillerSelection(userId, message, session);
                break;
                
            case FLOW_STATES.BILL_PAYMENT.PAYCODE_OPTION:
                await this.handlePayCodeOption(userId, message, session);
                break;
                
            case FLOW_STATES.BILL_PAYMENT.WAIT_FOR_PAYCODE:
                await this.handlePayCodeEntry(userId, message, session);
                break;
                
            case FLOW_STATES.BILL_PAYMENT.ENTER_AMOUNT:
                await this.handleAmountEntry(userId, message, session);
                break;
                
            case FLOW_STATES.BILL_PAYMENT.CONFIRM_PAYMENT:
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
     * Step 1: Biller Selection
     */
    async sendBillerSelection(userId) {
        let billersText = '';
        for (const [key, biller] of Object.entries(BILLERS)) {
            billersText += `${key}️⃣ ${biller.emoji} ${biller.name}\n`;
        }
        
        const message = `💳 *Pay Bill*\n\n` +
            `Select biller:\n\n` +
            `${billersText}\n` +
            `📝 Reply with number (1)\n\n` +
            `Type *0* to return to Main Menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
   async handleBillerSelection(userId, message, session) {
    const selection = message.trim();
    
    // Handle return to main menu
    if (selection === '0') {
        deleteSession(userId);
        const { sendWelcomeMessage } = require('../handlers/mainMenuHandler');
        await sendWelcomeMessage(userId);
        return {
            hasMessage: true,
            hasSession: false,
            newState: null
        };
    }
    
    // Validate biller selection
    if (!BILLERS[selection]) {
        const isMaxRetries = incrementRetries(userId);
        
        if (isMaxRetries) {
            await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
            deleteSession(userId);
            return {
                hasMessage: true,
                hasSession: false,
                newState: null
            };
        }
        
        let optionsText = '';
        for (const [key, biller] of Object.entries(BILLERS)) {
            optionsText += `${key}. ${biller.name}\n`;
        }
        
        await messaging.sendMessage(userId, 
            `❌ Invalid selection. Please choose:\n\n` +
            `${optionsText}\n` +
            `Or type 0 for Main Menu\n\n` +
            `Attempts remaining: ${3 - session.retries}`
        );
        
        return {
            hasMessage: true,
            hasSession: true,
            newState: session.flow
        };
    }
    
    const biller = BILLERS[selection];
    
    // Handle Nyaradzo - redirect to dedicated service
    if (biller.key === 'nyaradzo') {
        console.log(`⚰️ Redirecting ${userId} to Nyaradzo dedicated service`);
        
        // Clear the bills session
        deleteSession(userId);
        
        // Start the Nyaradzo flow
        const nyaradzoService = require('./nyaradzo');
        await nyaradzoService.startFlow(userId);
        
        return {
            hasMessage: true,
            hasSession: true,
            newState: 'redirected_to_nyaradzo'
        };
    }
    
    // For other billers (if any in future), handle with PayCode flow
    if (biller.requiresPayCode) {
        // Update session with biller choice
        updateSessionStep(userId, 'paycode_option', FLOW_STATES.BILL_PAYMENT.PAYCODE_OPTION, {
            billerKey: biller.key,
            billerName: biller.name,
            billerEmoji: biller.emoji,
            requiresPayCode: true
        });
        
        await this.sendPayCodeOption(userId, biller);
        
        return {
            hasMessage: true,
            hasSession: true,
            newState: FLOW_STATES.BILL_PAYMENT.PAYCODE_OPTION
        };
    }
    
    // Fallback
    await messaging.sendMessage(userId, 
        `⚠️ This biller is not yet implemented.\n\n` +
        `Please try another service.`
    );
    deleteSession(userId);
    
    return {
        hasMessage: true,
        hasSession: false,
        newState: null
    };
}
    
    /**
     * Step 2: PayCode Option
     */
    async sendPayCodeOption(userId, biller) {
        let optionsText = '';
        for (const [key, option] of Object.entries(PAYCODE_OPTIONS)) {
            optionsText += `${key}️⃣ ${option}\n`;
        }
        
        const message = `💳 *Pay ${biller.name}*\n\n` +
            `*PayCode Required*\n\n` +
            `PayCode format: CCH123456\n\n` +
            `Choose an option:\n\n` +
            `${optionsText}\n` +
            `📝 Reply with number (1-3)`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handlePayCodeOption(userId, message, session) {
        const selection = message.trim();
        
        if (selection === '1') {
            // I have a PayCode
            updateSessionStep(userId, 'wait_paycode', FLOW_STATES.BILL_PAYMENT.WAIT_FOR_PAYCODE);
            
            await messaging.sendMessage(userId,
                `💳 *Enter PayCode*\n\n` +
                `Please send your PayCode:\n\n` +
                `📋 *Format:* CCH123456\n\n` +
                `Example: CCH789012`
            );
            
        } else if (selection === '2') {
            // Get from website
            await messaging.sendMessage(userId,
                `🌐 *Get PayCode from Website*\n\n` +
                `1. Visit: ${URLS.MAIN_WEBSITE}\n` +
                `2. Search for your biller\n` +
                `3. Click "Pay with WhatsApp"\n` +
                `4. Get your 6-digit PayCode\n\n` +
                `📋 *PayCode format:* CCH123456\n\n` +
                `Return here and send your PayCode.\n\n` +
                `Type "hi" to cancel.`
            );
            
            // Still wait for PayCode
            updateSessionStep(userId, 'wait_paycode', FLOW_STATES.BILL_PAYMENT.WAIT_FOR_PAYCODE);
            
        } else if (selection === '3') {
            // Back to main menu
            deleteSession(userId);
            const { sendWelcomeMessage } = require('../handlers/mainMenuHandler');
            await sendWelcomeMessage(userId);
        } else {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            let optionsText = '';
            for (const [key, option] of Object.entries(PAYCODE_OPTIONS)) {
                optionsText += `${key}. ${option}\n`;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose:\n\n` +
                `${optionsText}\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
        }
    }
    
    /**
     * Step 3: Wait for PayCode
     * IMPORTANT: ONLY accepts CCH123456 format here
     */
    async handlePayCodeEntry(userId, message, session) {
        const paycode = message.trim().toUpperCase();
        
        // STRICT VALIDATION: Only accept CCH123456 format
        if (!validation.isValidPayCode(paycode)) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId,
                `❌ *Invalid PayCode Format*\n\n` +
                `Must be exactly: CCH + 6 digits\n` +
                `Example: CCH123456\n\n` +
                `You entered: ${paycode}\n\n` +
                `Attempts remaining: ${3 - session.retries}\n\n` +
                `Get valid PayCode from: ${URLS.MAIN_WEBSITE}`
            );
            return;
        }
        
        // Validate PayCode (simulate API check)
        const isValid = await this.validatePayCode(paycode, session.data.billerKey);
        
        if (!isValid) {
            await messaging.sendMessage(userId,
                `❌ *Invalid PayCode*\n\n` +
                `This PayCode is not valid or has expired.\n\n` +
                `Get a new PayCode from:\n` +
                `${URLS.MAIN_WEBSITE}\n\n` +
                `Type "hi" to start over.`
            );
            deleteSession(userId);
            return;
        }
        
        // Update session with PayCode
        updateSessionStep(userId, 'enter_amount', FLOW_STATES.BILL_PAYMENT.ENTER_AMOUNT, {
            paycode: paycode
        });
        
        // Ask for amount
        await this.sendAmountPrompt(userId);
    }
    
    /**
     * Step 4: Amount Entry
     */
    async sendAmountPrompt(userId) {
        // Note: Bills payment amounts may vary by biller
        // For now, using a generic range
        const minAmount = 10;
        const maxAmount = 10000000;
        const currency = 'ZiG';
        
        const message = `💳 *Enter Amount*\n\n` +
            `Enter bill amount (${currency}):\n\n` +
            `💰 *Range:* ${minAmount.toLocaleString()} - ${maxAmount.toLocaleString()} ${currency}\n\n` +
            `Enter amount now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const amount = parseInt(amountText, 10);
        
        const minAmount = 10;
        const maxAmount = 10000000;
        const currency = 'ZiG';
        
        // Validate amount
        if (isNaN(amount) || amount < minAmount || amount > maxAmount) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Amount must be between ${minAmount.toLocaleString()} and ${maxAmount.toLocaleString()} ${currency}.\n\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        // Calculate fee (5% for bills)
        const fee = 0.05;
        const serviceFee = Math.round(amount * fee);
        const totalAmount = amount + serviceFee;
        
        // Update session with amount
        updateSessionStep(userId, 'confirm_payment', FLOW_STATES.BILL_PAYMENT.CONFIRM_PAYMENT, {
            amount: amount,
            serviceFee: serviceFee,
            totalAmount: totalAmount
        });
        
        // Show confirmation
        await this.sendConfirmation(userId, session);
    }
    
    /**
     * Step 5: Payment Confirmation
     */
    async sendConfirmation(userId, session) {
        const { billerName, paycode, amount, serviceFee, totalAmount } = session.data;
        const currency = 'ZiG';
        
        const message = `💳 *Bill Payment - Confirm*\n\n` +
            `📋 *Details:*\n` +
            `• Biller: ${billerName}\n` +
            `• PayCode: ${paycode}\n` +
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
                `❌ *Bill payment cancelled*\n\n` +
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
     * Process payment and send receipt
     */
    async processPayment(userId, session) {
        const { billerName, paycode, amount, serviceFee, totalAmount } = session.data;
        const currency = 'ZiG';
        
        // Simulate payment processing
        await messaging.sendMessage(userId, 
            `⏳ *Processing payment...*\n\n` +
            `Please wait while we process your ${amount.toLocaleString()} ${currency} bill payment.\n\n` +
            `🔗 Verifying PayCode: ${paycode}...`
        );
        
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Generate transaction ID
        const transactionId = `BILL${Date.now().toString().slice(-8)}`;
        
        // Send receipt
        const receiptMessage = `✅ *Bill Payment Successful!*\n\n` +
            `📋 *Receipt:*\n` +
            `• Transaction: ${transactionId}\n` +
            `• Biller: ${billerName}\n` +
            `• PayCode: ${paycode}\n` +
            `• Amount: ${amount.toLocaleString()} ${currency}\n` +
            `• Service Fee: ${serviceFee.toLocaleString()} ${currency}\n` +
            `• Total Paid: ${totalAmount.toLocaleString()} ${currency}\n` +
            `• Date: ${new Date().toLocaleString()}\n\n` +
            `💡 *Payment will be processed within 24 hours.*\n\n` +
            `Type "hi" for another transaction.`;
        
        await messaging.sendMessage(userId, receiptMessage);
        
        // Clear session
        deleteSession(userId);
        
        // Log transaction
        console.log(`✅ Bill payment completed for ${userId}: ${amount} ${currency} with PayCode ${paycode}`);
    }
    
    /**
     * Validate PayCode (simulated)
     */
    async validatePayCode(paycode, billerKey) {
        // Simulate API validation
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Basic validation: check format and simulate expiration
        if (!paycode.match(/^CCH\d{6}$/)) {
            return false;
        }
        
        // Simulate: 90% of PayCodes are valid
        return Math.random() > 0.1;
    }
}

// Export singleton instance
module.exports = new BillsService();