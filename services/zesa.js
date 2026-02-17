// services/zesa.js - CORRECTED with proper PayNow integration
/**
 * ZESA Flow Handler
 * Manages the conversation flow for ZESA purchases
 */

const currencyGate = require('./currencyGate');
const paynow = require('./paynow');
const hotrecharge = require('./hotrecharge');
const { createSession, updateSession, getActiveSession, deleteSession } = require('../handlers/sessionHandlers');

// Flow states
const STATES = {
    SELECT_CURRENCY: 'SELECT_CURRENCY',
    ENTER_METER: 'ENTER_METER',
    VERIFY_METER: 'VERIFY_METER',
    ENTER_AMOUNT: 'ENTER_AMOUNT',
    SELECT_PAYMENT: 'SELECT_PAYMENT',
    ENTER_PAYMENT_PHONE: 'ENTER_PAYMENT_PHONE',
    ENTER_NOTIFICATION_PHONE: 'ENTER_NOTIFICATION_PHONE',
    CONFIRM: 'CONFIRM',
    PROCESSING: 'PROCESSING'
};

// Phone validation
const PHONE_REGEX = /^(\+?263|0)[0-9]{9}$/;

/**
 * Start ZESA flow
 */
async function startFlow(from, currency = null) {
    console.log(`⚡ [ZESA] Starting flow for user: ${from}`);
    
    deleteSession(from);
    const session = createSession(from, 'zesa');
    
    session.state = STATES.SELECT_CURRENCY;
    session.data = { userId: from };

    if (currency) {
        session.data.currency = currency.toLowerCase();
        session.state = STATES.ENTER_METER;
        updateSession(from, { state: session.state, data: session.data });
        
        return {
            message: `⚡ *ZESA Purchase*\n\nPlease enter your 11-digit ZESA meter number:`,
            session: session
        };
    }

    updateSession(from, { state: session.state, data: session.data });
    
    return {
        message: `⚡ *ZESA Purchase*\n\nPlease select currency:\n\n1️⃣ ZiG\n2️⃣ USD\n\n────────────────\nReply with *1* or *2*`,
        session: session
    };
}

/**
 * Handle ZESA flow messages
 */
async function handleRequest(userId, messageText, session) {
    console.log(`⚡ [ZESA] Handling message - State: ${session.state}`);
    
    const activeSession = getActiveSession(userId);
    if (!activeSession) {
        return {
            message: `⚠️ *Session Expired*\n\nPlease start again by typing *hi*`,
            session: null
        };
    }
    
    try {
        let result;
        
        switch (session.state) {
            case STATES.SELECT_CURRENCY:
                result = await handleCurrencySelection(userId, messageText, session);
                break;
            case STATES.ENTER_METER:
                result = await handleMeterEntry(userId, messageText, session);
                break;
            case STATES.VERIFY_METER:
                result = await handleMeterVerification(userId, messageText, session);
                break;
            case STATES.ENTER_AMOUNT:
                result = await handleAmountEntry(userId, messageText, session);
                break;
            case STATES.SELECT_PAYMENT:
                result = await handlePaymentSelection(userId, messageText, session);
                break;
            case STATES.ENTER_PAYMENT_PHONE:
                result = await handlePaymentPhone(userId, messageText, session);
                break;
            case STATES.ENTER_NOTIFICATION_PHONE:
                result = await handleNotificationPhone(userId, messageText, session);
                break;
            case STATES.CONFIRM:
                result = await handleConfirmation(userId, messageText, session);
                break;
            default:
                deleteSession(userId);
                return {
                    message: `❌ *Error*\n\nSomething went wrong. Please type *hi* to restart.`,
                    session: null
                };
        }
        
        return result;
        
    } catch (error) {
        console.error(`⚡ [ZESA] Error:`, error);
        deleteSession(userId);
        return {
            message: `❌ *Error*\n\nAn error occurred. Please type *hi* to restart.`,
            session: null
        };
    }
}

/**
 * Handle currency selection
 */
async function handleCurrencySelection(userId, message, session) {
    let currency;
    
    if (message === '1' || message.toLowerCase().includes('zig')) {
        currency = 'zig';
    } else if (message === '2' || message.toLowerCase().includes('usd')) {
        currency = 'usd';
    } else {
        return {
            message: `⚡ *ZESA Purchase*\n\nPlease select currency:\n\n1️⃣ ZiG\n2️⃣ USD\n\n────────────────\nReply with *1* or *2*`,
            session: session
        };
    }
    
    const gateCheck = currencyGate.checkCurrency('ZESA', currency);
    if (!gateCheck.allowed) {
        deleteSession(userId);
        return {
            message: gateCheck.message,
            session: null
        };
    }
    
    session.data.currency = currency;
    session.state = STATES.ENTER_METER;
    updateSession(userId, { state: session.state, data: session.data });
    
    return {
        message: `⚡ *ZESA Purchase*\n\nPlease enter your 11-digit ZESA meter number:`,
        session: session
    };
}

/**
 * Handle meter number entry
 */
async function handleMeterEntry(userId, message, session) {
    const meterNumber = message.replace(/\s/g, '');
    
    if (!/^\d{11}$/.test(meterNumber)) {
        return {
            message: `⚠️ *Invalid Meter*\n\nPlease enter a valid 11-digit ZESA meter number:`,
            session: session
        };
    }
    
    session.data.meterNumber = meterNumber;
    session.state = STATES.VERIFY_METER;
    updateSession(userId, { state: session.state, data: session.data });
    
    // Show verification in progress
    await sendIntermediateMessage(userId, `⏳ Verifying meter...`);
    
    const verifyResult = await hotrecharge.verifyZesaMeter(meterNumber, session.data.currency);
    
    if (verifyResult.success) {
        session.data.customerName = verifyResult.customerName;
        session.state = STATES.ENTER_AMOUNT;
        updateSession(userId, { state: session.state, data: session.data });
        
        return {
            message: `✅ *Meter Verified*\n\n` +
                    `Customer: ${verifyResult.customerName}\n` +
                    `Meter: ${meterNumber}\n\n` +
                    `────────────────\n` +
                    `Now enter amount to purchase:`,
            session: session
        };
    } else {
        return {
            message: `❌ *Verification Failed*\n\n${verifyResult.error}\n\nWould you like to try another meter? (yes/no)`,
            session: session
        };
    }
}

/**
 * Handle meter verification response
 */
async function handleMeterVerification(userId, message, session) {
    if (message.toLowerCase() === 'yes' || message.toLowerCase() === 'y') {
        session.state = STATES.ENTER_METER;
        updateSession(userId, { state: session.state });
        
        return {
            message: `⚡ *ZESA Purchase*\n\nPlease enter the 11-digit ZESA meter number:`,
            session: session
        };
    } else {
        deleteSession(userId);
        return {
            message: `❌ *Cancelled*\n\nZESA purchase cancelled. Type *hi* for main menu.`,
            session: null
        };
    }
}

/**
 * Handle amount entry
 */
async function handleAmountEntry(userId, message, session) {
    const amount = parseFloat(message);
    
    if (isNaN(amount) || amount <= 0) {
        return {
            message: `⚠️ *Invalid Amount*\n\nPlease enter a valid amount:`,
            session: session
        };
    }
    
    const zesaService = session.data.currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
    const amountCheck = zesaService.validateAmount(amount);
    
    if (!amountCheck.valid) {
        return {
            message: `⚠️ *Invalid Amount*\n\n${amountCheck.message}`,
            session: session
        };
    }
    
    session.data.amount = amount;
    session.state = STATES.SELECT_PAYMENT;
    updateSession(userId, { state: session.state, data: session.data });
    
    return {
        message: `💰 *Amount:* ${zesaService.formatAmount(amount)}\n\n` +
                `Select payment method:\n\n` +
                `1️⃣ EcoCash\n` +
                `2️⃣ InnBucks\n\n` +
                `────────────────\n` +
                `Reply with *1* or *2*`,
        session: session
    };
}

/**
 * Handle payment method selection
 */
async function handlePaymentSelection(userId, message, session) {
    let paymentMethod;
    
    if (message === '1' || message.toLowerCase().includes('ecocash')) {
        paymentMethod = 'ecocash';
        session.state = STATES.ENTER_PAYMENT_PHONE;
    } else if (message === '2' || message.toLowerCase().includes('innbucks')) {
        paymentMethod = 'innbucks';
        session.state = STATES.ENTER_NOTIFICATION_PHONE;
    } else {
        return {
            message: `⚠️ *Invalid Selection*\n\nPlease select 1 for EcoCash or 2 for InnBucks:`,
            session: session
        };
    }
    
    session.data.paymentMethod = paymentMethod;
    updateSession(userId, { state: session.state, data: session.data });
    
    if (paymentMethod === 'ecocash') {
        return {
            message: `📱 *EcoCash Payment*\n\nPlease enter your EcoCash phone number:`,
            session: session
        };
    } else {
        return {
            message: `📲 *Token SMS*\n\nPlease enter the phone number to receive the ZESA token:`,
            session: session
        };
    }
}

/**
 * Handle payment phone number entry
 */
async function handlePaymentPhone(userId, message, session) {
    if (!PHONE_REGEX.test(message)) {
        return {
            message: `⚠️ *Invalid Number*\n\nPlease enter a valid Zimbabwe phone number (e.g., 0771234567):`,
            session: session
        };
    }
    
    session.data.paymentPhone = message;
    session.state = STATES.ENTER_NOTIFICATION_PHONE;
    updateSession(userId, { state: session.state, data: session.data });
    
    return {
        message: `📲 *Token SMS*\n\nPlease enter the phone number to receive the ZESA token:`,
        session: session
    };
}

/**
 * Handle notification phone number entry
 */
async function handleNotificationPhone(userId, message, session) {
    if (!PHONE_REGEX.test(message)) {
        return {
            message: `⚠️ *Invalid Number*\n\nPlease enter a valid Zimbabwe phone number (e.g., 0771234567):`,
            session: session
        };
    }
    
    session.data.notifyNumber = message;
    session.state = STATES.CONFIRM;
    updateSession(userId, { state: session.state, data: session.data });
    
    const zesaService = session.data.currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
    const formattedAmount = zesaService.formatAmount(session.data.amount);
    const paymentMethod = session.data.paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
    
    let confirmMessage = `📋 *Confirm ZESA Purchase*\n\n`;
    confirmMessage += `Meter: ${session.data.meterNumber}\n`;
    confirmMessage += `Customer: ${session.data.customerName || 'N/A'}\n`;
    confirmMessage += `Amount: ${formattedAmount}\n`;
    confirmMessage += `Payment: ${paymentMethod}\n`;
    confirmMessage += `Token SMS: ${session.data.notifyNumber}\n`;
    
    if (session.data.paymentPhone) {
        confirmMessage += `Paid with: ${session.data.paymentPhone}\n`;
    }
    
    confirmMessage += `\n────────────────\n`;
    confirmMessage += `Reply:\n`;
    confirmMessage += `✅ *confirm* to proceed\n`;
    confirmMessage += `❌ *cancel* to abort`;
    
    return {
        message: confirmMessage,
        session: session
    };
}

/**
 * Handle confirmation
 */
async function handleConfirmation(userId, message, session) {
    if (message.toLowerCase() === 'confirm') {
        session.state = STATES.PROCESSING;
        updateSession(userId, { state: session.state });
        
        const result = await processTransaction(userId, session);
        deleteSession(userId);
        
        return {
            message: result.message,
            session: null
        };
        
    } else if (message.toLowerCase() === 'cancel') {
        deleteSession(userId);
        return {
            message: `❌ *Cancelled*\n\nZESA purchase cancelled. Type *hi* for main menu.`,
            session: null
        };
    } else {
        return {
            message: `⚠️ *Invalid*\n\nPlease reply *confirm* or *cancel*:`,
            session: session
        };
    }
}

/**
 * Send intermediate message (like "Verifying...")
 */
async function sendIntermediateMessage(userId, text) {
    const messaging = require('../utils/messaging');
    await messaging.sendMessage(userId, text);
}

/**
 * Process transaction
 */
async function processTransaction(userId, session) {
    try {
        const { currency, meterNumber, amount, paymentMethod, paymentPhone, notifyNumber } = session.data;
        const normalizedCurrency = currency.toLowerCase();
        
        // Generate a reference for this transaction
        const reference = `ZESA${Date.now().toString().slice(-8)}`;
        
        // Use initiateQuickPay from your paynow.js
        const paynowResult = await paynow.initiateQuickPay({
            amount: amount,
            reference: reference,
            phone: paymentPhone, // Only used for EcoCash
            method: paymentMethod,
            service: 'ZESA',
            currency: normalizedCurrency
        });
        
        if (!paynowResult.success) {
            return {
                message: `❌ *Payment Failed*\n\n${paynowResult.error}`
            };
        }
        
        // For InnBucks, return the instructions with auth code and QR
        if (paymentMethod === 'innbucks') {
            return {
                message: paynowResult.instructions + `\n\n⏳ After payment, your ZESA token will be sent to ${notifyNumber}`
            };
        }
        
        // For EcoCash, we need to poll for payment confirmation
        await sendIntermediateMessage(userId, `⏳ Waiting for EcoCash payment confirmation...`);
        
        // Poll for payment status
        let paymentConfirmed = false;
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts * 3 seconds = 90 seconds
        
        while (!paymentConfirmed && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
            
            const status = await paynow.checkPaymentStatus(paynowResult.pollUrl);
            if (status.paid) {
                paymentConfirmed = true;
                break;
            }
            attempts++;
        }
        
        if (!paymentConfirmed) {
            return {
                message: `❌ *Payment Timeout*\n\nPayment not confirmed after 90 seconds. Please check your EcoCash app and try again.`
            };
        }
        
        // Payment successful, purchase ZESA token
        await sendIntermediateMessage(userId, `✅ Payment confirmed! Now purchasing ZESA token...`);
        
        const zesaService = normalizedCurrency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
        const tokenResult = await zesaService.purchaseToken({
            meterNumber,
            amount,
            notifyNumber,
            paymentPhone,
            userId
        });
        
        if (tokenResult.success) {
            return {
                message: `✅ *ZESA Purchase Successful!*\n\n` +
                        `Amount: ${zesaService.formatAmount(amount)}\n` +
                        `Meter: ${meterNumber}\n` +
                        `Units: ${tokenResult.units || 'N/A'}\n` +
                        `Token: ${tokenResult.token || 'N/A'}\n\n` +
                        `📲 Token sent to: ${notifyNumber}\n\n` +
                        `Thank you for using CCHub!`
            };
        } else {
            return {
                message: `⚠️ *Payment Successful*\n\n` +
                        `But token purchase failed.\n` +
                        `Reference: ${tokenResult.reference || reference}\n\n` +
                        `Please contact support.`
            };
        }
        
    } catch (error) {
        console.error('[ZESA] Transaction error:', error);
        return {
            message: `❌ *Error*\n\nAn error occurred. Please try again.`
        };
    }
}

module.exports = {
    startFlow,
    handleRequest
};