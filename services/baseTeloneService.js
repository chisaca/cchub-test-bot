// Add to baseTelOneService.js inside the class

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
    
    // Rest of your existing switch statement...
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
