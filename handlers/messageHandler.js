// handlers/messageHandler.js - UPDATED to follow state-driven architecture

const { getActiveSession, deleteSession, saveSession } = require('./sessionHandlers');
const { handleMainMenu } = require('./mainMenuHandler');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');
const messaging = require('../utils/messaging');
const { userActivity } = require('./sessionHandlers'); // For lockout check

async function processMessage(userId, messageText) {
    console.log(`📱 Processing message from ${userId}: "${messageText}"`);
    
    // ==================== STEP 1: UNIVERSAL RESET CHECK ====================
    // ONLY "hi" works everywhere, not "menu"
    if (messageText.trim().toLowerCase() === 'hi') {
        console.log(`🔄 Resetting session for ${userId} via "hi" command`);
        deleteSession(userId);
        await sendWelcomeMessage(userId);
        return;
    }
    
    // ==================== STEP 2: LOCKOUT CHECK ====================
    const userState = userActivity[userId];
    if (userState && userState.lockoutUntil > Date.now()) {
        const remainingMinutes = Math.ceil((userState.lockoutUntil - Date.now()) / (60 * 1000));
        await messaging.sendMessage(userId, 
            `🔒 *ACCOUNT LOCKED*\n\nToo many invalid attempts.\n\n⏰ Time remaining: ${remainingMinutes} minute(s)\n\nType "hi" after lockout expires.`
        );
        return;
    }
    
    // ==================== STEP 3: GET USER'S CURRENT SESSION ====================
    const session = getActiveSession(userId);
    
    // ==================== STEP 4: NO SESSION = MAIN MENU LOGIC ====================
    if (!session) {
        await handleNoSession(userId, messageText.trim());
        return;
    }
    
    // ==================== STEP 5: HAS SESSION = ROUTE TO APPROPRIATE SERVICE ====================
    await routeToService(userId, messageText.trim(), session);
}

async function handleNoSession(userId, messageText) {
    // User has no active session = they're at main menu
    const cleanMessage = messageText.toLowerCase();
    
    // Strict validation: Only accept specific inputs at main menu
    const validInputs = [
        // Menu numbers
        '1', '2', '3', '4', '5',
        // Service keywords (exact or partial matches)
        'airtime', 'topup', 'zesa', 'electricity', 'bill', 'payment', 'emergency', 'help'
    ];
    
    // Check if input contains valid keywords
    const isValidInput = validInputs.some(input => 
        cleanMessage === input || (input.length > 2 && cleanMessage.includes(input))
    );
    
    if (!isValidInput) {
        // PayCode detection ONLY at main menu for direct entry
        const paycodeMatch = messageText.match(/CCH\d{6}/);
        if (paycodeMatch) {
            // User is trying to enter PayCode directly from main menu
            await billsService.handleDirectPayCodeEntry(userId, paycodeMatch[0]);
            return;
        }
        
        // Invalid input - show welcome message
        await sendWelcomeMessage(userId);
        return;
    }
    
    // Handle valid main menu input
    await handleMainMenu(userId, messageText);
}

async function routeToService(userId, messageText, session) {
    // User has an active session = route based on their current service
    // IMPORTANT: Each service handles its own step-by-step logic
    
    switch(session.service) {
        case 'airtime':
            await airtimeService.handleRequest(userId, messageText, session);
            break;
            
        case 'zesa':
            await zesaService.handleRequest(userId, messageText, session);
            break;
            
        case 'bill_payment':
            await billsService.handleRequest(userId, messageText, session);
            break;
            
        case 'emergency':
            await emergencyService.handleRequest(userId, messageText, session);
            break;
            
        default:
            // Unknown or corrupted service - reset to main menu
            console.error(`❌ Unknown service in session for ${userId}: ${session.service}`);
            deleteSession(userId);
            await sendWelcomeMessage(userId);
    }
}

async function sendWelcomeMessage(userId) {
    await messaging.sendMessage(userId,
        `🤖 *Welcome to CCHub WhatsApp Bot!*\n\n` +
        `Please select a service:\n\n` +
        `1️⃣ *Buy Airtime* - Top up your mobile\n` +
        `2️⃣ *Buy ZESA* - Electricity tokens\n` +
        `3️⃣ *Pay Bill* - Using PayCode\n` +
        `4️⃣ *Emergency Services* - Contacts\n` +
        `5️⃣ *Help* - Assistance\n\n` +
        `📝 *Reply with the number (1-5) or service name*\n` +
        `🔄 Type *"hi"* anytime to restart`
    );
}

// Helper function for main menu (moved to separate handler)
async function handleMainMenu(userId, messageText) {
    const cleanMessage = messageText.toLowerCase();
    
    if (cleanMessage === '1' || cleanMessage.includes('airtime')) {
        await airtimeService.startFlow(userId);
    } else if (cleanMessage === '2' || cleanMessage.includes('zesa') || cleanMessage.includes('electricity')) {
        await zesaService.startFlow(userId);
    } else if (cleanMessage === '3' || cleanMessage.includes('bill') || cleanMessage.includes('payment')) {
        await billsService.startFlow(userId);
    } else if (cleanMessage === '4' || cleanMessage.includes('emergency')) {
        await emergencyService.startFlow(userId);
    } else if (cleanMessage === '5' || cleanMessage.includes('help')) {
        await helpService.sendHelpMessage(userId);
    } else {
        // This shouldn't happen due to validation in handleNoSession, but as fallback
        await sendWelcomeMessage(userId);
    }
}

module.exports = { 
    processMessage, 
    handleNoSession, 
    routeToService,
    sendWelcomeMessage,
    handleMainMenu
};