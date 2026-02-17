// services/zesa.js - COMPLETE WITH PROPER SESSION HANDLING
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
    ENTER_PAYMENT_PHONE: 'ENTER_PAYMENT_PHONE', // For EcoCash
    ENTER_NOTIFICATION_PHONE: 'ENTER_NOTIFICATION_PHONE',
    CONFIRM: 'CONFIRM',
    PROCESSING: 'PROCESSING'
};

// Consistent phone regex matching service modules
const PHONE_REGEX = /^(\+?263|0)[0-9]{9}$/;

/**
 * Start ZESA flow - ALWAYS CREATES FRESH SESSION
 */
async function startFlow(from, currency = null) {
    console.log(`⚡ [ZESA] ========== STARTING ZESA FLOW ==========`);
    console.log(`⚡ [ZESA] User: ${from}`);
    console.log(`⚡ [ZESA] Pre-selected currency: ${currency || 'none'}`);
    
    // CRITICAL: Delete any existing session to ensure fresh start
    deleteSession(from);
    
    // Create brand new session using the session handler
    const session = createSession(from, 'zesa');
    
    // Initialize ZESA-specific session data
    session.state = STATES.SELECT_CURRENCY;
    session.data = {
        userId: from,
        createdAt: Date.now()
    };
    
    console.log(`⚡ [ZESA] New session created with state: ${session.state}`);

    // If currency is pre-selected (from currency gate)
    if (currency) {
        session.data.currency = currency.toLowerCase();
        session.state = STATES.ENTER_METER;
        
        // Update the session with changes
        updateSession(from, {
            state: session.state,
            data: session.data
        });
        
        console.log(`⚡ [ZESA] Currency pre-selected: ${currency}`);
        console.log(`⚡ [ZESA] Moving to state: ${session.state}`);
        
        return {
            message: `Please enter your 11-digit ZESA meter number:`,
            session: session
        };
    }

    // Save the initial session state
    updateSession(from, {
        state: session.state,
        data: session.data
    });
    
    console.log(`⚡ [ZESA] Session saved, asking for currency selection`);
    
    return {
        message: `Please select currency for ZESA purchase:\n1️⃣ ZiG\n2️⃣ USD`,
        session: session
    };
}

/**
 * Handle ZESA flow messages
 */
async function handleRequest(userId, messageText, session) {
    console.log(`⚡ [ZESA] ========== HANDLING MESSAGE ==========`);
    console.log(`⚡ [ZESA] User: ${userId}`);
    console.log(`⚡ [ZESA] Current state: ${session?.state}`);
    console.log(`⚡ [ZESA] Message: "${messageText}"`);
    console.log(`⚡ [ZESA] Session data:`, JSON.stringify(session?.data, null, 2));
    
    // Verify session still exists in global store
    const activeSession = getActiveSession(userId);
    if (!activeSession) {
        console.log(`⚡ [ZESA] Session expired for ${userId}`);
        return {
            message: "Your session has expired. Please start over by typing 'menu'.",
            session: null
        };
    }
    
    try {
        let result;
        
        switch (session.state) {
            case STATES.SELECT_CURRENCY:
                console.log(`⚡ [ZESA] Handling CURRENCY SELECTION`);
                result = await handleCurrencySelection(userId, messageText, session);
                break;
                
            case STATES.ENTER_METER:
                console.log(`⚡ [ZESA] Handling METER ENTRY`);
                result = await handleMeterEntry(userId, messageText, session);
                break;
                
            case STATES.VERIFY_METER:
                console.log(`⚡ [ZESA] Handling METER VERIFICATION RESPONSE`);
                result = await handleMeterVerification(userId, messageText, session);
                break;
                
            case STATES.ENTER_AMOUNT:
                console.log(`⚡ [ZESA] Handling AMOUNT ENTRY`);
                result = await handleAmountEntry(userId, messageText, session);
                break;
                
            case STATES.SELECT_PAYMENT:
                console.log(`⚡ [ZESA] Handling PAYMENT SELECTION`);
                result = await handlePaymentSelection(userId, messageText, session);
                break;
                
            case STATES.ENTER_PAYMENT_PHONE:
                console.log(`⚡ [ZESA] Handling PAYMENT PHONE ENTRY`);
                result = await handlePaymentPhone(userId, messageText, session);
                break;
                
            case STATES.ENTER_NOTIFICATION_PHONE:
                console.log(`⚡ [ZESA] Handling NOTIFICATION PHONE ENTRY`);
                result = await handleNotificationPhone(userId, messageText, session);
                break;
                
            case STATES.CONFIRM:
                console.log(`⚡ [ZESA] Handling CONFIRMATION`);
                result = await handleConfirmation(userId, messageText, session);
                break;
                
            default:
                console.log(`⚡ [ZESA] ERROR: Unknown state: ${session.state}`);
                deleteSession(userId);
                return {
                    message: "Something went wrong. Please start over.",
                    session: null
                };
        }
        
        console.log(`⚡ [ZESA] Handler result:`, {
            messagePreview: result.message?.substring(0, 50) + '...',
            hasSession: !!result.session,
            newState: result.session?.state
        });
        
        return result;
        
    } catch (error) {
        console.error(`⚡ [ZESA] ERROR in handleRequest:`, error);
        console.error(error.stack);
        deleteSession(userId);
        return {
            message: "An error occurred. Please try again.",
            session: null
        };
    }
}

/**
 * Handle currency selection
 */
async function handleCurrencySelection(userId, message, session) {
    console.log(`⚡ [ZESA] handleCurrencySelection - Message: "${message}"`);
    
    let currency;
    
    if (message === '1' || message.toLowerCase().includes('zig')) {
        currency = 'zig';
        console.log(`⚡ [ZESA] Selected currency: ZiG`);
    } else if (message === '2' || message.toLowerCase().includes('usd')) {
        currency = 'usd';
        console.log(`⚡ [ZESA] Selected currency: USD`);
    } else {
        console.log(`⚡ [ZESA] Invalid currency selection: "${message}"`);
        return {
            message: "Please select 1 for ZiG or 2 for USD:",
            session: session
        };
    }
    
    // Check if currency is allowed
    const gateCheck = currencyGate.checkCurrency('ZESA', currency);
    if (!gateCheck.allowed) {
        console.log(`⚡ [ZESA] Currency blocked by gate: ${gateCheck.message}`);
        deleteSession(userId);
        return {
            message: gateCheck.message,
            session: null
        };
    }
    
    // Update session data
    session.data.currency = currency;
    session.state = STATES.ENTER_METER;
    
    // Save to global session store
    updateSession(userId, {
        state: session.state,
        data: session.data
    });
    
    console.log(`⚡ [ZESA] Updated session state to: ${session.state}`);
    
    return {
        message: `Please enter your 11-digit ZESA meter number:`,
        session: session
    };
}

/**
 * Handle meter number entry
 */
async function handleMeterEntry(userId, message, session) {
    console.log(`⚡ [ZESA] handleMeterEntry - Raw message: "${message}"`);
    
    // Remove any spaces
    const meterNumber = message.replace(/\s/g, '');
    console.log(`⚡ [ZESA] Cleaned meter number: "${meterNumber}"`);
    
    // Basic validation
    if (!/^\d{11}$/.test(meterNumber)) {
        console.log(`⚡ [ZESA] Invalid meter format: not 11 digits`);
        return {
            message: "That doesn't look like a valid meter number. Please enter 11 digits:",
            session: session
        };
    }
    
    session.data.meterNumber = meterNumber;
    session.state = STATES.VERIFY_METER;
    
    // Save to global session store
    updateSession(userId, {
        state: session.state,
        data: session.data
    });
    
    console.log(`⚡ [ZESA] Verifying meter with HotRecharge...`);
    
    // Verify meter with HotRecharge
    const verifyResult = await hotrecharge.verifyZesaMeter(meterNumber, session.data.currency);
    console.log(`⚡ [ZESA] Verification result:`, verifyResult);
    
    if (verifyResult.success) {
        session.data.customerName = verifyResult.customerName;
        session.state = STATES.ENTER_AMOUNT;
        
        // Save to global session store
        updateSession(userId, {
            state: session.state,
            data: session.data
        });
        
        console.log(`⚡ [ZESA] Meter verified! Customer: ${verifyResult.customerName}`);
        console.log(`⚡ [ZESA] Moving to ENTER_AMOUNT state`);
        
        return {
            message: `✅ Meter verified!\n\nCustomer: ${verifyResult.customerName}\n\nNow enter amount to purchase:`,
            session: session
        };
    } else {
        console.log(`⚡ [ZESA] Meter verification failed: ${verifyResult.error}`);
        
        return {
            message: `❌ ${verifyResult.error}\n\nWould you like to try another meter number? (yes/no)`,
            session: session
        };
    }
}

/**
 * Handle meter verification response
 */
async function handleMeterVerification(userId, message, session) {
    console.log(`⚡ [ZESA] handleMeterVerification - Response: "${message}"`);
    
    if (message.toLowerCase() === 'yes' || message.toLowerCase() === 'y') {
        console.log(`⚡ [ZESA] User wants to try another meter`);
        session.state = STATES.ENTER_METER;
        
        // Save to global session store
        updateSession(userId, {
            state: session.state,
            data: session.data
        });
        
        return {
            message: "Please enter the 11-digit ZESA meter number:",
            session: session
        };
    } else {
        console.log(`⚡ [ZESA] User cancelled ZESA purchase`);
        deleteSession(userId);
        return {
            message: "ZESA purchase cancelled. Type 'menu' to return to main menu.",
            session: null
        };
    }
}

/**
 * Handle amount entry
 */
async function handleAmountEntry(userId, message, session) {
    console.log(`⚡ [ZESA] handleAmountEntry - Amount: "${message}"`);
    
    const amount = parseFloat(message);
    
    if (isNaN(amount) || amount <= 0) {
        console.log(`⚡ [ZESA] Invalid amount: not a number or <= 0`);
        return {
            message: "Please enter a valid amount:",
            session: session
        };
    }
    
    // Validate amount based on currency
    const zesaService = session.data.currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
    const amountCheck = zesaService.validateAmount(amount);
    
    if (!amountCheck.valid) {
        console.log(`⚡ [ZESA] Amount validation failed: ${amountCheck.message}`);
        return {
            message: amountCheck.message,
            session: session
        };
    }
    
    session.data.amount = amount;
    session.state = STATES.SELECT_PAYMENT;
    
    // Save to global session store
    updateSession(userId, {
        state: session.state,
        data: session.data
    });
    
    console.log(`⚡ [ZESA] Amount set: ${amount}`);
    console.log(`⚡ [ZESA] Moving to SELECT_PAYMENT state`);
    
    return {
        message: `Amount: ${zesaService.formatAmount(amount)}\n\nSelect payment method:\n1️⃣ EcoCash\n2️⃣ InnBucks`,
        session: session
    };
}

/**
 * Handle payment method selection
 */
async function handlePaymentSelection(userId, message, session) {
    console.log(`⚡ [ZESA] handlePaymentSelection - Choice: "${message}"`);
    
    let paymentMethod;
    
    if (message === '1' || message.toLowerCase().includes('ecocash') || message.toLowerCase().includes('econet')) {
        paymentMethod = 'ecocash';
        session.state = STATES.ENTER_PAYMENT_PHONE;
        console.log(`⚡ [ZESA] Selected EcoCash payment`);
    } else if (message === '2' || message.toLowerCase().includes('innbucks')) {
        paymentMethod = 'innbucks';
        session.state = STATES.ENTER_NOTIFICATION_PHONE;
        console.log(`⚡ [ZESA] Selected InnBucks payment`);
    } else {
        console.log(`⚡ [ZESA] Invalid payment selection`);
        return {
            message: "Please select 1 for EcoCash or 2 for InnBucks:",
            session: session
        };
    }
    
    session.data.paymentMethod = paymentMethod;
    
    // Save to global session store
    updateSession(userId, {
        state: session.state,
        data: session.data
    });
    
    if (paymentMethod === 'ecocash') {
        return {
            message: "Please enter your EcoCash phone number for payment:",
            session: session
        };
    } else {
        return {
            message: "Please enter the phone number to receive the ZESA token SMS:",
            session: session
        };
    }
}

/**
 * Handle payment phone number entry (for EcoCash)
 */
async function handlePaymentPhone(userId, message, session) {
    console.log(`⚡ [ZESA] handlePaymentPhone - Phone: "${message}"`);
    
    // Validate phone number using consistent regex
    const phoneCheck = PHONE_REGEX.test(message);
    
    if (!phoneCheck) {
        console.log(`⚡ [ZESA] Invalid phone number format`);
        return {
            message: "Please enter a valid Zimbabwe phone number (e.g., 0771234567 or +263771234567):",
            session: session
        };
    }
    
    session.data.paymentPhone = message;
    session.state = STATES.ENTER_NOTIFICATION_PHONE;
    
    // Save to global session store
    updateSession(userId, {
        state: session.state,
        data: session.data
    });
    
    console.log(`⚡ [ZESA] Payment phone saved: ${message}`);
    console.log(`⚡ [ZESA] Moving to ENTER_NOTIFICATION_PHONE`);
    
    return {
        message: "Please enter the phone number to receive the ZESA token SMS:",
        session: session
    };
}

/**
 * Handle notification phone number entry
 */
async function handleNotificationPhone(userId, message, session) {
    console.log(`⚡ [ZESA] handleNotificationPhone - Phone: "${message}"`);
    
    // Validate phone number using consistent regex
    const phoneCheck = PHONE_REGEX.test(message);
    
    if (!phoneCheck) {
        console.log(`⚡ [ZESA] Invalid notification phone format`);
        return {
            message: "Please enter a valid Zimbabwe phone number (e.g., 0771234567 or +263771234567):",
            session: session
        };
    }
    
    session.data.notifyNumber = message;
    session.state = STATES.CONFIRM;
    
    // Save to global session store
    updateSession(userId, {
        state: session.state,
        data: session.data
    });
    
    // Show confirmation
    const zesaService = session.data.currency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
    const formattedAmount = zesaService.formatAmount(session.data.amount);
    const paymentMethod = session.data.paymentMethod === 'ecocash' ? 'EcoCash' : 'InnBucks';
    
    console.log(`⚡ [ZESA] Notification phone saved: ${message}`);
    console.log(`⚡ [ZESA] Moving to CONFIRM state`);
    
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
async function handleConfirmation(userId, message, session) {
    console.log(`⚡ [ZESA] handleConfirmation - Response: "${message}"`);
    
    if (message.toLowerCase() === 'confirm') {
        console.log(`⚡ [ZESA] User confirmed purchase`);
        session.state = STATES.PROCESSING;
        
        // Save to global session store
        updateSession(userId, {
            state: session.state,
            data: session.data
        });
        
        // Process the transaction
        console.log(`⚡ [ZESA] Processing transaction...`);
        const result = await processTransaction(userId, session);
        
        // Clear session after processing
        deleteSession(userId);
        console.log(`⚡ [ZESA] Transaction completed, session cleared`);
        
        return {
            message: result.message,
            session: null
        };
        
    } else if (message.toLowerCase() === 'cancel') {
        console.log(`⚡ [ZESA] User cancelled purchase`);
        deleteSession(userId);
        return {
            message: "ZESA purchase cancelled. Type 'menu' to return to main menu.",
            session: null
        };
    } else {
        console.log(`⚡ [ZESA] Invalid confirmation response`);
        return {
            message: "Please reply 'confirm' to proceed or 'cancel' to abort:",
            session: session
        };
    }
}

/**
 * Process the actual transaction
 */
async function processTransaction(userId, session) {
    console.log(`⚡ [ZESA] ========== PROCESSING TRANSACTION ==========`);
    console.log(`⚡ [ZESA] User: ${userId}`);
    console.log(`⚡ [ZESA] Transaction data:`, JSON.stringify(session.data, null, 2));
    
    try {
        const { currency, meterNumber, amount, paymentMethod, paymentPhone, notifyNumber } = session.data;
        
        // Normalize currency to lowercase
        const normalizedCurrency = currency.toLowerCase();
        
        console.log(`⚡ [ZESA] Creating PayNow payment...`);
        
        // Create PayNow payment
        const description = `ZESA ${normalizedCurrency.toUpperCase()} Purchase - Meter: ${meterNumber}`;
        const paynowResult = await paynow.createPayment(
            userId,
            amount,
            description,
            normalizedCurrency,
            paymentMethod
        );
        
        console.log(`⚡ [ZESA] PayNow result:`, paynowResult);
        
        if (!paynowResult.success) {
            console.log(`⚡ [ZESA] PayNow payment creation failed`);
            return {
                success: false,
                message: `❌ Failed to create payment: ${paynowResult.error}`
            };
        }
        
        // For InnBucks, return auth code and QR
        if (paymentMethod === 'innbucks') {
            console.log(`⚡ [ZESA] InnBucks payment initiated`);
            return {
                success: true,
                message: `📱 InnBucks Payment:\n\n` +
                        `Auth Code: ${paynowResult.authCode}\n` +
                        `Amount: $${amount.toFixed(2)} ${normalizedCurrency.toUpperCase()}\n\n` +
                        `📍 Scan QR code at any InnBucks agent\n\n` +
                        `⏳ After payment, your ZESA token will be sent to ${notifyNumber}`
            };
        }
        
        // For EcoCash, wait for payment confirmation
        console.log(`⚡ [ZESA] Polling for EcoCash payment confirmation...`);
        const paymentConfirmed = await paynow.pollPaymentStatus(paynowResult.pollUrl);
        
        if (!paymentConfirmed.success) {
            console.log(`⚡ [ZESA] Payment failed or timed out`);
            return {
                success: false,
                message: `❌ Payment failed: ${paymentConfirmed.error}`
            };
        }
        
        console.log(`⚡ [ZESA] Payment confirmed, purchasing ZESA token...`);
        
        // Payment successful, purchase ZESA token
        const zesaService = normalizedCurrency === 'usd' ? hotrecharge.zesa.usd : hotrecharge.zesa.zig;
        
        const tokenResult = await zesaService.purchaseToken({
            meterNumber,
            amount,
            notifyNumber,
            paymentPhone,
            userId: userId
        });
        
        console.log(`⚡ [ZESA] Token purchase result:`, tokenResult);
        
        if (tokenResult.success) {
            let successMessage = `✅ ZESA Purchase Successful!\n\n`;
            successMessage += `Amount: ${zesaService.formatAmount(amount)}\n`;
            successMessage += `Meter: ${meterNumber}\n`;
            successMessage += `Customer: ${tokenResult.customerName || session.data.customerName || 'N/A'}\n`;
            successMessage += `Units: ${tokenResult.units || 'N/A'}\n`;
            successMessage += `Token: ${tokenResult.token || 'N/A'}\n\n`;
            successMessage += `📲 Token sent to: ${notifyNumber}\n`;
            
            if (paymentPhone) {
                successMessage += `💰 Paid with: ${paymentPhone}\n`;
            }
            
            successMessage += `\nReference: ${tokenResult.reference || 'N/A'}\n`;
            successMessage += `Thank you for using CCHub!`;
            
            return {
                success: true,
                message: successMessage
            };
        } else {
            console.log(`⚡ [ZESA] ⚠️ PAYMENT SUCCESSFUL BUT TOKEN PURCHASE FAILED`);
            console.log(`⚡ [ZESA] Error:`, tokenResult.error);
            
            return {
                success: false,
                message: `⚠️ Payment successful but token purchase failed.\n` +
                        `Error: ${tokenResult.error || 'Unknown error'}\n` +
                        `Your reference: ${tokenResult.reference || paynowResult.reference || 'N/A'}\n` +
                        `Please contact support with this reference.`
            };
        }
        
    } catch (error) {
        console.error(`⚡ [ZESA] TRANSACTION PROCESSING ERROR:`);
        console.error(error);
        console.error(error.stack);
        return {
            success: false,
            message: `❌ An error occurred processing your transaction. Please try again.`
        };
    }
}

module.exports = {
    startFlow,
    handleRequest,
    STATES
};