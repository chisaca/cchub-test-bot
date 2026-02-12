// handlers/mainMenuHandler.js - FIXED VERSION (Enable ZiG now)

const messaging = require('../utils/messaging');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');

/**
 * Handle main menu selection
 */
async function handleMainMenu(userId, messageText) {
    const cleanMessage = messageText.toLowerCase().trim();
    
    // Check for numeric menu selections first
    if (cleanMessage === '1') {
        await airtimeService.startFlow(userId);
    } else if (cleanMessage === '2') {
        // ✅ FIXED: ZiG AND USD both available immediately
        await zesaService.startFlow(userId);
    } else if (cleanMessage === '3') {
        await billsService.startFlow(userId);
    } else if (cleanMessage === '4') {
        await emergencyService.startFlow(userId);
    } else if (cleanMessage === '5') {
        await helpService.sendHelpMessage(userId);
    }
    // Natural language
    else if (cleanMessage.includes('airtime') || cleanMessage.includes('topup')) {
        await airtimeService.startFlow(userId);
    } else if (cleanMessage.includes('zesa') || cleanMessage.includes('electric')) {
        // ✅ FIXED: No restriction message
        await zesaService.startFlow(userId);
    } else if (cleanMessage.includes('bill') || cleanMessage.includes('pay')) {
        await billsService.startFlow(userId);
    } else if (cleanMessage.includes('emergency')) {
        await emergencyService.startFlow(userId);
    } else if (cleanMessage.includes('help')) {
        await helpService.sendHelpMessage(userId);
    } else {
        await messaging.sendWelcomeMessage(userId);
    }
}

module.exports = {
    handleMainMenu
};