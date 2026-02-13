// services/emergency.js - UPDATED to follow state-driven architecture

const axios = require('axios');
const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
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
        
        // Send service selection message
        await this.sendServiceSelection(userId);
        
        // Update session to first step
        updateSessionStep(userId, 'select_service', FLOW_STATES.EMERGENCY.SELECT_SERVICE);
    }
    
    /**
     * Main request handler for emergency flow
     * Follows step-by-step state-driven architecture
     */
    async handleRequest(userId, message, session) {
        console.log(`🚨 Emergency request from ${userId} at step ${session.step}: "${message}"`);
        
        // Route based on current flow state
        switch(session.flow) {
            case FLOW_STATES.EMERGENCY.SELECT_SERVICE:
                await this.handleServiceSelection(userId, message, session);
                break;
                
            case FLOW_STATES.EMERGENCY.SELECT_PROVINCE:
                await this.handleProvinceSelection(userId, message, session);
                break;
                
            case FLOW_STATES.EMERGENCY.SHOW_CONTACTS:
                // This state is for showing results, not handling input
                // After showing contacts, session is cleared
                break;
                
            default:
                // Invalid state - reset
                console.error(`❌ Invalid flow state for ${userId}: ${session.flow}`);
                deleteSession(userId);
                await this.startFlow(userId);
        }
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
            `📝 Reply with number (1-${Object.keys(services).length})`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleServiceSelection(userId, message, session) {
        const selection = message.trim();
        const services = EMERGENCY_CONFIG.SERVICES;
        
        // Validate service selection
        if (!services[selection]) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            let optionsText = '';
            for (const [key, service] of Object.entries(services)) {
                optionsText += `${key}. ${service.emoji} ${service.name}\n`;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose:\n\n` +
                `${optionsText}\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        const service = services[selection];
        
        // Update session with service choice
        updateSessionStep(userId, 'select_province', FLOW_STATES.EMERGENCY.SELECT_PROVINCE, {
            serviceKey: selection,
            serviceName: service.name,
            serviceEmoji: service.emoji
        });
        
        // Ask for province
        await this.sendProvinceSelection(userId, service);
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
            `📝 Reply with number (1-${Object.keys(provinces).length})`;
        
        await messaging.sendMessage(userId, message);
    }
    
    async handleProvinceSelection(userId, message, session) {
        const selection = message.trim();
        const provinces = EMERGENCY_CONFIG.PROVINCES;
        
        // Validate province selection
        if (!provinces[selection]) {
            const isMaxRetries = incrementRetries(userId);
            
            if (isMaxRetries) {
                await messaging.sendMessage(userId, RESPONSE_MESSAGES.TOO_MANY_ATTEMPTS);
                deleteSession(userId);
                return;
            }
            
            let optionsText = '';
            for (const [key, province] of Object.entries(provinces)) {
                optionsText += `${key}. ${province}\n`;
            }
            
            await messaging.sendMessage(userId, 
                `❌ Invalid selection. Please choose:\n\n` +
                `${optionsText}\n` +
                `Attempts remaining: ${3 - session.retries}`
            );
            return;
        }
        
        const province = provinces[selection];
        
        // Update session with province choice
        updateSessionStep(userId, 'show_contacts', FLOW_STATES.EMERGENCY.SHOW_CONTACTS, {
            province: province,
            provinceKey: selection
        });
        
        // Fetch and show emergency contacts
        await this.fetchAndShowContacts(userId, session);
    }
    
    /**
     * Step 3: Fetch and Show Contacts
     */
    async fetchAndShowContacts(userId, session) {
        const { serviceKey, serviceName, serviceEmoji, province } = session.data;
        
        // Show loading message
        await messaging.sendMessage(userId,
            `🔍 *Searching ${serviceName} in ${province}...*\n\n` +
            `Please wait while I fetch the emergency contacts.`
        );
        
        try {
            // Fetch emergency services
            const emergencyData = await this.fetchEmergencyServices(province, serviceKey);
            
            if (emergencyData.success && emergencyData.services && emergencyData.services.length > 0) {
                // Format and show contacts
                const formattedResponse = this.formatEmergencyResponse(emergencyData, serviceEmoji);
                await messaging.sendMessage(userId, formattedResponse);
            } else {
                // No services found
                await messaging.sendMessage(userId,
                    `${serviceEmoji} *${serviceName} - ${province}*\n\n` +
                    `🚫 *No emergency services found*\n\n` +
                    `No ${serviceName.toLowerCase()} services were found in ${province}.\n\n` +
                    `*National Emergency Numbers:*\n` +
                    `• All Emergencies: 999\n` +
                    `• Police: 995\n` +
                    `• Ambulance: 994\n` +
                    `• Fire: 993\n` +
                    `• Civil Protection: 112\n\n` +
                    `Please try another province or service.`
                );
            }
        } catch (error) {
            console.error('Emergency fetch error:', error.message);
            
            await messaging.sendMessage(userId,
                `⚠️ *Service temporarily unavailable*\n\n` +
                `Unable to fetch emergency services right now.\n\n` +
                `*National Emergency Numbers:*\n` +
                `• All Emergencies: 999\n` +
                `• Police: 995\n` +
                `• Ambulance: 994\n` +
                `• Fire: 993\n` +
                `• Civil Protection: 112\n\n` +
                `Please try again in a few minutes.`
            );
        }
        
        // Clear session after showing results
        deleteSession(userId);
        
        // Show main menu after delay
        setTimeout(async () => {
            await messaging.sendMessagesendWelcomeMessage(userId);
        }, 2000);
    }
    
    /**
     * Fetch emergency services from WordPress API with caching
     */
    async fetchEmergencyServices(province, serviceType) {
        const cacheKey = `${province}_${serviceType}`;
        const cached = emergencyCache.get(cacheKey);
        
        // Return cached data if valid
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            console.log(`📦 Returning cached emergency data for ${province} - ${serviceType}`);
            return cached.data;
        }
        
        try {
            const apiUrl = process.env.WORDPRESS_API_URL;
            
            if (!apiUrl) {
                console.warn('⚠️ WORDPRESS_API_URL not set, using mock data');
                return this.getMockEmergencyData(province, serviceType);
            }
            
            // Use province mapping for API calls
            const apiProvince = province.toLowerCase().replace(/\s+/g, '-');
            
            const url = `${apiUrl}/wp-json/zim-emergency/v1/services/${apiProvince}/${serviceType}`;
            
            console.log(`🌐 Calling emergency API: ${url}`);
            
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'CCHub-Emergency-Bot/1.0.0'
                }
            });
            
            console.log(`✅ Successfully fetched emergency data for ${province}`);
            
            // Cache successful response
            const dataToCache = {
                ...response.data,
                success: true
            };
            
            emergencyCache.set(cacheKey, {
                data: dataToCache,
                timestamp: Date.now()
            });
            
            return dataToCache;
        } catch (error) {
            console.error(`❌ Error fetching emergency data for "${province}":`, error.message);
            
            // Return stale cache if available
            if (cached) {
                console.log(`⚠️ Using stale cached emergency data for ${province} - ${serviceType}`);
                cached.data.stale = true;
                cached.data.message = 'Note: Showing cached data. Some information may be outdated.';
                return cached.data;
            }
            
            // Return mock data as fallback
            console.log(`⚠️ Using mock emergency data for ${province} - ${serviceType}`);
            return this.getMockEmergencyData(province, serviceType);
        }
    }
    
    /**
     * Format emergency services for WhatsApp
     */
    formatEmergencyResponse(data, serviceEmoji) {
        const { province, services, stale } = data;
        const serviceType = services[0]?.service_type_name || 'Emergency Service';
        
        let message = `${serviceEmoji} *${serviceType} - ${province}*\n\n`;
        
        if (stale) {
            message += `⚠️ Note: Showing cached data. Some information may be outdated.\n\n`;
        }
        
        services.forEach((service, index) => {
            const itemEmoji = service.service_emoji || serviceEmoji;
            message += `${itemEmoji} *${service.service_name}*\n`;
            
            // Phone numbers
            if (service.phone_number) {
                const phone1 = service.phone_number.replace(/\s+/g, '');
                message += `📞 ${phone1}`;
                
                if (service.phone_number2 && service.phone_number2.trim()) {
                    const phone2 = service.phone_number2.replace(/\s+/g, '');
                    message += ` / ${phone2}`;
                }
                message += '\n';
            }
            
            // Address
            if (service.address && service.address.trim()) {
                message += `📍 ${service.address}\n`;
            }
            
            // Description
            if (service.description && service.description.trim()) {
                message += `📝 ${service.description}\n`;
            }
            
            // Verified badge
            if (service.verified) {
                message += `✅ Verified\n`;
            }
            
            message += '\n';
        });
        
        // Add national emergency numbers
        message += "📞 *National Emergency Numbers:*\n";
        message += "• All Emergencies: 999\n";
        message += "• Police: 995\n";
        message += "• Ambulance: 994\n";
        message += "• Fire: 993\n";
        message += "• Civil Protection: 112\n\n";
        
        message += "_🇿🇼 Zimbabwe Emergency Services via CCHub_";
        
        return message;
    }
    
    /**
     * Get mock emergency data (fallback)
     */
    getMockEmergencyData(province, serviceType) {
        const services = EMERGENCY_CONFIG.SERVICES;
        const service = services[serviceType] || { name: 'Emergency Service', emoji: '🚨' };
        
        const mockServices = [
            {
                service_name: `${service.name} Headquarters`,
                service_type_name: service.name,
                service_emoji: service.emoji,
                phone_number: '0242-123456',
                address: `Main Office, ${province}`,
                description: '24/7 emergency services',
                verified: true
            },
            {
                service_name: `${province} ${service.name} Response`,
                service_type_name: service.name,
                service_emoji: service.emoji,
                phone_number: '0800-12345',
                address: `Response Center, ${province}`,
                description: 'Rapid response unit',
                verified: true
            }
        ];
        
        return {
            success: true,
            province: province,
            type: serviceType,
            services: mockServices
        };
    }
}

// Export singleton instance
module.exports = new EmergencyService();