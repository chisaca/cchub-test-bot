// services/bills.js - UPDATED to follow state-driven architecture

const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const { FLOW_STATES, BILL_CATEGORIES, PAYCODE_OPTIONS, PAYMENT_CONFIG, RESPONSE_MESSAGES, ERROR_MESSAGES, URLS } = require('../config/constants');

class BillsService {
    
    /**
     * Start the bill payment flow
     * Called from main menu
     */
    async startFlow(userId) {
        console.log(`💳 Starting bill payment flow for ${userId}`);
        
        // Create new session for bill payment service
        const session = createSession(userId, 'bill_payment');
        
        // Send category selection message
        await this.sendCategorySelection(userId);
        
        // Update session to first step
        updateSessionStep(userId, 'select_category', FLOW_STATES.BILL_PAYMENT.SELECT_CATEGORY);
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
        console.log(`💳 Bill payment request from ${userId} at step ${session.step}: "${message}"`);
        
        // Route based on current flow state
        switch(session.flow) {
            case FLOW_STATES.BILL_PAYMENT.SELECT_CATEGORY:
                await this.handleCategorySelection(userId, message, session);
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
     * Step 1: Category Selection
     */
    async sendCategorySelection(userId) {
        let categoriesText = '';
        for (const [key, category] of Object.entries(BILL_CATEGORIES)) {
            categoriesText += `${key}️⃣ ${category.name}\n`;
        }
        
        const message = `💳 *Pay Bill*\n\n` +
            `Select bill category:\n\n` +
            `${categoriesText}\n` +
            `📝 Reply with number (1-4)`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleCategorySelection(userId, message, session) {
        const selection = message.trim();
        
        // Validate category selection
        if (!BILL_CATEGORIES[selection]) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            let optionsText = '';
            for (const [key, category] of Object.entries(BILL_CATEGORIES)) {
                optionsText += `${key}. ${category.name}\n`;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose:\n\n` +
                `${optionsText}\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        const category = BILL_CATEGORIES[selection];
        
        // Update session with category choice
        updateSessionStep(userId, 'paycode_option', FLOW_STATES.BILL_PAYMENT.PAYCODE_OPTION, {
            category: category.key,
            categoryName: category.name
        });
        
        // Ask for PayCode option
        await this.sendPayCodeOption(userId, category);
    }
    
    /**
     * Step 2: PayCode Option
     */
    async sendPayCodeOption(userId, category) {
        let optionsText = '';
        for (const [key, option] of Object.entries(PAYCODE_OPTIONS)) {
            optionsText += `${key}️⃣ ${option}\n`;
        }
        
        const message = `💳 *Pay ${category.name}*\n\n` +
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
                `Example: CCH789012\n\n` +
                `Get PayCode from: ${URLS.BILLER_SEARCH[session.data.category.toUpperCase()]}`
            );
            
        } else if (selection === '2') {
            // Get from website
            const websiteUrl = URLS.BILLER_SEARCH[session.data.category.toUpperCase()];
            
            await messaging.sendMessage(userId,
                `🌐 *Get PayCode from Website*\n\n` +
                `1. Visit: ${websiteUrl}\n` +
                `2. Search for your ${session.data.categoryName.toLowerCase()}\n` +
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
            await require('../index').sendWelcomeMessage(userId);
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
                `Get valid PayCode from: ${URLS.BILLER_SEARCH[session.data.category.toUpperCase()]}`
            );
            return;
        }
        
        // Validate PayCode (simulate API check)
        const isValid = await this.validatePayCode(paycode, session.data.category);
        
        if (!isValid) {
            await messaging.sendMessage(userId,
                `❌ *Invalid PayCode*\n\n` +
                `This PayCode is not valid or has expired.\n\n` +
                `Get a new PayCode from:\n` +
                `${URLS.BILLER_SEARCH[session.data.category.toUpperCase()]}\n\n` +
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
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.BILLS;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.BILLS;
        const currency = PAYMENT_CONFIG.CURRENCIES.BILLS;
        
        const message = `💳 *Enter Amount*\n\n` +
            `Enter bill amount (${currency}):\n\n` +
            `💰 *Range:* ${minAmount.toLocaleString()} - ${maxAmount.toLocaleString()} ${currency}\n\n` +
            `📝 Minimum: ${minAmount.toLocaleString()} ${currency}\n\n` +
            `Enter amount now:`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleAmountEntry(userId, message, session) {
        const amountText = message.trim().replace(/,/g, '');
        const amount = parseInt(amountText, 10);
        
        const minAmount = PAYMENT_CONFIG.MIN_AMOUNTS.BILLS;
        const maxAmount = PAYMENT_CONFIG.MAX_AMOUNTS.BILLS;
        const currency = PAYMENT_CONFIG.CURRENCIES.BILLS;
        
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
        const fee = PAYMENT_CONFIG.SERVICE_FEES.BILLS;
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
        const { categoryName, paycode, amount, serviceFee, totalAmount } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.BILLS;
        
        const message = `💳 *Bill Payment - Confirm*\n\n` +
            `📋 *Details:*\n` +
            `• Category: ${categoryName}\n` +
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
        const { categoryName, paycode, amount, serviceFee, totalAmount } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.BILLS;
        
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
            `• Category: ${categoryName}\n` +
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
    async validatePayCode(paycode, category) {
        // Simulate API validation
        // In real implementation, this would check against your database/API
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