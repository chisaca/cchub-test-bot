// services/emergency.js
const axios = require('axios');
const sessionHandler = require('../handlers/sessionHandler');
const messaging = require('../utils/messaging');
const { EMERGENCY_DISPLAY_NAMES, EMERGENCY_EMOJIS, PROVINCES, FLOW_STATES, EMERGENCY_CONFIG } = require('../config/constants');

const { updateSession, getActiveSession, deleteSession } = sessionHandler;

// Cache for emergency services
const emergencyCache = new Map();
const CACHE_TTL = EMERGENCY_CONFIG.CACHE_TTL;

// Get emergency service type from number selection
function getEmergencyServiceType(number) {
    const serviceMap = {
        '1': 'zrp_police',
        '2': 'ambulance_medical',
        '3': 'fire_brigade',
        '4': 'vehicle_breakdown',
        '5': 'hospital_clinic',
        '6': 'child_services',
        '7': 'funeral_homes',
        '8': 'attorneys_legal',
        '9': 'immigration',
        '10': 'zetdc_electricity',
        '11': 'municipal_services'
    };
    
    return serviceMap[number] || null;
}

// Fetch emergency services from WordPress API with caching - ORIGINAL VERSION
async function fetchEmergencyServices(province, serviceType) {
    const cacheKey = `${province}_${serviceType}`;
    const cached = emergencyCache.get(cacheKey);
    
    // Return cached data if valid
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`📦 Returning cached emergency data for ${province} - ${serviceType}`);
        return cached.data;
    }
    
    try {
        const apiUrl = process.env.WORDPRESS_API_URL;
        
        // Use province mapping for API calls (hyphenated format)
        const apiProvince = EMERGENCY_CONFIG.PROVINCE_MAPPINGS[province] || province.toLowerCase();
        
        const url = `${apiUrl}/wp-json/zim-emergency/v1/services/${apiProvince}/${serviceType}`;
        
        console.log(`🌐 Calling API: ${url}`);
        
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'CChub-Emergency-Bot/1.0.0'
            }
        });
        
        console.log(`✅ Successfully fetched data for ${province}`);
        
        // Cache successful response
        emergencyCache.set(cacheKey, {
            data: response.data,
            timestamp: Date.now()
        });
        
        return response.data;
    } catch (error) {
        console.error(`❌ Error fetching "${province}":`, error.message);
        
        // Return stale cache if available
        if (cached) {
            console.log(`⚠️ Using stale cached emergency data for ${province} - ${serviceType}`);
            cached.data.stale = true;
            cached.data.message = 'Note: Showing cached data. Some information may be outdated.';
            return cached.data;
        }
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        
        return {
            success: false,
            message: `Unable to fetch emergency services for ${province}. Please try another province.`
        };
    }
}

// Format emergency services for WhatsApp - ORIGINAL VERSION
function formatEmergencyResponse(data) {
    if (!data || !data.success || !data.services || data.services.length === 0) {
        return "🚫 *No emergency services found* for your request.\n\n" +
               "Please check the province and service type, or try another service.";
    }
    
    const province = data.province;
    const serviceType = data.service_type || data.services[0]?.service_type_name || 'Emergency Service';
    const emoji = EMERGENCY_EMOJIS[data.type] || '🚨';
    
    let message = `${emoji} *${serviceType} - ${province}*\n\n`;
    
    if (data.stale) {
        message += `⚠️ ${data.message || 'Note: Showing cached data'}\n\n`;
    }
    
    data.services.forEach((service, index) => {
        const serviceEmoji = service.service_emoji || emoji;
        message += `${serviceEmoji} *${service.service_name}*\n`;
        
        // Remove spaces from phone numbers
        let phone1 = service.phone_number ? service.phone_number.replace(/\s+/g, '') : '';
        message += `📞 ${phone1}`;
        
        if (service.phone_number2 && service.phone_number2.trim()) {
            let phone2 = service.phone_number2.replace(/\s+/g, '');
            message += ` / ${phone2}`;
        }
        
        if (service.address && service.address.trim()) {
            message += `\n📍 ${service.address}`;
        }
        
        if (service.description && service.description.trim()) {
            message += `\n📝 ${service.description}`;
        }
        
        if (service.verified) {
            message += `\n✅ Verified`;
        }
        
        message += "\n\n";
    });
    
    // Add national emergency numbers (no spaces)
    message += "📞 *National Emergency Numbers:*\n";
    message += "• All Emergencies: 999\n";
    message += "• Police: 995\n";
    message += "• Ambulance: 994\n";
    message += "• Fire: 993\n";
    message += "• Civil Protection: 112\n\n";
    
    message += "_🇿🇼 Zimbabwe Emergency Services via CChub_";
    
    return message;
}

// Track error attempts
function trackError(phone, context) {
    if (!global.errorAttempts) {
        global.errorAttempts = {};
    }
    if (!global.errorAttempts[phone]) {
        global.errorAttempts[phone] = {};
    }
    
    if (!global.errorAttempts[phone][context]) {
        global.errorAttempts[phone][context] = 1;
    } else {
        global.errorAttempts[phone][context]++;
    }
    
    return global.errorAttempts[phone][context];
}

// Emergency Services Flow
async function startEmergencyFlow(from) {
    const sessionId = updateSession(from, {
        flow: FLOW_STATES.EMERGENCY_SERVICE_SELECT,
        service: 'emergency_services',
        timestamp: Date.now()
    });
    
    await messaging.sendMessage(
        from,
        `🚨 *Emergency Services Directory*\n\n` +
        `*Select emergency service:*\n\n` +
        `1. 👮 Police (ZRP)\n` +
        `2. 🚑 Ambulance & Medical\n` +
        `3. 🚒 Fire Brigade\n` +
        `4. 🛠️ Vehicle Breakdown\n` +
        `5. 🏥 Hospital & Clinic\n` +
        `6. 👶 Child Services\n` +
        `7. ⚰️ Funeral Services\n` +
        `8. ⚖️ Legal Services\n` +
        `9. 🛂 Immigration Services\n` +
        `10. 💡 Electricity (ZETDC)\n` +
        `11. 🏛️ Municipal Services\n\n` +
        `*Reply with number (1-11)*`
    );
}

async function handleEmergencyServiceSelect(from, input, session) {
    const clean = input.trim();
    
    // Check if input is a valid number 1-11
    if (!clean.match(/^(1[0-1]|[1-9])$/)) {
        const errors = trackError(from, 'emergency_service');
        
        if (errors >= 3) {
            await messaging.sendMessage(
                from,
                `😕 *Please select a service number*\n\n` +
                `Available services:\n\n` +
                `1. 👮 Police (ZRP)\n` +
                `2. 🚑 Ambulance & Medical\n` +
                `3. 🚒 Fire Brigade\n` +
                `4. 🛠️ Vehicle Breakdown\n` +
                `5. 🏥 Hospital & Clinic\n` +
                `6. 👶 Child Services\n` +
                `7. ⚰️ Funeral Services\n` +
                `8. ⚖️ Legal Services\n` +
                `9. 🛂 Immigration Services\n` +
                `10. 💡 Electricity (ZETDC)\n` +
                `11. 🏛️ Municipal Services\n\n` +
                `*Try:* Reply with a number 1-11\n\n` +
                `Or type "hi" to start over.`
            );
            return;
        }
        
        await messaging.sendMessage(
            from,
            `❌ *Invalid selection*\n\n` +
            `Please choose a number from 1 to 11:\n\n` +
            `*Example:* 1 for Police, 2 for Ambulance\n\n` +
            `Or type "hi" for main menu.`
        );
        return;
    }
    
    const serviceType = getEmergencyServiceType(clean);
    
    // Success - proceed
    const sessionId = updateSession(from, {
        ...session,
        flow: FLOW_STATES.EMERGENCY_PROVINCE_SELECT,
        emergencyServiceType: serviceType,
        emergencyServiceName: EMERGENCY_DISPLAY_NAMES[serviceType] || serviceType,
        emergencyEmoji: EMERGENCY_EMOJIS[serviceType] || '🚨'
    });
    
    // Create numbered province options
    let provinceOptions = '';
    PROVINCES.forEach((province, index) => {
        const number = index + 1;
        provinceOptions += `${number}. ${province}\n`;
    });
    
    await messaging.sendMessage(
        from,
        `${EMERGENCY_EMOJIS[serviceType] || '🚨'} *${EMERGENCY_DISPLAY_NAMES[serviceType] || serviceType}* ✓\n\n` +
        `*Select your province:*\n\n` +
        `${provinceOptions}\n` +
        `*Reply with number (1-10):*\n` +
        `*Example:* 5 for Mashonaland East`
    );
}

async function handleEmergencyProvinceSelect(from, input, session) {
    const clean = input.trim();
    
    // Check if input is a valid number 1-10
    const provinceNumber = parseInt(clean);
    
    if (isNaN(provinceNumber) || provinceNumber < 1 || provinceNumber > 10) {
        const errors = trackError(from, 'emergency_province');
        
        if (errors >= 3) {
            await messaging.sendMessage(
                from,
                `😕 *Please select a province number*\n\n` +
                `Available provinces:\n\n` +
                PROVINCES.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n\n' +
                `*Try:* Reply with a number 1-10\n\n` +
                `Or type "hi" to start over.`
            );
            return;
        }
        
        await messaging.sendMessage(
            from,
            `❌ *Invalid province number*\n\n` +
            `Please select a province:\n\n` +
            PROVINCES.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n\n' +
            `*Reply with number (1-10):*\n` +
            `*Example:* 5 for Mashonaland East`
        );
        return;
    }
    
    // Success - get province name from number
    const province = PROVINCES[provinceNumber - 1];
    const sessionId = updateSession(from, {
        ...session,
        flow: FLOW_STATES.EMERGENCY_FETCHING,
        emergencyProvince: province
    });
    
    await messaging.sendMessage(
        from,
        `🔍 *Searching ${session.emergencyServiceName} in ${province}...*\n\n` +
        `Please wait a moment while I fetch the emergency numbers.`
    );
    
    // Fetch emergency services - USING ORIGINAL FUNCTION
    try {
        const emergencyData = await fetchEmergencyServices(province, session.emergencyServiceType);
        
        if (emergencyData.success) {
            const formattedResponse = formatEmergencyResponse(emergencyData);
            await messaging.sendMessage(from, formattedResponse);
        } else {
            await messaging.sendMessage(
                from,
                `❌ *Unable to fetch services*\n\n` +
                `Reason: ${emergencyData.message || 'No services found'}\n\n` +
                `Please try:\n` +
                `• Another province\n` +
                `• Another service type\n` +
                `• Or contact support\n\n` +
                `*National Emergency Numbers:*\n` +
                `• Police: 999\n` +
                `• Ambulance: 994\n` +
                `• Fire: 993`
            );
        }
    } catch (error) {
        console.error('Emergency fetch error:', error.message);
        await messaging.sendMessage(
            from,
            `⚠️ *Service temporarily unavailable*\n\n` +
            `Unable to fetch emergency services right now.\n\n` +
            `*National Emergency Numbers:*\n` +
            `• Police: 999 👮\n` +
            `• Ambulance: 994 🚑\n` +
            `• Fire: 993 🚒\n` +
            `• Civil Protection: 112\n\n` +
            `*Please try again in a few minutes.*`
        );
    }
    
    // Clean up session
    deleteSession(from);
    
    // Return to main menu after delay
    setTimeout(async () => {
        await messaging.sendMessage(
            from,
            `✨ *Need another emergency service?*\n\n` +
            `1. 🏫 Pay Bill\n` +
            `2. ⚡ Buy ZESA\n` +
            `3. 📱 Buy Airtime\n` +
            `4. 🚨 Emergency Services\n` +
            `5. ❓ Get Help\n\n` +
            `Or just say "hi" for the main menu.`
        );
    }, 3000);
}

module.exports = {
    startEmergencyFlow,
    handleEmergencyServiceSelect,
    handleEmergencyProvinceSelect,
    fetchEmergencyServices,
    formatEmergencyResponse
};