// services/paynow.js - PRODUCTION READY
const { Paynow } = require("paynow");

class PayNowService {
    constructor() {
        // Credentials from environment
        this.integrationId = process.env.PAYNOW_ID || '23374';
        this.integrationKey = process.env.PAYNOW_KEY || '486538ea-63af-4400-a91b-8d9d1c67ccd3';
        this.merchantEmail = 'cchisango@cchub.co.zw';
        
        console.log('💳 [PAYNOW] Initializing SDK for mobile payments...');
        
        try {
            this.paynow = new Paynow(this.integrationId, this.integrationKey);
            
            // Required placeholder URLs (SDK requirement)
            this.paynow.resultUrl = 'https://cchub.co.zw/paynow/result';
            this.paynow.returnUrl = 'https://cchub.co.zw/paynow/return';
            
            console.log('✅ PayNow SDK initialized');
            console.log(`   ID: ${this.integrationId}`);
            console.log(`   Email: ${this.merchantEmail}`);
            
        } catch (error) {
            console.error('❌ PayNow init failed:', error.message);
            throw error;
        }
    }
    
    async initiateQuickPay(paymentData) {
        console.log('💳 [PAYNOW] Initiating mobile payment...');
        
        try {
            const { amount, reference, phone, service } = paymentData;
            
            if (!amount || isNaN(amount)) throw new Error('Invalid amount');
            if (!reference) throw new Error('Reference required');
            if (!phone) throw new Error('Phone required');
            
            // Format phone to local (077...)
            let formattedPhone = phone.toString().replace(/\D/g, '');
            if (formattedPhone.startsWith('263')) {
                formattedPhone = '0' + formattedPhone.substring(3);
            }
            
            const provider = this.detectMobileProvider(formattedPhone);
            if (!provider) {
                throw new Error(`No provider detected for ${formattedPhone}`);
            }
            
            console.log(`📱 ${provider} | ${formattedPhone}`);
            
            const formattedAmount = parseFloat(amount).toFixed(2);
            
            // Create and send payment
            const payment = this.paynow.createPayment(reference, this.merchantEmail);
            payment.add(service || 'Airtime', parseFloat(formattedAmount));
            
            const response = await this.paynow.sendMobile(
                payment,
                formattedPhone,
                provider.toLowerCase()
            );
            
            if (!response) throw new Error('No response from PayNow');
            if (response.error) throw new Error(response.error);
            
            console.log('📥 Response received');
            
            return {
                success: true,
                pollUrl: response.pollUrl,
                instructions: response.instructions || `Check ${provider} wallet & enter PIN to pay $${formattedAmount}`,
                provider,
                reference,
                amount: formattedAmount,
                phone: formattedPhone
            };
            
        } catch (error) {
            console.error('❌ PayNow error:', error.message);
            
            // Simulation mode for testing
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
            
            return { success: false, error: error.message };
        }
    }
    
    detectMobileProvider(phone) {
        const p = phone.toString().replace(/\D/g, '');
        
        if (p.startsWith('077') || p.startsWith('078') || 
            p.startsWith('26377') || p.startsWith('26378')) {
            return 'ecocash';
        }
        if (p.startsWith('071') || p.startsWith('26371')) {
            return 'onemoney';
        }
        return null;
    }
    
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