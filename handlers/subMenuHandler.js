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
        },
        message: `📄 *Bills Payment*\n\nSelect biller:\n\n1🌸 Nyaradzo Funeral \n\n────────────────\nReply with *1-6*\nType *0* to return to Main Menu`
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
