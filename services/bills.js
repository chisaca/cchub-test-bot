// services/bills.js
const sessionHandler = require('../handlers/sessionHandler');
const messaging = require('../utils/messaging');
const { MOCK_BILLERS, BILLER_SEARCH_URLS } = require('../data/mockData');

const { updateSession, getActiveSession, deleteSession } = sessionHandler;

async function startBillPaymentFlow(from) {
    const sessionId = updateSession(from, {
        flow: 'bill_category_selection',
        service: 'bill_payment',
        testTransaction: false,
        paycodeRequired: true
    });
    
    await messaging.sendMessage(from, `💳 *BILL PAYMENT*\n\n*All bill payments require a PayCode from our website.*\n\n📋 *PAYCODE FORMAT:* CCH123456\n\nWhat type of bill would you like to pay?\n\n1. 🏫 School Fees\n2. 🏛️ City Council\n3. 🛡️ Insurance\n4. 🛒 Retail/Subscriptions\n5. ← Back to Main Menu\n\n*Reply with the number (1-5) of your choice.*`);
}

async function handleBillCategorySelection(from, choice, session) {
    const categoryOptions = {
        '1': { type: 'school_fees', name: 'School Fees', emoji: '🏫' },
        '2': { type: 'city_council', name: 'City Council', emoji: '🏛️' },
        '3': { type: 'insurance', name: 'Insurance', emoji: '🛡️' },
        '4': { type: 'retail_subscriptions', name: 'Retail/Subscriptions', emoji: '🛒' },
        '5': { type: 'back', name: 'Back', emoji: '←' }
    };
    
    const selectedCategory = categoryOptions[choice];
    
    if (!selectedCategory) {
        await messaging.sendMessage(from, '❌ Invalid selection. Please choose a number from 1-5.');
        return;
    }
    
    if (selectedCategory.type === 'back') {
        await messaging.sendWelcomeMessage(from);
        return;
    }
    
    const searchUrl = BILLER_SEARCH_URLS[selectedCategory.type];
    
    const sessionId = updateSession(from, {
        ...session,
        flow: 'bill_code_search_option',
        billCategory: selectedCategory.type,
        billCategoryName: selectedCategory.name,
        billEmoji: selectedCategory.emoji,
        websiteUrl: searchUrl
    });
    
    await messaging.sendMessage(from, `${selectedCategory.emoji} *${selectedCategory.name.toUpperCase()} PAYMENT*\n\nFor ${selectedCategory.name.toLowerCase()} payments:\n\n🔒 *SECURE PAYCODE REQUIRED*\n\n📋 *FORMAT:* CCH123456\n\n1. Visit: ${searchUrl}\n2. Search and select\n3. Get 6-digit PayCode\n4. Return here and send: CCH123456\n\n✅ *Example:* CCH789012\n\nOr choose:\n1. ✅ I have a PayCode (send CCH123456)\n2. 🔍 Get PayCode from website\n3. ← Choose different category`);
}

async function handleBillCodeSearchOption(from, choice, session) {
    if (choice === '1') {
        await messaging.sendMessage(from, `${session.billEmoji} *SEND YOUR PAYCODE*\n\nPlease send your PayCode:\n\n📋 *EXAMPLE:* CCH123456\n\n💡 *Got from:* ${session.websiteUrl}`);
        
        const sessionId = updateSession(from, {
            ...session,
            flow: 'waiting_for_paycode',
            waitingForPaycode: true
        });
        
    } else if (choice === '2') {
        await messaging.sendMessage(from, `${session.billEmoji} *GET PAYCODE FROM WEBSITE*\n\n1. Visit: ${session.websiteUrl}\n2. Search your ${session.billCategoryName.toLowerCase()}\n3. Click "Pay with WhatsApp"\n4. Get 6-digit PayCode\n5. Return here and send the PayCode\n\n📋 PayCode example: CCH123456\n\n🔒 *Why PayCodes?*\n• Prevents biller code errors\n• Ensures correct provider\n• Secure one-time use\n• 10-minute expiration`);
        
        const sessionId = updateSession(from, {
            ...session,
            flow: 'waiting_for_paycode',
            waitingForPaycode: true
        });
        
    } else if (choice === '3') {
        await startBillPaymentFlow(from);
    } else {
        await messaging.sendMessage(from, '❌ Invalid selection. Please choose 1, 2, or 3.');
    }
}

async function handleBillCodeEntry(from, billerCode, session) {
    const formattedCode = billerCode.padStart(4, '0');
    const biller = MOCK_BILLERS[formattedCode];
    
    if (!biller) {
        await messaging.sendMessage(from, `❌ *BILLER CODE NOT FOUND*\n\nCode "${formattedCode}" is not valid.\n\nPlease use a valid 4-digit biller code.\n\nTest codes for ${session.billCategoryName}:\n${getTestCodesForCategory(session.billCategory)}\n\n💡 *Find biller codes at:* ${BILLER_SEARCH_URLS[session.billCategory]}`);
        return;
    }
    
    if (biller.type !== session.billCategory) {
        await messaging.sendMessage(from, `❌ *WRONG CATEGORY*\n\nCode "${formattedCode}" belongs to ${biller.category}, not ${session.billCategoryName}.\n\nPlease use a ${session.billCategoryName} biller code or choose the correct category.`);
        return;
    }
    
    const sessionId = updateSession(from, {
        ...session,
        flow: 'bill_amount_entry',
        billerCode: formattedCode,
        billerName: biller.name,
        billerCategory: biller.category
    });
    
    await messaging.sendMessage(from, `✅ *BILLER VERIFIED* ⚠️\n\n${session.billEmoji} ${session.billCategoryName}\n🏢 Biller: ${biller.name}\n🔢 Code: ${formattedCode}\n\n💡 *THIS IS A TEST - NO REAL PAYMENT*\n\nHow much would you like to pay?\n(Minimum: ZWL 50,000)\n\n*Enter amount in ZWL:*\nExample: 100000 for ZWL 100,000`);
}

async function handleBillAmountEntry(from, amountText, session) {
    const amount = parseInt(amountText);
    
    if (isNaN(amount) || amount < 50000) {
        await messaging.sendMessage(from, 'Please enter a valid amount (minimum ZWL 50,000).\n\nExample: 100000 for ZWL 100,000');
        return;
    }
    
    const serviceFee = Math.round(amount * 0.04);
    const total = amount + serviceFee;
    
    const sessionId = updateSession(from, {
        ...session,
        flow: 'bill_payment_confirmation',
        amount: amount,
        serviceFee: serviceFee,
        total: total
    });
    
    await messaging.sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n${session.billEmoji} ${session.billCategoryName}\n🏢 Biller: ${session.billerName}\n🔢 Biller Code: ${session.billerCode}\n\n💰 Bill Amount: ZWL ${amount.toLocaleString()}\n📈 Service Fee (4%): ZWL ${serviceFee.toLocaleString()}\n💰 *Total to Pay: ZWL ${total.toLocaleString()}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n💳 *ECO CASH ONLY FOR BILL PAYMENTS*\n\nIs this correct?\n\n1. ✅ Yes, pay with EcoCash\n2. ✏️ Change amount\n3. ← Start over\n\n*Reply with the number (1-3) of your choice.*`);
}

async function handleBillPaymentConfirmation(from, choice, session) {
    if (choice === '1') {
        const transactionId = `TEST-BILL-${Date.now().toString().slice(-8)}`;
        
        await messaging.sendMessage(from, `✅ *TEST PAYMENT COMPLETE* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n💳 *ECO CASH ONLY TRANSACTION*\n\n${session.billEmoji} ${session.billCategoryName}\n🏢 Biller: ${session.billerName}\n🔢 Code: ${session.billerCode}\n💰 Bill Amount: ZWL ${session.amount.toLocaleString()}\n📈 Service Fee: ZWL ${session.serviceFee.toLocaleString()}\n💰 Total Paid: ZWL ${session.total.toLocaleString()}\n📞 Reference: ${transactionId}\n💳 Paid via: EcoCash\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: ${transactionId}\nService: ${session.billCategoryName} (Test Mode)\nBiller: ${session.billerName}\nBiller Code: ${session.billerCode}\nBase Amount: ZWL ${session.amount.toLocaleString()}\nService Fee: ZWL ${session.serviceFee.toLocaleString()} (4%)\nTotal: ZWL ${session.total.toLocaleString()}\nWallet: EcoCash (Only)\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "hi" to start again.`);
        
        deleteSession(from);
    } else if (choice === '2') {
        const sessionId = updateSession(from, {
            ...session,
            flow: 'bill_amount_entry'
        });
        
        await messaging.sendMessage(from, `✏️ *CHANGE AMOUNT*\n\nPlease enter the new amount (minimum ZWL 50,000):\n\nExample: 150000 for ZWL 150,000`);
    } else if (choice === '3') {
        await startBillPaymentFlow(from);
    } else {
        await messaging.sendMessage(from, '❌ Invalid selection. Please choose 1, 2, or 3.');
    }
}

function getTestCodesForCategory(category) {
    const categoryCodes = {
        'school_fees': ['0001', '0002', '0003'],
        'city_council': ['0004', '0005', '0006'],
        'insurance': ['0007', '0008', '0009'],
        'retail_subscriptions': ['0010', '0011', '0012']
    };
    
    return categoryCodes[category]?.map(code => `• ${code}`).join('\n') || '';
}

module.exports = {
    startBillPaymentFlow,
    handleBillCategorySelection,
    handleBillCodeSearchOption,
    handleBillCodeEntry,
    handleBillAmountEntry,
    handleBillPaymentConfirmation,
    getTestCodesForCategory
};