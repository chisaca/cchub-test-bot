// utils/messaging.js - UPDATED with correct environment variable names
// ============================================================================
// WHATSAPP MESSAGING UTILITY
// Handles all outgoing WhatsApp messages through the Meta Graph API
// ============================================================================

const { 
    RESPONSE_MESSAGES, 
    WHATSAPP_CONFIG,
    UI_MESSAGES,
    ERROR_MESSAGES,
    MESSAGING_CONFIG,
    INTERACTIVE_UI_CONFIG,
    PERSONALITY_CONFIG
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
    // VALIDATE ENVIRONMENT VARIABLES - Using your .env variable names
    // ========================================================================
    const phoneNumberId = process.env.PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    // Debug: Log what we have (without exposing full tokens)
    console.log(`🔑 [MESSAGING] Checking credentials...`);
    console.log(`   PHONE_NUMBER_ID: ${phoneNumberId ? '✅ Present (' + phoneNumberId.substring(0, 3) + '...)' : '❌ Missing'}`);
    console.log(`   WHATSAPP_ACCESS_TOKEN: ${accessToken ? '✅ Present (' + accessToken.substring(0, 5) + '...)' : '❌ Missing'}`);
    
    if (!phoneNumberId || !accessToken) {
        console.error('❌ [MESSAGING] WhatsApp credentials not configured');
        console.error('   Required env vars: PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN');
        console.error('   Check your .env file and ensure the bot is restarted after changes');
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
// INTERACTIVE MESSAGES (WhatsApp Modern UI)
// ============================================================================

/**
 * Send an interactive LIST message (modern menu)
 * Users can tap options instead of typing numbers
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} headerText - Header text (plain text, no markdown)
 * @param {string} bodyText - Body text (can have markdown)
 * @param {string} buttonText - Text on the button that opens the list
 * @param {Array} sections - Array of sections with rows
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendListMessage(to, headerText, bodyText, buttonText, sections) {
    const phoneNumberId = process.env.PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    if (!phoneNumberId || !accessToken) {
        console.error('❌ [MESSAGING] WhatsApp credentials not configured');
        return false;
    }
    
    try {
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to,
            type: "interactive",
            interactive: {
                type: "list",
                header: {
                    type: "text",
                    text: headerText // Keep header plain - no markdown
                },
                body: {
                    text: bodyText // Body can have markdown (*bold*)
                },
                footer: {
                    text: `💬 ${PERSONALITY_CONFIG.BOT_NAME} - Tap to choose`
                },
                action: {
                    button: buttonText,
                    sections: sections
                }
            }
        };
        
        const response = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_CONFIG.API_VERSION}/${phoneNumberId}/messages`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: MESSAGING_CONFIG.REQUEST_TIMEOUT
            }
        );
        
        console.log(`✅ [LIST] Interactive menu sent to ${to}`);
        return true;
        
    } catch (error) {
        console.error('❌ [LIST] Error sending interactive menu:', error.response?.data || error.message);
        return false;
    }
}

/**
 * Send an interactive BUTTON message (quick confirmations)
 * Users tap buttons instead of typing YES/NO
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} bodyText - The question/message
 * @param {Array} buttons - Array of button objects {id, title}
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendButtonMessage(to, bodyText, buttons) {
    const phoneNumberId = process.env.PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    if (!phoneNumberId || !accessToken) {
        console.error('❌ [MESSAGING] WhatsApp credentials not configured');
        return false;
    }
    
    try {
        // Format buttons (max 3, titles max 20 chars)
        const formattedButtons = buttons.slice(0, 3).map((btn, index) => ({
            type: "reply",
            reply: {
                id: btn.id,
                title: btn.title.substring(0, 20)
            }
        }));
        
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to,
            type: "interactive",
            interactive: {
                type: "button",
                body: {
                    text: bodyText
                },
                footer: {
                    text: `💬 Tap a button below`
                },
                action: {
                    buttons: formattedButtons
                }
            }
        };
        
        const response = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_CONFIG.API_VERSION}/${phoneNumberId}/messages`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: MESSAGING_CONFIG.REQUEST_TIMEOUT
            }
        );
        
        console.log(`✅ [BUTTON] Interactive buttons sent to ${to}`);
        return true;
        
    } catch (error) {
        console.error('❌ [BUTTON] Error sending buttons:', error.response?.data || error.message);
        return false;
    }
}

/**
 * Send an interactive main menu using LIST message (5-category structure)
 * This is the primary entry point for the 3-tap architecture
 * 
 * @param {string} to - Recipient's WhatsApp ID
 */
async function sendInteractiveMainMenu(to) {
    const greeting = getTimeBasedGreeting();
    const tip = getDailyTip();
    const fact = getZimFact();
    
    const bodyText = `${greeting}\n\n` +
        `I'm *${PERSONALITY_CONFIG.BOT_NAME}*, your personal assistant.\n\n` +
        `💡 *Tip:* ${tip}\n` +
        `📚 *Fact:* ${fact}\n\n` +
        `👇 *Select a category:*`;
    
    await sendListMessage(
        to,
        "MAIN MENU",
        bodyText,
        "📋 View Menu",
        INTERACTIVE_UI_CONFIG.MAIN_MENU_SECTIONS
    );
}

/**
 * Send a category submenu (PAYMENTS, INFORMATION, QUICK, MARKETPLACE)
 * Used when user taps a category from main menu
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} category - Category name (PAYMENTS, INFORMATION, QUICK, MARKETPLACE)
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendCategorySubmenu(to, category) {
    let submenuConfig;
    
    switch (category) {
        case 'PAYMENTS':
            submenuConfig = INTERACTIVE_UI_CONFIG.PAYMENTS_SUBMENU;
            break;
        case 'INFORMATION':
            submenuConfig = INTERACTIVE_UI_CONFIG.INFORMATION_SUBMENU;
            break;
        case 'QUICK':
            submenuConfig = INTERACTIVE_UI_CONFIG.QUICK_SUBMENU;
            break;
        case 'MARKETPLACE':
            submenuConfig = INTERACTIVE_UI_CONFIG.MARKETPLACE_SUBMENU;
            break;
        default:
            console.error(`❌ [MESSAGING] Unknown category: ${category}`);
            return false;
    }
    
    if (!submenuConfig) {
        console.error(`❌ [MESSAGING] No submenu config for category: ${category}`);
        return false;
    }
    
    const greeting = getTimeBasedGreeting();
    const bodyText = `${greeting}\n\nSelect an option below:`;
    
    return await sendListMessage(
        to,
        submenuConfig[0].title,
        bodyText,
        "📋 View Options",
        submenuConfig
    );
}

/**
 * Send a confirmation prompt with YES/NO/EDIT buttons
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} question - The confirmation question
 */
async function sendConfirmationButtons(to, question) {
    await sendButtonMessage(
        to,
        question,
        INTERACTIVE_UI_CONFIG.CONFIRM_BUTTONS
    );
}

/**
 * Send post-transaction options (another, receipt, menu)
 * Used after successful transactions for 1-tap next actions
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} successMessage - The success message to show
 */
async function sendPostTransactionButtons(to, successMessage) {
    const message = `${successMessage}\n\nWhat would you like to do next?`;
    
    await sendButtonMessage(
        to,
        message,
        INTERACTIVE_UI_CONFIG.POST_TRANSACTION_BUTTONS
    );
}

/**
 * Send network selection buttons
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} context - Context message (e.g., "Select network for airtime")
 */
async function sendNetworkButtons(to, context) {
    const message = `📱 *${context}*\n\nChoose a network:`;
    
    await sendButtonMessage(
        to,
        message,
        INTERACTIVE_UI_CONFIG.NETWORK_BUTTONS
    );
}

/**
 * Send currency selection buttons
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} service - Service name (Airtime/ZESA)
 */
async function sendCurrencyButtons(to, service) {
    const message = `💰 *${service} Purchase*\n\nChoose currency:`;
    
    await sendButtonMessage(
        to,
        message,
        INTERACTIVE_UI_CONFIG.CURRENCY_BUTTONS
    );
}

/**
 * Send a WhatsApp Flow (interactive form) - 2-tap experience
 * NOTE: Requires Flow ID from Meta Developer Dashboard
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {string} flowId - Flow ID from Meta
 * @param {string} screen - Screen name to start on
 * @param {object} data - Pre-filled data for the form
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendFlow(to, flowId, screen, data = {}) {
    const phoneNumberId = process.env.PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    if (!phoneNumberId || !accessToken) {
        console.error('❌ [MESSAGING] WhatsApp credentials not configured');
        return false;
    }
    
    try {
        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: to,
            type: "interactive",
            interactive: {
                type: "flow",
                body: {
                    text: "Tap the button below to open the purchase form 👇"
                },
                action: {
                    name: "flow",
                    parameters: {
                        flow_message_version: "3",
                        flow_token: generateFlowToken(),
                        flow_id: flowId,
                        flow_cta: "Continue",
                        flow_action: "navigate",
                        flow_action_payload: {
                            screen: screen,
                            data: data
                        }
                    }
                }
            }
        };
        
        const response = await axios.post(
            `https://graph.facebook.com/${WHATSAPP_CONFIG.API_VERSION}/${phoneNumberId}/messages`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: MESSAGING_CONFIG.REQUEST_TIMEOUT
            }
        );
        
        console.log(`✅ [FLOW] Flow sent to ${to}`);
        return true;
        
    } catch (error) {
        console.error('❌ [FLOW] Error sending flow:', error.response?.data || error.message);
        return false;
    }
}

/**
 * Send a flow message wrapper for airtime/ZESA
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {object} flowConfig - Flow configuration
 */
async function sendFlowMessage(to, flowConfig) {
    await sendFlow(
        to,
        flowConfig.flowId,
        flowConfig.screen,
        flowConfig.data || {}
    );
}

/**
 * Generate a unique flow token
 * 
 * @returns {string} Unique flow token
 */
function generateFlowToken() {
    return `flow_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get time-based greeting based on hour of day
 * 
 * @returns {string} Appropriate greeting (no asterisks)
 */
function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    let greeting;
    
    if (hour < 12) {
        greeting = PERSONALITY_CONFIG.GREETINGS.morning;
    } else if (hour < 17) {
        greeting = PERSONALITY_CONFIG.GREETINGS.afternoon;
    } else if (hour < 20) {
        greeting = PERSONALITY_CONFIG.GREETINGS.evening;
    } else {
        greeting = PERSONALITY_CONFIG.GREETINGS.night;
    }
    
    // Remove asterisks
    return greeting.replace(/\*/g, '').trim();
}

/**
 * Get daily tip
 * 
 * @returns {string} Random tip
 */
function getDailyTip() {
    const { DAILY_ENGAGEMENT_CONFIG } = require('../config/constants');
    const tips = DAILY_ENGAGEMENT_CONFIG?.TIPS || [
        "You can buy airtime for friends by just sharing their contact!",
        "Quick service repeats your last purchase in one tap!"
    ];
    return tips[Math.floor(Math.random() * tips.length)];
}

/**
 * Get random Zimbabwe fact
 * 
 * @returns {string} Random fact
 */
function getZimFact() {
    const facts = PERSONALITY_CONFIG.ZIM_FACTS;
    return facts[Math.floor(Math.random() * facts.length)];
}

// ============================================================================
// STANDARD MESSAGE TEMPLATES (Preserved for backward compatibility)
// ============================================================================

/**
 * Send welcome message with main menu
 * Now uses interactive menu by default
 * 
 * @param {string} to - Recipient's WhatsApp ID
 */
async function sendWelcomeMessage(to) {
    await sendInteractiveMainMenu(to);
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
// CONFIRMATION MESSAGES (Enhanced with buttons)
// ============================================================================

/**
 * Send a confirmation message with details and options
 * Now uses buttons by default
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
    
    // Use buttons instead of text options
    if (options && options.length > 0) {
        // Map options to button format
        const buttons = options.map((opt, index) => ({
            id: `confirm_${index + 1}`,
            title: opt.substring(0, 20) // Max 20 chars
        }));
        
        await sendButtonMessage(to, message, buttons);
    } else {
        await sendConfirmationButtons(to, message + '\n\nPlease confirm:');
    }
}

// ============================================================================
// RECEIPT MESSAGES
// ============================================================================

/**
 * Send a clean receipt message with masked phone numbers
 * 
 * @param {string} to - Recipient's WhatsApp ID
 * @param {Object} transactionDetails - Transaction details
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
    
    let message = `✅ *${service} Successful!*\n\n`;
    
    // Mask recipient for privacy (e.g., 07712****345)
    if (recipient && recipient.length > MESSAGING_CONFIG.RECEIPT_PREFIX_LENGTH + MESSAGING_CONFIG.RECEIPT_MASK_LENGTH) {
        message += `📱 Recipient: ${recipient.slice(0, MESSAGING_CONFIG.RECEIPT_PREFIX_LENGTH)}****${recipient.slice(-MESSAGING_CONFIG.RECEIPT_MASK_LENGTH)}\n`;
    } else {
        message += `📱 Recipient: ${recipient}\n`;
    }
    
    message += `💰 Amount: ${amount} ${currency}\n`;
    message += `🆔 Reference: ${transactionId}\n`;
    if (additionalInfo) message += `\n${additionalInfo}`;
    
    // Add random success message from personality config
    const randomSuccess = PERSONALITY_CONFIG.PAYMENT_CONFIRMATIONS[
        Math.floor(Math.random() * PERSONALITY_CONFIG.PAYMENT_CONFIRMATIONS.length)
    ];
    
    message += `\n${randomSuccess}`;
    
    await sendMessage(to, message);
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    // Core
    sendMessage,
    
    // Interactive
    sendListMessage,
    sendButtonMessage,
    sendInteractiveMainMenu,
    sendCategorySubmenu,
    sendConfirmationButtons,
    sendPostTransactionButtons,
    sendNetworkButtons,
    sendCurrencyButtons,
    sendFlow,
    sendFlowMessage,
    
    // Standard
    sendWelcomeMessage,
    sendHelpMessage,
    sendSessionExpiredMessage,
    sendTooManyAttemptsMessage,
    sendErrorMessage,
    sendConfirmationMessage,
    sendReceiptMessage
};