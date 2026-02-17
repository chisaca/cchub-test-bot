// handlers/mainMenuHandler.js

const messaging = require('../utils/messaging');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');

async function handleMainMenu(userId, messageText) {
    console.log(`📋 [MAIN MENU] User: ${userId}, Input: "${messageText}"`);
    
    const input = messageText.toLowerCase().trim();
    let result;
    
    // Numeric menu
    if (input === '1') {
        console.log(`📋 [MAIN MENU] Redirecting to AIRTIME flow`);
        result = await airtimeService.startFlow(userId);
    } else if (input === '2') {
        console.log(`📋 [MAIN MENU] Redirecting to ZESA flow`);
        
        // Debug: Check if startFlow exists
        if (typeof zesaService.startFlow !== 'function') {
            console.error(`❌ [MAIN MENU] CRITICAL: zesaService.startFlow is not a function!`);
            console.error(`❌ [MAIN MENU] Available methods:`, Object.keys(zesaService));
            return {
                message: "⚠️ System error. Please try again later.",
                session: null
            };
        }
        
        result = await zesaService.startFlow(userId);
    } else if (input === '3') {
        console.log(`📋 [MAIN MENU] Redirecting to BILLS flow`);
        result = await billsService.startFlow(userId);
    } else if (input === '4') {
        console.log(`📋 [MAIN MENU] Redirecting to EMERGENCY flow`);
        result = await emergencyService.startFlow(userId);
    } else if (input === '5') {
        console.log(`📋 [MAIN MENU] Sending HELP message`);
        result = await helpService.sendHelpMessage(userId);
    }
    // Natural language
    else if (input.includes('airtime') || input.includes('top') || input.includes('bundle')) {
        console.log(`📋 [MAIN MENU] Natural language: AIRTIME`);
        result = await airtimeService.startFlow(userId);
    } else if (input.includes('zesa') || input.includes('electric') || input.includes('meter')) {
        console.log(`📋 [MAIN MENU] Natural language: ZESA`);
        result = await zesaService.startFlow(userId);
    } else if (input.includes('bill') || input.includes('paycode')) {
        console.log(`📋 [MAIN MENU] Natural language: BILLS`);
        result = await billsService.startFlow(userId);
    } else if (input.includes('emergency') || input.includes('police') || input.includes('ambulance')) {
        console.log(`📋 [MAIN MENU] Natural language: EMERGENCY`);
        result = await emergencyService.startFlow(userId);
    } else if (input.includes('help')) {
        console.log(`📋 [MAIN MENU] Natural language: HELP`);
        result = await helpService.sendHelpMessage(userId);
    } else {
        console.log(`📋 [MAIN MENU] No match, sending welcome message`);
        result = await messaging.sendWelcomeMessage(userId);
    }
    
    console.log(`📋 [MAIN MENU] Result:`, result ? {
        hasMessage: !!result.message,
        hasSession: !!result.session,
        state: result.session?.state
    } : 'No result');
    
    return result;
}

module.exports = {
    handleMainMenu
};