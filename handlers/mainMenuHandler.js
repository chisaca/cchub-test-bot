// handlers/mainMenuHandler.js - NEW FILE for main menu logic

const messaging = require('../utils/messaging');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');

/**
 * Handle main menu selection
 * Called when user has no session and sends a valid main menu input
 */
async function handleMainMenu(userId, messageText) {
    const cleanMessage = messageText.toLowerCase().trim();
    
    // Check for numeric menu selections first
    if (cleanMessage === '1') {
        await airtimeService.startFlow(userId);
    } else if (cleanMessage === '2') {
        await zesaService.startFlow(userId);
    } else if (cleanMessage === '3') {
        await billsService.startFlow(userId);
    } else if (cleanMessage === '4') {
        await emergencyService.startFlow(userId);
    } else if (cleanMessage === '5') {
        await helpService.sendHelpMessage(userId);
    }
    // Check for natural language keywords
    else if (cleanMessage.includes('airtime') || cleanMessage.includes('topup')) {
        await airtimeService.startFlow(userId);
    } else if (cleanMessage.includes('zesa') || cleanMessage.includes('electric')) {
        await zesaService.startFlow(userId);
    } else if (cleanMessage.includes('bill') || cleanMessage.includes('pay')) {
        await billsService.startFlow(userId);
    } else if (cleanMessage.includes('emergency')) {
        await emergencyService.startFlow(userId);
    } else if (cleanMessage.includes('help')) {
        await helpService.sendHelpMessage(userId);
    } else {
        // Should not happen due to validation in messageHandler, but as fallback
        await messaging.sendWelcomeMessage(userId);
    }
}

module.exports = {
    handleMainMenu
};