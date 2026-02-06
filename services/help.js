// services/help.js
const messaging = require('../utils/messaging');

async function sendHelpMessage(from) {
    await messaging.sendMessage(
        from,
        `🆘 *CChub Help Center*\n\n` +
        `✨ *What can I help you with?*\n\n` +
        `🔢 *Menu Options:*\n` +
        `1. 🏫 Pay Bill – Use a PayCode from cchub.co.zw\n` +
        `2. ⚡ Buy ZESA – Electricity tokens (simulation)\n` +
        `3. 📱 Buy Airtime – Mobile top-up\n` +
        `4. 🚨 Emergency Services – Police, ambulance, fire, etc.\n` +
        `5. ❓ Help – This menu\n\n` +
        `💡 *Emergency Services:*\n` +
        `• Say "emergency" or type 4\n` +
        `• Choose service type (police, ambulance, fire, etc.)\n` +
        `• Select your province (use numbers 1-10)\n` +
        `• Get emergency numbers instantly\n\n` +
        `💡 *Quick Tips:*\n` +
        `• Say "airtime", "zesa", "bill", or "emergency"\n` +
        `• Send a PayCode directly anytime\n` +
        `• Format: CCH + 6 digits\n` +
        `• Get PayCodes from cchub.co.zw\n\n` +
        `❓ *Having trouble?*\n` +
        `• Type "hi" anytime to restart\n` +
        `• Wrong input? Try again or type "hi"\n` +
        `• Stuck? I'll offer help after 3 tries\n\n` +
        `🚨 *National Emergency Numbers:*\n` +
        `• Police: 999 👮\n` +
        `• Ambulance: 994 🚑\n` +
        `• Fire: 993 🚒\n` +
        `• Civil Protection: 112\n\n` +
        `📞 *Support:*\n` +
        `Call: +263 71 286 1483\n` +
        `Email: support@cchub.co.zw\n\n` +
        `💬 *To return to Main Menu, say:* hi or menu`
    );
}

module.exports = {
    sendHelpMessage
};