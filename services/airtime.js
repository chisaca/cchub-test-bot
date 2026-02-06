// services/airtime.js
const { 
    PAYMENT_CONFIG, 
    AIRTIME_PRESETS, 
    WALLET_OPTIONS,
    FLOW_STATES 
} = require('../config/constants');
const sessionHandler = require('../handlers/sessionHandler');
const validation = require('../utils/validation');
const messaging = require('../utils/messaging');

const { updateSession, getActiveSession, deleteSession } = sessionHandler;

async function startAirtimeFlow(from) {
    const sessionId = updateSession(from, {
        flow: 'airtime_recipient_entry',
        service: 'airtime',
        testTransaction: true,
        retryCount: 0
    });
    
    await messaging.sendMessage(from, `📱 *TEST MODE - AIRTIME PURCHASE*\n\n⚠️ *THIS IS A TEST SIMULATION*\nNo real payments will be processed.\n\nPlease enter the phone number to receive airtime:\n\n*Format:* 0770123456 (10 digits, starts with 0)\n\nValid network prefixes:\n• 077, 078 = Econet\n• 071 = NetOne\n• 073 = Telecel\n\nOr type "hi" to go back to main menu.`);
}

async function handleAirtimeRecipientEntry(from, phoneNumber) {
    const session = getActiveSession(from);
    
    if (phoneNumber.toLowerCase().includes('hi')) {
        await messaging.sendWelcomeMessage(from);
        return;
    }
    
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const validationResult = validation.validateAndDetectNetwork(cleanPhone);
    
    if (!validationResult.valid) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await messaging.sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await messaging.sendWelcomeMessage(from);
            return;
        }
        
        if (session) {
            updateSession(from, {
                ...session,
                retryCount: retryCount,
                expiresAt: Date.now() + (10 * 60 * 1000)
            });
        }
        
        await messaging.sendMessage(from, `❌ *INVALID PHONE NUMBER*\n\n${validationResult.error}\n\nPlease enter a valid 10-digit number:\n• Starts with 0\n• Valid prefixes: 077, 078, 071, 073\n\nExample: 0770123456\n\nOr type "hi" to go back to main menu.`);
        return;
    }
    
    const sessionId = updateSession(from, {
        flow: 'airtime_amount_entry',
        service: 'airtime',
        testTransaction: true,
        recipientNumber: validationResult.original,
        formattedNumber: validationResult.formattedNumber,
        network: validationResult.network,
        retryCount: 0
    });
    
    await messaging.sendMessage(from, `✅ *NUMBER VERIFIED* ⚠️\n\n📱 Sending to: ${validationResult.formattedNumber}\n📶 Network: ${validationResult.network}\n\n💡 *THIS IS A TEST - NO REAL PAYMENT*\n\nHow much airtime would you like to buy?\n\n*Choose an option:*\n1. ZWL 5,000\n2. ZWL 10,000\n3. ZWL 20,000\n4. Other amount\n\n*Reply with the number (1-4) of your choice.*\n\nOr type "hi" to go back to main menu.`);
}

async function handleAirtimeAmountEntry(from, choice, session) {
    if (choice.toLowerCase().includes('hi')) {
        await messaging.sendWelcomeMessage(from);
        return;
    }
    
    const amountOptions = {
        '1': 5000,
        '2': 10000,
        '3': 20000,
        '4': 'other'
    };
    
    let selectedAmount = amountOptions[choice];
    
    if (!selectedAmount) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await messaging.sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await messaging.sendWelcomeMessage(from);
            return;
        }
        
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000)
        });
        
        await messaging.sendMessage(from, '❌ Invalid selection. Please choose a number from 1-4:\n\n1. ZWL 5,000\n2. ZWL 10,000\n3. ZWL 20,000\n4. Other amount\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    if (selectedAmount === 'other') {
        const sessionId = updateSession(from, {
            ...session,
            flow: 'airtime_custom_amount',
            waitingForCustomAmount: true
        });
        
        await messaging.sendMessage(from, '💵 Please enter your custom amount (minimum ZWL 100):\n\nExample: 15000 for ZWL 15,000\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    await processAirtimeAmount(from, selectedAmount, session);
}

async function processAirtimeAmount(from, amount, session) {
    if (typeof amount === 'string' && amount.toLowerCase().includes('hi')) {
        await messaging.sendWelcomeMessage(from);
        return;
    }
    
    const amountValue = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (isNaN(amountValue) || amountValue < PAYMENT_CONFIG.MIN_AMOUNTS.AIRTIME) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await messaging.sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await messaging.sendWelcomeMessage(from);
            return;
        }
        
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000)
        });
        
        await messaging.sendMessage(from, '❌ Please enter a valid amount (minimum ZWL 100).\nExample: 15000 for ZWL 15,000\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const serviceFee = (amountValue * PAYMENT_CONFIG.SERVICE_FEES.AIRTIME).toFixed(2);
    const total = (amountValue + parseFloat(serviceFee)).toFixed(2);
    
    const sessionId = updateSession(from, {
        ...session,
        flow: 'airtime_wallet_selection',
        amount: amountValue,
        serviceFee: serviceFee,
        total: total,
        waitingForCustomAmount: false,
        retryCount: 0
    });
    
    await messaging.sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n📱 To: ${session.formattedNumber}\n📶 Network: ${session.network}\n💵 Airtime Value: ZWL ${amountValue.toLocaleString()}\n📈 Service Fee (8%): ZWL ${serviceFee}\n💰 *Total to Pay: ZWL ${total}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n\nSelect a test wallet to pay with:\n\n1. EcoCash\n2. OneMoney\n3. Innbucks\n4. Mukuru\n5. Omari\n6. Telecash\n\n*Reply with the number (1-6) of your choice.*\n\nOr type "hi" to go back to main menu.`);
}

async function handleAirtimeWalletSelection(from, walletChoice, session) {
    if (walletChoice.toLowerCase().includes('hi')) {
        await messaging.sendWelcomeMessage(from);
        return;
    }
    
    const walletOptions = {
        '1': 'EcoCash',
        '2': 'OneMoney',
        '3': 'Innbucks',
        '4': 'Mukuru',
        '5': 'Omari',
        '6': 'Telecash'
    };
    
    const selectedWallet = WALLET_OPTIONS.AIRTIME[walletChoice];
    
    if (!selectedWallet) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await messaging.sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await messaging.sendWelcomeMessage(from);
            return;
        }
        
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000)
        });
        
        await messaging.sendMessage(from, '❌ Invalid selection. Please choose a number from 1-6:\n\n1. EcoCash\n2. OneMoney\n3. Innbucks\n4. Mukuru\n5. Omari\n6. Telecash\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const transactionId = `TEST-AIR-${Date.now().toString().slice(-8)}`;
    
    await messaging.sendMessage(from, `✅ *TEST AIRTIME SENT* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n\n📱 To: ${session.formattedNumber}\n💵 Face Value: ZWL ${session.amount.toLocaleString()}\n📈 Service Fee: ZWL ${session.serviceFee}\n📶 Network: ${session.network}\n📞 Reference: ${transactionId}\n💳 Paid via: ${selectedWallet}\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: ${transactionId}\nService: Airtime Top-up (Test Mode)\nRecipient: ${session.formattedNumber}\nNetwork: ${session.network}\nBase Amount: ZWL ${session.amount.toLocaleString()}\nService Fee: ZWL ${session.serviceFee} (8%)\nTotal: ZWL ${session.total}\nWallet: ${selectedWallet}\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "hi" to start again.`);
    
    deleteSession(from);
}

module.exports = {
    startAirtimeFlow,
    handleAirtimeRecipientEntry,
    handleAirtimeAmountEntry,
    processAirtimeAmount,
    handleAirtimeWalletSelection
};