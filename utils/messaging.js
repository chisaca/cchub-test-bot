// utils/messaging.js
const { RESPONSE_MESSAGES } = require('../config/constants');
const axios = require('axios');
const sessionHandler = require('../handlers/sessionHandler');

const { updateSession } = sessionHandler;

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

async function sendWelcomeMessage(from) {
    const sessionId = updateSession(from, { 
        flow: 'main_menu', 
        testTransaction: false,
        paycodeRequired: false
    });
    
    await sendMessage(from, RESPONSE_MESSAGES.WELCOME);
}

module.exports = {
    sendMessage,
    sendWelcomeMessage
};