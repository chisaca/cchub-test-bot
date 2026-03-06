// services/paynow.js
// ============================================================================
// PAYNOW PAYMENT GATEWAY SERVICE
// Handles all payment processing through PayNow with support for 8 payment methods
// 
// Features:
// - Dual currency support (USD and ZiG with separate credentials)
// - All 8 payment methods fully integrated
// - Token management for Zimswitch recurring payments
// - Mobile money (EcoCash, OneMoney) USSD push
// - InnBucks with QR codes and deep links
// - Zimswitch with card tokenization
// - Simulation mode for development
// ============================================================================

const { Paynow } = require("paynow");
const constants = require('../config/constants');

class PayNowService {
    constructor() {
        // ========================================================================
        // INITIALIZE CREDENTIALS
        // Separate credentials for USD and ZiG currencies
        // ========================================================================
        this.usdIntegrationId = process.env.PAYNOW_ID || '23374';
        this.usdIntegrationKey = process.env.PAYNOW_KEY || '486538ea-63af-4400-a91b-8d9d1c67ccd3';
        
        this.zigIntegrationId = process.env.PAYNOW_ID_ZIG || '23556';
        this.zigIntegrationKey = process.env.PAYNOW_KEY_ZIG || '55213442-3155-49b9-8bb4-4d4acfce9c6c';
        
        this.merchantEmail = constants.MERCHANT_CONFIG.EMAIL;
        
        // ========================================================================
        // TOKEN STORAGE
        // In-memory store for Zimswitch tokens (in production, use database)
        // Format: phone -> { token, expiry, last4 }
        // ========================================================================
        this.tokenStore = new Map();
        
        console.log('💳 [PAYNOW] Initializing SDK with dual currency support...');
        console.log(`   USD ID: ${this.usdIntegrationId}`);
        console.log(`   ZiG ID: ${this.zigIntegrationId}`);
        
        try {
            // Initialize both PayNow instances (USD and ZiG)
            this.paynowUsd = new Paynow(this.usdIntegrationId, this.usdIntegrationKey);
            this.paynowZig = new Paynow(this.zigIntegrationId, this.zigIntegrationKey);
            
            // Set callback URLs from constants
            const resultUrl = constants.MERCHANT_CONFIG.RESULT_URL;
            const returnUrl = constants.MERCHANT_CONFIG.RETURN_URL;
            
            this.paynowUsd.resultUrl = resultUrl;
            this.paynowUsd.returnUrl = returnUrl;
            
            this.paynowZig.resultUrl = resultUrl;
            this.paynowZig.returnUrl = returnUrl;
            
            console.log('✅ [PAYNOW] SDK initialized with dual currency support');
            
        } catch (error) {
            console.error('❌ [PAYNOW] Init failed:', error.message);
            throw error;
        }
    }
    
    // ============================================================================
    // CORE UTILITIES
    // ============================================================================
    
    /**
     * Get appropriate PayNow instance based on currency
     * 
     * @param {string} currency - Currency ('USD' or 'ZiG')
     * @returns {Object} PayNow instance for the specified currency
     */
    getPaynowInstance(currency) {
        return currency?.toLowerCase() === 'zig' ? this.paynowZig : this.paynowUsd;
    }
    
    /**
     * Format amount with currency symbol for display
     * 
     * @param {number} amount - Amount to format
     * @param {string} currency - Currency ('USD' or 'ZiG')
     * @returns {string} Formatted amount with symbol
     */
    formatAmountWithCurrency(amount, currency = 'USD') {
        const numAmount = parseFloat(amount).toFixed(2);
        if (currency.toUpperCase() === 'USD') {
            return `$${numAmount}`;
        } else {
            return `${numAmount} ZiG`;
        }
    }
    
    // ============================================================================
    // TOKEN MANAGEMENT (Zimswitch Recurring Payments)
    // ============================================================================
    
    /**
     * Store a Zimswitch token for a user
     * 
     * @param {string} phone - User's phone number
     * @param {string} token - Token value
     * @param {string} expiry - Token expiry date (DDMMMYYYY)
     * @param {string} last4 - Last 4 digits of card
     */
    storeUserToken(phone, token, expiry, last4) {
        if (!phone || !token) return;
        this.tokenStore.set(phone, {
            token: token,
            expiry: expiry,
            last4: last4,
            timestamp: new Date().toISOString()
        });
        console.log(`✅ [PAYNOW] Token stored for ${phone} (${last4})`);
    }
    
    /**
     * Get stored token for a user if not expired
     * 
     * @param {string} phone - User's phone number
     * @returns {Object|null} Token data or null if not found/expired
     */
    getUserToken(phone) {
        if (!phone) return null;
        const tokenData = this.tokenStore.get(phone);
        
        // Check if token exists and not expired
        if (tokenData && tokenData.expiry) {
            const expiryDate = this.parseTokenExpiry(tokenData.expiry);
            if (expiryDate && expiryDate > new Date()) {
                return tokenData;
            }
            console.log(`⚠️ [PAYNOW] Token expired for ${phone}`);
            this.tokenStore.delete(phone);
        }
        return null;
    }
    
    /**
     * Parse token expiry from DDMMMYYYY format
     * Example: 30APR2019 → Date object
     * 
     * @param {string} expiryStr - Expiry string in DDMMMYYYY format
     * @returns {Date|null} Parsed date or null if invalid
     */
    parseTokenExpiry(expiryStr) {
        if (!expiryStr) return null;
        try {
            const day = expiryStr.substring(0, 2);
            const month = expiryStr.substring(2, 5);
            const year = expiryStr.substring(5);
            return new Date(`${month} ${day}, ${year}`);
        } catch (e) {
            return null;
        }
    }
    
    /**
     * Get token status for a user (for UI display)
     * 
     * @param {string} phone - User's phone number
     * @returns {Object} Token status information
     */
    getUserTokenStatus(phone) {
        if (!phone) return { hasToken: false };
        
        const tokenData = this.getUserToken(phone);
        if (!tokenData) return { hasToken: false };
        
        return {
            hasToken: true,
            last4: tokenData.last4,
            expiry: tokenData.expiry,
            valid: true
        };
    }
    
    /**
     * Clear stored token for a user
     * 
     * @param {string} phone - User's phone number
     * @returns {boolean} True if token was cleared
     */
    clearUserToken(phone) {
        if (this.tokenStore.has(phone)) {
            this.tokenStore.delete(phone);
            console.log(`🗑️ [PAYNOW] Token cleared for ${phone}`);
            return true;
        }
        return false;
    }
    
    // ============================================================================
    // PROVIDER DETECTION
    // ============================================================================
    
    /**
     * Get provider display name based on method and currency
     * 
     * @param {string} method - Payment method
     * @param {string} currency - Currency
     * @returns {string} Provider display name
     */
    getProviderName(method, currency) {
        if (method === 'ecocash') {
            return currency?.toLowerCase() === 'zig' ? 'EcoCash ZiG' : 'EcoCash USD';
        } else if (method === 'zimswitch') {
            return currency?.toLowerCase() === 'zig' ? 'Zimswitch ZiG' : 'Zimswitch USD';
        }  else if (method === 'onemoney') {
            return 'OneMoney ZiG';
        } else if (method === 'innbucks') {
            return 'InnBucks USD';
        }
        return method;
    }
    
    /**
     * Detect mobile money provider from phone number
     * Validates that phone matches expected method's prefixes
     * 
     * @param {string} phone - Phone number
     * @param {string} expectedMethod - Expected payment method
     * @returns {string|null} Provider name if valid, null if invalid
     */
    detectMobileProvider(phone, expectedMethod) {
        const digits = phone.replace(/\D/g, '');
        
        const ecoCashPrefixes = constants.PAYNOW_CONFIG.PROVIDER_PREFIXES.ECOCASH;
        const isEcoCash = ecoCashPrefixes.local.some(p => digits.startsWith(p)) || 
                          ecoCashPrefixes.international.some(p => digits.startsWith(p));
        
        const oneMoneyPrefixes = constants.PAYNOW_CONFIG.PROVIDER_PREFIXES.ONEMONEY;
        const isOneMoney = oneMoneyPrefixes.local.some(p => digits.startsWith(p)) || 
                           oneMoneyPrefixes.international.some(p => digits.startsWith(p));
        
        
        if (expectedMethod === 'ecocash' && isEcoCash) return ecoCashPrefixes.name;
        if (expectedMethod === 'onemoney' && isOneMoney) return oneMoneyPrefixes.name;
        
        return null;
    }
    
    // ============================================================================
    // PAYMENT INITIATION
    // ============================================================================
    
    /**
     * Initiate a payment through PayNow
     * Routes to appropriate method handler based on payment method
     * 
     * @param {Object} paymentData - Payment details
     * @param {number} paymentData.amount - Payment amount
     * @param {string} paymentData.reference - Unique reference
     * @param {string} paymentData.phone - Phone number (for mobile money)
     * @param {string} paymentData.method - Payment method (ecocash, zimswitch, etc.)
     * @param {string} paymentData.paymentMethodCode - Method code from constants
     * @param {string} paymentData.service - Service description
     * @param {string} paymentData.currency - Currency (USD or ZiG)
     * @param {boolean} paymentData.useToken - Whether to use stored token for Zimswitch
     * @returns {Promise<Object>} Payment initiation result
     */
    async initiateQuickPay(paymentData) {
        console.log('💳 [PAYNOW] Initiating mobile payment...');
        
        try {
            const { amount, reference, phone, method, paymentMethodCode, service, currency = 'USD', useToken } = paymentData;
            
            // ========================================================================
            // VALIDATION
            // ========================================================================
            if (!amount || isNaN(amount)) throw new Error('Invalid amount');
            if (!reference) throw new Error('Reference required');
            if (!method) throw new Error('Payment method required');
            
            const mobileMoneyMethods = ['ecocash', 'onemoney'];
            
            // Phone required for mobile money methods only
            if (mobileMoneyMethods.includes(method) && !phone) {
                throw new Error(`Phone required for ${method}`);
            }
            
            // Get appropriate PayNow instance based on currency
            const paynowInstance = this.getPaynowInstance(currency);
            
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
            
            console.log(`📱 [PAYNOW] Provider: ${provider} | Method: ${method} | Currency: ${currency}`);
            console.log(`   Phone: ${formattedPhone || 'N/A'} | Amount: ${amount} ${currency}`);
            
            const formattedAmount = parseFloat(amount).toFixed(2);
            const amountDisplay = this.formatAmountWithCurrency(amount, currency);
            
            // Create payment
            const payment = paynowInstance.createPayment(reference, this.merchantEmail);
            payment.add(service || 'Payment', parseFloat(formattedAmount));
            
            let response;
            
            // ========================================================================
            // PAYMENT METHOD HANDLING
            // ========================================================================
            
            // InnBucks - USD only
            if (method === 'innbucks') {
                response = await this.handleInnBucksPayment(paynowInstance, payment, amountDisplay, reference);
            }
            
            // Zimswitch - ZiG or USD (with token support)
            else if (method === 'zimswitch') {
                const tokenData = useToken && phone ? this.getUserToken(phone) : null;
                
                if (tokenData) {
                    console.log(`🔑 [PAYNOW] Using stored token for ${phone} (${tokenData.last4})`);
                    response = await this.handleZimswitchTokenPayment(
                        paynowInstance, payment, amountDisplay, reference, 
                        currency, tokenData.token
                    );
                } else {
                    response = await this.handleZimswitchPayment(
                        paynowInstance, payment, amountDisplay, reference, currency
                    );
                }
            }
            
            // Mobile Money (EcoCash, OneMoney)
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
            
            console.log('📥 [PAYNOW] Response received from PayNow');
            
            // Store token if returned in response (for future use)
            if (response.token && phone) {
                this.storeUserToken(phone, response.token, response.tokenExpiry, response.last4 || '****');
            }
            
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
                authorizationCode: response.authorizationCode,
                authorizationExpires: response.authorizationExpires,
                qrCodeUrl: response.qrCodeUrl,
                deepLink: response.deepLink,
                merchantCode: response.merchantCode,
                token: response.token,
                tokenExpiry: response.tokenExpiry,
                last4: response.last4,
                tokenized: !!response.token
            };
            
        } catch (error) {
            console.error('❌ [PAYNOW] Error:', error.message);
            
            // ========================================================================
            // SIMULATION MODE (for development)
            // ========================================================================
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
    
    // ============================================================================
    // METHOD-SPECIFIC HANDLERS
    // ============================================================================
    
    /**
     * Handle InnBucks payment (USD only)
     * Generates QR code and deep link for InnBucks app
     */
    async handleInnBucksPayment(paynowInstance, payment, amountDisplay, reference) {
        const webResponse = await paynowInstance.send(payment, 'innbucks');
        
        if (!webResponse) throw new Error('No response from PayNow');
        if (webResponse.error) throw new Error(webResponse.error);
        
        const authCode = webResponse.authorizationcode;
        const authExpires = webResponse.authorizationexpires;
        
        const qrCodeUrl = constants.PAYNOW_CONFIG.INNBUCKS.qrCodeUrlTemplate.replace('%s', authCode);
        const deepLink = constants.PAYNOW_CONFIG.INNBUCKS.deepLinkTemplate.replace('%s', authCode);
        
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
     * Handle Zimswitch payment (first time / no token)
     * This is a redirect flow where user enters card details
     */
    async handleZimswitchPayment(paynowInstance, payment, amountDisplay, reference, currency) {
        const webResponse = await paynowInstance.send(payment, 'zimswitch');
        
        if (!webResponse) throw new Error('No response from PayNow');
        if (webResponse.error) throw new Error(webResponse.error);
        
        const merchantCode = constants.MERCHANT_CONFIG.ZIMSWITCH_MERCHANT_CODE;
        
        const instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ZIMSWITCH
            .replace('%s', merchantCode)
            .replace('%s', amountDisplay)
            .replace('%s', reference)
            .replace('%s', webResponse.browserUrl || webResponse.redirectUrl);
        
        return {
            pollUrl: webResponse.pollUrl,
            browserUrl: webResponse.browserUrl || webResponse.redirectUrl,
            merchantCode: merchantCode,
            instructions: instructions,
            requiresRedirect: true
        };
    }
    
    /**
     * Handle Zimswitch payment with token (recurring / one-click)
     * Processes immediately without redirect
     */
    async handleZimswitchTokenPayment(paynowInstance, payment, amountDisplay, reference, currency, token) {
        const merchantTrace = `ZIM${Date.now()}${Math.floor(Math.random()*1000)}`.substring(0, 32);
        
        try {
            const webResponse = await paynowInstance.send(payment, 'zimswitch', {
                token: token,
                merchanttrace: merchantTrace
            });
            
            if (!webResponse) throw new Error('No response from PayNow');
            if (webResponse.error) throw new Error(webResponse.error);
            
            const newToken = webResponse.token;
            const newTokenExpiry = webResponse.tokenexpiry;
            
            let last4 = null;
            if (webResponse.paymentinstrument) {
                const match = webResponse.paymentinstrument.match(/\d{4}$/);
                if (match) last4 = match[0];
            }
            
            const instructions = `💳 *Zimswitch Payment Processed*\n\n` +
                `Amount: ${amountDisplay}\n` +
                `Reference: ${reference}\n\n` +
                `✅ Payment completed successfully using stored card.`;
            
            return {
                pollUrl: webResponse.pollUrl,
                instructions: instructions,
                token: newToken,
                tokenExpiry: newTokenExpiry,
                last4: last4,
                requiresRedirect: false
            };
            
        } catch (error) {
            console.error('❌ [PAYNOW] Token payment failed:', error.message);
            console.log('⚠️ [PAYNOW] Falling back to standard Zimswitch payment');
            return this.handleZimswitchPayment(paynowInstance, payment, amountDisplay, reference, currency);
        }
    }
    
    /**
     * Handle mobile money payment (EcoCash, OneMoney)
     * Uses USSD push - no dialing required
     */
    async handleMobileMoneyPayment(paynowInstance, payment, phone, method, amountDisplay, reference, provider) {
        const response = await paynowInstance.sendMobile(payment, phone, method);
        
        if (!response) throw new Error('No response from PayNow');
        if (response.error) throw new Error(response.error);
        
        let template;
        switch(method) {
            case 'ecocash':
                template = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ECOCASH;
                break;
            case 'onemoney':
                template = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ONEMONEY;
                break;
            default:
                template = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ECOCASH;
        }
        
        const instructions = template
            .replace('%s', phone)
            .replace('%s', amountDisplay)
            .replace('%s', reference);
        
        response.instructions = instructions;
        
        return response;
    }
    
    // ============================================================================
    // SIMULATION MODE (Development Only)
    // ============================================================================
    
    /**
     * Handle simulation mode for development/testing
     * Provides mock responses without actual payment processing
     */
    handleSimulationMode(paymentData) {
        console.log('⚠️ [PAYNOW] Using simulation fallback');
        
        const { method = 'ecocash', currency = 'USD', amount, reference: ref, phone, useToken } = paymentData;
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
            
        } else if (method === 'zimswitch') {
            const merchantCode = constants.MERCHANT_CONFIG.ZIMSWITCH_MERCHANT_CODE;
            
            if (useToken) {
                const mockToken = 'SIM-TOKEN-' + Date.now().toString().slice(-12);
                const mockExpiry = '30DEC2025';
                const mockLast4 = '1234';
                
                instructions = `💳 *SIMULATION: Zimswitch (Token)*\n\n` +
                    `Amount: ${amountDisplay}\n` +
                    `Reference: ${simReference}\n\n` +
                    `✅ Token payment would be processed automatically.`;
                
                response.token = mockToken;
                response.tokenExpiry = mockExpiry;
                response.last4 = mockLast4;
                response.tokenized = true;
                response.requiresRedirect = false;
            } else {
                const mockBrowserUrl = 'https://paynow.co.zw/simulate/' + Date.now();
                
                instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.ZIMSWITCH
                    .replace('%s', merchantCode)
                    .replace('%s', amountDisplay)
                    .replace('%s', simReference)
                    .replace('%s', mockBrowserUrl);
                
                response.merchantCode = merchantCode;
                response.browserUrl = mockBrowserUrl;
                response.requiresRedirect = true;
            }
        } else {
            instructions = constants.PAYNOW_CONFIG.INSTRUCTION_TEMPLATES.SIMULATION_ECOCASH
                .replace('%s', phone || 'N/A')
                .replace('%s', amountDisplay)
                .replace('%s', simReference);
            
            response.phone = phone;
        }
        
        response.instructions = instructions;
        return response;
    }
    
    // ============================================================================
    // PAYMENT STATUS CHECKING
    // ============================================================================
    
    /**
     * Check payment status via poll URL
     * 
     * @param {string} pollUrl - Poll URL from PayNow response
     * @returns {Promise<Object>} Payment status
     */
    async checkPaymentStatus(pollUrl) {
        try {
            console.log('🔍 [PAYNOW] Checking payment status...');
            if (!pollUrl) throw new Error('Poll URL required');
            
            // Try USD instance first, fall back to ZiG
            let status;
            try {
                status = await this.paynowUsd.pollTransaction(pollUrl);
            } catch (error) {
                status = await this.paynowZig.pollTransaction(pollUrl);
            }
            
            let isPaid = false;
            if (typeof status.paid === 'function') {
                isPaid = status.paid();      // New SDK
            } else if (typeof status.paid === 'boolean') {
                isPaid = status.paid;        // Old SDK
            } else if (status.status === 'paid') {
                isPaid = true;               // Fallback
            }
            
            const token = status.token;
            const tokenExpiry = status.tokenexpiry;
            
            let last4 = null;
            if (status.paymentinstrument) {
                const match = status.paymentinstrument.match(/\d{4}$/);
                if (match) last4 = match[0];
            }
            
            return {
                paid: isPaid,
                status: isPaid ? 'paid' : (status.status || 'pending'),
                reference: status.reference,
                amount: status.amount,
                paynowref: status.paynowRef,
                token: token,
                tokenExpiry: tokenExpiry,
                last4: last4,
                paymentinstrument: status.paymentinstrument,
                paymentchannel: status.paymentchannel,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ [PAYNOW] Status check error:', error.message);
            return {
                paid: false,
                status: 'error',
                error: error.message
            };
        }
    }
}

// Export singleton instance
module.exports = new PayNowService();