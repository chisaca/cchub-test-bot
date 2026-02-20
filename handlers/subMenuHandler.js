// handlers/subMenuHandler.js - ONLY menu definitions and selection mapping

const SUBMENUS = {
    BILLS: {
        name: 'Bills',
        options: {
            '1': {
                key: 'nyaradzo',
                name: 'Nyaradzo Funeral',
                emoji: '🌸',
                service: 'nyaradzo'  // Just returns service name
            },
            '2': {
                key: 'telone_voice',
                name: 'TelOne Voice',
                emoji: '📞',
                service: 'telone_voice'  // Just returns service name
            },
            '3': {
                key: 'telone_broadband',
                name: 'TelOne Broadband',
                emoji: '🌐',
                service: 'telone_broadband'  // Just returns service name
            },
            '4': {
                key: 'telone_lte',
                name: 'TelOne LTE',
                emoji: '📶',
                service: 'telone_lte'  // Just returns service name
            },
            '5': {
                key: 'telone_voip',
                name: 'TelOne VoIP',
                emoji: '📱',
                service: 'telone_voip'  // Just returns service name
            },
            '6': {
                key: 'telone_usd',
                name: 'TelOne USD Bundle',
                emoji: '💵',
                service: 'telone_usd'  // Just returns service name
            }
        },
        message: `📄 *Bills Payment*\n\nSelect biller:\n\n1️⃣ 🌸 Nyaradzo Funeral\n2️⃣ 📞 TelOne Voice (ZiG)\n3️⃣ 🌐 TelOne Broadband (ZiG)\n4️⃣ 📶 TelOne LTE (ZiG)\n5️⃣ 📱 TelOne VoIP (ZiG)\n6️⃣ 💵 TelOne USD Bundle (USD)\n\n────────────────\nReply with *1-6*\nType *0* to return to Main Menu`
    }
};

async function handleSubmenuSelection(userId, submenu, selection) {
    console.log(`📋 [SUBMENU] User: ${userId}, Submenu: ${submenu}, Selection: ${selection}`);
    
    const menu = SUBMENUS[submenu];
    if (!menu) {
        return { error: 'Invalid menu' };
    }
    
    // Handle return to main menu
    if (selection === '0') {
        return { exit: true };
    }
    
    // Get the selected option
    const option = menu.options[selection];
    if (!option) {
        return { 
            error: 'Invalid selection',
            validOptions: Object.keys(menu.options).join(', ')
        };
    }
    
    // Return ONLY the service name - NO service logic here!
    return {
        service: option.service,
        option: option
    };
}

async function sendSubmenu(userId, submenu) {
    const menu = SUBMENUS[submenu];
    if (menu) {
        const messaging = require('../utils/messaging');
        await messaging.sendMessage(userId, menu.message);
    }
}

module.exports = {
    handleSubmenuSelection,
    sendSubmenu,
    SUBMENUS
};
