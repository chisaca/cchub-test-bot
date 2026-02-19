// handlers/messageHandler.js - UPDATED with better session handling
// FIXED: Now properly handles session from service results
// REMOVED: All PayCode logic
// ADDED: TelOne service routing

const { getActiveSession, deleteSession } = require('./sessionHandlers');
const { handleMainMenu } = require('./mainMenuHandler');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const nyaradzoService = require('../services/nyaradzo');
const teloneService = require('../services/telone');  // ADDED
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
    console.log(`📱 Current session:`, session ? {
        service: session.service,
        state: session.state,
        flow: session.flow
    } : 'No session');
    
    // ==================== STEP 4: NO SESSION = MAIN MENU LOGIC ====================
    if (!session) {
        console.log(`📱 No active session for ${userId}, routing to main menu`);
        const result = await handleNoSession(userId, messageText.trim());
        
        // Send the message if there is one
        if (result && result.message) {
            console.log(`📱 Sending message from main menu result to ${userId}`);
            await messaging.sendMessage(userId, result.message);
        }
        
        // If the result contains a session, it's already been created by handleMainMenu
        if (result && result.session) {
            console.log(`📱 Session created/updated for ${userId}:`, {
                service: result.session.service,
                state: result.session.state
            });
        }
        
        return;
    }
    
    // ==================== STEP 5: HAS SESSION = ROUTE TO APPROPRIATE SERVICE ====================
    console.log(`📱 Routing to service: ${session.service} for ${userId}`);
    const result = await routeToService(userId, messageText.trim(), session);
    
    // Send the message if there is one
    if (result && result.message) {
        console.log(`📱 Sending message from service result to ${userId}`);
        await messaging.sendMessage(userId, result.message);
    } else {
        console.log(`📱 No message in service result for ${userId}`);
    }
    
    // Check if the session is still active
    const updatedSession = getActiveSession(userId);
    if (updatedSession) {
        console.log(`📱 Session still active for ${userId}:`, {
            service: updatedSession.service,
            state: updatedSession.state
        });
    } else {
        console.log(`📱 Session ended for ${userId}`);
    }
}

async function handleNoSession(userId, messageText) {
    console.log(`📱 [NO SESSION] User: ${userId}, Message: "${messageText}"`);
    
    const cleanMessage = messageText.toLowerCase();
    
    // Valid main menu inputs (NO PAYCODES)
    const validInputs = [
        '1', '2', '3', '4', '5',
        'airtime', 'topup', 'zesa', 'electricity', 'bill', 'bills', 'payment',
        'nyaradzo', 'funeral', 'telone', 'tel one', 'voice', 'bundle',
        'emergency', 'help', 'support'
    ];
    
    // Check if input contains valid keywords
    const isValidInput = validInputs.some(input => 
        cleanMessage === input || (input.length > 2 && cleanMessage.includes(input))
    );
    
    if (!isValidInput) {
        // Invalid input - show welcome message
        console.log(`📱 Invalid input, showing welcome message`);
        await messaging.sendWelcomeMessage(userId);
        return { message: null, session: null };
    }
    
    // Handle valid main menu input
    console.log(`📱 Valid main menu input: "${messageText}"`);
    const result = await handleMainMenu(userId, messageText);
    
    console.log(`📱 [NO SESSION] Main menu result:`, result ? {
        hasMessage: !!result?.message,
        hasSession: !!result?.session,
        sessionState: result?.session?.state
    } : 'No result');
    
    return result;
}

async function routeToService(userId, messageText, session) {
    console.log(`📱 [ROUTE] User: ${userId}, Service: ${session.service}, State: ${session.state}`);
    
    let result;
    
    try {
        switch(session.service) {
            case 'airtime':
                console.log(`📱 Routing to airtime service`);
                result = await airtimeService.handleRequest(userId, messageText, session);
                break;
                
            case 'zesa':
                console.log(`📱 Routing to zesa service`);
                result = await zesaService.handleRequest(userId, messageText, session);
                break;
                
            case 'bill_payment':
                console.log(`📱 Routing to bills service`);
                result = await billsService.handleRequest(userId, messageText, session);
                break;
                
            case 'nyaradzo':
                console.log(`📱 Routing to nyaradzo service`);
                result = await nyaradzoService.handleRequest(userId, messageText, session);
                break;
                
            case 'telone':
                console.log(`📱 Routing to telone service`);
                result = await teloneService.handleMessage(userId, messageText, session);
                break;
                
            case 'emergency':
                console.log(`📱 Routing to emergency service`);
                result = await emergencyService.handleRequest(userId, messageText, session);
                break;
                
            case 'help':
                console.log(`📱 Routing to help service`);
                result = await helpService.handleRequest(userId, messageText, session);
                break;
                
            default:
                console.error(`❌ Unknown service in session for ${userId}: ${session.service}`);
                deleteSession(userId);
                await messaging.sendWelcomeMessage(userId);
                return { message: null, session: null };
        }
    } catch (error) {
        console.error(`❌ Error in routeToService for ${userId}:`, error);
        deleteSession(userId);
        return { 
            message: `❌ An error occurred. Please type "hi" to restart.`,
            session: null 
        };
    }
    
    console.log(`📱 [ROUTE] Service result:`, result ? {
        hasMessage: !!result?.message,
        hasSession: !!result?.session,
        sessionState: result?.session?.state,
        messagePreview: result?.message ? result.message.substring(0, 50) + '...' : null
    } : 'No result');
    
    return result;
}

module.exports = { 
    processMessage
};
