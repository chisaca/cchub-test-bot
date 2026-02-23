// services/emergency.js - UPDATED with correct API endpoints

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
    
    /**
     * Start the emergency flow
     * Called from main menu
     */
    async startFlow(userId) {
        console.log(`🚨 Starting emergency flow for ${userId}`);
        
        // Create new session for emergency service
        const session = createSession(userId, 'emergency');
        
        // Update session state
        updateSession(userId, {
            state: FLOW_STATES.EMERGENCY.SELECT_SERVICE,
            data: {}
        });
        
        // Send service selection message
        await this.sendServiceSelection(userId);
        
        // Return result object to match expected pattern
        return {
            session: true,
            message: null // No message needed here as we already sent it
        };
    }
    
    /**
     * Main request handler for emergency flow
     * Follows step-by-step state-driven architecture
     * RETURNS result object with session and message properties
     */
    async handleRequest(userId, message, session) {
        console.log(`🚨 Emergency request from ${userId} at state ${session.state}: "${message}"`);
        
        // Check for universal reset (hi)
        const normalizedMessage = message.trim().toLowerCase();
        if (normalizedMessage === 'hi') {
            console.log(`🔄 Universal reset triggered for ${userId} in emergency flow`);
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,  // Tell messageHandler to show main menu
                message: null
            };
        }
        
        let result = {
            session: true, // Assume session continues by default
            message: null,
            returnToMain: false
        };
        
        // Route based on current flow state
        switch(session.state) {
            case FLOW_STATES.EMERGENCY.SELECT_SERVICE:
                result = await this.handleServiceSelection(userId, message, session);
                break;
                
            case FLOW_STATES.EMERGENCY.SELECT_PROVINCE:
                result = await this.handleProvinceSelection(userId, message, session);
                break;
                
            case FLOW_STATES.EMERGENCY.SHOW_CONTACTS:
                // This state is for showing results, not handling input
                result.message = "⏳ Please wait while I fetch emergency contacts...\n\n" +
                                 "Type *hi* to return to main menu.";
                break;
                
            default:
                // Invalid state - reset
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
        const services = EMERGENCY_CONFIG.SERVICES;
        
        let servicesText = '';
        for (const [key, service] of Object.entries(services)) {
            servicesText += `${key}️⃣ ${service.emoji} ${service.name}\n`;
        }
        
        const message = `🚨 *Emergency Services*\n\n` +
            `Select emergency service:\n\n` +
            `${servicesText}\n` +
            `📝 Reply with number (1-${Object.keys(services).length})\n\n` +
            `────────────────\n` +
            `Type *hi* to return to Main Menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleServiceSelection(userId, message, session) {
        const selection = message.trim();
        const services = EMERGENCY_CONFIG.SERVICES;
        
        // Validate service selection
        if (!services[selection]) {
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
            
            let optionsText = '';
            for (const [key, service] of Object.entries(services)) {
                optionsText += `${key}. ${service.emoji} ${service.name}\n`;
            }
            
            const errorMessage = `❌ Invalid selection. Please choose:\n\n` +
                `${optionsText}\n` +
                `────────────────\n` +
                `Attempts remaining: ${3 - newRetryCount}\n` +
                `Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, errorMessage);
            
            return {
                session: true,
                message: null
            };
        }
        
        const service = services[selection];
        
        // Update session with service choice
        updateSession(userId, {
            state: FLOW_STATES.EMERGENCY.SELECT_PROVINCE,
            data: {
                serviceKey: selection,
                serviceName: service.name,
                serviceEmoji: service.emoji
            },
            retries: 0 // Reset retries
        });
        
        // Ask for province
        await this.sendProvinceSelection(userId, service);
        
        return {
            session: true,
            message: null
        };
    }
    
    /**
     * Step 2: Province Selection
     */
    async sendProvinceSelection(userId, service) {
        const provinces = EMERGENCY_CONFIG.PROVINCES;
        
        let provincesText = '';
        for (const [key, province] of Object.entries(provinces)) {
            provincesText += `${key}️⃣ ${province}\n`;
        }
        
        const message = `${service.emoji} *${service.name}*\n\n` +
            `Select your province:\n\n` +
            `${provincesText}\n` +
            `📝 Reply with number (1-${Object.keys(provinces).length})\n\n` +
            `────────────────\n` +
            `Type *hi* to return to Main Menu`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleProvinceSelection(userId, message, session) {
        const selection = message.trim();
        const provinces = EMERGENCY_CONFIG.PROVINCES;
        
        // Validate province selection
        if (!provinces[selection]) {
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
            
            let optionsText = '';
            for (const [key, province] of Object.entries(provinces)) {
                optionsText += `${key}. ${province}\n`;
            }
            
            const errorMessage = `❌ Invalid selection. Please choose:\n\n` +
                `${optionsText}\n` +
                `────────────────\n` +
                `Attempts remaining: ${3 - newRetryCount}\n` +
                `Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, errorMessage);
            
            return {
                session: true,
                message: null
            };
        }
        
        const province = provinces[selection];
        
        // Get service data from session
        const { serviceKey, serviceName, serviceEmoji } = session.data || {};
        
        if (!serviceKey || !serviceName) {
            console.error(`❌ Missing service data in session for ${userId}`);
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        // Update session with province choice and move to show contacts
        updateSession(userId, {
            state: FLOW_STATES.EMERGENCY.SHOW_CONTACTS,
            data: {
                ...session.data,
                province: province,
                provinceKey: selection
            },
            retries: 0
        });
        
        // Fetch and show emergency contacts
        await this.fetchAndShowContacts(userId, {
            serviceKey,
            serviceName,
            serviceEmoji,
            province
        });
        
        // Session will be deleted after showing contacts, so return false with returnToMain
        return {
            session: false,
            returnToMain: true,
            message: null
        };
    }
    
    /**
     * Step 3: Fetch and Show Contacts
     */
    async fetchAndShowContacts(userId, data) {
        const { serviceKey, serviceName, serviceEmoji, province } = data;
        
        // Show loading message
        await messaging.sendMessage(userId,
            `🔍 *Searching ${serviceName} in ${province}...*\n\n` +
            `⏳ Please wait while I fetch the emergency contacts.\n\n` +
            `This may take a few seconds...`
        );
        
        try {
            // First, fetch list of provinces to verify structure
            const apiUrl = process.env.WORDPRESS_API_URL || 'https://cchub.co.zw';
            
            // Try to get provinces list first to understand the data structure
            const provincesUrl = `${apiUrl}/wp-json/zim-emergency/v1/provinces`;
            console.log(`🌐 Fetching provinces list: ${provincesUrl}`);
            
            const provincesResponse = await axios.get(provincesUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'CCHub-Emergency-Bot/1.0.0'
                }
            });
            
            console.log(`✅ Successfully fetched provinces data`);
            
            // Based on the provinces endpoint, we need to determine how to get contacts
            // This might be returning a list of provinces with their emergency contacts
            const provincesData = provincesResponse.data;
            
            // Find the selected province in the response
            const selectedProvinceData = this.findProvinceData(provincesData, province, serviceKey);
            
            if (selectedProvinceData && selectedProvinceData.contacts && selectedProvinceData.contacts.length > 0) {
                // Format and show contacts
                const formattedResponse = this.formatEmergencyResponse(selectedProvinceData, serviceEmoji);
                await messaging.sendMessage(userId, formattedResponse);
            } else {
                // No contacts found for this province/service
                await messaging.sendMessage(userId,
                    `${serviceEmoji} *${serviceName} - ${province}*\n\n` +
                    `🚫 *No emergency contacts found*\n\n` +
                    `No ${serviceName.toLowerCase()} contacts were found in ${province}.\n\n` +
                    `*National Emergency Numbers:*\n` +
                    `• All Emergencies: 999\n` +
                    `• Police: 995\n` +
                    `• Ambulance: 994\n` +
                    `• Fire: 993\n` +
                    `• Civil Protection: 112\n\n` +
                    `────────────────\n\n` +
                    `Please try another province or service.\n\n` +
                    `Type *hi* to return to Main Menu`
                );
            }
        } catch (error) {
            console.error('Emergency fetch error:', error.message);
            
            // Fallback to comprehensive mock data
            console.log(`⚠️ Using mock emergency data for ${province} - ${serviceKey}`);
            const mockData = this.getComprehensiveMockData(province, serviceKey);
            const formattedResponse = this.formatEmergencyResponse(mockData, serviceEmoji);
            await messaging.sendMessage(userId, formattedResponse);
        }
        
        // Delete session
        deleteSession(userId);
    }
    
    /**
     * Find province data in the API response
     */
    findProvinceData(provincesData, provinceName, serviceKey) {
        // This depends on the actual structure of your API response
        // You'll need to adjust this based on what the /provinces endpoint returns
        
        // If provincesData is an array
        if (Array.isArray(provincesData)) {
            const province = provincesData.find(p => 
                p.name?.toLowerCase() === provinceName.toLowerCase() ||
                p.province?.toLowerCase() === provinceName.toLowerCase()
            );
            
            if (province) {
                return {
                    province: provinceName,
                    serviceType: serviceKey,
                    contacts: province.contacts || province.services || []
                };
            }
        }
        
        // If provincesData is an object with provinces as keys
        if (provincesData && typeof provincesData === 'object') {
            const provinceKey = Object.keys(provincesData).find(key => 
                key.toLowerCase() === provinceName.toLowerCase() ||
                provincesData[key]?.name?.toLowerCase() === provinceName.toLowerCase()
            );
            
            if (provinceKey) {
                const provinceData = provincesData[provinceKey];
                return {
                    province: provinceName,
                    serviceType: serviceKey,
                    contacts: provinceData.contacts || provinceData.services || []
                };
            }
        }
        
        return null;
    }
    
    /**
     * Format emergency services for WhatsApp
     */
    formatEmergencyResponse(data, serviceEmoji) {
        const { province, contacts, serviceType, isMock } = data;
        const serviceName = this.getServiceName(serviceType);
        
        let message = `${serviceEmoji} *${serviceName} - ${province}*\n\n`;
        
        if (isMock) {
            message += `ℹ️ *Demo Mode:* Showing sample emergency contacts\n\n`;
        }
        
        if (contacts && contacts.length > 0) {
            contacts.forEach((contact, index) => {
                const itemEmoji = contact.emoji || serviceEmoji;
                message += `${itemEmoji} *${contact.name || contact.service_name}*\n`;
                
                // Phone numbers
                if (contact.phone || contact.phone_number) {
                    const phone = (contact.phone || contact.phone_number).replace(/\s+/g, '');
                    message += `📞 ${phone}`;
                    
                    if (contact.phone2 || contact.phone_number2) {
                        const phone2 = (contact.phone2 || contact.phone_number2).replace(/\s+/g, '');
                        message += ` / ${phone2}`;
                    }
                    message += '\n';
                }
                
                // Address
                if (contact.address) {
                    message += `📍 ${contact.address}\n`;
                }
                
                // Description
                if (contact.description) {
                    message += `📝 ${contact.description}\n`;
                }
                
                message += '\n';
            });
        }
        
        // Add national emergency numbers
        message += "📞 *National Emergency Numbers:*\n";
        message += "• All Emergencies: 999\n";
        message += "• Police: 995\n";
        message += "• Ambulance: 994\n";
        message += "• Fire: 993\n";
        message += "• Civil Protection: 112\n\n";
        
        message += "────────────────\n\n";
        message += "_🇿🇼 Zimbabwe Emergency Services via CCHub_\n\n";
        message += "Type *hi* to return to Main Menu";
        
        return message;
    }
    
    /**
     * Get service name from service key
     */
    getServiceName(serviceKey) {
        const services = EMERGENCY_CONFIG.SERVICES;
        return services[serviceKey]?.name || 'Emergency Service';
    }
    
    /**
     * Get comprehensive mock emergency data (fallback)
     */
    getComprehensiveMockData(province, serviceType) {
        const services = EMERGENCY_CONFIG.SERVICES;
        const service = services[serviceType] || { name: 'Emergency Service', emoji: '🚨' };
        
        // Province-specific phone codes
        const provinceCodes = {
            'Harare': '0242',
            'Bulawayo': '029',
            'Manicaland': '020',
            'Mashonaland Central': '027',
            'Mashonaland East': '025',
            'Mashonaland West': '026',
            'Masvingo': '039',
            'Matabeleland North': '028',
            'Matabeleland South': '029',
            'Midlands': '054'
        };
        
        const areaCode = provinceCodes[province] || '0242';
        
        // Service-specific mock data
        const serviceMocks = {
            '1': [ // Police
                {
                    name: `${province} Police Station (ZRP)`,
                    emoji: '👮',
                    phone: `${areaCode}-222333`,
                    phone2: `${areaCode}-222444`,
                    address: `Central Police Station, ${province}`,
                    description: '24/7 police services, emergency response, and crime reporting'
                },
                {
                    name: `${province} Traffic Police`,
                    emoji: '🚔',
                    phone: `${areaCode}-222555`,
                    address: `Traffic Department, ${province}`,
                    description: 'Traffic accidents, road safety, and vehicle-related incidents'
                }
            ],
            '2': [ // Ambulance
                {
                    name: `${province} Emergency Medical Services`,
                    emoji: '🚑',
                    phone: `${areaCode}-223333`,
                    phone2: '994',
                    address: `${province} Central Hospital`,
                    description: '24/7 ambulance services, emergency medical response'
                }
            ],
            '3': [ // Fire
                {
                    name: `${province} Fire Brigade`,
                    emoji: '🚒',
                    phone: `${areaCode}-224444`,
                    phone2: '993',
                    address: `${province} Fire Station`,
                    description: 'Fire emergencies, rescue operations, and fire safety'
                }
            ],
            '4': [ // Hospital
                {
                    name: `${province} Central Hospital`,
                    emoji: '🏥',
                    phone: `${areaCode}-225555`,
                    address: `Main Street, ${province}`,
                    description: '24/7 emergency department, general hospital services'
                },
                {
                    name: `${province} Private Clinic`,
                    emoji: '🏥',
                    phone: `${areaCode}-226666`,
                    address: `${province} Medical Centre`,
                    description: 'General practice, minor emergencies, consultations'
                }
            ],
            '5': [ // Electricity
                {
                    name: `ZETDC ${province} Region`,
                    emoji: '⚡',
                    phone: `${areaCode}-227777`,
                    phone2: '0800-12345',
                    address: `${province} ZETDC Office`,
                    description: 'Power outages, electrical faults, and emergency repairs'
                }
            ]
        };
        
        const contacts = serviceMocks[serviceType] || [
            {
                name: `${service.name} - ${province}`,
                emoji: service.emoji,
                phone: `${areaCode}-228888`,
                address: `${province} Main Office`,
                description: 'Emergency services available 24/7'
            }
        ];
        
        return {
            province: province,
            serviceType: serviceType,
            contacts: contacts,
            isMock: true
        };
    }
}

// Export singleton instance
module.exports = new EmergencyService();
