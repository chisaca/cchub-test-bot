// handlers/messageHandler.js
const sessionHandler = require('./sessionHandler');
const paycodeHandler = require('./paycodeHandler');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const { FLOW_STATES } = require('../config/constants');

const { updateSession, getActiveSession, deleteSession, userActivity } = sessionHandler;

async function processMessage(from, messageText) {
    console.log(`📱 Processing message from ${from}: "${messageText}"`);
    
    let session = getActiveSession(from);
    const cleanMessage = messageText.trim().toLowerCase();
    
    // STEP 1: Check for "hi" (always works)
    if (cleanMessage.includes('hi') || cleanMessage.includes('hello') || cleanMessage.includes('menu')) {
        if (userActivity[from]) {
            userActivity[from].attempts = 0;
            userActivity[from].lockoutUntil = 0;
        }
        deleteSession(from);
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
        await paycodeHandler.handlePayCodeMessage(from, messageText);
        return;
    }
    
    // STEP 4: Check for keywords (natural language)
    if (cleanMessage.includes('emergency')) {
        await emergencyService.startEmergencyFlow(from);
        return;
    }
    
    if (cleanMessage.includes('help') || cleanMessage === '5') {
        await helpService.sendHelpMessage(from);
        return;
    }
    
    // STEP 5: Handle airtime requests - ALL airtime messages go through handleAirtimeRequest
    if (session && session.service === 'airtime') {
        await airtimeService.handleAirtimeRequest(from, cleanMessage);
        return;
    }
    
    // STEP 6: Handle natural language for starting airtime flow
    const detectedKeyword = validation.detectKeywords(messageText);
    if (detectedKeyword === 'airtime' || cleanMessage.includes('airtime') || cleanMessage.includes('topup')) {
        await airtimeService.startAirtimeFlow(from);
        return;
    }
    
    // STEP 7: Handle numbered selections
    if (session && /^\d+$/.test(cleanMessage)) {
        // Check if it's a 6-digit number that might be a PayCode without CCH
        if (cleanMessage.length === 6 && !session.waitingForPaycode && session.service !== 'bill_payment') {
            await messaging.sendMessage(from, `❌ *PAYCODE FORMAT ERROR*\n\nPayCodes must start with "CCH".\n\nYou sent: "${cleanMessage}"\n\n✅ *Correct format:* CCH${cleanMessage}\n\n🔗 *Get valid PayCode:* https://cchub.co.zw\n\nOr type "hi" for other options.`);
            return;
        }
        
        if (session.flow === FLOW_STATES.MAIN_MENU) {
            await handleMainMenuSelection(from, cleanMessage);
            return;
        } else if (session.flow === FLOW_STATES.BILL_CATEGORY_SELECTION) {
            await billsService.handleBillCategorySelection(from, cleanMessage, session);
            return;
        } else if (session.flow === FLOW_STATES.BILL_CODE_SEARCH_OPTION) {
            await billsService.handleBillCodeSearchOption(from, cleanMessage, session);
            return;
        } else if (session.flow === FLOW_STATES.BILL_PAYMENT_CONFIRMATION) {
            await billsService.handleBillPaymentConfirmation(from, cleanMessage, session);
            return;
        } else if (session.flow === FLOW_STATES.ZESA_WALLET_SELECTION) {
            await zesaService.handleWalletSelection(from, cleanMessage, session);
            return;
        } else if (session.flow === FLOW_STATES.EMERGENCY_SERVICE_SELECT) {
            await emergencyService.handleEmergencyServiceSelect(from, cleanMessage, session);
            return;
        } else if (session.flow === FLOW_STATES.EMERGENCY_PROVINCE_SELECT) {
            await emergencyService.handleEmergencyProvinceSelect(from, cleanMessage, session);
            return;
        }
    }
    
    // STEP 8: Handle amount entry flows
    if (session) {
        if (session.flow === FLOW_STATES.BILL_AMOUNT_ENTRY && /^\d+$/.test(cleanMessage)) {
            const amount = parseInt(cleanMessage);
            if (amount < 50000) {
                await messaging.sendMessage(from, `❌ *INVALID AMOUNT*\n\nMinimum bill payment is ZWL 50,000.\n\nYou entered: ZWL ${amount.toLocaleString()}\n\n✅ *Please enter:*\n• Minimum: 50000\n• Example: 100000 for ZWL 100,000\n\nOr type "hi" to cancel.`);
                return;
            }
            await billsService.handleBillAmountEntry(from, cleanMessage, session);
            return;
        }
        
        if (session.flow === FLOW_STATES.ZESA_AMOUNT_ENTRY && /^\d+$/.test(cleanMessage)) {
            await zesaService.handleAmountEntry(from, cleanMessage, session);
            return;
        }
        
        // Handle zesa meter number entry
        if (session.flow === FLOW_STATES.ZESA_METER_ENTRY && /^\d+$/.test(cleanMessage) && cleanMessage.length >= 10) {
            await zesaService.handleMeterEntry(from, cleanMessage);
            return;
        }
        
        // Handle waiting for paycode
        if (session.flow === FLOW_STATES.WAITING_FOR_PAYCODE) {
            const hasPayCode = /CCH/i.test(cleanMessage) || /paycode/i.test(cleanMessage);
            if (hasPayCode) {
                await paycodeHandler.handlePayCodeMessage(from, cleanMessage);
            } else {
                await messaging.sendMessage(from, `📋 *WAITING FOR PAYCODE*\n\nPlease send your PayCode:\n\n✅ *Format:* CCH123456\n\n🔗 *Get PayCode:* https://cchub.co.zw\n\nOr type "hi" to cancel.`);
            }
            return;
        }
        
        // Handle emergency fetching
        if (session.flow === FLOW_STATES.EMERGENCY_FETCHING) {
            await messaging.sendMessage(from, '⏳ *Still fetching emergency services...*\n\nPlease wait a moment.');
            return;
        }
        
        // Handle main menu redirect
        if (session.flow === FLOW_STATES.MAIN_MENU) {
            await messaging.sendMessage(from, 'Please type "hi" to see the main menu with numbered options.');
            return;
        }
        
        // Invalid input for current flow
        const errorMessage = validation.getFlowErrorMessage(session.flow);
        await messaging.sendMessage(from, errorMessage);
        return;
    }
    
    // STEP 9: No active session - check for direct menu options
    if (/^[1-5]$/.test(cleanMessage)) {
        await handleMainMenuSelection(from, cleanMessage);
        return;
    }
    
    // STEP 10: Direct keyword detection for starting services
    if (cleanMessage.includes('zesa') || cleanMessage.includes('electricity')) {
        await zesaService.startZesaFlow(from);
    } else if (cleanMessage.includes('bill') || cleanMessage.includes('pay')) {
        await messaging.sendMessage(from, `💳 *BILL PAYMENTS REQUIRE PAYCODE*\n\nFor all bill payments (School, Council, Insurance, Retail):\n\n1. Visit: https://cchub.co.zw\n2. Search and select your biller\n3. Get your 6-digit PayCode\n4. Return here and send: CCH123456\n\n✅ *Example:* CCH789012\n\nOr type "hi" for other options.`);
    } else if (/^\d{6}$/.test(cleanMessage)) {
        await messaging.sendMessage(from, `❌ *PAYCODE FORMAT ERROR*\n\nPayCodes must start with "CCH".\n\nYou sent: "${cleanMessage}"\n\n✅ *Correct format:* CCH${cleanMessage}\n\n🔗 *Get valid PayCode:* https://cchub.co.zw\n\nOr type "hi" for other options.`);
    } else if (/^\d+$/.test(cleanMessage) && cleanMessage.length >= 10) {
        // Direct meter number entry
        updateSession(from, {
            flow: FLOW_STATES.ZESA_METER_ENTRY,
            service: 'zesa',
            testTransaction: true
        });
        await zesaService.handleMeterEntry(from, cleanMessage);
    } else {
        // Default: send welcome message
        await messaging.sendWelcomeMessage(from);
    }
}

async function handleMainMenuSelection(from, choice) {
    const menuOptions = {
        '1': 'buy_airtime',   
        '2': 'buy_zesa',      
        '3': 'pay_bill',      
        '4': 'emergency_services',
        '5': 'help'
    };
    
    const selectedOption = menuOptions[choice];
    
    if (!selectedOption) {
        await messaging.sendMessage(from, '❌ Invalid selection. Please choose a number from 1-5.\n\n1. Buy Airtime\n2. Buy ZESA\n3. Pay Bill\n4. Emergency Services\n5. Help');
        return;
    }
    
    if (selectedOption === 'buy_zesa') {
        await zesaService.startZesaFlow(from);
    } else if (selectedOption === 'buy_airtime') {
        await airtimeService.startAirtimeFlow(from);
    } else if (selectedOption === 'pay_bill') {
        await billsService.startBillPaymentFlow(from);
    } else if (selectedOption === 'emergency_services') {
        await emergencyService.startEmergencyFlow(from);
    } else if (selectedOption === 'help') {
        await helpService.sendHelpMessage(from);
    }
}

module.exports = {
    processMessage,
    handleMainMenuSelection
};