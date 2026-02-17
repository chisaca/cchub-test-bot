// services/paynow.js - PRODUCTION READY
// UPDATED: Supports both USD and ZiG currencies
// UPDATED: All configuration moved to constants.js

const { Paynow } = require("paynow");
const constants = require('../config/constants');

class PayNowService {
    constructor() {
        // Credentials from environment
        this.integrationId = process.env.PAYNOW_ID || '23374';
        this.integrationKey = process.env.PAYNOW_KEY || '486538ea-63af-4400-a91b-8d9d1c67ccd3';
        this.merchantEmail = constants.MERCHANT_CONFIG.EMAIL;
        
        console.log('💳 [PAYNOW] Initializing SDK for mobile payments...');
        
        try {
            this.paynow = new Paynow(this.integrationId, this.integrationKey);
            
            // Required placeholder URLs from constants
            this.paynow.resultUrl = constants.MERCHANT_CONFIG.RESULT_URL;
            this.paynow.returnUrl = constants.MERCHANT_CONFIG.RETURN_URL;
            
            console.log('✅ PayNow SDK initialized');
            console.log(`   ID: ${this.integrationId}`);
            console.log(`   Email: ${this.merchantEmail}`);
            
        } catch (error) {
            console.error('❌ PayNow init failed:', error.message);
            throw error;
        }
    }
    
    /**
     * Format amount with currency symbol
     */
    formatAmountWithCurrency(amount, currency = 'USD') {
        const numAmount = parseFloat(amount).toFixed(2);
        if (currency.toUpperCase() === 'USD') {
            return `$${numAmount}`;
        } else {
            return `${numAmount} ZiG`;
        }
    }
    
    /**
     * Initiate quick PayNow payment
     */
    async initiateQuickPay(paymentData) {
        console.log('💳 [PAYNOW] Initiating mobile payment...');
        
        try {
            const { amount, reference, phone, method, service, currency = 'USD' } = paymentData;
            
            if (!amount || isNaN(amount)) throw new Error('Invalid amount');
            if (!reference) throw new Error('Reference required');
            if (!method) throw new Error('Payment method required');
            
            // Phone required for EcoCash only
            if (method === 'ecocash' && !phone) throw new Error('Phone required for EcoCash');
            
            // Format phone for EcoCash
            let formattedPhone = null;
            let provider = method;
            
            if (method === 'ecocash') {
                formattedPhone = phone.toString().replace(/\D/g, '');
                if (formattedPhone.startsWith('263')) {
                    formattedPhone = '0' + formattedPhone.substring(3);
                }
                
                provider = this.detectMobileProvider(formattedPhone);
                if (!provider) {
                    throw new Error(`No provider detected for ${formattedPhone}`);
                }
            } else if (method === 'innbucks') {
                provider = constants.PAYNOW_CONFIG.INNBUCKS.appName;
            }
            
            console.log(`📱 ${provider} | Method: ${method} | Phone: ${formattedPhone || 'N/A'} | Currency: ${currency}`);
            
            const formattedAmount = parseFloat(amount).toFixed(2);
            const amountDisplay = this.formatAmountWithCurrency(amount, currency);
            
            // Create payment
            const payment = this.paynow.createPayment(reference, this.merchantEmail);
            payment.add(service || 'Airtime', parseFloat(formattedAmount));
            
            let response;
            
            // ==================== INNBUCKS ====================
            if (method === 'innbucks') {
                // InnBucks uses standard PayNow with method=innbucks
                const webResponse = await this.paynow.send(payment, 'innbucks');
                
                if (!webResponse) throw new Error('No response from PayNow');
                if (webResponse.error) throw new Error(webResponse.error);
                
                // Extract InnBucks-specific fields
                const authCode = webResponse.authorizationcode;
                const authExpires = webResponse.authorizationexpires;
                
                // Generate QR Code and deep link using constants templates
                const qrCodeUrl = constants.PAYNOW_CONFIG.INNBUCKS.qrCodeUrlTemplate.replace('%s', authCode);
                const deepLink = constants.PAYNOW_CONFIG.INNBUCKS.deepLinkTemplate.replace('%s', authCode);
                
                // Build instructions using template from constants
                const instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.INNBUCKS
                    .replace('%s', authCode)
                    .replace('%s', authExpires)
                    .replace('%s', amountDisplay)
                    .replace('%s', deepLink)
                    .replace('%s', qrCodeUrl)
                    .replace('%s', authCode)
                    .replace('%s', reference);
                
                response = {
                    pollUrl: webResponse.pollUrl,
                    authorizationCode: authCode,
                    authorizationExpires: authExpires,
                    qrCodeUrl: qrCodeUrl,
                    deepLink: deepLink,
                    instructions: instructions
                };
            }
            
            // ==================== ECOCASH ====================
            else {
                // EcoCash uses USSD push - NO DIALING REQUIRED
                response = await this.paynow.sendMobile(
                    payment,
                    formattedPhone,
                    'ecocash'
                );
                
                if (!response) throw new Error('No response from PayNow');
                if (response.error) throw new Error(response.error);
                
                // Build instructions using template from constants
                response.instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ECOCASH
                    .replace('%s', formattedPhone)
                    .replace('%s', amountDisplay)
                    .replace('%s', reference);
            }
            
            console.log('📥 Response received');
            
            return {
                success: true,
                pollUrl: response.pollUrl,
                instructions: response.instructions,
                provider: provider,
                method: method,
                reference: reference,
                amount: formattedAmount,
                currency: currency,
                amountDisplay: amountDisplay,
                phone: formattedPhone,
                // InnBucks-specific fields
                authorizationCode: response.authorizationCode,
                authorizationExpires: response.authorizationExpires,
                qrCodeUrl: response.qrCodeUrl,
                deepLink: response.deepLink
            };
            
        } catch (error) {
            console.error('❌ PayNow error:', error.message);
            
            // ==================== SIMULATION MODE ====================
            if (process.env.NODE_ENV !== 'production') {
                console.log('⚠️ Using simulation fallback');
                
                const method = paymentData.method || 'ecocash';
                const provider = method === 'innbucks' ? 
                    constants.PAYNOW_CONFIG.INNBUCKS.appName : 
                    constants.PAYNOW_CONFIG.PROVIDER_PREFIXES.ECOCASH.name;
                const currency = paymentData.currency || 'USD';
                const amountDisplay = this.formatAmountWithCurrency(paymentData.amount, currency);
                const pollUrl = constants.PAYNOW_CONFIG.SIMULATION.pollUrlTemplate.replace('%s', Date.now());
                
                let instructions;
                let response = {
                    success: true,
                    pollUrl: pollUrl,
                    provider: provider,
                    method: method,
                    reference: paymentData.reference || 'SIM-' + Date.now(),
                    amount: paymentData.amount,
                    currency: currency,
                    amountDisplay: amountDisplay,
                    simulation: true
                };
                
                if (method === 'innbucks') {
                    const mockAuthCode = constants.PAYNOW_CONFIG.SIMULATION.authCodePrefix + Date.now().toString().slice(-8);
                    const mockExpires = new Date(Date.now() + 30*60000).toLocaleString();
                    const mockQrUrl = constants.PAYNOW_CONFIG.INNBUCKS.qrCodeUrlTemplate.replace('%s', mockAuthCode);
                    const mockDeepLink = constants.PAYNOW_CONFIG.INNBUCKS.deepLinkTemplate.replace('%s', mockAuthCode);
                    
                    instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.SIMULATION_INNBUCKS
                        .replace('%s', mockAuthCode)
                        .replace('%s', mockExpires)
                        .replace('%s', amountDisplay)
                        .replace('%s', mockDeepLink)
                        .replace('%s', mockQrUrl)
                        .replace('%s', paymentData.reference || 'SIM-' + Date.now());
                    
                    response.authorizationCode = mockAuthCode;
                    response.authorizationExpires = mockExpires;
                    response.qrCodeUrl = mockQrUrl;
                    response.deepLink = mockDeepLink;
                    
                } else {
                    // EcoCash simulation
                    instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.SIMULATION_ECOCASH
                        .replace('%s', paymentData.phone || 'N/A')
                        .replace('%s', amountDisplay)
                        .replace('%s', paymentData.reference || 'SIM-' + Date.now());
                    
                    response.phone = paymentData.phone;
                }
                
                response.instructions = instructions;
                return response;
            }
            
            return { 
                success: false, 
                error: error.message,
                provider: null,
                method: paymentData?.method,
                reference: paymentData?.reference
            };
        }
    }

    /**
     * Detect mobile money provider from phone number
     */
    detectMobileProvider(phone) {
        const digits = phone.replace(/\D/g, '');
        
        // Check EcoCash prefixes from constants
        const ecoCashPrefixes = constants.PAYNOW_CONFIG.PROVIDER_PREFIXES.ECOCASH;
        if (ecoCashPrefixes.local.some(p => digits.startsWith(p)) || 
            ecoCashPrefixes.international.some(p => digits.startsWith(p))) {
            return ecoCashPrefixes.name;
        }
        
        // Check OneMoney prefixes from constants
        const oneMoneyPrefixes = constants.PAYNOW_CONFIG.PROVIDER_PREFIXES.ONEMONEY;
        if (oneMoneyPrefixes.local.some(p => digits.startsWith(p)) || 
            oneMoneyPrefixes.international.some(p => digits.startsWith(p))) {
            return oneMoneyPrefixes.name;
        }
        
        return null;
    }
    
    /**
     * Check payment status via poll URL
     */
    async checkPaymentStatus(pollUrl) {
        try {
            console.log('🔍 Checking payment status...');
            if (!pollUrl) throw new Error('Poll URL required');
            
            const status = await this.paynow.pollTransaction(pollUrl);
            
            // Handle both SDK versions
            let isPaid = false;
            if (typeof status.paid === 'function') {
                isPaid = status.paid();      // New SDK
            } else if (typeof status.paid === 'boolean') {
                isPaid = status.paid;        // Old SDK
            } else if (status.status === 'paid') {
                isPaid = true;               // Fallback
            }
            
            return {
                paid: isPaid,
                status: isPaid ? 'paid' : (status.status || 'pending'),
                reference: status.reference,
                amount: status.amount,
                paynowref: status.paynowRef,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Status check error:', error.message);
            return {
                paid: false,
                status: 'error',
                error: error.message
            };
        }
    }
}

module.exports = new PayNowService();