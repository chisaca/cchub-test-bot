// handlers/messageHandler.js - SIMPLIFIED VERSION

async function processMessage(from, messageText) {
    console.log(`📱 Processing message from ${from}: "${messageText}"`);
    
    let session = getActiveSession(from);
    const cleanMessage = messageText.trim().toLowerCase();
    
    // ==================== UNIVERSAL COMMANDS ====================
    // Only "hi" and "menu" work everywhere
    if (cleanMessage.includes('hi') || cleanMessage.includes('menu')) {
        deleteSession(from);
        await messaging.sendWelcomeMessage(from);
        return;
    }
    
    // ==================== LOCKOUT CHECK ====================
    const userState = userActivity[from];
    if (userState && userState.lockoutUntil > Date.now()) {
        const remainingMinutes = Math.ceil((userState.lockoutUntil - Date.now()) / (60 * 1000));
        await messaging.sendMessage(from, `🔒 *ACCOUNT LOCKED*\n\nToo many invalid attempts.\n\n⏰ Time remaining: ${remainingMinutes} minute(s)\n\nType "hi" after lockout expires.`);
        return;
    }
    
    // ==================== NO SESSION - MAIN MENU ====================
    if (!session) {
        await handleNoSession(from, cleanMessage, messageText);
        return;
    }
    
    // ==================== HAS SESSION - ROUTE BY SERVICE ====================
    await handleWithSession(from, messageText, session, cleanMessage);
}

async function handleNoSession(from, cleanMessage, originalMessage) {
    // User has no active session = they're at main menu
    
    // 1. Check for direct menu numbers
    if (/^[1-5]$/.test(cleanMessage)) {
        await handleMainMenuSelection(from, cleanMessage);
        return;
    }
    
    // 2. Check for natural language to start flows
    if (cleanMessage.includes('airtime') || cleanMessage.includes('topup')) {
        await airtimeService.startAirtimeFlow(from);
        return;
    }
    
    if (cleanMessage.includes('zesa') || cleanMessage.includes('electricity')) {
        await zesaService.startZesaFlow(from);
        return;
    }
    
    if (cleanMessage.includes('emergency')) {
        await emergencyService.startEmergencyFlow(from);
        return;
    }
    
    if (cleanMessage.includes('help')) {
        await helpService.sendHelpMessage(from);
        return;
    }
    
    // 3. Check for PayCode (ONLY when no session = direct PayCode entry)
    if (/CCH/i.test(originalMessage)) {
        await paycodeHandler.handlePayCodeMessage(from, originalMessage);
        return;
    }
    
    // 4. Default: show welcome
    await messaging.sendWelcomeMessage(from);
}

async function handleWithSession(from, originalMessage, session, cleanMessage) {
    // User has an active session = route based on service
    
    switch(session.service) {
        case 'airtime':
            await airtimeService.handleAirtimeRequest(from, originalMessage);
            break;
            
        case 'zesa':
            await zesaService.handleZesaRequest(from, originalMessage, session);
            break;
            
        case 'bill_payment':
            await billsService.handleBillRequest(from, originalMessage, session);
            break;
            
        case 'emergency':
            await emergencyService.handleEmergencyRequest(from, originalMessage, session);
            break;
            
        default:
            // Unknown service - reset
            deleteSession(from);
            await messaging.sendWelcomeMessage(from);
    }
}

async function handleMainMenuSelection(from, choice) {
    const menuOptions = {
        '1': () => airtimeService.startAirtimeFlow(from),
        '2': () => zesaService.startZesaFlow(from),
        '3': () => billsService.startBillPaymentFlow(from),
        '4': () => emergencyService.startEmergencyFlow(from),
        '5': () => helpService.sendHelpMessage(from)
    };
    
    const handler = menuOptions[choice];
    if (handler) {
        await handler();
    } else {
        await messaging.sendMessage(from, '❌ Invalid selection. Please choose 1-5.');
    }
}

module.exports = { processMessage, handleMainMenuSelection };