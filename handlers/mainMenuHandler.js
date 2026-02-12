// handlers/mainMenuHandler.js

const messaging = require('../utils/messaging');
const airtimeService = require('../services/airtime');
const zesaService = require('../services/zesa');
const billsService = require('../services/bills');
const emergencyService = require('../services/emergency');
const helpService = require('../services/help');

async function handleMainMenu(userId, messageText) {
    const input = messageText.toLowerCase().trim();
    
    // Numeric menu
    if (input === '1') {
        await airtimeService.startFlow(userId);
    } else if (input === '2') {
        await zesaService.startFlow(userId);
    } else if (input === '3') {
        await billsService.startFlow(userId);
    } else if (input === '4') {
        await emergencyService.startFlow(userId);
    } else if (input === '5') {
        await helpService.sendHelpMessage(userId);
    }
    // Natural language
    else if (input.includes('airtime') || input.includes('top') || input.includes('bundle')) {
        await airtimeService.startFlow(userId);
    } else if (input.includes('zesa') || input.includes('electric') || input.includes('meter')) {
        await zesaService.startFlow(userId);
    } else if (input.includes('bill') || input.includes('paycode')) {
        await billsService.startFlow(userId);
    } else if (input.includes('emergency') || input.includes('police') || input.includes('ambulance')) {
        await emergencyService.startFlow(userId);
    } else if (input.includes('help')) {
        await helpService.sendHelpMessage(userId);
    } else {
        await messaging.sendWelcomeMessage(userId);
    }
}

module.exports = {
    handleMainMenu
};