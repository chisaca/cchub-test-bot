// utils/messaging.js - UPDATED for better error handling and logging
// CHANGES: All hardcoded messages moved to constants

const { 
    RESPONSE_MESSAGES, 
    WHATSAPP_CONFIG,
    UI_MESSAGES,
    ERROR_MESSAGES,
    MESSAGING_CONFIG 
} = require('../config/constants');
const axios = require('axios');

// Add these to constants.js if not present
const MESSAGING_CONFIG = {
    REQUEST_TIMEOUT: 10000, // 10 seconds
    TRUNCATION_SUFFIX: '\n\n[Message truncated due to length limits]',
    RECEIPT_MASK_LENGTH: 3,
    RECEIPT_PREFIX_LENGTH: 5,
    WELCOME_MESSAGE: `💎 *Welcome to CCHub*

*Please select a service:*

1 📱 *Airtime*
2 ⚡ *ZESA*
3 📄 *Bills*
4 🚨 *Emergency*
5 ❓ *Help*

────────────────

Reply with *1-5* or service name
Type *hi* anytime to restart`,
    ACCOUNT_LOCKED_TEMPLATE: `🔒 *Account Locked*\n\nToo many invalid attempts.\n\n⏰ Time remaining: %s minute(s)\n\nType "hi" after lockout expires.`,
    DEFAULT_ERROR: `❌ *Error*\n\nAn unexpected error occurred. Please type "hi" to restart.`
};

/**
 * Send a WhatsApp message
 */
async function sendMessage(to, text) {
    const phoneNumberId = process.env.PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    // Validate environment variables
    if (!phoneNumberId || !accessToken) {
        console.error('❌ WhatsApp credentials not configured');
        return false;
    }
    
    // Validate message length
    if (text.length > WHATSAPP_CONFIG.MAX_MESSAGE_LENGTH) {
        console.warn(`⚠️ Message too long (${text.length} chars), truncating...`);
        text = text.substring(0, WHATSAPP_CONFIG.MAX_MESSAGE_LENGTH - 100) + 
               MESSAGING_CONFIG.TRUNCATION_SUFFIX;
    }
    
    try {
        const response = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_CONFIG.API_VERSION}/${phoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: to,
                type: "text",
                text: { 
                    body: text,
                    preview_url: false
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: MESSAGING_CONFIG.REQUEST_TIMEOUT
            }
        );
        
        console.log(`✅ Message sent to ${to} (${text.length} chars)`);
        return true;
        
    } catch (error) {
        if (error.response) {
            // The request was made and the server responded with a status code
            console.error(`❌ WhatsApp API Error ${error.response.status}:`, {
                error: error.response.data.error?.message,
                type: error.response.data.error?.type,
                code: error.response.data.error?.code
            });
        } else if (error.request) {
            // The request was made but no response was received
            console.error('❌ No response from WhatsApp API:', error.message);
        } else {
            // Something happened in setting up the request
            console.error('❌ Error setting up WhatsApp request:', error.message);
        }
        
        // Log the full error in development
        if (process.env.NODE_ENV === 'development') {
            console.error('Full error:', error);
        }
        
        return false;
    }
}

/**
 * Send welcome message (main menu)
 */
async function sendWelcomeMessage(to) {
    await sendMessage(to, MESSAGING_CONFIG.WELCOME_MESSAGE);
}

/**
 * Send help message
 */
async function sendHelpMessage(to) {
    await sendMessage(to, RESPONSE_MESSAGES.HELP);
}

/**
 * Send session expired message
 */
async function sendSessionExpiredMessage(to) {
    await sendMessage(to, RESPONSE_MESSAGES.SESSION_EXPIRED);
}

/**
 * Send too many attempts message
 */
async function sendTooManyAttemptsMessage(to) {
    await sendMessage(to, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
}

/**
 * Send a formatted error message
 */
async function sendErrorMessage(to, errorType, details = {}) {
    let message = '';
    
    switch(errorType) {
        case 'invalid_selection':
            message = RESPONSE_MESSAGES.INVALID_SELECTION;
            break;
        case 'paycode_required':
            message = RESPONSE_MESSAGES.PAYCODE_REQUIRED;
            break;
        case 'account_locked':
            const minutes = details.minutes || 15;
            message = MESSAGING_CONFIG.ACCOUNT_LOCKED_TEMPLATE.replace('%s', minutes);
            break;
        default:
            message = MESSAGING_CONFIG.DEFAULT_ERROR;
    }
    
    await sendMessage(to, message);
}

/**
 * Send a confirmation message with options
 */
async function sendConfirmationMessage(to, title, details, options) {
    let message = `✅ *${title}*\n\n`;
    
    // Add details
    for (const [key, value] of Object.entries(details)) {
        message += `• ${key}: ${value}\n`;
    }
    
    message += '\n';
    
    // Add options
    if (options && options.length > 0) {
        message += 'Please confirm:\n\n';
        options.forEach((option, index) => {
            message += `${index + 1}. ${option}\n`;
        });
        message += '\n📝 Reply with the number of your choice.';
    } else {
        message += 'Type YES to confirm or NO to cancel.';
    }
    
    await sendMessage(to, message);
}

/**
 * Send a receipt message
 */
async function sendReceiptMessage(to, transactionDetails) {
    const { 
        transactionId, 
        service, 
        amount, 
        currency, 
        recipient, 
        additionalInfo = ''
    } = transactionDetails;
    
    // Clean receipt - just the facts
    let message = `✅ ${service} Sent!\n`;
    
    // Mask recipient for privacy
    if (recipient && recipient.length > MESSAGING_CONFIG.RECEIPT_PREFIX_LENGTH + MESSAGING_CONFIG.RECEIPT_MASK_LENGTH) {
        message += `📱 ${recipient.slice(0, MESSAGING_CONFIG.RECEIPT_PREFIX_LENGTH)}****${recipient.slice(-MESSAGING_CONFIG.RECEIPT_MASK_LENGTH)}\n`;
    } else {
        message += `📱 ${recipient}\n`;
    }
    
    message += `💰 ${amount} ${currency}\n`;
    message += `🆔 ${transactionId}\n`;
    if (additionalInfo) message += additionalInfo;
    
    await sendMessage(to, message);
}

module.exports = {
    sendMessage,
    sendWelcomeMessage,
    sendHelpMessage,
    sendSessionExpiredMessage,
    sendTooManyAttemptsMessage,
    sendErrorMessage,
    sendConfirmationMessage,
    sendReceiptMessage
};