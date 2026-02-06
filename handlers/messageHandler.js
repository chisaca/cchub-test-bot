// handlers/messageHandler.js
const sessionHandler = require('./sessionHandler');
const paycodeHandler = require('./paycodeHandler');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');

const { updateSession, getActiveSession, deleteSession, userActivity } = sessionHandler;

async function processMessage(from, messageText) {
    console.log(`📱 Processing message from ${from}: "${messageText}"`);
    
    let session = getActiveSession(from);
    
    const cleanMessage = messageText.trim();
    
    // STEP 1: Check for "hi" (always works)
    if (cleanMessage.toLowerCase().includes('hi')) {
        if (userActivity[from]) {
            userActivity[from].attempts = 0;
            userActivity[from].lockoutUntil = 0;
        }
        await messaging.sendWelcomeMessage(from);
        return;
    }

    // STEP 2: Check if user is locked out
    const userState = userActivity[from];
    if (userState && userState.lockoutUntil > Date.now()) {
        const remainingMinutes = Math.ceil((userState.lockoutUntil - Date.now()) / (60 * 1000));
        await messaging.sendMessage(from, `🔒 *ACCOUNT LOCKED*\n\nToo many invalid attempts detected.\n\n⏰ *Time remaining:* ${remainingMinutes} minute(s)\n\nPlease wait or contact support.\n\nType "hi" after lockout expires.`);
        return;
    }

    // STEP 3: Check for PayCodes (most important check first)
    const hasPossiblePayCode = /CCH/i.test(cleanMessage) || /paycode/i.test(cleanMessage) || /cchub/i.test(cleanMessage);
    
    if (hasPossiblePayCode) {
        console.log(`🎯 Possible PayCode detected from ${from}`);
        await paycodeHandler.handlePayCodeMessage(from, cleanMessage);
        return;
    }
    
    // STEP 4: Check for keywords
    const detectedKeyword = validation.detectKeywords(messageText);
    if (detectedKeyword) {
        if (detectedKeyword === 'airtime') {
            await airtimeService.startAirtimeFlow(from);
            return;
        } else if (detectedKeyword === 'zesa') {
            await zesaService.startZesaFlow(from);
            return;
        }
    }
    
    // STEP 5: Handle numbered selections
    if (session && /^\d+$/.test(cleanMessage)) {
        // Check if it's a 6-digit number that might be a PayCode without CCH
        if (cleanMessage.length === 6 && !session.waitingForPaycode && !session.service === 'bill_payment') {
            await messaging.sendMessage(from, `❌ *PAYCODE FORMAT ERROR*\n\nPayCodes must start with "CCH".\n\nYou sent: "${cleanMessage}"\n\n✅ *Correct format:* CCH${cleanMessage}\n\n🔗 *Get valid PayCode:* https://cchub.co.zw\n\nOr type "hi" for other options.`);
            return;
        }
        
        if (session.flow === 'main_menu') {
            await handleMainMenuSelection(from, cleanMessage);
            return;
        } else if (session.flow === 'bill_category_selection') {
            await billsService.handleBillCategorySelection(from, cleanMessage, session);
            return;
        } else if (session.flow === 'bill_code_search_option') {
            await billsService.handleBillCodeSearchOption(from, cleanMessage, session);
            return;
        } else if (session.flow === 'bill_payment_confirmation') {
            await billsService.handleBillPaymentConfirmation(from, cleanMessage, session);
            return;
        } else if (session.flow === 'zesa_wallet_selection') {
            await zesaService.handleWalletSelection(from, cleanMessage, session);
            return;
        } else if (session.flow === 'airtime_wallet_selection') {
            await airtimeService.handleAirtimeWalletSelection(from, cleanMessage, session);
            return;
        }
    }
    
    // STEP 6: Handle amount entry flows
    if (session) {
        if (session.flow === 'bill_amount_entry' && /^\d+$/.test(cleanMessage)) {
            const amount = parseInt(cleanMessage);
            if (amount < 50000) {
                await messaging.sendMessage(from, `❌ *INVALID AMOUNT*\n\nMinimum bill payment is ZWL 50,000.\n\nYou entered: ZWL ${amount.toLocaleString()}\n\n✅ *Please enter:*\n• Minimum: 50000\n• Example: 100000 for ZWL 100,000\n\nOr type "hi" to cancel.`);
                return;
            }
            await billsService.handleBillAmountEntry(from, cleanMessage, session);
            return;
        }
        
        if (session.flow === 'zesa_amount_entry' && /^\d+$/.test(cleanMessage)) {
            await zesaService.handleAmountEntry(from, cleanMessage, session);
            return;
        }
        
        if (session.flow === 'airtime_custom_amount' && /^\d+$/.test(cleanMessage)) {
            await airtimeService.processAirtimeAmount(from, cleanMessage, session);
            return;
        }
        
        if (session.flow === 'airtime_amount_entry' && /^\d$/.test(cleanMessage)) {
            await airtimeService.handleAirtimeAmountEntry(from, cleanMessage, session);
            return;
        }
    }
    
    // STEP 7: Handle other flow-specific inputs
    if (session) {
        if (session.flow === 'zesa_meter_entry' && /^\d+$/.test(cleanMessage) && cleanMessage.length >= 10) {
            await zesaService.handleMeterEntry(from, cleanMessage);
            return;
        } else if (session.flow === 'airtime_recipient_entry') {
            await airtimeService.handleAirtimeRecipientEntry(from, cleanMessage);
            return;
        } else if (session.flow === 'waiting_for_paycode') {
            const hasPayCode = /CCH/i.test(cleanMessage) || /paycode/i.test(cleanMessage);
            if (hasPayCode) {
                await paycodeHandler.handlePayCodeMessage(from, cleanMessage);
            } else {
                await messaging.sendMessage(from, `📋 *WAITING FOR PAYCODE*\n\nPlease send your PayCode:\n\n✅ *Format:* CCH123456\n\n🔗 *Get PayCode:* https://cchub.co.zw\n\nOr type "hi" to cancel.`);
            }
            return;
        } else if (session.flow === 'main_menu') {
            await messaging.sendMessage(from, 'Please type "hi" to see the main menu with numbered options.');
            return;
        }
        
        // Invalid input for current flow
        const errorMessage = validation.getFlowErrorMessage(session.flow);
        await messaging.sendMessage(from, errorMessage);
        return;
    }
    
    // STEP 8: No active session
    if (cleanMessage.toLowerCase().includes('bill') || cleanMessage.toLowerCase().includes('pay')) {
        await messaging.sendMessage(from, `💳 *BILL PAYMENTS REQUIRE PAYCODE*\n\nFor all bill payments (School, Council, Insurance, Retail):\n\n1. Visit: https://cchub.co.zw\n2. Search and select your biller\n3. Get your 6-digit PayCode\n4. Return here and send: CCH123456\n\n✅ *Example:* CCH789012\n\nOr type "hi" for ZESA or Airtime options.`);
    } else if (/^\d{6}$/.test(cleanMessage)) {
        await messaging.sendMessage(from, `❌ *PAYCODE FORMAT ERROR*\n\nPayCodes must start with "CCH".\n\nYou sent: "${cleanMessage}"\n\n✅ *Correct format:* CCH${cleanMessage}\n\n🔗 *Get valid PayCode:* https://cchub.co.zw\n\nOr type "hi" for other options.`);
    } else if (/^\d+$/.test(cleanMessage) && cleanMessage.length >= 10) {
        const sessionId = updateSession(from, {
            flow: 'zesa_meter_entry',
            service: 'zesa',
            testTransaction: true
        });
        await zesaService.handleMeterEntry(from, cleanMessage);
    } else {
        await messaging.sendWelcomeMessage(from);
    }
}

async function handleMainMenuSelection(from, choice) {
    const menuOptions = {
        '1': 'buy_zesa',
        '2': 'buy_airtime',
        '3': 'pay_bill',
        '4': 'help'
    };
    
    const selectedOption = menuOptions[choice];
    
    if (!selectedOption) {
        await messaging.sendMessage(from, '❌ Invalid selection. Please choose a number from 1-4.\n\n1. Buy ZESA\n2. Buy Airtime\n3. Pay Bill\n4. Help');
        return;
    }
    
    if (selectedOption === 'buy_zesa') {
        await zesaService.startZesaFlow(from);
    } else if (selectedOption === 'buy_airtime') {
        await airtimeService.startAirtimeFlow(from);
    } else if (selectedOption === 'pay_bill') {
        await billsService.startBillPaymentFlow(from);
    } else if (selectedOption === 'help') {
        await messaging.sendMessage(from, '🆘 *HELP - TEST MODE*\n\nThis is a test simulation bot for CCHub.\n\n• Type "hi" to see main menu\n• Select option 1 for ZESA test\n• Select option 2 for Airtime test\n• Select option 3 for Bill Payment test\n• All transactions are simulated\n• No real payments are processed');
    }
}

module.exports = {
    processMessage,
    handleMainMenuSelection
};