// services/paynow.js - PRODUCTION READY
// UPDATED: Supports both USD and ZiG currencies with separate credentials
// UPDATED: All payment methods supported (EcoCash, Zimswitch, PayGo, OneMoney, InnBucks)

const { Paynow } = require("paynow");
const constants = require('../config/constants');

class PayNowService {
    constructor() {
        // Credentials from environment
        this.usdIntegrationId = process.env.PAYNOW_ID || '23374';
        this.usdIntegrationKey = process.env.PAYNOW_KEY || '486538ea-63af-4400-a91b-8d9d1c67ccd3';
        
        this.zigIntegrationId = process.env.PAYNOW_ID_ZIG || '23556';
        this.zigIntegrationKey = process.env.PAYNOW_KEY_ZIG || '55213442-3155-49b9-8bb4-4d4acfce9c6c';
        
        this.merchantEmail = constants.MERCHANT_CONFIG.EMAIL;
        
        console.log('💳 [PAYNOW] Initializing SDK with dual currency support...');
        console.log(`   USD ID: ${this.usdIntegrationId}`);
        console.log(`   ZiG ID: ${this.zigIntegrationId}`);
        
        try {
            // Initialize both instances
            this.paynowUsd = new Paynow(this.usdIntegrationId, this.usdIntegrationKey);
            this.paynowZig = new Paynow(this.zigIntegrationId, this.zigIntegrationKey);
            
            // Required placeholder URLs from constants
            const resultUrl = constants.MERCHANT_CONFIG.RESULT_URL;
            const returnUrl = constants.MERCHANT_CONFIG.RETURN_URL;
            
            this.paynowUsd.resultUrl = resultUrl;
            this.paynowUsd.returnUrl = returnUrl;
            
            this.paynowZig.resultUrl = resultUrl;
            this.paynowZig.returnUrl = returnUrl;
            
            console.log('✅ PayNow SDK initialized with dual currency support');
            
        } catch (error) {
            console.error('❌ PayNow init failed:', error.message);
            throw error;
        }
    }
    
    /**
     * Get appropriate PayNow instance based on currency
     */
    getPaynowInstance(currency) {
        return currency?.toLowerCase() === 'zig' ? this.paynowZig : this.paynowUsd;
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
            const { amount, reference, phone, method, paymentMethodCode, service, currency = 'USD' } = paymentData;
            
            if (!amount || isNaN(amount)) throw new Error('Invalid amount');
            if (!reference) throw new Error('Reference required');
            if (!method) throw new Error('Payment method required');
            
            // Get appropriate PayNow instance based on currency
            const paynowInstance = this.getPaynowInstance(currency);
            
            // Phone required for mobile money methods only
            const mobileMoneyMethods = ['ecocash', 'onemoney', 'paygo'];
            if (mobileMoneyMethods.includes(method) && !phone) {
                throw new Error(`Phone required for ${method}`);
            }
            
            // Format phone for mobile money
            let formattedPhone = null;
            let provider = this.getProviderName(method, currency);
            
            if (mobileMoneyMethods.includes(method)) {
                formattedPhone = phone.toString().replace(/\D/g, '');
                if (formattedPhone.startsWith('263')) {
                    formattedPhone = '0' + formattedPhone.substring(3);
                }
                
                // Validate provider
                const detectedProvider = this.detectMobileProvider(formattedPhone, method);
                if (!detectedProvider) {
                    throw new Error(`Invalid phone number for ${method}`);
                }
            }
            
            console.log(`📱 Provider: ${provider} | Method: ${method} | Currency: ${currency}`);
            console.log(`   Phone: ${formattedPhone || 'N/A'} | Amount: ${amount} ${currency}`);
            
            const formattedAmount = parseFloat(amount).toFixed(2);
            const amountDisplay = this.formatAmountWithCurrency(amount, currency);
            
            // Create payment
            const payment = paynowInstance.createPayment(reference, this.merchantEmail);
            payment.add(service || 'Payment', parseFloat(formattedAmount));
            
            let response;
            
            // ==================== PAYMENT METHOD HANDLING ====================
            
            // InnBucks - USD only
            if (method === 'innbucks') {
                response = await this.handleInnBucksPayment(paynowInstance, payment, amountDisplay, reference);
            }
            
            // Zimswitch - ZiG or USD
            else if (method === 'zimswitch') {
                response = await this.handleZimswitchPayment(paynowInstance, payment, amountDisplay, reference, currency);
            }
            
            // Mobile Money (EcoCash, OneMoney, PayGo)
            else if (mobileMoneyMethods.includes(method)) {
                response = await this.handleMobileMoneyPayment(
                    paynowInstance, payment, formattedPhone, method, 
                    amountDisplay, reference, provider
                );
            }
            
            // Unknown method
            else {
                throw new Error(`Unsupported payment method: ${method}`);
            }
            
            console.log('📥 Response received from PayNow');
            
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
                // Provider-specific fields
                authorizationCode: response.authorizationCode,
                authorizationExpires: response.authorizationExpires,
                qrCodeUrl: response.qrCodeUrl,
                deepLink: response.deepLink,
                merchantCode: response.merchantCode
            };
            
        } catch (error) {
            console.error('❌ PayNow error:', error.message);
            
            // ==================== SIMULATION MODE ====================
            if (process.env.NODE_ENV !== 'production') {
                return this.handleSimulationMode(paymentData);
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
     * Handle InnBucks payment
     */
    async handleInnBucksPayment(paynowInstance, payment, amountDisplay, reference) {
        const webResponse = await paynowInstance.send(payment, 'innbucks');
        
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
        
        return {
            pollUrl: webResponse.pollUrl,
            authorizationCode: authCode,
            authorizationExpires: authExpires,
            qrCodeUrl: qrCodeUrl,
            deepLink: deepLink,
            instructions: instructions
        };
    }
    
    /**
     * Handle Zimswitch payment
     */
    async handleZimswitchPayment(paynowInstance, payment, amountDisplay, reference, currency) {
        // Zimswitch uses standard PayNow with method=zimswitch
        const webResponse = await paynowInstance.send(payment, 'zimswitch');
        
        if (!webResponse) throw new Error('No response from PayNow');
        if (webResponse.error) throw new Error(webResponse.error);
        
        const merchantCode = constants.MERCHANT_CONFIG.ZIMSWITCH_MERCHANT_CODE;
        
        // Build instructions using template from constants
        const instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ZIMSWITCH
            .replace('%s', merchantCode)
            .replace('%s', amountDisplay)
            .replace('%s', reference);
        
        return {
            pollUrl: webResponse.pollUrl,
            merchantCode: merchantCode,
            instructions: instructions
        };
    }
    
    /**
     * Handle mobile money payment (EcoCash, OneMoney, PayGo)
     */
    async handleMobileMoneyPayment(paynowInstance, payment, phone, method, amountDisplay, reference, provider) {
        // Mobile money uses USSD push - NO DIALING REQUIRED
        const response = await paynowInstance.sendMobile(
            payment,
            phone,
            method // 'ecocash', 'onemoney', or 'paygo'
        );
        
        if (!response) throw new Error('No response from PayNow');
        if (response.error) throw new Error(response.error);
        
        // Get the appropriate instruction template
        let template;
        switch(method) {
            case 'ecocash':
                template = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ECOCASH;
                break;
            case 'onemoney':
                template = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ONEMONEY;
                break;
            case 'paygo':
                template = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.PAYGO;
                break;
            default:
                template = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ECOCASH;
        }
        
        // Build instructions
        const instructions = template
            .replace('%s', phone)
            .replace('%s', amountDisplay)
            .replace('%s', reference);
        
        response.instructions = instructions;
        
        return response;
    }
    
    /**
     * Get provider name based on method and currency
     */
    getProviderName(method, currency) {
        if (method === 'ecocash') {
            return currency?.toLowerCase() === 'zig' ? 'EcoCash ZiG' : 'EcoCash USD';
        } else if (method === 'zimswitch') {
            return currency?.toLowerCase() === 'zig' ? 'Zimswitch ZiG' : 'Zimswitch USD';
        } else if (method === 'paygo') {
            return currency?.toLowerCase() === 'zig' ? 'PayGo ZiG' : 'PayGo USD';
        } else if (method === 'onemoney') {
            return 'OneMoney ZiG';
        } else if (method === 'innbucks') {
            return 'InnBucks USD';
        }
        return method;
    }
    
    /**
     * Detect mobile money provider from phone number
     */
    detectMobileProvider(phone, expectedMethod) {
        const digits = phone.replace(/\D/g, '');
        
        // Check EcoCash prefixes from constants
        const ecoCashPrefixes = constants.PAYNOW_CONFIG.PROVIDER_PREFIXES.ECOCASH;
        const isEcoCash = ecoCashPrefixes.local.some(p => digits.startsWith(p)) || 
                          ecoCashPrefixes.international.some(p => digits.startsWith(p));
        
        // Check OneMoney prefixes from constants
        const oneMoneyPrefixes = constants.PAYNOW_CONFIG.PROVIDER_PREFIXES.ONEMONEY;
        const isOneMoney = oneMoneyPrefixes.local.some(p => digits.startsWith(p)) || 
                           oneMoneyPrefixes.international.some(p => digits.startsWith(p));
        
        // PayGo can use multiple prefixes
        const payGoPrefixes = constants.PAYNOW_CONFIG.PROVIDER_PREFIXES.PAYGO || {
            local: ['071', '077', '078'],
            international: ['26371', '26377', '26378']
        };
        const isPayGo = payGoPrefixes.local.some(p => digits.startsWith(p)) || 
                        payGoPrefixes.international.some(p => digits.startsWith(p));
        
        // Validate against expected method
        if (expectedMethod === 'ecocash' && isEcoCash) return ecoCashPrefixes.name;
        if (expectedMethod === 'onemoney' && isOneMoney) return oneMoneyPrefixes.name;
        if (expectedMethod === 'paygo' && isPayGo) return 'PayGo';
        
        return null;
    }
    
    /**
     * Handle simulation mode for development
     */
    handleSimulationMode(paymentData) {
        console.log('⚠️ Using simulation fallback');
        
        const { method = 'ecocash', currency = 'USD', amount, reference: ref, phone } = paymentData;
        const provider = this.getProviderName(method, currency);
        const amountDisplay = this.formatAmountWithCurrency(paymentData.amount, currency);
        const pollUrl = constants.PAYNOW_CONFIG.SIMULATION.pollUrlTemplate.replace('%s', Date.now());
        const simReference = ref || 'SIM-' + Date.now();
        
        let instructions;
        let response = {
            success: true,
            pollUrl: pollUrl,
            provider: provider,
            method: method,
            reference: simReference,
            amount: paymentData.amount,
            currency: currency,
            amountDisplay: amountDisplay,
            simulation: true
        };
        
        // Simulation for InnBucks
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
                .replace('%s', simReference);
            
            response.authorizationCode = mockAuthCode;
            response.authorizationExpires = mockExpires;
            response.qrCodeUrl = mockQrUrl;
            response.deepLink = mockDeepLink;
            
        }
        // Simulation for Zimswitch
        else if (method === 'zimswitch') {
            const merchantCode = constants.MERCHANT_CONFIG.ZIMSWITCH_MERCHANT_CODE;
            
            instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ZIMSWITCH
                .replace('%s', merchantCode)
                .replace('%s', amountDisplay)
                .replace('%s', simReference);
            
            response.merchantCode = merchantCode;
            
        }
        // Simulation for mobile money
        else {
            instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.SIMULATION_ECOCASH
                .replace('%s', phone || 'N/A')
                .replace('%s', amountDisplay)
                .replace('%s', simReference);
            
            response.phone = phone;
        }
        
        response.instructions = instructions;
        return response;
    }
    
    /**
     * Check payment status via poll URL
     */
    async checkPaymentStatus(pollUrl) {
        try {
            console.log('🔍 Checking payment status...');
            if (!pollUrl) throw new Error('Poll URL required');
            
            // Try both instances? Or determine from pollUrl
            // For now, try USD instance first, then ZiG if that fails
            let status;
            try {
                status = await this.paynowUsd.pollTransaction(pollUrl);
            } catch (error) {
                // If USD fails, try ZiG
                status = await this.paynowZig.pollTransaction(pollUrl);
            }
            
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
