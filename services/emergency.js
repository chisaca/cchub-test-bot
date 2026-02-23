// services/emergency.js - UPDATED with correct service type mapping

const axios = require('axios');
const { 
    getActiveSession, 
    deleteSession, 
    createSession, 
    updateSession, 
    incrementRetries 
} = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const { FLOW_STATES, EMERGENCY_CONFIG, RESPONSE_MESSAGES } = require('../config/constants');

// Cache for emergency services
const emergencyCache = new Map();
const CACHE_TTL = EMERGENCY_CONFIG.CACHE_TTL;

class EmergencyService {
    
    // Service type mapping based on database ENUM
    serviceTypeMap = {
        '1': 'zrp_police',           // Police
        '2': 'ambulance_medical',     // Ambulance
        '3': 'fire_brigade',          // Fire
        '4': 'vehicle_breakdown',      // Breakdown
        '5': 'child_services',         // Child Services
        '6': 'hospital_clinic',        // Hospital/Clinic
        '7': 'funeral_homes',          // Funeral Homes
        '8': 'attorneys_legal',        // Attorneys/Legal
        '9': 'immigration',            // Immigration
        '10': 'zetdc_electricity',      // Electricity
        '11': 'municipal_services'      // Municipal Services
    };

    // Display names for each service type
    serviceDisplayNames = {
        '1': 'Police',
        '2': 'Ambulance',
        '3': 'Fire Brigade',
        '4': 'Vehicle Breakdown',
        '5': 'Child Services',
        '6': 'Hospital/Clinic',
        '7': 'Funeral Homes',
        '8': 'Legal Services',
        '9': 'Immigration',
        '10': 'Electricity (ZETDC)',
        '11': 'Municipal Services'
    };

    // Emojis for each service type
    serviceEmojis = {
        '1': '👮',
        '2': '🚑',
        '3': '🚒',
        '4': '🔧',
        '5': '👶',
        '6': '🏥',
        '7': '⚰️',
        '8': '⚖️',
        '9': '🛂',
        '10': '⚡',
        '11': '🏛️'
    };
    
    /**
     * Start the emergency flow
     */
    async startFlow(userId) {
        console.log(`🚨 Starting emergency flow for ${userId}`);
        
        const session = createSession(userId, 'emergency');
        
        updateSession(userId, {
            state: FLOW_STATES.EMERGENCY.SELECT_SERVICE,
            data: {}
        });
        
        await this.sendServiceSelection(userId);
        
        return {
            session: true,
            message: null
        };
    }
    
    /**
     * Main request handler
     */
    async handleRequest(userId, message, session) {
        console.log(`🚨 Emergency request from ${userId} at state ${session.state}: "${message}"`);
        
        const normalizedMessage = message.trim().toLowerCase();
        if (normalizedMessage === 'hi') {
            console.log(`🔄 Universal reset triggered for ${userId}`);
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        let result = {
            session: true,
            message: null,
            returnToMain: false
        };
        
        switch(session.state) {
            case FLOW_STATES.EMERGENCY.SELECT_SERVICE:
                result = await this.handleServiceSelection(userId, message, session);
                break;
                
            case FLOW_STATES.EMERGENCY.SELECT_PROVINCE:
                result = await this.handleProvinceSelection(userId, message, session);
                break;
                
            case FLOW_STATES.EMERGENCY.SHOW_CONTACTS:
                result.message = "⏳ Please wait while I fetch emergency contacts...\n\n" +
                                 "Type *hi* to return to main menu.";
                break;
                
            default:
                console.error(`❌ Invalid state for ${userId}: ${session.state}`);
                deleteSession(userId);
                result.session = false;
                result.returnToMain = true;
        }
        
        return result;
    }
    
    /**
     * Step 1: Service Selection
     */
    async sendServiceSelection(userId) {
        let servicesText = '';
        for (let i = 1; i <= 11; i++) {
            const key = i.toString();
            servicesText += `${key}️⃣ ${this.serviceEmojis[key]} ${this.serviceDisplayNames[key]}\n`;
        }
        
        const message = `🚨 *Emergency Services*\n\n` +
            `Select emergency service:\n\n` +
            `${servicesText}\n` +
            `📝 Reply with number (1-11)\n\n` +
            `────────────────\n` +
            `Type *hi* to return to Main Menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleServiceSelection(userId, message, session) {
        const selection = message.trim();
        
        if (!this.serviceTypeMap[selection]) {
            const newRetryCount = (session.retries || 0) + 1;
            updateSession(userId, { retries: newRetryCount });
            
            if (newRetryCount >= 3) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return {
                    session: false,
                    returnToMain: true,
                    message: null
                };
            }
            
            const errorMessage = `❌ Invalid selection. Please choose 1-11.\n` +
                `────────────────\n` +
                `Attempts remaining: ${3 - newRetryCount}\n` +
                `Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, errorMessage);
            
            return {
                session: true,
                message: null
            };
        }
        
        const serviceTypeString = this.serviceTypeMap[selection];
        const serviceDisplayName = this.serviceDisplayNames[selection];
        const serviceEmoji = this.serviceEmojis[selection];
        
        updateSession(userId, {
            state: FLOW_STATES.EMERGENCY.SELECT_PROVINCE,
            data: {
                serviceKey: selection,
                serviceTypeString: serviceTypeString,
                serviceName: serviceDisplayName,
                serviceEmoji: serviceEmoji
            },
            retries: 0
        });
        
        await this.sendProvinceSelection(userId, serviceDisplayName, serviceEmoji);
        
        return {
            session: true,
            message: null
        };
    }
    
    /**
     * Step 2: Province Selection
     */
    async sendProvinceSelection(userId, serviceName, serviceEmoji) {
        try {
            const apiUrl = process.env.WORDPRESS_API_URL || 'https://cchub.co.zw';
            const provincesUrl = `${apiUrl}/wp-json/zim-emergency/v1/provinces`;
            
            console.log(`🌐 Fetching provinces from: ${provincesUrl}`);
            
            const response = await axios.get(provincesUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'CCHub-Emergency-Bot/1.0.0'
                }
            });
            
            const provinces = response.data.provinces || [];
            
            let provincesText = '';
            const provinceMap = {};
            
            provinces.forEach((province, index) => {
                const optionNumber = (index + 1).toString();
                provincesText += `${optionNumber}️⃣ ${province.name}\n`;
                provinceMap[optionNumber] = {
                    name: province.name
                };
            });
            
            const session = getActiveSession(userId);
            if (session) {
                updateSession(userId, {
                    data: {
                        ...session.data,
                        provinceMap: provinceMap
                    }
                });
            }
            
            const message = `${serviceEmoji} *${serviceName}*\n\n` +
                `Select your province:\n\n` +
                `${provincesText}\n` +
                `📝 Reply with number (1-${provinces.length})\n\n` +
                `────────────────\n` +
                `Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, message);
            
        } catch (error) {
            console.error('Error fetching provinces:', error.message);
            
            // Fallback to static provinces
            const staticProvinces = [
                'Harare', 'Bulawayo', 'Manicaland', 'Mashonaland Central',
                'Mashonaland East', 'Mashonaland West', 'Masvingo',
                'Matabeleland North', 'Matabeleland South', 'Midlands'
            ];
            
            let provincesText = '';
            const provinceMap = {};
            
            staticProvinces.forEach((province, index) => {
                const optionNumber = (index + 1).toString();
                provincesText += `${optionNumber}️⃣ ${province}\n`;
                provinceMap[optionNumber] = {
                    name: province
                };
            });
            
            const session = getActiveSession(userId);
            if (session) {
                updateSession(userId, {
                    data: {
                        ...session.data,
                        provinceMap: provinceMap
                    }
                });
            }
            
            const message = `${serviceEmoji} *${serviceName}*\n\n` +
                `Select your province:\n\n` +
                `${provincesText}\n` +
                `📝 Reply with number (1-10)\n\n` +
                `────────────────\n` +
                `Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, message);
        }
    }
    
    async handleProvinceSelection(userId, message, session) {
        const selection = message.trim();
        const provinceMap = session.data?.provinceMap || {};
        const selectedProvince = provinceMap[selection];
        
        if (!selectedProvince) {
            const newRetryCount = (session.retries || 0) + 1;
            updateSession(userId, { retries: newRetryCount });
            
            if (newRetryCount >= 3) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return {
                    session: false,
                    returnToMain: true,
                    message: null
                };
            }
            
            const errorMessage = `❌ Invalid selection. Please choose a valid province number.\n` +
                `────────────────\n` +
                `Attempts remaining: ${3 - newRetryCount}\n` +
                `Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, errorMessage);
            
            return {
                session: true,
                message: null
            };
        }
        
        const { serviceTypeString, serviceName, serviceEmoji } = session.data;
        
        updateSession(userId, {
            state: FLOW_STATES.EMERGENCY.SHOW_CONTACTS,
            data: {
                ...session.data,
                province: selectedProvince.name
            },
            retries: 0
        });
        
        await messaging.sendMessage(userId,
            `🔍 *Fetching ${serviceName} contacts in ${selectedProvince.name}...*\n\n` +
            `⏳ Please wait...`
        );
        
        await this.fetchEmergencyContacts(userId, {
            serviceTypeString,
            serviceName,
            serviceEmoji,
            province: selectedProvince.name
        });
        
        return {
            session: false,
            returnToMain: true,
            message: null
        };
    }
    
    /**
     * Fetch emergency contacts from the API
     */
    async fetchEmergencyContacts(userId, data) {
        const { serviceTypeString, serviceName, serviceEmoji, province } = data;
        
        try {
            const apiUrl = process.env.WORDPRESS_API_URL || 'https://cchub.co.zw';
            const contactsUrl = `${apiUrl}/wp-json/zim-emergency/v1/services/${encodeURIComponent(province)}/${serviceTypeString}`;
            
            console.log(`🌐 Fetching emergency contacts: ${contactsUrl}`);
            
            const response = await axios.get(contactsUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'CCHub-Emergency-Bot/1.0.0'
                }
            });
            
            if (response.data.success && response.data.services) {
                const message = this.formatApiResponse(response.data, serviceEmoji);
                await messaging.sendMessage(userId, message);
            } else {
                await messaging.sendMessage(userId,
                    `${serviceEmoji} *${serviceName} - ${province}*\n\n` +
                    `📭 *No contacts found*\n\n` +
                    `No ${serviceName.toLowerCase()} contacts are currently available for ${province}.\n\n` +
                    `📞 *National Emergency Numbers*\n` +
                    `• All Emergencies: 999\n` +
                    `• Police: 995\n` +
                    `• Ambulance: 994\n` +
                    `• Fire: 993\n\n` +
                    `────────────────\n` +
                    `Type *hi* for main menu`
                );
            }
            
        } catch (error) {
            console.error(`Error fetching contacts:`, error.message);
            
            // Fallback message
            await messaging.sendMessage(userId,
                `${serviceEmoji} *${serviceName} - ${province}*\n\n` +
                `⚠️ *Service Temporarily Unavailable*\n\n` +
                `We're having trouble fetching live contacts right now.\n\n` +
                `📞 *National Emergency Numbers*\n` +
                `• All Emergencies: 999\n` +
                `• Police: 995\n` +
                `• Ambulance: 994\n` +
                `• Fire: 993\n\n` +
                `────────────────\n` +
                `Please try again later or type *hi* for main menu`
            );
        }
        
        deleteSession(userId);
    }
    
    /**
     * Format API response for WhatsApp
     */
    formatApiResponse(apiData, serviceEmoji) {
        const { province, type, services } = apiData;
        
        let message = `${serviceEmoji} *${province} Emergency Contacts*\n\n`;
        
        services.forEach((service, index) => {
            message += `📍 *${service.service_name}*\n`;
            message += `📞 ${service.phone_number}`;
            
            if (service.phone_number2) {
                message += ` / ${service.phone_number2}`;
            }
            message += '\n';
            
            if (service.address) {
                message += `🏢 ${service.address}\n`;
            }
            
            if (service.description) {
                message += `📝 ${service.description}\n`;
            }
            
            message += '\n';
        });
        
        message += "────────────────\n";
        message += "🇿🇼 *CCHub Emergency Services*\n";
        message += "Type *hi* for main menu";
        
        return message;
    }
}

module.exports = new EmergencyService();
