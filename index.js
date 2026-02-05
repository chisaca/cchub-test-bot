const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Store sessions in memory
const sessions = {};

// Rate limiting and user activity tracking
const userActivity = {};
const RATE_LIMIT_CONFIG = {
    maxAttempts: 3,
    windowMs: 5 * 60 * 1000,
    lockoutDuration: 15 * 60 * 1000
};

// ==================== HELPER FUNCTIONS ====================

// Helper function to create/update session
const updateSession = (whatsappNumber, data) => {
    Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].whatsappNumber === whatsappNumber) {
            if (data.service === 'bill_payment' && sessions[sessionId].service !== 'bill_payment') {
                return;
            }
            delete sessions[sessionId];
        }
    });
    
    const sessionId = `session_${whatsappNumber}_${Date.now()}`;
    sessions[sessionId] = {
        ...data,
        whatsappNumber,
        createdAt: Date.now(),
        expiresAt: Date.now() + (10 * 60 * 1000)
    };
    return sessionId;
};

// Keyword detection helper
function detectKeywords(message) {
    const cleanMessage = message.toLowerCase().trim();
    
    if (cleanMessage.includes('airtime')) {
        return 'airtime';
    } else if (cleanMessage.includes('zesa')) {
        return 'zesa';
    }
    
    return null;
}

// Flow error message helper
function getFlowErrorMessage(flow) {
    const simpleMessages = {
        'zesa_meter_entry': `❌ *Sorry, number not correct*\n\nPlease send your ZESA meter number:\n\nIt should have 10 or more numbers\n\nExample meter numbers:\n• 12345678901\n• 11111111111\n\nOr type "hi" to go back to menu.`,
        'zesa_amount_entry': `❌ *Sorry, amount not correct*\n\nPlease enter an amount:\n\nMinimum: $1\n\nExample: 10 for $10\n\nOr type "hi" to go back to menu.`,
        'zesa_wallet_selection': `❌ *Sorry, choice not correct*\n\nPlease choose a wallet (1-5):\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari\n\nOr type "hi" to go back to menu.`,
        'airtime_recipient_entry': `❌ *Sorry, phone number not correct*\n\nPlease send a phone number:\n\n• 10 digits\n• Starts with 0\n\nExample: 0770123456\n\nOr type "hi" to go back to menu.`,
        'airtime_amount_entry': `❌ *Sorry, choice not correct*\n\nPlease choose (1-4):\n\n1. ZWL 5,000\n2. ZWL 10,000\n3. ZWL 20,000\n4. Other amount\n\nOr type "hi" to go back to menu.`,
        'airtime_custom_amount': `❌ *Sorry, amount not correct*\n\nPlease enter an amount:\n\nMinimum: ZWL 100\n\nExample: 15000 for ZWL 15,000\n\nOr type "hi" to go back to menu.`,
        'airtime_wallet_selection': `❌ *Sorry, choice not correct*\n\nPlease choose a wallet (1-6):\n\n1. EcoCash\n2. OneMoney\n3. Innbucks\n4. Mukuru\n5. Omari\n6. Telecash\n\nOr type "hi" to go back to menu.`,
        'bill_category_selection': `❌ *Sorry, choice not correct*\n\nPlease choose (1-5):\n\n1. 🏫 School Fees\n2. 🏛️ City Council\n3. 🛡️ Insurance\n4. 🛒 Retail/Subscriptions\n5. ← Back to Menu\n\nOr type "hi" to go back to menu.`,
        'bill_code_search_option': `❌ *Sorry, choice not correct*\n\nPlease choose (1-3):\n\n1. ✅ I have a PayCode\n2. 🔍 Get PayCode from website\n3. ← Choose different category\n\nOr type "hi" to go back to menu.`,
        'bill_amount_entry': `❌ *Sorry, amount too small*\n\nPlease enter amount:\n\nMinimum: ZWL 50,000\n\nExample: 100000 for ZWL 100,000\n\nOr type "hi" to cancel.`,
        'bill_payment_confirmation': `❌ *Sorry, choice not correct*\n\nPlease choose (1-3):\n\n1. ✅ Yes, pay with EcoCash\n2. ✏️ Change amount\n3. ← Start over\n\nOr type "hi" to go back to menu.`,
        'waiting_for_paycode': `❌ *Sorry, not a valid PayCode*\n\nPlease send a PayCode like this:\n\nCCH123456\n\nExample: CCH789012\n\nOr type "hi" to go back to menu.`,
        'main_menu': `❌ *Sorry, choice not correct*\n\nPlease choose (1-4):\n\n1. ⚡ Buy ZESA\n2. 📱 Buy Airtime\n3. 💳 Pay Bill\n4. ❓ Help\n\nOr type "hi" to see menu.`
    };
    
    return simpleMessages[flow] || `❌ *Sorry, something went wrong*\n\nPlease try again or type "hi" to go back to menu.`;
}

// ==================== PAYCODE CLEANING & VALIDATION ====================

/**
 * Clean a PayCode string by removing all non-essential characters
 */
function cleanPayCode(rawPayCode) {
    if (!rawPayCode || typeof rawPayCode !== 'string') {
        return null;
    }
    
    // Step 1: Trim whitespace
    let cleaned = rawPayCode.trim();
    
    // Step 2: Remove all non-alphanumeric characters (spaces, dashes, dots, etc.)
    cleaned = cleaned.replace(/[^\w]/g, '');
    
    // Step 3: Convert to uppercase for consistency
    cleaned = cleaned.toUpperCase();
    
    // Step 4: Ensure CCH is at the beginning (case-insensitive)
    const cchMatch = cleaned.match(/^(CCH)(\d+)$/i);
    if (cchMatch) {
        cleaned = cchMatch[1].toUpperCase() + cchMatch[2];
    }
    
    console.log(`🧹 DEBUG - PayCode Cleaning:`);
    console.log(`  Input: "${rawPayCode}"`);
    console.log(`  Output: "${cleaned}"`);
    console.log(`  Length: ${cleaned.length}`);
    
    return cleaned;
}

/**
 * Extract PayCode from message using multiple pattern matching
 */
function extractPayCodeFromMessage(message) {
    const cleanMessage = message.trim();
    console.log(`🔍 DEBUG - Extracting from: "${cleanMessage}"`);
    
    // Pattern 1: Standard CCH followed by 6 digits (allowing spaces/dashes)
    const standardPattern = /(CCH[\s\-\.]*\d{6})/i;
    
    // Pattern 2: "PayCode:" prefix
    const prefixedPattern = /paycode[:\s]+(CCH[\s\-\.]*\d{6})/i;
    
    // Pattern 3: cchub://pay/ format
    const urlPattern = /cchub[:\/]+pay[:\/]+(CCH[\s\-\.]*\d{6})/i;
    
    // Pattern 4: Just 6 digits (but we'll require CCH prefix later)
    const digitsOnlyPattern = /(\d{6})/;
    
    let match = null;
    
    // Try patterns in order
    if ((match = cleanMessage.match(standardPattern))) {
        console.log(`🔍 Matched standard pattern: ${match[1]}`);
        return match[1];
    } else if ((match = cleanMessage.match(prefixedPattern))) {
        console.log(`🔍 Matched prefixed pattern: ${match[1]}`);
        return match[1];
    } else if ((match = cleanMessage.match(urlPattern))) {
        console.log(`🔍 Matched URL pattern: ${match[1]}`);
        return match[1];
    } else if ((match = cleanMessage.match(digitsOnlyPattern))) {
        console.log(`🔍 Matched digits only: ${match[1]}`);
        return match[1]; // Will be validated as needing CCH prefix
    }
    
    console.log(`🔍 No PayCode pattern matched`);
    return null;
}

/**
 * Comprehensive PayCode validation with rate limiting
 */
function validatePayCode(payCode, from) {
     console.log(`🔐 DEBUG - Validating: "${payCode}" from ${from}`);
    
    // Initialize user activity tracking
    if (!userActivity[from]) {
        userActivity[from] = {
            attempts: 0,
            lastAttempt: 0,
            lockoutUntil: 0,
            lastValidPayCode: null
        };
    }
    
    const userState = userActivity[from];
    const now = Date.now();
    
    // Check if user is locked out
    if (userState.lockoutUntil > now) {
        const remainingMinutes = Math.ceil((userState.lockoutUntil - now) / (60 * 1000));
        throw new Error(`RATE_LIMIT: Too many invalid attempts. Please try again in ${remainingMinutes} minute(s).`);
    }
    
    // Reset attempts if window expired
    if (userState.lastAttempt < now - RATE_LIMIT_CONFIG.windowMs) {
        userState.attempts = 0;
    }
    
    // Clean the PayCode first
    const cleanedPayCode = cleanPayCode(payCode);
    console.log(`🔐 DEBUG - Cleaned PayCode: "${cleanedPayCode}"`);
    
    if (!cleanedPayCode) {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: Invalid PayCode format.`);
    }
    
    // RULE 1: Must start with CCH
    if (!cleanedPayCode.startsWith('CCH')) {
        // Check if it's just 6 digits (add CCH prefix)
        if (/^\d{6}$/.test(cleanedPayCode)) {
            userState.attempts++;
            userState.lastAttempt = now;
            throw new Error(`FORMAT: PayCodes now start with "CCH". Please add "CCH" prefix: CCH${cleanedPayCode}`);
        }
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: PayCode must start with "CCH".`);
    }
    
    // RULE 2: CCH must be uppercase
    if (cleanedPayCode.slice(0, 3) !== 'CCH') {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: "CCH" must be in uppercase.`);
    }
    
    // RULE 3: Check total length (CCH + 6 digits = 9)
    if (cleanedPayCode.length !== 9) {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: Invalid PayCode length. Must be exactly 9 characters (CCH + 6 digits). Got ${cleanedPayCode.length}.`);
    }
    
    // RULE 4: Check digits after CCH
    const numericPart = cleanedPayCode.slice(3);
    if (!/^\d{6}$/.test(numericPart)) {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`FORMAT: After "CCH", must be exactly 6 digits. Found: "${numericPart}"`);
    }
    
    // RULE 5: Check for suspicious patterns
    const suspiciousPatterns = [
        /^CCH0{6}$/,
        /^CCH1{6}$/,
        /^CCH9{6}$/,
        /^CCH123456$/,
        /^CCH654321$/,
        /^CCH(\d)\1{5}$/,
    ];
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(cleanedPayCode)) {
            console.warn(`⚠️ Suspicious PayCode pattern detected from ${from}: ${cleanedPayCode}`);
            userState.attempts += 2;
            userState.lastAttempt = now;
            break;
        }
    }
    
    // RULE 6: Check for same PayCode as last time
    if (userState.lastValidPayCode === cleanedPayCode) {
        throw new Error(`SECURITY: This PayCode was already used recently. Each PayCode can only be used once.`);
    }
    
    // RULE 7: Check if entire message is too long (security)
    if (payCode.length > 100) {
        userState.attempts++;
        userState.lastAttempt = now;
        throw new Error(`SECURITY: Message too long. Please send only the PayCode.`);
    }
    
    // SUCCESS: Valid PayCode
    userState.attempts = 0;
    userState.lastValidPayCode = cleanedPayCode;
    userState.lastAttempt = now;
    
    console.log(`✅ DEBUG - PayCode validation passed: ${cleanedPayCode}`);
    return cleanedPayCode;
}

// ==================== PAYCODE HANDLING ====================

async function handlePayCodeMessage(from, message) {
    console.log(`🔐 Processing PayCode from ${from}: "${message}"`);
    
    // Debug environment variables
    console.log('🔧 DEBUG - Environment Check:');
    console.log('📦 WordPress URL:', process.env.WORDPRESS_API_URL || 'Not set');
    console.log('🔑 Token exists:', !!process.env.CCHUB_BOT_TOKEN);
    console.log('🔑 Token length:', process.env.CCHUB_BOT_TOKEN?.length || 0);
    
    try {
        // Step 1: Extract PayCode from message
        const extractedPayCode = extractPayCodeFromMessage(message);
        
        if (!extractedPayCode) {
            console.log(`❌ No PayCode extracted from message`);
            
            // Check if user is in a session that expects amount
            const session = getActiveSession(from);
            if (session && session.flow === 'bill_amount_entry' && /^\d+$/.test(message.trim())) {
                console.log(`📝 User is in bill amount entry, not PayCode`);
                return;
            }
            
            await sendMessage(from, `❌ *PAYCODE NOT DETECTED*\n\nTo pay a bill, you need a PayCode from our website.\n\n📋 *CORRECT FORMAT:* CCH123456\n\n✅ *Examples:*\n• CCH789012\n• PayCode: CCH345678\n• cchub://pay/CCH901234\n\n🔗 *Get PayCode:* https://cchub.co.zw\n\nOr type "hi" to see other options.`);
            return;
        }
        
        console.log(`🔍 Extracted PayCode: "${extractedPayCode}"`);
        
        // Step 2: Validate the PayCode format
        let validatedPayCode;
        try {
            validatedPayCode = validatePayCode(extractedPayCode, from);
        } catch (validationError) {
            console.log(`❌ PayCode validation failed:`, validationError.message);
            throw validationError;
        }
        
        // PayCode validated successfully
        console.log(`✅ Valid PayCode detected: ${validatedPayCode} from ${from}`);
        
        // Step 3: Call WordPress API to decode PayCode
        if (!process.env.WORDPRESS_API_URL || !process.env.CCHUB_BOT_TOKEN) {
            throw new Error('API configuration missing. Please check environment variables.');
        }
        
        const response = await axios.get(
            `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/get-biller-code/${validatedPayCode}`,
            {
                headers: {
                    'X-CCHUB-TOKEN': process.env.CCHUB_BOT_TOKEN || ''
                },
                timeout: 10000
            }
        );
        
        console.log(`📡 API Response Status: ${response.status}`);
        
        const data = response.data;
        
        if (data.status !== 'success') {
            userActivity[from].attempts++;
            userActivity[from].lastAttempt = Date.now();
            await sendMessage(from, `❌ *INVALID PAYCODE*\n\nPayCode *${validatedPayCode}* is not valid.\n\nPossible reasons:\n• Already used\n• Expired (10-minute limit)\n• Incorrect format\n\n🔗 *Get a new PayCode:* https://cchub.co.zw\n\nOr type "hi" to see other options.`);
            return;
        }
        
        // Map WordPress service types
        const serviceMapping = {
            'schools': 'school_fees',
            'city_council': 'city_council', 
            'insurance': 'insurance',
            'retail': 'retail_subscriptions'
        };
        
        const botCategory = serviceMapping[data.service_type] || data.service_type;
        const emojiMapping = {
            'school_fees': '🏫',
            'city_council': '🏛️',
            'insurance': '🛡️',
            'retail_subscriptions': '🛒'
        };
        
        const emoji = emojiMapping[botCategory] || '💳';
        const categoryName = data.service_type ? data.service_type.replace('_', ' ').toUpperCase() : 'BILL PAYMENT';
        
        // Update session
        const sessionId = updateSession(from, {
            flow: 'bill_amount_entry',
            service: 'bill_payment',
            billCategory: botCategory,
            billCategoryName: categoryName,
            billEmoji: emoji,
            billerCode: data.biller_code,
            billerName: data.provider_name,
            paycode: validatedPayCode,
            paycodeVerified: true,
            testTransaction: false,
            skipBillerSearch: true,
            paycodeValidatedAt: Date.now()
        });
        
        await sendMessage(from, `${emoji} *PAYCODE VERIFIED ✅*\n\n🔐 *Secure PayCode:* ${validatedPayCode}\n✅ *Status:* Valid\n⏰ *Expires:* 10 minutes\n\n🏢 *Biller:* ${data.provider_name}\n📋 *Service:* ${categoryName}\n🔢 *Biller Code:* ${data.biller_code}\n\n💰 *READY FOR PAYMENT*\n\n*Enter amount in ZWL:*\nExample: 100000 for ZWL 100,000\n\n💡 *Minimum amount:* ZWL 50,000\n\nOr type "hi" to cancel.`);
        
    } catch (error) {
        console.error('❌ Error processing PayCode:', error.message);
        console.error('❌ Error stack:', error.stack);
        
        const userState = userActivity[from] || { attempts: 0 };
        
        if (error.message.includes('RATE_LIMIT') || error.message.includes('SECURITY') || error.message.includes('FORMAT')) {
            userState.attempts = (userState.attempts || 0) + 1;
            userState.lastAttempt = Date.now();
            
            // Apply lockout if too many attempts
            if (userState.attempts >= RATE_LIMIT_CONFIG.maxAttempts) {
                userState.lockoutUntil = Date.now() + RATE_LIMIT_CONFIG.lockoutDuration;
                const lockoutMinutes = Math.ceil(RATE_LIMIT_CONFIG.lockoutDuration / (60 * 1000));
                
                await sendMessage(from, `🔒 *ACCOUNT TEMPORARILY LOCKED*\n\nToo many invalid attempts detected.\n\n⏰ *Lockout duration:* ${lockoutMinutes} minutes\n🔢 *Attempts:* ${userState.attempts}\n\n🔐 *For security reasons, please wait before trying again.*\n\nContact support if this is an error.`);
                return;
            }
            
            const errorType = error.message.split(':')[0];
            const errorDetail = error.message.split(':')[1]?.trim() || error.message;
            
            await sendMessage(from, `❌ *${errorType} ERROR*\n\n${errorDetail}\n\n🔢 *Attempt ${userState.attempts} of ${RATE_LIMIT_CONFIG.maxAttempts}*\n\n📋 *CORRECT FORMAT:* CCH123456\n\n✅ *Examples:*\n• CCH789012\n• Send only: CCH345678\n\n🔗 *Get valid PayCode:* https://cchub.co.zw\n\nOr type "hi" to see other options.`);
            
        } else if (error.response?.status === 401) {
            await sendMessage(from, `🔒 *API AUTHENTICATION ERROR*\n\nTechnical issue with PayCode verification.\n\nPlease:\n1. Try again in 2 minutes\n2. Contact support if problem persists\n3. Type "hi" for other options`);
            
        } else if (error.response?.status === 404) {
            await sendMessage(from, `❌ *PAYCODE NOT FOUND*\n\nThis PayCode doesn't exist in our system.\n\nPossible reasons:\n• Generated more than 10 minutes ago\n• Already used successfully\n• Invalid format\n\n🔗 *Get a new PayCode:* https://cchub.co.zw\n\nEach PayCode is valid for 10 minutes and single use only.`);
            
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            await sendMessage(from, `⚠️ *CONNECTION TIMEOUT*\n\nUnable to verify PayCode at the moment.\n\nPlease:\n1. Try again in 1 minute\n2. Check your internet connection\n3. Type "hi" for manual bill payment`);
            
        } else {
            await sendMessage(from, `⚠️ *TEMPORARY SYSTEM ERROR*\n\nWe're unable to process your PayCode right now.\n\nPlease:\n1. Try again in 2 minutes\n2. Get a new PayCode from website\n3. Type "hi" for other options\n\nError: ${error.message.substring(0, 50)}`);
        }
    }
}

// ==================== SESSION MANAGEMENT ====================

// Test meter numbers for simulation
const TEST_METERS = {
    '12345678901': {
        customerName: 'TEST USER - CHIDO MUTSVANGWA',
        area: 'TEST AREA - HARARE CBD',
        previousUnits: 15.50,
        isTest: true
    },
    '11111111111': {
        customerName: 'TEST USER - JOHN DOE',
        area: 'TEST AREA - BULAWAYO',
        previousUnits: 10.25,
        isTest: true
    },
    '22222222222': {
        customerName: 'TEST USER - JANE SMITH',
        area: 'TEST AREA - MUTARE',
        previousUnits: 20.75,
        isTest: true
    }
};

// MOCK BILLER DATA
const MOCK_BILLERS = {
    '0001': { name: 'School A', type: 'school_fees', category: '🏫 School' },
    '0002': { name: 'School B', type: 'school_fees', category: '🏫 School' },
    '0003': { name: 'School C', type: 'school_fees', category: '🏫 School' },
    '0004': { name: 'Council A', type: 'city_council', category: '🏛️ City Council' },
    '0005': { name: 'Council B', type: 'city_council', category: '🏛️ City Council' },
    '0006': { name: 'Council C', type: 'city_council', category: '🏛️ City Council' },
    '0007': { name: 'Insurance A', type: 'insurance', category: '🛡️ Insurance' },
    '0008': { name: 'Insurance B', type: 'insurance', category: '🛡️ Insurance' },
    '0009': { name: 'Insurance C', type: 'insurance', category: '🛡️ Insurance' },
    '0010': { name: 'Retail A', type: 'retail_subscriptions', category: '🛒 Retail/Subscriptions' },
    '0011': { name: 'Retail B', type: 'retail_subscriptions', category: '🛒 Retail/Subscriptions' },
    '0012': { name: 'Retail C', type: 'retail_subscriptions', category: '🛒 Retail/Subscriptions' }
};

// WEBSITE URLs
const BILLER_SEARCH_URLS = {
    'school_fees': 'https://cchub.co.zw/pay-school-fees/',
    'city_council': 'https://cchub.co.zw/pay-city-council/',
    'insurance': 'https://cchub.co.zw/pay-insurance/',
    'retail_subscriptions': 'https://cchub.co.zw/pay-retail-subscriptions/'
};

// NETWORK IDENTIFICATION
function validateAndDetectNetwork(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    
    if (cleanNumber.length !== 10) {
        return { valid: false, error: 'Phone number must be exactly 10 digits' };
    }
    
    if (!cleanNumber.startsWith('0')) {
        return { valid: false, error: 'Phone number must start with 0' };
    }
    
    let network = 'Unknown';
    if (cleanNumber.startsWith('077') || cleanNumber.startsWith('078')) {
        network = 'Econet';
    } else if (cleanNumber.startsWith('071')) {
        network = 'NetOne';
    } else if (cleanNumber.startsWith('073')) {
        network = 'Telecel';
    } else {
        return { valid: false, error: 'Invalid network. Must start with 077, 078, 071, or 073' };
    }
    
    return {
        valid: true,
        formattedNumber: cleanNumber.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3'),
        network: network,
        original: cleanNumber
    };
}

// Session management helpers
function getActiveSession(whatsappNumber) {
    const now = Date.now();
    
    // Clean up expired sessions
    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        if (session.expiresAt < now) {
            delete sessions[sessionId];
        }
    });
    
    // Find active sessions for this number
    const activeSessions = Object.values(sessions).filter(session => 
        session.whatsappNumber === whatsappNumber && session.expiresAt > now
    );
    
    return activeSessions.sort((a, b) => b.createdAt - a.createdAt)[0];
}

function deleteSession(whatsappNumber) {
    Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].whatsappNumber === whatsappNumber) {
            delete sessions[sessionId];
        }
    });
}

// Cleanup functions
function cleanupOldSessions() {
    const now = Date.now();
    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        if (session.expiresAt < now) {
            delete sessions[sessionId];
        }
    });
}

function cleanupUserActivity() {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    
    Object.keys(userActivity).forEach(userId => {
        const activity = userActivity[userId];
        
        if (activity.lastAttempt < hourAgo && activity.lockoutUntil < now) {
            delete userActivity[userId];
        }
        
        if (activity.lockoutUntil > 0 && activity.lockoutUntil < now) {
            activity.lockoutUntil = 0;
            activity.attempts = 0;
        }
    });
}

// Run cleanups
setInterval(cleanupOldSessions, 60 * 1000);
setInterval(cleanupUserActivity, 5 * 60 * 1000);

// ==================== WEBHOOK ENDPOINTS ====================

// Webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        console.log('✅ Webhook verified');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        res.sendStatus(403);
    }
});

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
    console.log('📨 Received webhook');
    
    try {
        const body = req.body;
        
        if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
                const message = body.entry[0].changes[0].value.messages[0];
                const from = message.from;
                const messageText = message.text.body;

                console.log(`📱 RAW Message from ${from}: "${messageText}"`);
                await processMessage(from, messageText);
            }
        }
        
        res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.sendStatus(500);
    }
});

// ==================== MAIN MESSAGE PROCESSING ====================

async function processMessage(from, messageText) {
    console.log(`📱 Processing message from ${from}: "${messageText}"`);
    
    let session = getActiveSession(from);
    
    const cleanMessage = messageText.trim();
    
    // STEP 1: Check for "hi" (always works)
    if (cleanMessage.toLowerCase().includes('hi')) {
        if (userActivity[from]) {
            userActivity[from].attempts = 0;
            userActivity[from].lockoutUntil = 0;
        }
        await sendWelcomeMessage(from);
        return;
    }

    // STEP 2: Check if user is locked out
    const userState = userActivity[from];
    if (userState && userState.lockoutUntil > Date.now()) {
        const remainingMinutes = Math.ceil((userState.lockoutUntil - Date.now()) / (60 * 1000));
        await sendMessage(from, `🔒 *ACCOUNT LOCKED*\n\nToo many invalid attempts detected.\n\n⏰ *Time remaining:* ${remainingMinutes} minute(s)\n\nPlease wait or contact support.\n\nType "hi" after lockout expires.`);
        return;
    }

    // STEP 3: Check for PayCodes (most important check first)
    const hasPossiblePayCode = /CCH/i.test(cleanMessage) || /paycode/i.test(cleanMessage) || /cchub/i.test(cleanMessage);
    
    if (hasPossiblePayCode) {
        console.log(`🎯 Possible PayCode detected from ${from}`);
        await handlePayCodeMessage(from, cleanMessage);
        return;
    }
    
    // STEP 4: Check for keywords
    const detectedKeyword = detectKeywords(messageText);
    if (detectedKeyword) {
        if (detectedKeyword === 'airtime') {
            await startAirtimeFlow(from);
            return;
        } else if (detectedKeyword === 'zesa') {
            await startZesaFlow(from);
            return;
        }
    }
    
    // STEP 5: Handle numbered selections
    if (session && /^\d+$/.test(cleanMessage)) {
        // Check if it's a 6-digit number that might be a PayCode without CCH
        if (cleanMessage.length === 6 && !session.waitingForPaycode && !session.service === 'bill_payment') {
            await sendMessage(from, `❌ *PAYCODE FORMAT ERROR*\n\nPayCodes must start with "CCH".\n\nYou sent: "${cleanMessage}"\n\n✅ *Correct format:* CCH${cleanMessage}\n\n🔗 *Get valid PayCode:* https://cchub.co.zw\n\nOr type "hi" for other options.`);
            return;
        }
        
        if (session.flow === 'main_menu') {
            await handleMainMenuSelection(from, cleanMessage);
            return;
        } else if (session.flow === 'bill_category_selection') {
            await handleBillCategorySelection(from, cleanMessage, session);
            return;
        } else if (session.flow === 'bill_code_search_option') {
            await handleBillCodeSearchOption(from, cleanMessage, session);
            return;
        } else if (session.flow === 'bill_payment_confirmation') {
            await handleBillPaymentConfirmation(from, cleanMessage, session);
            return;
        } else if (session.flow === 'zesa_wallet_selection') {
            await handleWalletSelection(from, cleanMessage, session);
            return;
        } else if (session.flow === 'airtime_wallet_selection') {
            await handleAirtimeWalletSelection(from, cleanMessage, session);
            return;
        }
    }
    
    // STEP 6: Handle amount entry flows
    if (session) {
        if (session.flow === 'bill_amount_entry' && /^\d+$/.test(cleanMessage)) {
            const amount = parseInt(cleanMessage);
            if (amount < 50000) {
                await sendMessage(from, `❌ *INVALID AMOUNT*\n\nMinimum bill payment is ZWL 50,000.\n\nYou entered: ZWL ${amount.toLocaleString()}\n\n✅ *Please enter:*\n• Minimum: 50000\n• Example: 100000 for ZWL 100,000\n\nOr type "hi" to cancel.`);
                return;
            }
            await handleBillAmountEntry(from, cleanMessage, session);
            return;
        }
        
        if (session.flow === 'zesa_amount_entry' && /^\d+$/.test(cleanMessage)) {
            await handleAmountEntry(from, cleanMessage, session);
            return;
        }
        
        if (session.flow === 'airtime_custom_amount' && /^\d+$/.test(cleanMessage)) {
            await processAirtimeAmount(from, cleanMessage, session);
            return;
        }
        
        if (session.flow === 'airtime_amount_entry' && /^\d$/.test(cleanMessage)) {
            await handleAirtimeAmountEntry(from, cleanMessage, session);
            return;
        }
    }
    
    // STEP 7: Handle other flow-specific inputs
    if (session) {
        if (session.flow === 'zesa_meter_entry' && /^\d+$/.test(cleanMessage) && cleanMessage.length >= 10) {
            await handleMeterEntry(from, cleanMessage);
            return;
        } else if (session.flow === 'airtime_recipient_entry') {
            await handleAirtimeRecipientEntry(from, cleanMessage);
            return;
        } else if (session.flow === 'waiting_for_paycode') {
            const hasPayCode = /CCH/i.test(cleanMessage) || /paycode/i.test(cleanMessage);
            if (hasPayCode) {
                await handlePayCodeMessage(from, cleanMessage);
            } else {
                await sendMessage(from, `📋 *WAITING FOR PAYCODE*\n\nPlease send your PayCode:\n\n✅ *Format:* CCH123456\n\n🔗 *Get PayCode:* https://cchub.co.zw\n\nOr type "hi" to cancel.`);
            }
            return;
        } else if (session.flow === 'main_menu') {
            await sendMessage(from, 'Please type "hi" to see the main menu with numbered options.');
            return;
        }
        
        // Invalid input for current flow
        const errorMessage = getFlowErrorMessage(session.flow);
        await sendMessage(from, errorMessage);
        return;
    }
    
    // STEP 8: No active session
    if (cleanMessage.toLowerCase().includes('bill') || cleanMessage.toLowerCase().includes('pay')) {
        await sendMessage(from, `💳 *BILL PAYMENTS REQUIRE PAYCODE*\n\nFor all bill payments (School, Council, Insurance, Retail):\n\n1. Visit: https://cchub.co.zw\n2. Search and select your biller\n3. Get your 6-digit PayCode\n4. Return here and send: CCH123456\n\n✅ *Example:* CCH789012\n\nOr type "hi" for ZESA or Airtime options.`);
    } else if (/^\d{6}$/.test(cleanMessage)) {
        await sendMessage(from, `❌ *PAYCODE FORMAT ERROR*\n\nPayCodes must start with "CCH".\n\nYou sent: "${cleanMessage}"\n\n✅ *Correct format:* CCH${cleanMessage}\n\n🔗 *Get valid PayCode:* https://cchub.co.zw\n\nOr type "hi" for other options.`);
    } else if (/^\d+$/.test(cleanMessage) && cleanMessage.length >= 10) {
        const sessionId = updateSession(from, {
            flow: 'zesa_meter_entry',
            service: 'zesa',
            testTransaction: true
        });
        await handleMeterEntry(from, cleanMessage);
    } else {
        await sendWelcomeMessage(from);
    }
}

// ==================== WELCOME & MAIN MENU ====================

async function sendWelcomeMessage(from) {
    const sessionId = updateSession(from, { 
        flow: 'main_menu', 
        testTransaction: false,
        paycodeRequired: false
    });
    
    await sendMessage(from, `👋 *WELCOME TO CCHUB PAYMENTS*\n\nWhat would you like to do today?\n\n1. ⚡ Buy ZESA (Direct entry)\n2. 📱 Buy Airtime (Direct entry)\n3. 💳 Pay Bill (*Requires PayCode*)\n4. ❓ Help / Information\n\n*Reply with the number (1-4) of your choice.*\n\n💡 *Note:* Bill payments require a PayCode from our website.\n🔗 *Website:* https://cchub.co.zw`);
}

async function handleMainMenuSelection(from, choice) {
    const menuOptions = {
        '1': 'buy_zesa',
        '2': 'buy_airtime',
        '3': 'pay_bill',
        '4': 'help'
    };
    
    const selectedOption = menuOptions[choice];
    
    if (!selectedOption) {
        await sendMessage(from, '❌ Invalid selection. Please choose a number from 1-4.\n\n1. Buy ZESA\n2. Buy Airtime\n3. Pay Bill\n4. Help');
        return;
    }
    
    if (selectedOption === 'buy_zesa') {
        await startZesaFlow(from);
    } else if (selectedOption === 'buy_airtime') {
        await startAirtimeFlow(from);
    } else if (selectedOption === 'pay_bill') {
        await startBillPaymentFlow(from);
    } else if (selectedOption === 'help') {
        await sendMessage(from, '🆘 *HELP - TEST MODE*\n\nThis is a test simulation bot for CCHub.\n\n• Type "hi" to see main menu\n• Select option 1 for ZESA test\n• Select option 2 for Airtime test\n• Select option 3 for Bill Payment test\n• All transactions are simulated\n• No real payments are processed');
    }
}

// ==================== BILL PAYMENT FLOW ====================

async function startBillPaymentFlow(from) {
    const sessionId = updateSession(from, {
        flow: 'bill_category_selection',
        service: 'bill_payment',
        testTransaction: false,
        paycodeRequired: true
    });
    
    await sendMessage(from, `💳 *BILL PAYMENT*\n\n*All bill payments require a PayCode from our website.*\n\n📋 *PAYCODE FORMAT:* CCH123456\n\nWhat type of bill would you like to pay?\n\n1. 🏫 School Fees\n2. 🏛️ City Council\n3. 🛡️ Insurance\n4. 🛒 Retail/Subscriptions\n5. ← Back to Main Menu\n\n*Reply with the number (1-5) of your choice.*`);
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
        await sendMessage(from, '❌ Invalid selection. Please choose a number from 1-5.');
        return;
    }
    
    if (selectedCategory.type === 'back') {
        await sendWelcomeMessage(from);
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
    
    await sendMessage(from, `${selectedCategory.emoji} *${selectedCategory.name.toUpperCase()} PAYMENT*\n\nFor ${selectedCategory.name.toLowerCase()} payments:\n\n🔒 *SECURE PAYCODE REQUIRED*\n\n📋 *FORMAT:* CCH123456\n\n1. Visit: ${searchUrl}\n2. Search and select\n3. Get 6-digit PayCode\n4. Return here and send: CCH123456\n\n✅ *Example:* CCH789012\n\nOr choose:\n1. ✅ I have a PayCode (send CCH123456)\n2. 🔍 Get PayCode from website\n3. ← Choose different category`);
}

async function handleBillCodeSearchOption(from, choice, session) {
    if (choice === '1') {
        await sendMessage(from, `${session.billEmoji} *SEND YOUR PAYCODE*\n\nPlease send your PayCode:\n\n📋 *EXAMPLE:* CCH123456\n\n💡 *Got from:* ${session.websiteUrl}`);
        
        const sessionId = updateSession(from, {
            ...session,
            flow: 'waiting_for_paycode',
            waitingForPaycode: true
        });
        
    } else if (choice === '2') {
        await sendMessage(from, `${session.billEmoji} *GET PAYCODE FROM WEBSITE*\n\n1. Visit: ${session.websiteUrl}\n2. Search your ${session.billCategoryName.toLowerCase()}\n3. Click "Pay with WhatsApp"\n4. Get 6-digit PayCode\n5. Return here and send the PayCode\n\n📋 PayCode example: CCH123456\n\n🔒 *Why PayCodes?*\n• Prevents biller code errors\n• Ensures correct provider\n• Secure one-time use\n• 10-minute expiration`);
        
        const sessionId = updateSession(from, {
            ...session,
            flow: 'waiting_for_paycode',
            waitingForPaycode: true
        });
        
    } else if (choice === '3') {
        await startBillPaymentFlow(from);
    } else {
        await sendMessage(from, '❌ Invalid selection. Please choose 1, 2, or 3.');
    }
}

async function handleBillCodeEntry(from, billerCode, session) {
    const formattedCode = billerCode.padStart(4, '0');
    const biller = MOCK_BILLERS[formattedCode];
    
    if (!biller) {
        await sendMessage(from, `❌ *BILLER CODE NOT FOUND*\n\nCode "${formattedCode}" is not valid.\n\nPlease use a valid 4-digit biller code.\n\nTest codes for ${session.billCategoryName}:\n${getTestCodesForCategory(session.billCategory)}\n\n💡 *Find biller codes at:* ${BILLER_SEARCH_URLS[session.billCategory]}`);
        return;
    }
    
    if (biller.type !== session.billCategory) {
        await sendMessage(from, `❌ *WRONG CATEGORY*\n\nCode "${formattedCode}" belongs to ${biller.category}, not ${session.billCategoryName}.\n\nPlease use a ${session.billCategoryName} biller code or choose the correct category.`);
        return;
    }
    
    const sessionId = updateSession(from, {
        ...session,
        flow: 'bill_amount_entry',
        billerCode: formattedCode,
        billerName: biller.name,
        billerCategory: biller.category
    });
    
    await sendMessage(from, `✅ *BILLER VERIFIED* ⚠️\n\n${session.billEmoji} ${session.billCategoryName}\n🏢 Biller: ${biller.name}\n🔢 Code: ${formattedCode}\n\n💡 *THIS IS A TEST - NO REAL PAYMENT*\n\nHow much would you like to pay?\n(Minimum: ZWL 50,000)\n\n*Enter amount in ZWL:*\nExample: 100000 for ZWL 100,000`);
}

async function handleBillAmountEntry(from, amountText, session) {
    const amount = parseInt(amountText);
    
    if (isNaN(amount) || amount < 50000) {
        await sendMessage(from, 'Please enter a valid amount (minimum ZWL 50,000).\n\nExample: 100000 for ZWL 100,000');
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
    
    await sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n${session.billEmoji} ${session.billCategoryName}\n🏢 Biller: ${session.billerName}\n🔢 Biller Code: ${session.billerCode}\n\n💰 Bill Amount: ZWL ${amount.toLocaleString()}\n📈 Service Fee (4%): ZWL ${serviceFee.toLocaleString()}\n💰 *Total to Pay: ZWL ${total.toLocaleString()}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n💳 *ECO CASH ONLY FOR BILL PAYMENTS*\n\nIs this correct?\n\n1. ✅ Yes, pay with EcoCash\n2. ✏️ Change amount\n3. ← Start over\n\n*Reply with the number (1-3) of your choice.*`);
}

async function handleBillPaymentConfirmation(from, choice, session) {
    if (choice === '1') {
        const transactionId = `TEST-BILL-${Date.now().toString().slice(-8)}`;
        
        await sendMessage(from, `✅ *TEST PAYMENT COMPLETE* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n💳 *ECO CASH ONLY TRANSACTION*\n\n${session.billEmoji} ${session.billCategoryName}\n🏢 Biller: ${session.billerName}\n🔢 Code: ${session.billerCode}\n💰 Bill Amount: ZWL ${session.amount.toLocaleString()}\n📈 Service Fee: ZWL ${session.serviceFee.toLocaleString()}\n💰 Total Paid: ZWL ${session.total.toLocaleString()}\n📞 Reference: ${transactionId}\n💳 Paid via: EcoCash\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: ${transactionId}\nService: ${session.billCategoryName} (Test Mode)\nBiller: ${session.billerName}\nBiller Code: ${session.billerCode}\nBase Amount: ZWL ${session.amount.toLocaleString()}\nService Fee: ZWL ${session.serviceFee.toLocaleString()} (4%)\nTotal: ZWL ${session.total.toLocaleString()}\nWallet: EcoCash (Only)\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "hi" to start again.`);
        
        deleteSession(from);
    } else if (choice === '2') {
        const sessionId = updateSession(from, {
            ...session,
            flow: 'bill_amount_entry'
        });
        
        await sendMessage(from, `✏️ *CHANGE AMOUNT*\n\nPlease enter the new amount (minimum ZWL 50,000):\n\nExample: 150000 for ZWL 150,000`);
    } else if (choice === '3') {
        await startBillPaymentFlow(from);
    } else {
        await sendMessage(from, '❌ Invalid selection. Please choose 1, 2, or 3.');
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

// ==================== ZESA FLOW ====================

async function startZesaFlow(from) {
    const sessionId = updateSession(from, {
        flow: 'zesa_meter_entry',
        service: 'zesa',
        testTransaction: true,
        retryCount: 0
    });
    
    await sendMessage(from, `🔌 *TEST MODE - ZESA TOKEN PURCHASE*\n\n⚠️ *THIS IS A TEST SIMULATION*\nNo real payments will be processed.\n\nPlease enter your test meter number:\n\nTest meter numbers you can use:\n• 12345678901\n• 11111111111\n• 22222222222\n\nType "hi" to go back to main menu.`);
}

async function handleMeterEntry(from, meterNumber) {
    const session = getActiveSession(from);
    
    if (meterNumber.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
        return;
    }
    
    if (!meterNumber || meterNumber.length < 10) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        if (session) {
            updateSession(from, {
                ...session,
                retryCount: retryCount,
                expiresAt: Date.now() + (10 * 60 * 1000)
            });
        }
        
        await sendMessage(from, '❌ Please enter a valid test meter number (at least 10 digits).\n\nTest numbers: 12345678901, 11111111111, 22222222222\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const meterData = TEST_METERS[meterNumber];
    
    if (!meterData) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        if (session) {
            updateSession(from, {
                ...session,
                retryCount: retryCount,
                expiresAt: Date.now() + (10 * 60 * 1000)
            });
        }
        
        await sendMessage(from, `❌ *TEST METER NOT FOUND*\n\nPlease use one of these test meter numbers:\n• 12345678901\n• 11111111111\n• 22222222222\n\nThis is a simulation only.\n\nOr type "hi" to go back to main menu.`);
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
    
    await sendMessage(from, `✅ *TEST METER VERIFIED* ⚠️\n\n🔢 Meter: ${meterNumber}\n👤 Account: ${meterData.customerName}\n📍 Area: ${meterData.area}\n📊 Previous Units: ${meterData.previousUnits}\n\n💡 *THIS IS A TEST - NO REAL PAYMENT*\n\nHow much would you like to pay for token units?\n(Minimum: $1)\n\n*Enter amount:*\nExample: 10 for $10\n\nOr type "hi" to go back to main menu.`);
}

async function handleAmountEntry(from, amountText, session) {
    if (amountText.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
        return;
    }
    
    const amount = parseFloat(amountText);
    
    if (isNaN(amount) || amount < 1) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000)
        });
        
        await sendMessage(from, '❌ Please enter a valid amount (minimum $1).\nExample: 10\n\nOr type "hi" to go back to main menu.');
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
    
    await sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n👤 For: ${session.customerName}\n🔢 Meter: ${session.meterNumber}\n\n💡 Token Units: $${amount.toFixed(2)}\n📈 Service Fee (5%): $${serviceFee}\n💰 *Total to Pay: $${total}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n\nSelect a test wallet:\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari\n\n*Reply with the number (1-5) of your choice.*\n\nOr type "hi" to go back to main menu.`);
}

async function handleWalletSelection(from, walletChoice, session) {
    if (walletChoice.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
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
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000)
        });
        
        await sendMessage(from, '❌ Invalid selection. Please choose a number from 1-5:\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const testToken = Array.from({length: 4}, () => 
        Math.floor(1000 + Math.random() * 9000)
    ).join('-');
    
    const newUnits = (session.amount + session.previousUnits).toFixed(2);
    
    await sendMessage(from, `✅ *TEST TRANSACTION COMPLETE* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n\n👤 For: ${session.customerName}\n🔢 Meter: ${session.meterNumber}\n🔑 *Test Token:* ${testToken}\n💡 Units: $${session.amount.toFixed(2)} (+${session.previousUnits} previous = ${newUnits} total)\n📈 Service Fee: $${session.serviceFee}\n💰 Total Paid: $${session.total}\n📞 Reference: TEST-ZESA-${Date.now().toString().slice(-6)}\n💳 Paid via: ${selectedWallet}\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: TEST-ZESA-${Date.now().toString().slice(-6)}\nService: ZESA Tokens (Test Mode)\nMeter: ${session.meterNumber}\nBase Amount: $${session.amount.toFixed(2)}\nService Fee: $${session.serviceFee} (5%)\nTotal: $${session.total}\nWallet: ${selectedWallet}\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "hi" to start again.`);
    
    deleteSession(from);
}

// ==================== AIRTIME FLOW ====================

async function startAirtimeFlow(from) {
    const sessionId = updateSession(from, {
        flow: 'airtime_recipient_entry',
        service: 'airtime',
        testTransaction: true,
        retryCount: 0
    });
    
    await sendMessage(from, `📱 *TEST MODE - AIRTIME PURCHASE*\n\n⚠️ *THIS IS A TEST SIMULATION*\nNo real payments will be processed.\n\nPlease enter the phone number to receive airtime:\n\n*Format:* 0770123456 (10 digits, starts with 0)\n\nValid network prefixes:\n• 077, 078 = Econet\n• 071 = NetOne\n• 073 = Telecel\n\nOr type "hi" to go back to main menu.`);
}

async function handleAirtimeRecipientEntry(from, phoneNumber) {
    const session = getActiveSession(from);
    
    if (phoneNumber.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
        return;
    }
    
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const validation = validateAndDetectNetwork(cleanPhone);
    
    if (!validation.valid) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        if (session) {
            updateSession(from, {
                ...session,
                retryCount: retryCount,
                expiresAt: Date.now() + (10 * 60 * 1000)
            });
        }
        
        await sendMessage(from, `❌ *INVALID PHONE NUMBER*\n\n${validation.error}\n\nPlease enter a valid 10-digit number:\n• Starts with 0\n• Valid prefixes: 077, 078, 071, 073\n\nExample: 0770123456\n\nOr type "hi" to go back to main menu.`);
        return;
    }
    
    const sessionId = updateSession(from, {
        flow: 'airtime_amount_entry',
        service: 'airtime',
        testTransaction: true,
        recipientNumber: validation.original,
        formattedNumber: validation.formattedNumber,
        network: validation.network,
        retryCount: 0
    });
    
    await sendMessage(from, `✅ *NUMBER VERIFIED* ⚠️\n\n📱 Sending to: ${validation.formattedNumber}\n📶 Network: ${validation.network}\n\n💡 *THIS IS A TEST - NO REAL PAYMENT*\n\nHow much airtime would you like to buy?\n\n*Choose an option:*\n1. ZWL 5,000\n2. ZWL 10,000\n3. ZWL 20,000\n4. Other amount\n\n*Reply with the number (1-4) of your choice.*\n\nOr type "hi" to go back to main menu.`);
}

async function handleAirtimeAmountEntry(from, choice, session) {
    if (choice.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
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
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000)
        });
        
        await sendMessage(from, '❌ Invalid selection. Please choose a number from 1-4:\n\n1. ZWL 5,000\n2. ZWL 10,000\n3. ZWL 20,000\n4. Other amount\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    if (selectedAmount === 'other') {
        const sessionId = updateSession(from, {
            ...session,
            flow: 'airtime_custom_amount',
            waitingForCustomAmount: true
        });
        
        await sendMessage(from, '💵 Please enter your custom amount (minimum ZWL 100):\n\nExample: 15000 for ZWL 15,000\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    await processAirtimeAmount(from, selectedAmount, session);
}

async function processAirtimeAmount(from, amount, session) {
    if (typeof amount === 'string' && amount.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
        return;
    }
    
    const amountValue = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (isNaN(amountValue) || amountValue < 100) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000)
        });
        
        await sendMessage(from, '❌ Please enter a valid amount (minimum ZWL 100).\nExample: 15000 for ZWL 15,000\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const serviceFee = (amountValue * 0.08).toFixed(2);
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
    
    await sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n📱 To: ${session.formattedNumber}\n📶 Network: ${session.network}\n💵 Airtime Value: ZWL ${amountValue.toLocaleString()}\n📈 Service Fee (8%): ZWL ${serviceFee}\n💰 *Total to Pay: ZWL ${total}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n\nSelect a test wallet to pay with:\n\n1. EcoCash\n2. OneMoney\n3. Innbucks\n4. Mukuru\n5. Omari\n6. Telecash\n\n*Reply with the number (1-6) of your choice.*\n\nOr type "hi" to go back to main menu.`);
}

async function handleAirtimeWalletSelection(from, walletChoice, session) {
    if (walletChoice.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
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
    
    const selectedWallet = walletOptions[walletChoice];
    
    if (!selectedWallet) {
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000)
        });
        
        await sendMessage(from, '❌ Invalid selection. Please choose a number from 1-6:\n\n1. EcoCash\n2. OneMoney\n3. Innbucks\n4. Mukuru\n5. Omari\n6. Telecash\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const transactionId = `TEST-AIR-${Date.now().toString().slice(-8)}`;
    
    await sendMessage(from, `✅ *TEST AIRTIME SENT* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n\n📱 To: ${session.formattedNumber}\n💵 Face Value: ZWL ${session.amount.toLocaleString()}\n📈 Service Fee: ZWL ${session.serviceFee}\n📶 Network: ${session.network}\n📞 Reference: ${transactionId}\n💳 Paid via: ${selectedWallet}\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: ${transactionId}\nService: Airtime Top-up (Test Mode)\nRecipient: ${session.formattedNumber}\nNetwork: ${session.network}\nBase Amount: ZWL ${session.amount.toLocaleString()}\nService Fee: ZWL ${session.serviceFee} (8%)\nTotal: ZWL ${session.total}\nWallet: ${selectedWallet}\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "hi" to start again.`);
    
    deleteSession(from);
}

// ==================== WHATSAPP MESSAGING ====================

async function sendMessage(to, text) {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "text",
                text: { body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log('✅ Message sent');
    } catch (error) {
        console.error('❌ Error sending message:', error.response?.data || error.message);
    }
}

// ==================== SERVER START ====================

app.get('/', (req, res) => {
    res.send('CCHub WhatsApp Bot is running with Airtight PayCode Validation');
});

app.listen(PORT, () => {
    console.log(`🚀 CCHub WhatsApp Bot running on port ${PORT}`);
    console.log(`🔐 PayCode Validation: AIRTIGHT WITH CLEANING`);
    console.log(`🔒 Security Features:`);
    console.log(`   • Rate limiting: 3 attempts → 15 min lockout`);
    console.log(`   • Format validation: CCH123456 (case-sensitive)`);
    console.log(`   • Automatic cleaning of spaces/dashes/dots`);
    console.log(`   • Suspicious pattern detection`);
    console.log(`   • Single PayCode per message`);
    console.log(`🌐 WordPress API: ${process.env.WORDPRESS_API_URL || 'Not configured'}`);
    console.log(`🔑 Bot token: ${process.env.CCHUB_BOT_TOKEN ? 'Configured' : 'Missing!'}`);
    console.log(`🎯 Main menu: 1.ZESA, 2.Airtime, 3.Bill Payment (PayCode), 4.Help`);
    console.log(`💳 Bill payments: PayCode required from website`);
    console.log(`✅ Ready to receive messages!`);
});