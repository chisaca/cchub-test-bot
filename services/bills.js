// services/bills.js
const sessionHandler = require('../handlers/sessionHandler');
const paycodeHandler = require('../handlers/paycodeHandler');
const messaging = require('../utils/messaging');
const { FLOW_STATES } = require('../config/constants');
const { MOCK_BILLERS, BILLER_SEARCH_URLS } = require('../data/mockData');

const { updateSession, getActiveSession, deleteSession, updateExistingSession } = sessionHandler;

class BillsService {
    constructor() {
        this.MIN_AMOUNT = 50000; // ZWL
        this.SERVICE_FEE_PERCENTAGE = 0.04; // 4%
    }

    // ==================== MAIN ENTRY POINT ====================
    async handleBillRequest(userId, message, session) {
        console.log(`📋 Bill request: ${userId} - "${message}", step: ${session.step || 'none'}`);
        
        // Get current step from session
        const currentStep = session.step || 'start';
        
        // Route to appropriate handler based on step
        switch(currentStep) {
            case 'start':
                return await this.startBillPaymentFlow(userId);
            case 'select_category':
                return await this.handleBillCategorySelection(userId, message, session);
            case 'search_option':
                return await this.handleBillCodeSearchOption(userId, message, session);
            case 'waiting_paycode':
                return await this.handlePayCodeEntry(userId, message, session);
            case 'enter_amount':
                return await this.handleBillAmountEntry(userId, message, session);
            case 'confirm_payment':
                return await this.handleBillPaymentConfirmation(userId, message, session);
            default:
                // Unknown step - reset
                deleteSession(userId);
                return await this.startBillPaymentFlow(userId);
        }
    }

    // ==================== FLOW START ====================
    async startBillPaymentFlow(userId) {
        const sessionData = {
            flow: FLOW_STATES.BILL_CATEGORY_SELECTION,
            service: 'bill_payment',
            step: 'select_category',
            testTransaction: false,
            retries: 0
        };
        
        updateSession(userId, sessionData);
        
        await messaging.sendMessage(userId, 
            `💳 *BILL PAYMENT*\n\n` +
            `*All bill payments require a PayCode from our website.*\n\n` +
            `📋 *PAYCODE FORMAT:* CCH123456\n\n` +
            `What type of bill would you like to pay?\n\n` +
            `1. 🏫 School Fees\n` +
            `2. 🏛️ City Council\n` +
            `3. 🛡️ Insurance\n` +
            `4. 🛒 Retail/Subscriptions\n` +
            `5. ← Back to Main Menu\n\n` +
            `*Reply with the number (1-5) of your choice.*`
        );
    }

    // ==================== CATEGORY SELECTION ====================
    async handleBillCategorySelection(userId, message, session) {
        const categoryOptions = {
            '1': { type: 'school_fees', name: 'School Fees', emoji: '🏫' },
            '2': { type: 'city_council', name: 'City Council', emoji: '🏛️' },
            '3': { type: 'insurance', name: 'Insurance', emoji: '🛡️' },
            '4': { type: 'retail_subscriptions', name: 'Retail/Subscriptions', emoji: '🛒' },
            '5': { type: 'back', name: 'Back', emoji: '←' }
        };
        
        const selectedCategory = categoryOptions[message];
        
        if (!selectedCategory) {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await messaging.sendMessage(userId, '❌ Too many invalid attempts. Type "hi" to start again.');
                return;
            }
            
            updateExistingSession(userId, { retries: retries });
            
            await messaging.sendMessage(userId, 
                `⚠️ Please choose a number from 1-5:\n\n` +
                `1. 🏫 School Fees\n` +
                `2. 🏛️ City Council\n` +
                `3. 🛡️ Insurance\n` +
                `4. 🛒 Retail/Subscriptions\n` +
                `5. ← Back to Main Menu\n\n` +
                `Attempt ${retries}/3`
            );
            return;
        }
        
        if (selectedCategory.type === 'back') {
            deleteSession(userId);
            await messaging.sendWelcomeMessage(userId);
            return;
        }
        
        const searchUrl = BILLER_SEARCH_URLS[selectedCategory.type];
        
        updateExistingSession(userId, {
            step: 'search_option',
            flow: FLOW_STATES.BILL_CODE_SEARCH_OPTION,
            billCategory: selectedCategory.type,
            billCategoryName: selectedCategory.name,
            billEmoji: selectedCategory.emoji,
            websiteUrl: searchUrl,
            retries: 0
        });
        
        await messaging.sendMessage(userId, 
            `${selectedCategory.emoji} *${selectedCategory.name.toUpperCase()} PAYMENT*\n\n` +
            `For ${selectedCategory.name.toLowerCase()} payments:\n\n` +
            `🔒 *SECURE PAYCODE REQUIRED*\n\n` +
            `📋 *FORMAT:* CCH123456\n\n` +
            `1. Visit: ${searchUrl}\n` +
            `2. Search and select\n` +
            `3. Get 6-digit PayCode\n` +
            `4. Return here and send: CCH123456\n\n` +
            `✅ *Example:* CCH789012\n\n` +
            `Or choose:\n` +
            `1. ✅ I have a PayCode (send CCH123456)\n` +
            `2. 🔍 Get PayCode from website\n` +
            `3. ← Choose different category`
        );
    }

    // ==================== SEARCH OPTION ====================
    async handleBillCodeSearchOption(userId, message, session) {
        if (message === '1') {
            // User says they have a PayCode
            updateExistingSession(userId, {
                step: 'waiting_paycode',
                flow: FLOW_STATES.WAITING_FOR_PAYCODE,
                waitingForPaycode: true,
                retries: 0
            });
            
            await messaging.sendMessage(userId, 
                `${session.billEmoji} *SEND YOUR PAYCODE*\n\n` +
                `Please send your PayCode:\n\n` +
                `📋 *EXAMPLE:* CCH123456\n\n` +
                `💡 *Got from:* ${session.websiteUrl}`
            );
            
        } else if (message === '2') {
            // User needs to get PayCode
            updateExistingSession(userId, {
                step: 'waiting_paycode',
                flow: FLOW_STATES.WAITING_FOR_PAYCODE,
                waitingForPaycode: true,
                retries: 0
            });
            
            await messaging.sendMessage(userId, 
                `${session.billEmoji} *GET PAYCODE FROM WEBSITE*\n\n` +
                `1. Visit: ${session.websiteUrl}\n` +
                `2. Search your ${session.billCategoryName.toLowerCase()}\n` +
                `3. Click "Pay with WhatsApp"\n` +
                `4. Get 6-digit PayCode\n` +
                `5. Return here and send the PayCode\n\n` +
                `📋 PayCode example: CCH123456\n\n` +
                `🔒 *Why PayCodes?*\n` +
                `• Prevents biller code errors\n` +
                `• Ensures correct provider\n` +
                `• Secure one-time use\n` +
                `• 10-minute expiration`
            );
            
        } else if (message === '3') {
            // Go back to category selection
            updateExistingSession(userId, {
                step: 'select_category',
                flow: FLOW_STATES.BILL_CATEGORY_SELECTION,
                retries: 0
            });
            
            await this.startBillPaymentFlow(userId);
            
        } else {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await messaging.sendMessage(userId, '❌ Too many invalid attempts. Type "hi" to start again.');
                return;
            }
            
            updateExistingSession(userId, { retries: retries });
            
            await messaging.sendMessage(userId, 
                `⚠️ Please choose:\n` +
                `1. ✅ I have a PayCode\n` +
                `2. 🔍 Get PayCode from website\n` +
                `3. ← Choose different category\n\n` +
                `Attempt ${retries}/3`
            );
        }
    }

    // ==================== PAYCODE ENTRY ====================
    async handlePayCodeEntry(userId, message, session) {
        // Check if message contains a PayCode
        const hasPayCode = /CCH/i.test(message);
        
        if (!hasPayCode) {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await messaging.sendMessage(userId, '❌ Too many invalid attempts. Type "hi" to start again.');
                return;
            }
            
            updateExistingSession(userId, { retries: retries });
            
            await messaging.sendMessage(userId, 
                `⚠️ Please send a valid PayCode:\n\n` +
                `✅ Format: CCH123456\n\n` +
                `💡 Get from: ${session.websiteUrl}\n\n` +
                `Attempt ${retries}/3\n\n` +
                `Or type "hi" to cancel.`
            );
            return;
        }
        
        // Process the PayCode
        try {
            // Validate and process PayCode
            const paycodeResult = await paycodeHandler.handlePayCodeMessage(userId, message);
            
            if (paycodeResult && paycodeResult.valid) {
                // PayCode validated - move to amount entry
                updateExistingSession(userId, {
                    step: 'enter_amount',
                    flow: FLOW_STATES.BILL_AMOUNT_ENTRY,
                    paycode: paycodeResult.paycode,
                    billerCode: paycodeResult.billerCode,
                    billerName: paycodeResult.billerName,
                    retries: 0
                });
                
                await messaging.sendMessage(userId,
                    `✅ *PAYCODE VERIFIED*\n\n` +
                    `${session.billEmoji} ${session.billCategoryName}\n` +
                    `🏢 Biller: ${paycodeResult.billerName}\n` +
                    `🔢 Code: ${paycodeResult.billerCode}\n\n` +
                    `How much would you like to pay?\n` +
                    `(Minimum: ZWL ${this.MIN_AMOUNT.toLocaleString()})\n\n` +
                    `*Enter amount in ZWL:*\n` +
                    `Example: 100000 for ZWL 100,000`
                );
            } else {
                // PayCode validation failed
                await messaging.sendMessage(userId,
                    `❌ *INVALID PAYCODE*\n\n` +
                    `Please get a valid PayCode from:\n` +
                    `${session.websiteUrl}\n\n` +
                    `✅ Format: CCH123456\n\n` +
                    `Or type "hi" to start over.`
                );
            }
            
        } catch (error) {
            console.error('PayCode processing error:', error);
            await messaging.sendMessage(userId,
                `❌ Error processing PayCode.\n\n` +
                `Please try again or type "hi" to restart.`
            );
        }
    }

    // ==================== AMOUNT ENTRY ====================
    async handleBillAmountEntry(userId, message, session) {
        const amount = parseInt(message);
        
        if (isNaN(amount) || amount < this.MIN_AMOUNT) {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await messaging.sendMessage(userId, 
                    `❌ Amount must be at least ZWL ${this.MIN_AMOUNT.toLocaleString()}. Type "hi" to start again.`
                );
                return;
            }
            
            updateExistingSession(userId, { retries: retries });
            
            await messaging.sendMessage(userId, 
                `⚠️ Please enter a valid amount:\n\n` +
                `Minimum: ZWL ${this.MIN_AMOUNT.toLocaleString()}\n\n` +
                `Example: 100000 for ZWL 100,000\n\n` +
                `Attempt ${retries}/3`
            );
            return;
        }
        
        const serviceFee = Math.round(amount * this.SERVICE_FEE_PERCENTAGE);
        const total = amount + serviceFee;
        
        updateExistingSession(userId, {
            step: 'confirm_payment',
            flow: FLOW_STATES.BILL_PAYMENT_CONFIRMATION,
            amount: amount,
            serviceFee: serviceFee,
            total: total,
            retries: 0
        });
        
        await messaging.sendMessage(userId, 
            `📋 *PAYMENT SUMMARY*\n\n` +
            `${session.billEmoji} ${session.billCategoryName}\n` +
            `🏢 Biller: ${session.billerName}\n` +
            `🔢 Biller Code: ${session.billerCode}\n\n` +
            `💰 Bill Amount: ZWL ${amount.toLocaleString()}\n` +
            `📈 Service Fee (4%): ZWL ${serviceFee.toLocaleString()}\n` +
            `💰 *Total to Pay: ZWL ${total.toLocaleString()}*\n\n` +
            `💸 *ECO CASH ONLY FOR BILL PAYMENTS*\n\n` +
            `Is this correct?\n\n` +
            `1. ✅ Yes, pay with EcoCash\n` +
            `2. ✏️ Change amount\n` +
            `3. ← Start over\n\n` +
            `*Reply with the number (1-3) of your choice.*`
        );
    }

    // ==================== PAYMENT CONFIRMATION ====================
    async handleBillPaymentConfirmation(userId, message, session) {
        if (message === '1') {
            // Confirm payment
            const transactionId = `BILL-${Date.now().toString().slice(-8)}-${userId.slice(-6)}`;
            
            // TODO: Integrate with actual payment API
            console.log(`💰 Processing bill payment:`, {
                userId,
                amount: session.amount,
                total: session.total,
                biller: session.billerName,
                transactionId
            });
            
            await messaging.sendMessage(userId, 
                `✅ *PAYMENT COMPLETE*\n\n` +
                `💳 *ECO CASH TRANSACTION*\n\n` +
                `${session.billEmoji} ${session.billCategoryName}\n` +
                `🏢 Biller: ${session.billerName}\n` +
                `🔢 Code: ${session.billerCode}\n` +
                `💰 Bill Amount: ZWL ${session.amount.toLocaleString()}\n` +
                `📈 Service Fee: ZWL ${session.serviceFee.toLocaleString()}\n` +
                `💰 Total Paid: ZWL ${session.total.toLocaleString()}\n` +
                `📞 Reference: ${transactionId}\n` +
                `💳 Paid via: EcoCash\n\n` +
                `📄 *RECEIPT*\n` +
                `────────────────────\n` +
                `Date: ${new Date().toLocaleString()}\n` +
                `Reference: ${transactionId}\n` +
                `Service: ${session.billCategoryName}\n` +
                `Biller: ${session.billerName}\n` +
                `Biller Code: ${session.billerCode}\n` +
                `Base Amount: ZWL ${session.amount.toLocaleString()}\n` +
                `Service Fee: ZWL ${session.serviceFee.toLocaleString()} (4%)\n` +
                `Total: ZWL ${session.total.toLocaleString()}\n` +
                `Wallet: EcoCash\n` +
                `Status: ✅ Completed\n` +
                `────────────────────\n\n` +
                `Thank you for using CChub!\n\n` +
                `Type "hi" for another transaction.`
            );
            
            deleteSession(userId);
            
        } else if (message === '2') {
            // Change amount
            updateExistingSession(userId, {
                step: 'enter_amount',
                flow: FLOW_STATES.BILL_AMOUNT_ENTRY,
                retries: 0
            });
            
            await messaging.sendMessage(userId, 
                `✏️ *CHANGE AMOUNT*\n\n` +
                `Please enter the new amount:\n\n` +
                `Minimum: ZWL ${this.MIN_AMOUNT.toLocaleString()}\n\n` +
                `Example: 150000 for ZWL 150,000`
            );
            
        } else if (message === '3') {
            // Start over
            deleteSession(userId);
            await this.startBillPaymentFlow(userId);
            
        } else {
            const retries = (session.retries || 0) + 1;
            
            if (retries >= 3) {
                deleteSession(userId);
                await messaging.sendMessage(userId, '❌ Too many invalid attempts. Type "hi" to start again.');
                return;
            }
            
            updateExistingSession(userId, { retries: retries });
            
            await messaging.sendMessage(userId, 
                `⚠️ Please choose:\n` +
                `1. ✅ Yes, pay with EcoCash\n` +
                `2. ✏️ Change amount\n` +
                `3. ← Start over\n\n` +
                `Attempt ${retries}/3`
            );
        }
    }
}

module.exports = new BillsService();