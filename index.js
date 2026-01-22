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

// Helper function to create/update session - UPDATED VERSION
const updateSession = (whatsappNumber, data) => {
    // Clean up old sessions for this number
    Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].whatsappNumber === whatsappNumber) {
            // Keep ZESA/airtime sessions if different service
            if (data.service === 'bill_payment' && sessions[sessionId].service !== 'bill_payment') {
                return; // Don't delete ZESA/airtime sessions
            }
            delete sessions[sessionId];
        }
    });
    
    const sessionId = `session_${whatsappNumber}_${Date.now()}`;
    sessions[sessionId] = {
        ...data,
        whatsappNumber,
        createdAt: Date.now(),
        expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    };
    return sessionId;
};

// ==================== KEYWORD DETECTION HELPER ====================

function detectKeywords(message) {
    const cleanMessage = message.toLowerCase().trim();
    
    if (cleanMessage.includes('airtime')) {
        return 'airtime';
    } else if (cleanMessage.includes('zesa')) {
        return 'zesa';
    }
    
    return null;
}

// ==================== PAYCODE EXTRACTION HELPER ====================

function extractPayCode(message) {
    // Clean the message
    const cleanMessage = message.toLowerCase().trim();
    
    // EXCLUDE if it's just a plain number (might be amount)
    // Check if the message is ONLY a number
    if (/^\d+$/.test(cleanMessage)) {
        // Don't extract PayCode if it's just a plain number without context
        // PayCodes should have context or specific format
        return null;
    }
    
    // Look for 6-digit number that's not standalone (has context)
    const sixDigitRegex = /\b\d{6}\b/;
    const match = cleanMessage.match(sixDigitRegex);
    
    // Only return if the 6-digit is part of a longer message or has context
    if (match && cleanMessage.length > 6) {
        return match[0];
    }
    
    // Also check for paycode: prefix (always a PayCode)
    const prefixMatch = cleanMessage.match(/paycode[:\s]*(\d{6})/i);
    if (prefixMatch) {
        return prefixMatch[1];
    }
    
    // Check for cchub://pay/ format (always a PayCode)
    const deeplinkMatch = cleanMessage.match(/cchub[:\/\/]*pay[\/]*(\d{6})/i);
    if (deeplinkMatch) {
        return deeplinkMatch[1];
    }
    
    return null;
}
// ==================== PAYCODE HANDLING FUNCTIONS ====================

// Handle PayCode message from website
async function handlePayCodeMessage(from, paycode) {
    console.log(`🔐 Processing PayCode ${paycode} from ${from}`);
    
    try {
        // Call WordPress API to decode PayCode
        const response = await axios.get(
            `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/decode-paycode/${paycode}`
            // no headers needed endpoint is public
        );
        
        const data = response.data;
        
        if (data.status !== 'success') {
            await sendMessage(from, `❌ *INVALID PAYCODE*\n\nThis PayCode is invalid, expired, or has already been used.\n\nPlease get a new PayCode from our website:\nhttps://cchub.co.zw\n\nOr type "hi" to see other options.`);
            return;
        }
        
        // Map WordPress service types to your bot categories
        const serviceMapping = {
            'schools': 'school_fees',
            'city_council': 'city_council', 
            'insurance': 'insurance',
            'retail': 'retail_subscriptions'
        };
        
        const botCategory = serviceMapping[data.service_type];
        const emojiMapping = {
            'school_fees': '🏫',
            'city_council': '🏛️',
            'insurance': '🛡️',
            'retail_subscriptions': '🛒'
        };
        
        const emoji = emojiMapping[botCategory] || '💳';
        const categoryName = data.service_type.replace('_', ' ').toUpperCase();
        
        // Update session to skip to amount entry
        const sessionId = updateSession(from, {
            flow: 'bill_amount_entry',
            service: 'bill_payment',
            billCategory: botCategory,
            billCategoryName: categoryName,
            billEmoji: emoji,
            billerCode: data.biller_code,
            billerName: data.provider_name,
            paycode: paycode,
            paycodeVerified: true,
            testTransaction: false, // Real transaction
            skipBillerSearch: true // Skip manual entry steps
        });
        
        await sendMessage(from, `${emoji} *PAYCODE VERIFIED ✅*\n\n🔐 Secure PayCode: ${paycode}\n🏢 Biller: ${data.provider_name}\n📋 Service: ${categoryName}\n\n💰 *Ready to pay ${data.provider_name}*\n\nHow much would you like to pay?\n(Minimum: ZWL 50,000)\n\n*Enter amount in ZWL:*\nExample: 100000 for ZWL 100,000`);
        
    } catch (error) {
        console.error('Error decoding PayCode:', error);
        
        if (error.response?.status === 401) {
            await sendMessage(from, `🔒 *API AUTHENTICATION ERROR*\n\nPlease contact support. Technical issue with PayCode verification.\n\nYou can:\n1. Try again in a few minutes\n2. Get a new PayCode from our website\n3. Type "hi" for other options`);
        } else if (error.response?.status === 404) {
            await sendMessage(from, `❌ *PAYCODE NOT FOUND*\n\nThis PayCode doesn't exist or has expired.\n\nPlease get a new PayCode from our website:\nhttps://cchub.co.zw`);
        } else {
            await sendMessage(from, `⚠️ *TEMPORARY ERROR*\n\nUnable to verify PayCode at the moment.\n\nPlease:\n1. Try again in 2 minutes\n2. Get a new PayCode from website\n3. Type "hi" for manual bill payment`);
        }
    }
}

// Session cleanup function
function cleanupOldSessions() {
    const now = Date.now();
    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        
        // Clean up expired sessions
        if (session.expiresAt < now) {
            delete sessions[sessionId];
        }
        
        // Clean up PayCode sessions waiting too long (5 minutes)
        if (session.waitingForPaycode && session.createdAt < (now - 5 * 60 * 1000)) {
            console.log(`Cleaning up old PayCode session: ${sessionId}`);
            delete sessions[sessionId];
        }
    });
}

// Run cleanup every minute
setInterval(cleanupOldSessions, 60 * 1000);

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

// MOCK BILLER DATA - as per your specification
const MOCK_BILLERS = {
    // School Fees (0001-0003)
    '0001': { name: 'School A', type: 'school_fees', category: '🏫 School' },
    '0002': { name: 'School B', type: 'school_fees', category: '🏫 School' },
    '0003': { name: 'School C', type: 'school_fees', category: '🏫 School' },
    
    // City Council (0004-0006)
    '0004': { name: 'Council A', type: 'city_council', category: '🏛️ City Council' },
    '0005': { name: 'Council B', type: 'city_council', category: '🏛️ City Council' },
    '0006': { name: 'Council C', type: 'city_council', category: '🏛️ City Council' },
    
    // Insurance (0007-0009)
    '0007': { name: 'Insurance A', type: 'insurance', category: '🛡️ Insurance' },
    '0008': { name: 'Insurance B', type: 'insurance', category: '🛡️ Insurance' },
    '0009': { name: 'Insurance C', type: 'insurance', category: '🛡️ Insurance' },
    
    // Retail/Subscriptions (0010-0012)
    '0010': { name: 'Retail A', type: 'retail_subscriptions', category: '🛒 Retail/Subscriptions' },
    '0011': { name: 'Retail B', type: 'retail_subscriptions', category: '🛒 Retail/Subscriptions' },
    '0012': { name: 'Retail C', type: 'retail_subscriptions', category: '🛒 Retail/Subscriptions' }
};

// WEBSITE URLs for biller code search
const BILLER_SEARCH_URLS = {
    'school_fees': 'https://cchub.co.zw/pay-school-fees/',
    'city_council': 'https://cchub.co.zw/pay-city-council/',
    'insurance': 'https://cchub.co.zw/pay-insurance/',
    'retail_subscriptions': 'https://cchub.co.zw/pay-retail-subscriptions/'
};

// NETWORK IDENTIFICATION FUNCTION
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

// Webhook verification endpoint
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
    console.log('📨 Received webhook:', JSON.stringify(req.body, null, 2));
    
    try {
        const body = req.body;
        
        if (body.object === 'whatsapp_business_account') {
            if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
                const message = body.entry[0].changes[0].value.messages[0];
                const from = message.from;
                const messageText = message.text.body.trim();

                await processMessage(from, messageText);
            }
        }
        
        res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.sendStatus(500);
    }
});

// Update the processMessage function - FIXED with separate error handling
async function processMessage(from, messageText) {
    console.log(`📱 Processing message from ${from}: ${messageText}`);
    
    let session = getActiveSession(from);
    
    // Clean and normalize message
    const cleanMessage = messageText.trim().toLowerCase();
    
    // ===== STEP 1: Check for "airtime" or "zesa" keywords FIRST =====
    const detectedKeyword = detectKeywords(messageText);
    if (detectedKeyword) {
        console.log(`🎯 Detected keyword: ${detectedKeyword} from message: "${cleanMessage}"`);
        
        if (detectedKeyword === 'airtime') {
            await startAirtimeFlow(from);
            return;
        } else if (detectedKeyword === 'zesa') {
            await startZesaFlow(from);
            return;
        }
    }
    
    // ===== STEP 2: Handle numbered selections for active sessions =====
    if (session && /^\d+$/.test(cleanMessage)) {
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
    
    // ===== STEP 3: Check if we're in amount entry flows FIRST =====
    // This prevents 6-digit amounts from being mistaken as PayCodes
    if (session) {
        // Bill amount entry (check this BEFORE PayCode detection)
        if (session.flow === 'bill_amount_entry' && /^\d+$/.test(cleanMessage)) {
            await handleBillAmountEntry(from, cleanMessage, session);
            return;
        }
        
        // ZESA amount entry
        if (session.flow === 'zesa_amount_entry' && /^\d+$/.test(cleanMessage)) {
            await handleAmountEntry(from, cleanMessage, session);
            return;
        }
        
        // Airtime custom amount entry
        if (session.flow === 'airtime_custom_amount' && /^\d+$/.test(cleanMessage)) {
            await processAirtimeAmount(from, cleanMessage, session);
            return;
        }
        
        // Airtime amount selection (1-4)
        if (session.flow === 'airtime_amount_entry' && /^\d$/.test(cleanMessage)) {
            await handleAirtimeAmountEntry(from, cleanMessage, session);
            return;
        }
    }
    
    // ===== STEP 4: Now check for PayCodes =====
    // Only check for PayCodes if NOT in amount entry flows
    const paycode = extractPayCode(cleanMessage);
    if (paycode) {
        console.log(`🎯 Detected PayCode: ${paycode} from message: "${cleanMessage}"`);
        await handlePayCodeMessage(from, paycode);
        return;
    }
    
    // ===== STEP 5: Handle other flow-specific inputs =====
    if (session) {
        // Check for ZESA meter entry (10+ digits)
        if (session.flow === 'zesa_meter_entry' && /^\d+$/.test(cleanMessage) && cleanMessage.length >= 10) {
            await handleMeterEntry(from, cleanMessage);
            return;
        } 
        // Check for Airtime recipient entry (phone number validation)
        else if (session.flow === 'airtime_recipient_entry') {
            // This will handle both valid and invalid phone numbers
            await handleAirtimeRecipientEntry(from, cleanMessage);
            return;
        } else if (session.flow === 'bill_code_entry' && /^\d+$/.test(cleanMessage)) {
            // MODIFIED: Block manual code entry
            if (!session.paycodeVerified) {
                await sendMessage(from, `📋 *GET PAYCODE FROM WEBSITE*\n\nFor secure ${session.billCategoryName} payments:\n\n1. Go to: https://cchub.co.zw\n2. Search your ${session.billCategoryName.toLowerCase()}\n3. Click "Pay with WhatsApp"\n4. Send the 6-digit PayCode here\n\n🔒 PayCodes prevent errors and ensure security.`);
                return;
            }
            await handleBillCodeEntry(from, cleanMessage, session);
            return;
        } else if (session.flow === 'main_menu') {
            // Handle text-based menu navigation
            await sendMessage(from, 'Please type "hi" to see the main menu with numbered options.');
            return;
        }
        
        // If we have a session but the input doesn't match any flow-specific pattern
        // This is an INVALID INPUT for the current flow state
        await sendMessage(from, `❌ *Invalid input for current step*\n\nPlease provide a valid input for:\n• ${getCurrentStepInstructions(session.flow)}\n\nOr type "hi" to go back to main menu.`);
        return;
    }
    
    // ===== STEP 6: No active session - handle initial commands =====
    if (cleanMessage.includes('hi')) {
        await sendWelcomeMessage(from);
    } else if (cleanMessage.includes('bill') || cleanMessage.includes('pay')) {
        // MODIFIED: Start bill flow with PayCode requirement
        await sendMessage(from, `💳 *BILL PAYMENTS REQUIRE PAYCODE*\n\nFor all bill payments (School, Council, Insurance, Retail):\n\n1. Visit our website: https://cchub.co.zw\n2. Search and select your biller\n3. Get a 6-digit PayCode\n4. Return here and send the PayCode\n\nOr type "hi" for ZESA or Airtime options.`);
    } else if (/^\d{6}$/.test(cleanMessage)) {
        // 6-digit number with no session - could be PayCode
        // But we need to be careful - might be someone starting with a PayCode
        console.log(`🎯 6-digit number with no session: ${cleanMessage}`);
        await handlePayCodeMessage(from, cleanMessage);
    } else if (/^\d+$/.test(cleanMessage) && cleanMessage.length >= 10) {
        // Assume it's ZESA meter number (10+ digits) when no session exists
        const sessionId = updateSession(from, {
            flow: 'zesa_meter_entry',
            service: 'zesa',
            testTransaction: true
        });
        await handleMeterEntry(from, cleanMessage);
    } else {
        // Default response - UPDATED to mention keyword detection
        await sendMessage(from, `👋 Welcome to CCHub!\n\nTo pay bills:\n1. Get PayCode from https://cchub.co.zw\n2. Send PayCode here\n\nFor ZESA or Airtime, type:\n• "zesa" for ZESA tokens\n• "airtime" for airtime\n• "hi" for main menu\n\nOr you can use the main menu by typing "hi"`);
    }
}

// Add this helper function to provide step-specific instructions
function getCurrentStepInstructions(flow) {
    const instructions = {
        'zesa_meter_entry': 'ZESA meter number (10+ digits)',
        'zesa_amount_entry': 'ZESA amount in $ (minimum $1)',
        'zesa_wallet_selection': 'Wallet selection (1-5)',
        'airtime_recipient_entry': 'Phone number (10 digits, starts with 0)',
        'airtime_amount_entry': 'Airtime amount option (1-4)',
        'airtime_custom_amount': 'Custom amount in ZWL (minimum 100)',
        'airtime_wallet_selection': 'Wallet selection (1-6)',
        'bill_category_selection': 'Bill category (1-5)',
        'bill_code_search_option': 'PayCode option (1-3)',
        'bill_amount_entry': 'Bill amount in ZWL (minimum 50,000)',
        'bill_payment_confirmation': 'Payment confirmation (1-3)',
        'main_menu': 'Main menu option (1-4)',
        'waiting_for_paycode': '6-digit PayCode from website'
    };
    
    return instructions[flow] || 'valid input';
}

// Also update the welcome message function to mention keyword detection
async function sendWelcomeMessage(from) {
    const sessionId = updateSession(from, { 
        flow: 'main_menu', 
        testTransaction: false,
        paycodeRequired: false
    });
    
    await sendMessage(from, `👋 *WELCOME TO CCHUB PAYMENTS*\n\nWhat would you like to do today?\n\n1. ⚡ Buy ZESA (Direct entry)\n2. 📱 Buy Airtime (Direct entry)\n3. 💳 Pay Bill (*Requires PayCode*)\n4. ❓ Help / Information\n\n*Reply with the number (1-4) of your choice.*\n\n💡 *You can also type "zesa" or "airtime" at any time to start those flows directly!*`);
}

// Handle main menu selection
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

// ==================== BILL PAYMENT FLOW FUNCTIONS ====================
// Start Bill Payment flow - UPDATED VERSION
async function startBillPaymentFlow(from) {
    const sessionId = updateSession(from, {
        flow: 'bill_category_selection',
        service: 'bill_payment',
        testTransaction: false, // Real transaction
        paycodeRequired: true // Flag that PayCode is required
    });
    
    await sendMessage(from, `💳 *BILL PAYMENT*\n\n*All bill payments require a PayCode from our website.*\n\nWhat type of bill would you like to pay?\n\n1. 🏫 School Fees\n2. 🏛️ City Council\n3. 🛡️ Insurance\n4. 🛒 Retail/Subscriptions\n5. ← Back to Main Menu\n\n*Reply with the number (1-5) of your choice.*\n\n💡 *After selection, you'll get a website link to get your PayCode.*`);
}

// Handle bill category selection - UPDATED VERSION
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
    
    // Get website URL for this category
    const searchUrl = BILLER_SEARCH_URLS[selectedCategory.type];
    
    // Update session
    const sessionId = updateSession(from, {
        ...session,
        flow: 'bill_code_search_option',
        billCategory: selectedCategory.type,
        billCategoryName: selectedCategory.name,
        billEmoji: selectedCategory.emoji,
        websiteUrl: searchUrl
    });
    
    await sendMessage(from, `${selectedCategory.emoji} *${selectedCategory.name.toUpperCase()} PAYMENT*\n\nFor ${selectedCategory.name.toLowerCase()} payments:\n\n🔒 *SECURE PAYCODE REQUIRED*\n\n1. Visit: ${searchUrl}\n2. Search and select your ${selectedCategory.name.toLowerCase()}\n3. Get your 6-digit PayCode\n4. Return here and send the PayCode\n\n📋 *EXAMPLE PAYCODE:* 123456\n\nOr choose:\n1. ✅ I have a PayCode (send it now)\n2. 🔍 Get PayCode from website\n3. ← Choose different category\n\n*Reply with the number (1-3) of your choice.*`);
}

// Handle bill code search option - UPDATED VERSION
async function handleBillCodeSearchOption(from, choice, session) {
    if (choice === '1') {
        // User says they have PayCode
        await sendMessage(from, `${session.billEmoji} *SEND YOUR PAYCODE*\n\nPlease send your 6-digit PayCode:\n\n📋 *EXAMPLE:* 123456\n\n💡 *Got from:* ${session.websiteUrl}`);
        
        // Keep session active but no flow change - will be caught by PayCode handler
        const sessionId = updateSession(from, {
            ...session,
            flow: 'waiting_for_paycode',
            waitingForPaycode: true
        });
        
    } else if (choice === '2') {
        // User needs website
        await sendMessage(from, `${session.billEmoji} *GET PAYCODE FROM WEBSITE*\n\n1. Visit: ${session.websiteUrl}\n2. Search your ${session.billCategoryName.toLowerCase()}\n3. Click "Pay with WhatsApp"\n4. Get 6-digit PayCode\n5. Return here and send the PayCode\n\n📋 PayCode example: 123456\n\n🔒 *Why PayCodes?*\n• Prevents biller code errors\n• Ensures correct provider\n• Secure one-time use\n• 10-minute expiration`);
        
        // Keep session active
        const sessionId = updateSession(from, {
            ...session,
            flow: 'waiting_for_paycode',
            waitingForPaycode: true
        });
        
    } else if (choice === '3') {
        // Go back to category selection
        await startBillPaymentFlow(from);
    } else {
        await sendMessage(from, '❌ Invalid selection. Please choose 1, 2, or 3.');
    }
}

// Handle bill code entry
async function handleBillCodeEntry(from, billerCode, session) {
    // Format biller code to 4 digits with leading zeros
    const formattedCode = billerCode.padStart(4, '0');
    
    // Check if biller code exists
    const biller = MOCK_BILLERS[formattedCode];
    
    if (!biller) {
        await sendMessage(from, `❌ *BILLER CODE NOT FOUND*\n\nCode "${formattedCode}" is not valid.\n\nPlease use a valid 4-digit biller code.\n\nTest codes for ${session.billCategoryName}:\n${getTestCodesForCategory(session.billCategory)}\n\n💡 *Find biller codes at:* ${BILLER_SEARCH_URLS[session.billCategory]}`);
        return;
    }
    
    // Check if biller type matches selected category
    if (biller.type !== session.billCategory) {
        await sendMessage(from, `❌ *WRONG CATEGORY*\n\nCode "${formattedCode}" belongs to ${biller.category}, not ${session.billCategoryName}.\n\nPlease use a ${session.billCategoryName} biller code or choose the correct category.`);
        return;
    }
    
    // Update session with biller info
    const sessionId = updateSession(from, {
        ...session,
        flow: 'bill_amount_entry',
        billerCode: formattedCode,
        billerName: biller.name,
        billerCategory: biller.category
    });
    
    await sendMessage(from, `✅ *BILLER VERIFIED* ⚠️\n\n${session.billEmoji} ${session.billCategoryName}\n🏢 Biller: ${biller.name}\n🔢 Code: ${formattedCode}\n\n💡 *THIS IS A TEST - NO REAL PAYMENT*\n\nHow much would you like to pay?\n(Minimum: ZWL 50,000)\n\n*Enter amount in ZWL:*\nExample: 100000 for ZWL 100,000`);
}

// Handle bill amount entry
async function handleBillAmountEntry(from, amountText, session) {
    const amount = parseInt(amountText);
    
    if (isNaN(amount) || amount < 50000) {
        await sendMessage(from, 'Please enter a valid amount (minimum ZWL 50,000).\n\nExample: 100000 for ZWL 100,000');
        return;
    }
    
    // Calculate 4% service fee
    const serviceFee = Math.round(amount * 0.04);
    const total = amount + serviceFee;
    
    // Update session with amount details
    const sessionId = updateSession(from, {
        ...session,
        flow: 'bill_payment_confirmation',
        amount: amount,
        serviceFee: serviceFee,
        total: total
    });
    
    await sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n${session.billEmoji} ${session.billCategoryName}\n🏢 Biller: ${session.billerName}\n🔢 Biller Code: ${session.billerCode}\n\n💰 Bill Amount: ZWL ${amount.toLocaleString()}\n📈 Service Fee (4%): ZWL ${serviceFee.toLocaleString()}\n💰 *Total to Pay: ZWL ${total.toLocaleString()}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n💳 *ECO CASH ONLY FOR BILL PAYMENTS*\n\nIs this correct?\n\n1. ✅ Yes, pay with EcoCash\n2. ✏️ Change amount\n3. ← Start over\n\n*Reply with the number (1-3) of your choice.*`);
}

// Handle bill payment confirmation
async function handleBillPaymentConfirmation(from, choice, session) {
    if (choice === '1') {
        // Process payment
        const transactionId = `TEST-BILL-${Date.now().toString().slice(-8)}`;
        
        await sendMessage(from, `✅ *TEST PAYMENT COMPLETE* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n💳 *ECO CASH ONLY TRANSACTION*\n\n${session.billEmoji} ${session.billCategoryName}\n🏢 Biller: ${session.billerName}\n🔢 Code: ${session.billerCode}\n💰 Bill Amount: ZWL ${session.amount.toLocaleString()}\n📈 Service Fee: ZWL ${session.serviceFee.toLocaleString()}\n💰 Total Paid: ZWL ${session.total.toLocaleString()}\n📞 Reference: ${transactionId}\n💳 Paid via: EcoCash\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: ${transactionId}\nService: ${session.billCategoryName} (Test Mode)\nBiller: ${session.billerName}\nBiller Code: ${session.billerCode}\nBase Amount: ZWL ${session.amount.toLocaleString()}\nService Fee: ZWL ${session.serviceFee.toLocaleString()} (4%)\nTotal: ZWL ${session.total.toLocaleString()}\nWallet: EcoCash (Only)\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "hi" to start again.`);
        
        // Clear session
        deleteSession(from);
    } else if (choice === '2') {
        // Change amount
        const sessionId = updateSession(from, {
            ...session,
            flow: 'bill_amount_entry'
        });
        
        await sendMessage(from, `✏️ *CHANGE AMOUNT*\n\nPlease enter the new amount (minimum ZWL 50,000):\n\nExample: 150000 for ZWL 150,000`);
    } else if (choice === '3') {
        // Start over
        await startBillPaymentFlow(from);
    } else {
        await sendMessage(from, '❌ Invalid selection. Please choose 1, 2, or 3.');
    }
}

// Helper function to get test codes for category
function getTestCodesForCategory(category) {
    const categoryCodes = {
        'school_fees': ['0001', '0002', '0003'],
        'city_council': ['0004', '0005', '0006'],
        'insurance': ['0007', '0008', '0009'],
        'retail_subscriptions': ['0010', '0011', '0012']
    };
    
    return categoryCodes[category]?.map(code => `• ${code}`).join('\n') || '';
}

// ==================== ZESA FLOW FUNCTIONS ====================
async function startZesaFlow(from) {
    const sessionId = updateSession(from, {
        flow: 'zesa_meter_entry',
        service: 'zesa',
        testTransaction: true,
        retryCount: 0 // Add retry counter
    });
    
    await sendMessage(from, `🔌 *TEST MODE - ZESA TOKEN PURCHASE*\n\n⚠️ *THIS IS A TEST SIMULATION*\nNo real payments will be processed.\n\nPlease enter your test meter number:\n\nTest meter numbers you can use:\n• 12345678901\n• 11111111111\n• 22222222222\n\nType "hi" to go back to main menu.`);
}

async function handleMeterEntry(from, meterNumber) {
    const session = getActiveSession(from);
    
    // Check if user wants to go back to main menu
    if (meterNumber.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
        return;
    }
    
    if (!meterNumber || meterNumber.length < 10) {
        // Increment retry count
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            // Too many retries, go back to main menu
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        // Update session with retry count
        if (session) {
            updateSession(from, {
                ...session,
                retryCount: retryCount,
                expiresAt: Date.now() + (10 * 60 * 1000) // Extend session
            });
        }
        
        await sendMessage(from, '❌ Please enter a valid test meter number (at least 10 digits).\n\nTest numbers: 12345678901, 11111111111, 22222222222\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const meterData = TEST_METERS[meterNumber];
    
    if (!meterData) {
        // Invalid meter number - increment retry count
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            // Too many retries, go back to main menu
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        // Update session to stay in meter entry state
        if (session) {
            updateSession(from, {
                ...session,
                retryCount: retryCount,
                expiresAt: Date.now() + (10 * 60 * 1000) // Extend session
            });
        }
        
        await sendMessage(from, `❌ *TEST METER NOT FOUND*\n\nPlease use one of these test meter numbers:\n• 12345678901\n• 11111111111\n• 22222222222\n\nThis is a simulation only.\n\nOr type "hi" to go back to main menu.`);
        return;
    }
    
    // Reset retry count on success
    const sessionId = updateSession(from, {
        flow: 'zesa_amount_entry',
        service: 'zesa',
        testTransaction: true,
        meterNumber: meterNumber,
        customerName: meterData.customerName,
        area: meterData.area,
        previousUnits: meterData.previousUnits,
        retryCount: 0 // Reset retry count
    });
    
    await sendMessage(from, `✅ *TEST METER VERIFIED* ⚠️\n\n🔢 Meter: ${meterNumber}\n👤 Account: ${meterData.customerName}\n📍 Area: ${meterData.area}\n📊 Previous Units: ${meterData.previousUnits}\n\n💡 *THIS IS A TEST - NO REAL PAYMENT*\n\nHow much would you like to pay for token units?\n(Minimum: $1)\n\n*Enter amount:*\nExample: 10 for $10\n\nOr type "hi" to go back to main menu.`);
}

async function handleAmountEntry(from, amountText, session) {
    // Check if user wants to go back to main menu
    if (amountText.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
        return;
    }
    
    const amount = parseFloat(amountText);
    
    if (isNaN(amount) || amount < 1) {
        // Increment retry count
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            // Too many retries, go back to main menu
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        // Update session with retry count
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000) // Extend session
        });
        
        await sendMessage(from, '❌ Please enter a valid amount (minimum $1).\nExample: 10\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const serviceFee = (amount * 0.05).toFixed(2);
    const total = (amount + parseFloat(serviceFee)).toFixed(2);
    
    // Reset retry count on success
    const sessionId = updateSession(from, {
        ...session,
        flow: 'zesa_wallet_selection',
        amount: amount,
        serviceFee: serviceFee,
        total: total,
        retryCount: 0 // Reset retry count
    });
    
    await sendMessage(from, `📋 *TEST PAYMENT SUMMARY* ⚠️\n\n👤 For: ${session.customerName}\n🔢 Meter: ${session.meterNumber}\n\n💡 Token Units: $${amount.toFixed(2)}\n📈 Service Fee (5%): $${serviceFee}\n💰 *Total to Pay: $${total}*\n\n💸 *TEST MODE - NO REAL PAYMENT*\n\nSelect a test wallet:\n\n1. EcoCash USD\n2. OneMoney USD\n3. Innbucks USD\n4. Mukuru\n5. Omari\n\n*Reply with the number (1-5) of your choice.*\n\nOr type "hi" to go back to main menu.`);
}

async function handleWalletSelection(from, walletChoice, session) {
    // Check if user wants to go back
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
        // Increment retry count
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            // Too many retries, go back to main menu
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        // Update session with retry count
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000) // Extend session
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

// ==================== AIRTIME FLOW FUNCTIONS ====================
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
    
    // Check if user wants to go back
    if (phoneNumber.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
        return;
    }
    
    // First clean the phone number (remove any spaces or non-digits)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    const validation = validateAndDetectNetwork(cleanPhone);
    
    if (!validation.valid) {
        // Increment retry count
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            // Too many retries, go back to main menu
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        // Update session with retry count
        if (session) {
            updateSession(from, {
                ...session,
                retryCount: retryCount,
                expiresAt: Date.now() + (10 * 60 * 1000) // Extend session
            });
        }
        
        await sendMessage(from, `❌ *INVALID PHONE NUMBER*\n\n${validation.error}\n\nPlease enter a valid 10-digit number:\n• Starts with 0\n• Valid prefixes: 077, 078, 071, 073\n\nExample: 0770123456\n\nOr type "hi" to go back to main menu.`);
        return;
    }
    
    // Reset retry count on success
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
    // Check if user wants to go back
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
        // Increment retry count
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            // Too many retries, go back to main menu
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        // Update session with retry count
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000) // Extend session
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
    // Check if user wants to go back
    if (typeof amount === 'string' && amount.toLowerCase().includes('hi')) {
        await sendWelcomeMessage(from);
        return;
    }
    
    const amountValue = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (isNaN(amountValue) || amountValue < 100) {
        // Increment retry count
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            // Too many retries, go back to main menu
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        // Update session with retry count
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000) // Extend session
        });
        
        await sendMessage(from, '❌ Please enter a valid amount (minimum ZWL 100).\nExample: 15000 for ZWL 15,000\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const serviceFee = (amountValue * 0.08).toFixed(2);
    const total = (amountValue + parseFloat(serviceFee)).toFixed(2);
    
    // Reset retry count on success
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
    // Check if user wants to go back
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
        // Increment retry count
        const retryCount = (session?.retryCount || 0) + 1;
        if (retryCount >= 3) {
            // Too many retries, go back to main menu
            await sendMessage(from, '❌ Too many invalid attempts. Going back to main menu.');
            await sendWelcomeMessage(from);
            return;
        }
        
        // Update session with retry count
        const sessionId = updateSession(from, {
            ...session,
            retryCount: retryCount,
            expiresAt: Date.now() + (10 * 60 * 1000) // Extend session
        });
        
        await sendMessage(from, '❌ Invalid selection. Please choose a number from 1-6:\n\n1. EcoCash\n2. OneMoney\n3. Innbucks\n4. Mukuru\n5. Omari\n6. Telecash\n\nOr type "hi" to go back to main menu.');
        return;
    }
    
    const transactionId = `TEST-AIR-${Date.now().toString().slice(-8)}`;
    
    await sendMessage(from, `✅ *TEST AIRTIME SENT* ⚠️\n\n💸 *SIMULATION ONLY - NO REAL PAYMENT MADE*\n\n📱 To: ${session.formattedNumber}\n💵 Face Value: ZWL ${session.amount.toLocaleString()}\n📈 Service Fee: ZWL ${session.serviceFee}\n📶 Network: ${session.network}\n📞 Reference: ${transactionId}\n💳 Paid via: ${selectedWallet}\n\n📄 *TEST RECEIPT*\n────────────────────\nDate: ${new Date().toLocaleString()}\nReference: ${transactionId}\nService: Airtime Top-up (Test Mode)\nRecipient: ${session.formattedNumber}\nNetwork: ${session.network}\nBase Amount: ZWL ${session.amount.toLocaleString()}\nService Fee: ZWL ${session.serviceFee} (8%)\nTotal: ZWL ${session.total}\nWallet: ${selectedWallet}\nStatus: ✅ Test Completed\n────────────────────\n\nThank you for testing CCHub!\n\nType "hi" to start again.`);
    
    deleteSession(from);
}

// Helper function to send WhatsApp message
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
        console.log('✅ Message sent:', response.data);
    } catch (error) {
        console.error('❌ Error sending message:', error.response?.data || error.message);
    }
}

// Session management helpers
function getActiveSession(whatsappNumber) {
    const now = Date.now();
    
    // First clean up all expired sessions
    Object.keys(sessions).forEach(sessionId => {
        const session = sessions[sessionId];
        if (session.expiresAt < now) {
            console.log(`Cleaning expired session: ${sessionId}`);
            delete sessions[sessionId];
        }
    });
    
    // Now find active sessions for this number
    const activeSessions = Object.values(sessions).filter(session => 
        session.whatsappNumber === whatsappNumber && session.expiresAt > now
    );
    
    // Return the most recent session
    return activeSessions.sort((a, b) => b.createdAt - a.createdAt)[0];
}

function deleteSession(whatsappNumber) {
    Object.keys(sessions).forEach(sessionId => {
        if (sessions[sessionId].whatsappNumber === whatsappNumber) {
            delete sessions[sessionId];
        }
    });
}

// Health check endpoint
app.get('/', (req, res) => {
    res.send('CCHub WhatsApp Test Bot is running in TEST MODE');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 CCHub WhatsApp Bot running on port ${PORT}`);
    console.log(`🔐 PayCode system: ENABLED`);
    console.log(`🌐 WordPress API: ${process.env.WORDPRESS_API_URL || 'Not configured'}`);
    console.log(`🔑 Bot token: ${process.env.CCHUB_BOT_TOKEN ? 'Configured' : 'Missing!'}`);
    console.log(`📱 Test meter numbers: ${Object.keys(TEST_METERS).join(', ')}`);
    console.log(`🏢 Mock biller codes: 0001-0012 (12 billers - for testing only)`);
    console.log(`🌐 Biller search URLs configured`);
    console.log(`🎯 Main menu: 1.ZESA, 2.Airtime, 3.Bill Payment (*PayCode*), 4.Help`);
    console.log(`💳 Bill payments: PayCode required from website`);
    console.log(`🔒 PayCode verification: ACTIVE`);
    console.log(`🔄 Invalid input handling: ENABLED with retry counter`);
});