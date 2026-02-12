// services/paynow.js - PRODUCTION READY ✅
const { Paynow } = require("paynow");

class PayNowService {
    constructor() {
        // Get credentials from environment
        this.integrationId = process.env.PAYNOW_ID || '23374';
        this.integrationKey = process.env.PAYNOW_KEY || '486538ea-63af-4400-a91b-8d9d1c67ccd3';
        this.merchantEmail = 'cchisango@cchub.co.zw';
        
        console.log('💳 [PAYNOW] Initializing with SDK for MOBILE PAYMENTS ONLY...');
        
        try {
            this.paynow = new Paynow(this.integrationId, this.integrationKey);
            
            // ✅ FIX 1: Set valid placeholder URLs (REQUIRED by SDK)
            this.paynow.resultUrl = 'https://cchub.co.zw/paynow/result';
            this.paynow.returnUrl = 'https://cchub.co.zw/paynow/return';
            
            console.log('✅ PayNow SDK initialized successfully');
            console.log('   Integration ID:', this.integrationId);
            console.log('   Merchant Email:', this.merchantEmail);
            console.log('   Result URL:', this.paynow.resultUrl);
            console.log('   Return URL:', this.paynow.returnUrl);
            
        } catch (error) {
            console.error('❌ Failed to initialize PayNow SDK:', error.message);
            throw error;
        }
    }
    
    async initiateQuickPay(paymentData) {
        console.log('💳 [PAYNOW-SDK] Initiating QuickPay payment...');
        
        try {
            const { amount, reference, phone, service } = paymentData;
            
            if (!amount || isNaN(amount)) throw new Error('Invalid or missing amount');
            if (!reference) throw new Error('Reference is required');
            if (!phone) throw new Error('Phone number is required');
            
            // Format phone number
            let formattedPhone = phone.toString().trim().replace(/\D/g, '');
            
            // ✅ FIX 2: Convert to LOCAL format (077...) for PayNow
            if (formattedPhone.startsWith('263')) {
                formattedPhone = '0' + formattedPhone.substring(3);
            }
            
            const provider = this.detectMobileProvider(formattedPhone);
            if (!provider) {
                throw new Error(`Could not detect mobile money provider for phone: ${formattedPhone}`);
            }
            
            console.log(`📱 Provider: ${provider} for phone: ${formattedPhone}`);
            
            const formattedAmount = parseFloat(amount).toFixed(2);
            const email = this.merchantEmail;
            
            // Create payment
            const payment = this.paynow.createPayment(reference, email);
            payment.add(service || 'Airtime Purchase', parseFloat(formattedAmount));
            
            // ✅ FIX 3: Use existing instance (not creating new one)
            console.log(`📤 Sending mobile payment via ${provider}...`);
            
            const response = await this.paynow.sendMobile(
                payment,
                formattedPhone,  // Now in 077... format
                provider.toLowerCase()
            );
            
            if (!response) throw new Error('No response from PayNow');
            if (response.error) throw new Error(response.error);
            
            console.log('📥 Response received:', response);
            
            return {
                success: true,
                pollUrl: response.pollUrl,
                instructions: response.instructions || `Check your ${provider} wallet on your phone and enter PIN to pay $${formattedAmount}`,
                provider: provider,
                reference: reference,
                amount: formattedAmount,
                phone: formattedPhone
            };
            
        } catch (error) {
            console.error('❌ QuickPay error:', error.message);
            
            // Simulation fallback (only when enabled)
            if (process.env.NODE_ENV !== 'production') {
                console.log('⚠️ Using simulation fallback');
                return {
                    success: true,
                    pollUrl: `https://cchub.co.zw/paynow/simulate/${Date.now()}`,
                    instructions: `🔴 SIMULATION: Pay $${paymentData.amount} to CCHub (Ref: ${paymentData.reference})`,
                    provider: 'ecocash',
                    reference: paymentData.reference || 'SIM-' + Date.now(),
                    amount: paymentData.amount,
                    phone: paymentData.phone,
                    simulation: true
                };
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    detectMobileProvider(phone) {
        const cleanPhone = phone.toString().replace(/\D/g, '');
        
        // ✅ Check local format FIRST (077...)
        if (cleanPhone.startsWith('077') || cleanPhone.startsWith('078')) {
            return 'ecocash';
        }
        if (cleanPhone.startsWith('071')) {
            return 'onemoney';
        }
        
        // Fallback for international format
        if (cleanPhone.startsWith('26377') || cleanPhone.startsWith('26378')) {
            return 'ecocash';
        }
        if (cleanPhone.startsWith('26371')) {
            return 'onemoney';
        }
        
        return null;
    }
    
        /**
 * Check payment status
 * @param {string} pollUrl - Poll URL from PayNow response
 * @returns {Promise<Object>} Payment status
 */
        async checkPaymentStatus(pollUrl) {
        try {
            console.log('🔍 Checking payment status:', pollUrl);
            
            if (!pollUrl) throw new Error('Poll URL is required');
            
            // ✅ FIX: Use 'status' as variable name (matches documentation)
            const status = await this.paynow.pollTransaction(pollUrl);
            
            console.log('📊 PayNow response received');
            
            // ✅ FIX: Call paid() method on status object
            const isPaid = status.paid();
            
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