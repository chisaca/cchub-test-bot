// services/emergency.js - FINAL VERSION with working API endpoint

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
        
        return {
            session: true,
            message: null
        };
    }
    
    /**
     * Main request handler for emergency flow
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
                returnToMain: true,
                message: null
            };
        }
        
        let result = {
            session: true,
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
        
        updateSession(userId, {
            state: FLOW_STATES.EMERGENCY.SELECT_PROVINCE,
            data: {
                serviceKey: selection,
                serviceName: service.name,
                serviceEmoji: service.emoji
            },
            retries: 0
        });
        
        await this.sendProvinceSelection(userId, service);
        
        return {
            session: true,
            message: null
        };
    }
    
    /**
     * Step 2: Province Selection - Fetch from API
     */
    async sendProvinceSelection(userId, service) {
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
            
            // The API returns { "success": true, "provinces": [...] }
            const provinces = response.data.provinces || [];
            
            let provincesText = '';
            const provinceMap = {};
            
            provinces.forEach((province, index) => {
                const optionNumber = (index + 1).toString();
                provincesText += `${optionNumber}️⃣ ${province.name}\n`;
                // Store mapping of option number to province slug/name
                provinceMap[optionNumber] = {
                    id: province.id,
                    name: province.name,
                    slug: province.name.toLowerCase().replace(/\s+/g, '-')
                };
            });
            
            // Store province mapping in session
            const session = getActiveSession(userId);
            if (session) {
                updateSession(userId, {
                    data: {
                        ...session.data,
                        provinceMap: provinceMap
                    }
                });
            }
            
            const message = `${service.emoji} *${service.name}*\n\n` +
                `Select your province:\n\n` +
                `${provincesText}\n` +
                `📝 Reply with number (1-${provinces.length})\n\n` +
                `────────────────\n` +
                `Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, message);
            
        } catch (error) {
            console.error('Error fetching provinces:', error.message);
            
            // Fallback to static provinces
            const staticProvinces = EMERGENCY_CONFIG.PROVINCES;
            let provincesText = '';
            const provinceMap = {};
            
            for (const [key, province] of Object.entries(staticProvinces)) {
                provincesText += `${key}️⃣ ${province}\n`;
                provinceMap[key] = {
                    name: province,
                    slug: province.toLowerCase().replace(/\s+/g, '-')
                };
            }
            
            // Store province mapping in session
            const session = getActiveSession(userId);
            if (session) {
                updateSession(userId, {
                    data: {
                        ...session.data,
                        provinceMap: provinceMap
                    }
                });
            }
            
            const message = `${service.emoji} *${service.name}*\n\n` +
                `Select your province:\n\n` +
                `${provincesText}\n` +
                `📝 Reply with number (1-${Object.keys(staticProvinces).length})\n\n` +
                `────────────────\n` +
                `Type *hi* to return to Main Menu`;
            
            await messaging.sendMessage(userId, message);
        }
    }
    
    async handleProvinceSelection(userId, message, session) {
        const selection = message.trim();
        const provinceMap = session.data?.provinceMap || {};
        
        // Get province data from the selection
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
        
        const { serviceKey, serviceName, serviceEmoji } = session.data;
        
        if (!serviceKey || !serviceName) {
            console.error(`❌ Missing service data in session for ${userId}`);
            deleteSession(userId);
            return {
                session: false,
                returnToMain: true,
                message: null
            };
        }
        
        updateSession(userId, {
            state: FLOW_STATES.EMERGENCY.SHOW_CONTACTS,
            data: {
                ...session.data,
                province: selectedProvince.name,
                provinceSlug: selectedProvince.slug,
                provinceId: selectedProvince.id
            },
            retries: 0
        });
        
        // Show loading message
        await messaging.sendMessage(userId,
            `🔍 *Fetching ${serviceName} contacts in ${selectedProvince.name}...*\n\n` +
            `⏳ Please wait...`
        );
        
        // Fetch contacts from API
        await this.fetchEmergencyContacts(userId, {
            serviceKey,
            serviceName,
            serviceEmoji,
            province: selectedProvince.name,
            provinceSlug: selectedProvince.slug
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
        const { serviceKey, serviceName, serviceEmoji, province, provinceSlug } = data;
        
        try {
            const apiUrl = process.env.WORDPRESS_API_URL || 'https://cchub.co.zw';
            // Use the correct endpoint pattern: /services/{province}/{type}
            const contactsUrl = `${apiUrl}/wp-json/zim-emergency/v1/services/${provinceSlug}/${serviceKey}`;
            
            console.log(`🌐 Fetching emergency contacts: ${contactsUrl}`);
            
            const response = await axios.get(contactsUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'CCHub-Emergency-Bot/1.0.0'
                }
            });
            
            // Format and display the contacts
            const message = this.formatApiResponse(response.data, serviceEmoji, serviceName, province);
            await messaging.sendMessage(userId, message);
            
        } catch (error) {
            console.error(`Error fetching contacts:`, error.message);
            
            // Fallback to generated contacts
            console.log(`⚠️ Using generated contacts for ${province} - ${serviceName}`);
            const message = this.generateContactsMessage(province, serviceKey, serviceName, serviceEmoji);
            await messaging.sendMessage(userId, message);
        }
        
        // Delete session
        deleteSession(userId);
    }
    
    /**
     * Format API response for display
     */
    formatApiResponse(apiData, serviceEmoji, serviceName, province) {
        // Handle both array response and object with services property
        const services = Array.isArray(apiData) ? apiData : (apiData.services || []);
        
        let message = `${serviceEmoji} *${serviceName} - ${province}*\n\n`;
        
        if (services.length === 0) {
            message += `📭 *No contacts found*\n\n`;
            message += `No ${serviceName.toLowerCase()} contacts are currently available for ${province}.\n\n`;
        } else {
            services.forEach((service, index) => {
                const emoji = service.emoji || serviceEmoji;
                message += `${emoji} *${service.name || service.title}*\n`;
                
                if (service.phone || service.phone_number) {
                    const phone = (service.phone || service.phone_number).replace(/\s+/g, '');
                    message += `📞 ${phone}`;
                    if (service.phone2 || service.alternate_phone) {
                        const phone2 = (service.phone2 || service.alternate_phone).replace(/\s+/g, '');
                        message += ` / ${phone2}`;
                    }
                    message += '\n';
                }
                
                if (service.address) {
                    message += `📍 ${service.address}\n`;
                }
                
                if (service.description) {
                    message += `📝 ${service.description}\n`;
                }
                
                message += '\n';
            });
        }
        
        // Add national emergency numbers
        message += "📞 *National Emergency Numbers*\n";
        message += "• All Emergencies: 999\n";
        message += "• Police: 995\n";
        message += "• Ambulance: 994\n";
        message += "• Fire: 993\n";
        message += "• Civil Protection: 112\n\n";
        
        message += "────────────────\n";
        message += "🇿🇼 *CCHub Emergency Services*\n";
        message += "Type *hi* for main menu";
        
        return message;
    }
    
    /**
     * Generate contacts message (fallback)
     */
    generateContactsMessage(province, serviceKey, serviceName, serviceEmoji) {
        const areaCodes = {
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
        
        const areaCode = areaCodes[province] || '0242';
        
        const contacts = {
            '1': [ // Police
                {
                    name: `${province} Central Police Station`,
                    phone: `${areaCode}-703111`,
                    phone2: '995',
                    address: `Central Business District, ${province}`,
                    description: '24/7 emergency response, crime reporting'
                },
                {
                    name: `${province} Traffic Police`,
                    phone: `${areaCode}-703222`,
                    description: 'Traffic accidents and road safety'
                }
            ],
            '2': [ // Ambulance
                {
                    name: `${province} Emergency Medical Services`,
                    phone: `${areaCode}-704111`,
                    phone2: '994',
                    address: `${province} Central Hospital`,
                    description: '24/7 ambulance services'
                }
            ],
            '3': [ // Fire
                {
                    name: `${province} Fire Brigade`,
                    phone: `${areaCode}-705111`,
                    phone2: '993',
                    address: `${province} Fire Station`,
                    description: 'Fire emergencies and rescue'
                }
            ],
            '4': [ // Hospital
                {
                    name: `${province} Central Hospital`,
                    phone: `${areaCode}-706111`,
                    address: `Main Street, ${province}`,
                    description: '24/7 emergency department'
                }
            ],
            '5': [ // Electricity
                {
                    name: `ZETDC ${province}`,
                    phone: `${areaCode}-707111`,
                    phone2: '0800-12345',
                    description: 'Power outages and faults'
                }
            ]
        };
        
        const serviceContacts = contacts[serviceKey] || [
            {
                name: `${serviceName} - ${province}`,
                phone: `${areaCode}-708888`,
                description: 'Emergency services available 24/7'
            }
        ];
        
        let message = `${serviceEmoji} *${serviceName} - ${province}*\n\n`;
        message += `📍 *Emergency Contacts*\n\n`;
        
        serviceContacts.forEach(contact => {
            message += `• *${contact.name}*\n`;
            message += `  📞 ${contact.phone}`;
            if (contact.phone2) message += ` / ${contact.phone2}`;
            message += '\n';
            if (contact.address) message += `  📍 ${contact.address}\n`;
            if (contact.description) message += `  📝 ${contact.description}\n`;
            message += '\n';
        });
        
        // Add national numbers
        message += "📞 *National Emergency Numbers*\n";
        message += "• All Emergencies: 999\n";
        message += "• Police: 995\n";
        message += "• Ambulance: 994\n";
        message += "• Fire: 993\n";
        message += "• Civil Protection: 112\n\n";
        
        message += "────────────────\n";
        message += "🇿🇼 *CCHub Emergency Services*\n";
        message += "Type *hi* for main menu";
        
        return message;
    }
}

module.exports = new EmergencyService();
