// handlers/messageHandler.js - FULLY CORRECTED
// FIXED: Now captures and sends messages from service calls

const { getActiveSession, deleteSession } = require('./sessionHandlers');
const { handleMainMenu } = require('./mainMenuHandler');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');
const messaging = require('../utils/messaging');
const { userActivity } = require('./sessionHandlers');

async function processMessage(userId, messageText) {
    console.log(`📱 Processing message from ${userId}: "${messageText}"`);
    
    // ==================== STEP 1: UNIVERSAL RESET CHECK ====================
    if (messageText.trim().toLowerCase() === 'hi') {
        console.log(`🔄 Resetting session for ${userId} via "hi" command`);
        deleteSession(userId);
        await messaging.sendWelcomeMessage(userId);
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
        const result = await handleNoSession(userId, messageText.trim());
        // Send the message if there is one
        if (result && result.message) {
            await messaging.sendMessage(userId, result.message);
        }
        return;
    }
    
    // ==================== STEP 5: HAS SESSION = ROUTE TO APPROPRIATE SERVICE ====================
    const result = await routeToService(userId, messageText.trim(), session);
    // Send the message if there is one
    if (result && result.message) {
        await messaging.sendMessage(userId, result.message);
    }
}

async function handleNoSession(userId, messageText) {
    console.log(`📱 [NO SESSION] User: ${userId}, Message: "${messageText}"`);
    
    const cleanMessage = messageText.toLowerCase();
    
    // Strict validation: Only accept specific inputs at main menu
    const validInputs = [
        '1', '2', '3', '4', '5',
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
            return await billsService.handleDirectPayCodeEntry(userId, paycodeMatch[0]);
        }
        
        // Invalid input - show welcome message
        await messaging.sendWelcomeMessage(userId);
        return { message: null, session: null };
    }
    
    // Handle valid main menu input - GET THE RESULT
    const result = await handleMainMenu(userId, messageText);
    console.log(`📱 [NO SESSION] Main menu result:`, result ? {
        hasMessage: !!result?.message,
        hasSession: !!result?.session
    } : 'No result');
    
    return result;
}

async function routeToService(userId, messageText, session) {
    console.log(`📱 [ROUTE] User: ${userId}, Service: ${session.service}, State: ${session.state}`);
    
    let result;
    
    switch(session.service) {
        case 'airtime':
            result = await airtimeService.handleRequest(userId, messageText, session);
            break;
            
        case 'zesa':
            result = await zesaService.handleRequest(userId, messageText, session);
            break;
            
        case 'bill_payment':
            result = await billsService.handleRequest(userId, messageText, session);
            break;
            
        case 'emergency':
            result = await emergencyService.handleRequest(userId, messageText, session);
            break;
            
        default:
            console.error(`❌ Unknown service in session for ${userId}: ${session.service}`);
            deleteSession(userId);
            await messaging.sendWelcomeMessage(userId);
            return { message: null, session: null };
    }
    
    console.log(`📱 [ROUTE] Service result:`, result ? {
        hasMessage: !!result?.message,
        hasSession: !!result?.session,
        newState: result?.session?.state
    } : 'No result');
    
    return result;
}

module.exports = { 
    processMessage
};