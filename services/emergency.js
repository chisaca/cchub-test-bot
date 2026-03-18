// services/emergency.js - UPDATED with navigation buttons
// ============================================================================
// EMERGENCY SERVICES
// Handles the complete emergency contacts lookup flow:
// 1. Service type selection (Police, Ambulance, Fire, etc.)
// 2. Province selection (dynamically fetched from WordPress)
// 3. Fetch and display emergency contacts from WordPress database
// 
// NOW WITH: Navigation buttons at each step
// - Service selection: "🏠 Main Menu" button only
// - Province selection: "🔙 Emergency Services" and "🏠 Main Menu" buttons
// - Contacts display: "🔙 Province" (NEW), "🔙 Emergency Services", "🏠 Main Menu" buttons
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
     * Creates session and sends service selection prompt with Main Menu button
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
        
        // Handle button responses
        if (normalizedMessage === 'hi' || normalizedMessage === 'main_menu') {
            console.log(`🔄 [EMERGENCY] Returning to main menu for ${userId}`);
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        // Handle back to emergency services
        if (normalizedMessage === 'back_to_services') {
            console.log(`🔄 [EMERGENCY] Returning to service selection for ${userId}`);
            updateSession(userId, {
                state: FLOW_STATES.EMERGENCY.SELECT_SERVICE,
                data: {},
                retries: 0
            });
            await this.sendServiceSelection(userId);
            return {
                session: true,
                message: null
            };
        }
        
        // Handle back to province selection
        if (normalizedMessage === 'back_to_province' && session.data?.serviceKey) {
            console.log(`🔄 [EMERGENCY] Returning to province selection for ${userId}`);
            updateSession(userId, {
                state: FLOW_STATES.EMERGENCY.SELECT_PROVINCE,
                data: session.data,
                retries: 0
            });
            await this.sendProvinceSelection(userId, session.data.serviceName, session.data.serviceEmoji);
            return {
                session: true,
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
     * NOW WITH: Main Menu button only
     */
    async sendServiceSelection(userId) {
        let servicesText = '';
        for (let i = 1; i <= 11; i++) {
            const key = i.toString();
            servicesText += `${key} ${this.serviceEmojis[key]} ${this.serviceDisplayNames[key]}\n`;
        }
        
        const message = `🚨 *Emergency Services*

Select emergency service by replying with a number (1-11):

${servicesText}

────────────────`;

        await messaging.sendButtonMessage(
            userId,
            message,
            [
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
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
                `Attempts remaining: ${3 - newRetryCount}`;
            
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
     * NOW WITH: Emergency Services and Main Menu buttons
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

Select your province by replying with a number (1-${provinces.length}):

${provincesText}

────────────────`;

            await messaging.sendButtonMessage(
                userId,
                message,
                [
                    { id: "back_to_services", title: "🔙 Emergency Services" },
                    { id: "hi", title: "🏠 Main Menu" }
                ]
            );
            
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

Select your province by replying with a number (1-10):

${provincesText}

────────────────`;

            await messaging.sendButtonMessage(
                userId,
                message,
                [
                    { id: "back_to_services", title: "🔙 Emergency Services" },
                    { id: "hi", title: "🏠 Main Menu" }
                ]
            );
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
                `Attempts remaining: ${3 - newRetryCount}`;
            
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
            serviceKey: session.data.serviceKey,
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
 * NOW WITH: Province, Emergency Services, and Main Menu buttons
 * FIXED: Don't delete session and clear pending timers
 */
async function fetchEmergencyContacts(userId, data) {
    const { serviceKey, serviceTypeString, serviceName, serviceEmoji, province } = data;
    
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
        
        // Clear any pending welcome timer that might auto-return to menu
        const { clearPendingWelcome } = require('../handlers/messageHandler');
        if (typeof clearPendingWelcome === 'function') {
            clearPendingWelcome(userId);
        }
        
        if (response.data.success && response.data.services) {
            const message = this.formatApiResponse(response.data, serviceEmoji);
            
            // Send contacts with navigation buttons
            await messaging.sendButtonMessage(
                userId,
                message,
                [
                    { id: "back_to_province", title: "🔙 Province" },
                    { id: "back_to_services", title: "🔙 Emergency Services" },
                    { id: "hi", title: "🏠 Main Menu" }
                ]
            );
        } else {
            // No contacts found - show national numbers with buttons
            const message = `${serviceEmoji} *${serviceName} - ${province}*

📭 *No contacts found*

No ${serviceName.toLowerCase()} contacts are currently available for ${province}.

📞 *National Emergency Numbers*
• All Emergencies: 999
• Police: 995
• Ambulance: 994
• Fire: 993

────────────────`;

            await messaging.sendButtonMessage(
                userId,
                message,
                [
                    { id: "back_to_province", title: "🔙 Province" },
                    { id: "back_to_services", title: "🔙 Emergency Services" },
                    { id: "hi", title: "🏠 Main Menu" }
                ]
            );
        }
        
    } catch (error) {
        console.error(`❌ [EMERGENCY] Error fetching contacts:`, error.message);
        
        // Clear any pending welcome timer
        const { clearPendingWelcome } = require('../handlers/messageHandler');
        if (typeof clearPendingWelcome === 'function') {
            clearPendingWelcome(userId);
        }
        
        // Fallback message with national emergency numbers and buttons
        const message = `${serviceEmoji} *${serviceName} - ${province}*

⚠️ *Service Temporarily Unavailable*

We're having trouble fetching live contacts right now.

📞 *National Emergency Numbers*
• All Emergencies: 999
• Police: 995
• Ambulance: 994
• Fire: 993

────────────────`;

        await messaging.sendButtonMessage(
            userId,
            message,
            [
                { id: "back_to_province", title: "🔙 Province" },
                { id: "back_to_services", title: "🔙 Emergency Services" },
                { id: "hi", title: "🏠 Main Menu" }
            ]
        );
    }
    
    // IMPORTANT: Don't delete the session here!
    // The session will be cleaned up by the cleanup interval after timeout
    // This allows users to use the back buttons
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
        message += "🇿🇼 *CCHub Emergency Services*";
        
        return message;
    }
}

module.exports = new EmergencyService();