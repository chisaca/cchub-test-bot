// services/zesa.js
const sessionHandler = require('../handlers/sessionHandler');
const messaging = require('../utils/messaging');
const { TEST_METERS } = require('../data/mockData');

const { updateSession, getActiveSession, deleteSession } = sessionHandler;

async function startZesaFlow(from) {
    const sessionId = updateSession(from, {
        flow: 'zesa_meter_entry',
        service: 'zesa',
        testTransaction: true,
        retryCount: 0
    });
    
    await messaging.sendMessage(from, `🔌 *TEST MODE - ZESA TOKEN PURCHASE*\n\n⚠️ *THIS IS A TEST SIMULATION*\nNo real payments will be processed.\n\nPlease enter your test meter number:\n\nTest meter numbers you can use:\n• 12345678901\n• 11111111111\n• 22222222222\n\nType "hi" to go back to main menu.`);
}

async function handleMeterEntry(from, meterNumber) {
    const session = getActiveSession(from);
    
    if (meterNumber.toLowerCase().includes('hi')) {
        await messaging.sendWelcomeMessage(from);
        return;
    }
    
    if (!meterNumber || meterNumber.length < 10) {
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
        
        await messaging.sendMessage(from, '❌ Please enter a valid test meter number (at least 10 digits).\n\nTest numbers: 12345678901, 11111111111, 22222222222\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const meterData = TEST_METERS[meterNumber];
    
    if (!meterData) {
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
        
        await messaging.sendMessage(from, `❌ *TEST METER NOT FOUND*\n\nPlease use one of these test meter numbers:\n• 12345678901\n• 11111111111\n• 22222222222\n\nThis is a simulation only.\n\nOr type "hi" to go back to main menu.`);
        return;
    }
    
    const sessionId = updateSession(from, {
        flow: 'zesa_amount_entry',
        service: 'zesa',
        testTransaction: true,
        meterNumber: meterNumber,
        customerName: meterData.customerName,
        area: meterData.area,
        previousUnits: meterData.previousUnits,
        retryCount: 0
    });
    
    await messaging.sendMessage(from, `✅ *TEST METER VERIFIED* ⚠️\n\n🔢 Meter: ${meterNumber}\n👤 Account: ${meterData.customerName}\n📍 Area: ${meterData.area}\n📊 Previous Units: ${meterData.previousUnits}\n\n💡 *THIS IS A TEST - NO REAL PAYMENT*\n\nHow much would you like to pay for token units?\n(Minimum: $1)\n\n*Enter amount:*\nExample: 10 for $10\n\nOr type "hi" to go back to main menu.`);
}

async function handleAmountEntry(from, amountText, session) {
    if (amountText.toLowerCase().includes('hi')) {
        await messaging.sendWelcomeMessage(from);
        return;
    }
    
    const amount = parseFloat(amountText);
    
    if (isNaN(amount) || amount < 1) {
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
        
        await messaging.sendMessage(from, '❌ Please enter a valid amount (minimum $1).\nExample: 10\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const serviceFee = (amount * 0.05).toFixed(2);
    const total = (amount + parseFloat(serviceFee)).toFixed(2);
    
    const sessionId = updateSession(from, {
        ...session,
        flow: 'zesa_wallet_selection',
        amount: amount,
        serviceFee: serviceFee,
        total: total,
        retryCount: 0
    });
    
    await messaging.sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n👤 For: ${session.customerName}\n🔢 Meter: ${session.meterNumber}\n\n💡 Token Units: $${amount.toFixed(2)}\n📈 Service Fee (5%): $${serviceFee}\n💰 *Total to Pay: $${total}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n\nSelect a test wallet:\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari\n\n*Reply with the number (1-5) of your choice.*\n\nOr type "hi" to go back to main menu.`);
}

async function handleWalletSelection(from, walletChoice, session) {
    if (walletChoice.toLowerCase().includes('hi')) {
        await messaging.sendWelcomeMessage(from);
        return;
    }
    
    const walletOptions = {
        '1': 'EcoCash USD',
        '2': 'OneMoney USD',
        '3': 'Innbucks USD',
        '4': 'Mukuru',
        '5': 'Omari'
    };
    
    const selectedWallet = walletOptions[walletChoice];
    
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
        
        await messaging.sendMessage(from, '❌ Invalid selection. Please choose a number from 1-5:\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const testToken = Array.from({length: 4}, () => 
        Math.floor(1000 + Math.random() * 9000)
    ).join('-');
    
    const newUnits = (session.amount + session.previousUnits).toFixed(2);
    
    await messaging.sendMessage(from, `✅ *TEST TRANSACTION COMPLETE* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n\n👤 For: ${session.customerName}\n🔢 Meter: ${session.meterNumber}\n🔑 *Test Token:* ${testToken}\n💡 Units: $${session.amount.toFixed(2)} (+${session.previousUnits} previous = ${newUnits} total)\n📈 Service Fee: $${session.serviceFee}\n💰 Total Paid: $${session.total}\n📞 Reference: TEST-ZESA-${Date.now().toString().slice(-6)}\n💳 Paid via: ${selectedWallet}\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: TEST-ZESA-${Date.now().toString().slice(-6)}\nService: ZESA Tokens (Test Mode)\nMeter: ${session.meterNumber}\nBase Amount: $${session.amount.toFixed(2)}\nService Fee: $${session.serviceFee} (5%)\nTotal: $${session.total}\nWallet: ${selectedWallet}\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "hi" to start again.`);
    
    deleteSession(from);
}

module.exports = {
    startZesaFlow,
    handleMeterEntry,
    handleAmountEntry,
    handleWalletSelection
};