// services/emergency.js
// ============================================================================
// EMERGENCY SERVICES
// Handles the complete emergency contacts lookup flow:
// 1. Service type selection (Police, Ambulance, Fire, etc.)
// 2. Province selection (dynamically fetched from WordPress)
// 3. Fetch and display emergency contacts from WordPress database
// 
// Uses WordPress REST API to fetch live emergency contact data
// Falls back to national emergency numbers if API is unavailable
// ============================================================================

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

// Cache for emergency services to reduce API calls
const emergencyCache = new Map();
const CACHE_TTL = EMERGENCY_CONFIG.CACHE_TTL;

class EmergencyService {
    
    // ============================================================================
    // SERVICE TYPE MAPPINGS
    // Maps user selections (1-11) to database ENUM values and display information
    // ============================================================================
    
    // Service type mapping based on database ENUM
    serviceTypeMap = {
        '1': 'zrp_police',           // Police (ZRP)
        '2': 'ambulance_medical',     // Ambulance & Medical
        '3': 'fire_brigade',          // Fire Brigade
        '4': 'vehicle_breakdown',      // Vehicle Breakdown
        '5': 'child_services',         // Child Services
        '6': 'hospital_clinic',        // Hospital/Clinic
        '7': 'funeral_homes',          // Funeral Homes
        '8': 'attorneys_legal',        // Attorneys/Legal
        '9': 'immigration',            // Immigration
        '10': 'zetdc_electricity',      // Electricity (ZETDC)
        '11': 'municipal_services'      // Municipal Services
    };

    // Display names for each service type (user-friendly)
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

    // Emojis for each service type (visual enhancement)
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
    
    // ============================================================================
    // FLOW INITIATION
    // ============================================================================
    
    /**
     * Start the emergency services flow
     * Creates session and sends service selection prompt
     * 
     * @param {string} userId - WhatsApp user ID
     * @returns {Promise<Object>} Result object for messageHandler
     */
    async startFlow(userId) {
        console.log(`🚨 [EMERGENCY] Starting flow for ${userId}`);
        
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
    
    // ============================================================================
    // MAIN REQUEST HANDLER
    // ============================================================================
    
    /**
     * Handle user input based on current flow state
     * Routes to appropriate handler method
     * 
     * @param {string} userId - WhatsApp user ID
     * @param {string} message - User's message
     * @param {Object} session - Current session
     * @returns {Promise<Object>} Result object for messageHandler
     */
    async handleRequest(userId, message, session) {
        console.log(`🚨 [EMERGENCY] Request from ${userId} at state ${session.state}: "${message}"`);
        
        const normalizedMessage = message.trim().toLowerCase();
        
        // Universal reset - always handled at messageHandler level
        if (normalizedMessage === 'hi') {
            console.log(`🔄 [EMERGENCY] Universal reset triggered for ${userId}`);
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
                console.error(`❌ [EMERGENCY] Invalid state for ${userId}: ${session.state}`);
                deleteSession(userId);
                result.session = false;
                result.returnToMain = true;
        }
        
        return result;
    }
    
    // ============================================================================
    // STEP 1: SERVICE SELECTION
    // ============================================================================
    
    /**
     * Send service selection menu with all 11 emergency service types
     */
    async sendServiceSelection(userId) {
        let servicesText = '';
        for (let i = 1; i <= 11; i++) {
            const key = i.toString();
            servicesText += `${key} ${this.serviceEmojis[key]} ${this.serviceDisplayNames[key]}\n`;
        }
        
        const message = `🚨 *Emergency Services*

Select emergency service:

${servicesText}

📝 Reply with number (1-11)

────────────────
Type *hi* to return to Main Menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
    /**
     * Handle user's service type selection
     * Validates selection and proceeds to province selection
     */
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
    
    // ============================================================================
    // STEP 2: PROVINCE SELECTION
    // ============================================================================
    
    /**
     * Send province selection menu
     * Attempts to fetch provinces from WordPress API, falls back to static list
     */
    async sendProvinceSelection(userId, serviceName, serviceEmoji) {
        try {
            const apiUrl = process.env.WORDPRESS_API_URL || 'https://cchub.co.zw';
            const provincesUrl = `${apiUrl}/wp-json/zim-emergency/v1/provinces`;
            
            console.log(`🌐 [EMERGENCY] Fetching provinces from: ${provincesUrl}`);
            
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
                provincesText += `${optionNumber} ${province.name}\n`;
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
            
            const message = `${serviceEmoji} *${serviceName}*

Select your province:

${provincesText}

📝 Reply with number (1-${provinces.length})

────────────────
Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, message);
            
        } catch (error) {
            console.error('❌ [EMERGENCY] Error fetching provinces:', error.message);
            
            // Fallback to static provinces list
            const staticProvinces = [
                'Harare', 'Bulawayo', 'Manicaland', 'Mashonaland Central',
                'Mashonaland East', 'Mashonaland West', 'Masvingo',
                'Matabeleland North', 'Matabeleland South', 'Midlands'
            ];
            
            let provincesText = '';
            const provinceMap = {};
            
            staticProvinces.forEach((province, index) => {
                const optionNumber = (index + 1).toString();
                provincesText += `${optionNumber} ${province}\n`;
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
            
            const message = `${serviceEmoji} *${serviceName}*

Select your province:

${provincesText}

📝 Reply with number (1-10)

────────────────
Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, message);
        }
    }
    
    /**
     * Handle user's province selection
     * Validates selection and proceeds to fetch contacts
     */
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
    
    // ============================================================================
    // STEP 3: FETCH AND DISPLAY CONTACTS
    // ============================================================================
    
    /**
     * Fetch emergency contacts from WordPress API
     * Displays formatted results or fallback message
     */
    async fetchEmergencyContacts(userId, data) {
        const { serviceTypeString, serviceName, serviceEmoji, province } = data;
        
        try {
            const apiUrl = process.env.WORDPRESS_API_URL || 'https://cchub.co.zw';
            const contactsUrl = `${apiUrl}/wp-json/zim-emergency/v1/services/${encodeURIComponent(province)}/${serviceTypeString}`;
            
            console.log(`🌐 [EMERGENCY] Fetching contacts: ${contactsUrl}`);
            
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
                    `${serviceEmoji} *${serviceName} - ${province}*

📭 *No contacts found*

No ${serviceName.toLowerCase()} contacts are currently available for ${province}.

📞 *National Emergency Numbers*
• All Emergencies: 999
• Police: 995
• Ambulance: 994
• Fire: 993

────────────────
Type *hi* for main menu`
                );
            }
            
        } catch (error) {
            console.error(`❌ [EMERGENCY] Error fetching contacts:`, error.message);
            
            // Fallback message with national emergency numbers
            await messaging.sendMessage(userId,
                `${serviceEmoji} *${serviceName} - ${province}*

⚠️ *Service Temporarily Unavailable*

We're having trouble fetching live contacts right now.

📞 *National Emergency Numbers*
• All Emergencies: 999
• Police: 995
• Ambulance: 994
• Fire: 993

────────────────
Please try again later or type *hi* for main menu`
            );
        }
        
        deleteSession(userId);
    }
    
    // ============================================================================
    // RESPONSE FORMATTING
    // ============================================================================
    
    /**
     * Format API response for WhatsApp display
     * 
     * @param {Object} apiData - Response from WordPress API
     * @param {string} serviceEmoji - Emoji for the service type
     * @returns {string} Formatted WhatsApp message
     */
    formatApiResponse(apiData, serviceEmoji) {
        const { province, type, services } = apiData;
        
        let message = `${serviceEmoji} *${province} Emergency Contacts*

`;
        
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
