// utils/messaging.js
// ============================================================================
// WHATSAPP MESSAGING UTILITY
// Handles all outgoing WhatsApp messages through the Meta Graph API
// 
// Features:
// - Send text messages with proper formatting
// - Welcome message with main menu
// - Help messages
// - Error messages with different error types
// - Confirmation messages with options
// - Receipt messages with masked phone numbers for privacy
// - Automatic message truncation for WhatsApp's length limits
// ============================================================================

const { 
    RESPONSE_MESSAGES, 
    WHATSAPP_CONFIG,
    UI_MESSAGES,
    ERROR_MESSAGES,
    MESSAGING_CONFIG 
} = require('../config/constants');
const axios = require('axios');

// ============================================================================
// CORE MESSAGE SENDING
// ============================================================================

/**
 * Send a WhatsApp text message to a user
 * Automatically handles:
 * - Environment variable validation
 * - Message length truncation
 * - Error handling with detailed logging
 * - Timeout configuration
 * 
 * @param {string} to - Recipient's WhatsApp ID (phone number)
 * @param {string} text - Message content to send
 * @returns {Promise<boolean>} True if message was sent successfully
 */
async function sendMessage(to, text) {
    // ========================================================================
    // VALIDATE ENVIRONMENT VARIABLES
    // ========================================================================
    const phoneNumberId = process.env.PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    if (!phoneNumberId || !accessToken) {
        console.error('❌ [MESSAGING] WhatsApp credentials not configured');
        console.error('   PHONE_NUMBER_ID:', phoneNumberId ? '✅ Set' : '❌ Missing');
        console.error('   WHATSAPP_ACCESS_TOKEN:', accessToken ? '✅ Set' : '❌ Missing');
        return false;
    }
    
    // ========================================================================
    // TRUNCATE LONG MESSAGES
    // WhatsApp has a character limit, so truncate if needed
    // ========================================================================
    if (text.length > WHATSAPP_CONFIG.MAX_MESSAGE_LENGTH) {
        console.warn(`⚠️ [MESSAGING] Message too long (${text.length} chars), truncating...`);
        text = text.substring(0, WHATSAPP_CONFIG.MAX_MESSAGE_LENGTH - 100) + 
               MESSAGING_CONFIG.TRUNCATION_SUFFIX;
    }
    
    try {
        // ========================================================================
        // SEND TO WHATSAPP API
        // ========================================================================
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
        
        console.log(`✅ [MESSAGING] Message sent to ${to} (${text.length} chars)`);
        return true;
        
    } catch (error) {
        // ========================================================================
        // HANDLE API ERRORS
        // ========================================================================
        if (error.response) {
            // API returned an error response
            console.error(`❌ [MESSAGING] API Error ${error.response.status}:`, {
                error: error.response.data.error?.message,
                type: error.response.data.error?.type,
                code: error.response.data.error?.code
            });
        } else if (error.request) {
            // Request was made but no response received
            console.error('❌ [MESSAGING] No response from WhatsApp API:', error.message);
        } else {
            // Error setting up the request
            console.error('❌ [MESSAGING] Error setting up request:', error.message);
        }
        
        // Log full error in development for debugging
        if (process.env.NODE_ENV === 'development') {
            console.error('Full error:', error);
        }
        
        return false;
    }
}

// ============================================================================
// STANDARD MESSAGE TEMPLATES
// ============================================================================

/**
 * Send welcome message with main menu
 * 
 * @param {string} to - Recipient's WhatsApp ID
 */
async function sendWelcomeMessage(to) {
    await sendMessage(to, RESPONSE_MESSAGES.WELCOME);
}

/**
 * Send comprehensive help message
 * 
 * @param {string} to - Recipient's WhatsApp ID
 */
async function sendHelpMessage(to) {
    await sendMessage(to, RESPONSE_MESSAGES.HELP);
}

/**
 * Send session expired notification
 * 
 * @param {string} to - Recipient's WhatsApp ID
 */
async function sendSessionExpiredMessage(to) {
    await sendMessage(to, RESPONSE_MESSAGES.SESSION_EXPIRED);
}

/**
 * Send too many attempts notification
 * 
 * @param {string} to - Recipient's WhatsApp ID
 */
async function sendTooManyAttemptsMessage(to) {
    await sendMessage(to, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
}

// ============================================================================
// ERROR MESSAGES
// ============================================================================

/**
 * Send a formatted error message based on error type
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} errorType - Type of error (invalid_selection, paycode_required, account_locked)
 * @param {Object} details - Additional details for error message
 */
async function sendErrorMessage(to, errorType, details = {}) {
    let message = '';
    
    switch(errorType) {
        case 'invalid_selection':
            message = RESPONSE_MESSAGES.INVALID_SELECTION;
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

// ============================================================================
// CONFIRMATION MESSAGES
// ============================================================================

/**
 * Send a confirmation message with details and options
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} title - Confirmation title
 * @param {Object} details - Key-value pairs of transaction details
 * @param {Array} options - Array of option strings (numbered automatically)
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

// ============================================================================
// RECEIPT MESSAGES
// ============================================================================

/**
 * Send a clean receipt message with masked phone numbers
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {Object} transactionDetails - Transaction details
 * @param {string} transactionDetails.transactionId - Transaction ID
 * @param {string} transactionDetails.service - Service name
 * @param {number} transactionDetails.amount - Transaction amount
 * @param {string} transactionDetails.currency - Currency
 * @param {string} transactionDetails.recipient - Recipient phone number
 * @param {string} transactionDetails.additionalInfo - Any additional info
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
    
    let message = `✅ ${service} Sent!\n`;
    
    // Mask recipient for privacy (e.g., 07712****345)
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

// ============================================================================
// EXPORTS
// ============================================================================
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
