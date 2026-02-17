// services/zesa.js - UPDATED flow with both phone numbers
/**
 * ZESA Flow Handler
 * Manages the conversation flow for ZESA purchases
 */

const currencyGate = require('./currencyGate');
const paynow = require('./paynow');
const hotrecharge = require('./hotrecharge');

// Session storage
const sessions = new Map();

// Flow states
const STATES = {
    SELECT_CURRENCY: 'SELECT_CURRENCY',
    ENTER_METER: 'ENTER_METER',
    VERIFY_METER: 'VERIFY_METER',
    ENTER_AMOUNT: 'ENTER_AMOUNT',
    SELECT_PAYMENT: 'SELECT_PAYMENT',
    ENTER_PAYMENT_PHONE: 'ENTER_PAYMENT_PHONE', // For EcoCash
    ENTER_NOTIFICATION_PHONE: 'ENTER_NOTIFICATION_PHONE',
    CONFIRM: 'CONFIRM',
    PROCESSING: 'PROCESSING'
};

/**
 * Start ZESA flow
 */
async function startFlow(from, currency = null) {
    let session = sessions.get(from) || {
        service: 'ZESA',
        state: STATES.SELECT_CURRENCY,
        data: {}
    };

    // If currency is pre-selected (from currency gate)
    if (currency) {
        session.data.currency = currency;
        session.state = STATES.ENTER_METER;
        sessions.set(from, session);
        
        return {
            message: `Please enter your 11-digit ZESA meter number:`,
            session: session
        };
    }

    sessions.set(from, session);
    
    return {
        message: `Please select currency for ZESA purchase:\n1️⃣ ZiG\n2️⃣ USD`,
        session: session
    };
}

/**
 * Handle ZESA flow messages
 */
async function handleMessage(from, message, session) {
    
    switch (session.state) {
        
        case STATES.SELECT_CURRENCY:
            return handleCurrencySelection(from, message, session);
            
        case STATES.ENTER_METER:
            return handleMeterEntry(from, message, session);
            
        case STATES.VERIFY_METER:
            return handleMeterVerification(from, message, session);
            
        case STATES.ENTER_AMOUNT:
            return handleAmountEntry(from, message, session);
            
        case STATES.SELECT_PAYMENT:
            return handlePaymentSelection(from, message, session);
            
        case STATES.ENTER_PAYMENT_PHONE:
            return handlePaymentPhone(from, message, session);
            
        case STATES.ENTER_NOTIFICATION_PHONE:
            return handleNotificationPhone(from, message, session);
            
        case STATES.CONFIRM:
            return handleConfirmation(from, message, session);
            
        default:
            // Reset if something goes wrong
            sessions.delete(from);
            return {
                message: "Something went wrong. Please start over.",
                session: null
            };
    }
}

/**
 * Handle currency selection
 */
async function handleCurrencySelection(from, message, session) {
    let currency;
    
    if (message === '1' || message.toLowerCase().includes('zig')) {
        currency = 'zig';
    } else if (message === '2' || message.toLowerCase().includes('usd')) {
        currency = 'usd';
    } else {
        return {
            message: "Please select 1 for ZiG or 2 for USD:",
            session: session
        };
    }
    
    // Check if currency is allowed
    const gateCheck = currencyGate.checkCurrency('ZESA', currency);
    if (!gateCheck.allowed) {
        sessions.delete(from);
        return {
            message: gateCheck.message,
            session: null
        };
    }
    
    session.data.currency = currency;
    session.state = STATES.ENTER_METER;
    sessions.set(from, session);
    
    return {
        message: `Please enter your 11-digit ZESA meter number:`,
        session: session
    };
}

/**
 * Handle meter number entry
 */
async function handleMeterEntry(from, message, session) {
    // Remove any spaces
    const meterNumber = message.replace(/\s/g, '');
    
    // Basic validation
    if (!/^\d{11}$/.test(meterNumber)) {
        return {
            message: "That doesn't look like a valid meter number. Please enter 11 digits:",
            session: session
        };
    }
    
    session.data.meterNumber = meterNumber;
    session.state = STATES.VERIFY_METER;
    sessions.set(from, session);
    
    // Verify meter with HotRecharge
    const verifyResult = await hotrecharge.verifyZesaMeter(meterNumber, session.data.currency);
    
    if (verifyResult.success) {
        session.data.customerName = verifyResult.customerName;
        session.state = STATES.ENTER_AMOUNT;
        sessions.set(from, session);
        
        return {
            message: `✅ Meter verified!\n\nCustomer: ${verifyResult.customerName}\n\nNow enter amount to purchase:`,
            session: session
        };
    } else {
        // Ask if they want to try again
        return {
            message: `❌ ${verifyResult.error}\n\nWould you like to try another meter number? (yes/no)`,
            session: session
        };
    }
}

/**
 * Handle meter verification response
 */
async function handleMeterVerification(from, message, session) {
    if (message.toLowerCase() === 'yes' || message.toLowerCase() === 'y') {
        session.state = STATES.ENTER_METER;
        sessions.set(from, session);
        
        return {
            message: "Please enter the 11-digit ZESA meter number:",
            session: session
        };
    } else {
        sessions.delete(from);
        return {
            message: "ZESA purchase cancelled. Type 'menu' to return to main menu.",
            session: null
        };
    }
}

/**
 * Handle amount entry
 */
async function handleAmountEntry(from, message, session) {
    const amount = parseFloat(message);
    
    if (isNaN(amount) || amount <= 0) {
        return {
            message: "Please enter a valid amount:",
            session: session
        };
    }
    
    // Validate amount based on currency
    const zesaService = session.data.currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
    const amountCheck = zesaService.validateAmount(amount);
    
    if (!amountCheck.valid) {
        return {
            message: amountCheck.message,
            session: session
        };
    }
    
    session.data.amount = amount;
    session.state = STATES.SELECT_PAYMENT;
    sessions.set(from, session);
    
    return {
        message: `Amount: ${zesaService.formatAmount(amount)}\n\nSelect payment method:\n1️⃣ EcoCash\n2️⃣ InnBucks`,
        session: session
    };
}

/**
 * Handle payment method selection
 */
async function handlePaymentSelection(from, message, session) {
    let paymentMethod;
    
    if (message === '1' || message.toLowerCase().includes('econet')) {
        paymentMethod = 'ecocash';
        session.state = STATES.ENTER_PAYMENT_PHONE;
    } else if (message === '2' || message.toLowerCase().includes('innbucks')) {
        paymentMethod = 'innbucks';
        session.state = STATES.ENTER_NOTIFICATION_PHONE; // Skip payment phone for InnBucks
    } else {
        return {
            message: "Please select 1 for EcoCash or 2 for InnBucks:",
            session: session
        };
    }
    
    session.data.paymentMethod = paymentMethod;
    sessions.set(from, session);
    
    if (paymentMethod === 'ecocash') {
        return {
            message: "Please enter your EcoCash phone number for payment:",
            session: session
        };
    } else {
        // For InnBucks, go straight to notification phone
        return {
            message: "Please enter the phone number to receive the ZESA token SMS:",
            session: session
        };
    }
}

/**
 * Handle payment phone number entry (for EcoCash)
 */
async function handlePaymentPhone(from, message, session) {
    // Validate phone number
    const phoneCheck = /^((0|\+263|263)\d{9})$/.test(message);
    
    if (!phoneCheck) {
        return {
            message: "Please enter a valid Zimbabwe phone number (e.g., 0771234567 or +263771234567):",
            session: session
        };
    }
    
    session.data.paymentPhone = message;
    session.state = STATES.ENTER_NOTIFICATION_PHONE;
    sessions.set(from, session);
    
    return {
        message: "Please enter the phone number to receive the ZESA token SMS:",
        session: session
    };
}

/**
 * Handle notification phone number entry
 */
async function handleNotificationPhone(from, message, session) {
    // Validate phone number
    const phoneCheck = /^((0|\+263|263)\d{9})$/.test(message);
    
    if (!phoneCheck) {
        return {
            message: "Please enter a valid Zimbabwe phone number (e.g., 0771234567 or +263771234567):",
            session: session
        };
    }
    
    session.data.notifyNumber = message;
    session.state = STATES.CONFIRM;
    sessions.set(from, session);
    
    // Show confirmation
    const zesaService = session.data.currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
    const formattedAmount = zesaService.formatAmount(session.data.amount);
    const paymentMethod = session.data.paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
    
    let confirmMessage = `📋 Please confirm your ZESA purchase:\n\n`;
    confirmMessage += `Meter: ${session.data.meterNumber}\n`;
    confirmMessage += `Customer: ${session.data.customerName || 'N/A'}\n`;
    confirmMessage += `Amount: ${formattedAmount}\n`;
    confirmMessage += `Payment: ${paymentMethod}\n`;
    confirmMessage += `Token SMS to: ${session.data.notifyNumber}\n`;
    
    if (session.data.paymentPhone) {
        confirmMessage += `Paid with: ${session.data.paymentPhone}\n`;
    }
    
    confirmMessage += `\nReply:\n`;
    confirmMessage += `✅ 'confirm' to proceed\n`;
    confirmMessage += `❌ 'cancel' to abort`;
    
    return {
        message: confirmMessage,
        session: session
    };
}

/**
 * Handle confirmation
 */
async function handleConfirmation(from, message, session) {
    if (message.toLowerCase() === 'confirm') {
        session.state = STATES.PROCESSING;
        sessions.set(from, session);
        
        // Process the transaction
        const result = await processTransaction(from, session);
        
        // Clear session after processing
        sessions.delete(from);
        
        return {
            message: result.message,
            session: null
        };
        
    } else if (message.toLowerCase() === 'cancel') {
        sessions.delete(from);
        return {
            message: "ZESA purchase cancelled. Type 'menu' to return to main menu.",
            session: null
        };
    } else {
        return {
            message: "Please reply 'confirm' to proceed or 'cancel' to abort:",
            session: session
        };
    }
}

/**
 * Process the actual transaction
 */
async function processTransaction(from, session) {
    try {
        const { currency, meterNumber, amount, paymentMethod, paymentPhone, notifyNumber, userId } = session.data;
        
        // Create PayNow payment
        const description = `ZESA ${currency.toUpperCase()} Purchase - Meter: ${meterNumber}`;
        const paynowResult = await paynow.createPayment(
            from,
            amount,
            description,
            currency,
            paymentMethod
        );
        
        if (!paynowResult.success) {
            return {
                success: false,
                message: `❌ Failed to create payment: ${paynowResult.error}`
            };
        }
        
        // For InnBucks, return auth code and QR
        if (paymentMethod === 'innbucks') {
            return {
                success: true,
                message: `📱 InnBucks Payment:\n\n` +
                        `Auth Code: ${paynowResult.authCode}\n` +
                        `Amount: ${paynowResult.amount}\n\n` +
                        `📍 Scan QR code at any InnBucks agent\n\n` +
                        `⏳ After payment, your ZESA token will be sent to ${notifyNumber}`
            };
        }
        
        // For EcoCash, wait for payment confirmation
        const paymentConfirmed = await paynow.pollPaymentStatus(paynowResult.pollUrl);
        
        if (!paymentConfirmed.success) {
            return {
                success: false,
                message: `❌ Payment failed: ${paymentConfirmed.error}`
            };
        }
        
        // Payment successful, purchase ZESA token
        const zesaService = currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
        
        const tokenResult = await zesaService.purchaseToken({
            meterNumber,
            amount,
            notifyNumber,
            paymentPhone,
            userId: from
        });
        
        if (tokenResult.success) {
            let successMessage = `✅ ZESA Purchase Successful!\n\n`;
            successMessage += `Amount: ${zesaService.formatAmount(amount)}\n`;
            successMessage += `Meter: ${meterNumber}\n`;
            successMessage += `Units: ${tokenResult.units || 'N/A'}\n`;
            successMessage += `Token: ${tokenResult.token || 'N/A'}\n\n`;
            successMessage += `📲 Token sent to: ${notifyNumber}\n`;
            
            if (paymentPhone) {
                successMessage += `💰 Paid with: ${paymentPhone}\n`;
            }
            
            successMessage += `\nThank you for using CCHub!`;
            
            return {
                success: true,
                message: successMessage
            };
        } else {
            // Payment succeeded but token purchase failed - needs manual intervention
            return {
                success: false,
                message: `⚠️ Payment successful but token purchase failed.\n` +
                        `Your reference: ${tokenResult.transactionId || 'N/A'}\n` +
                        `Please contact support with this reference.`
            };
        }
        
    } catch (error) {
        console.error('[ZESA] Transaction processing error:', error);
        return {
            success: false,
            message: `❌ An error occurred processing your transaction. Please try again.`
        };
    }
}

/**
 * Clear session
 */
function clearSession(from) {
    sessions.delete(from);
}

module.exports = {
    startFlow,
    handleMessage,
    clearSession,
    STATES
};