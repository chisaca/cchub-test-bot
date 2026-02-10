// services/paynow.js - USING OFFICIAL PAYNOW SDK
const { Paynow } = require("paynow");

class PayNowService {
    constructor() {
        // Get credentials from environment
        this.integrationId = process.env.PAYNOW_ID || '23374';
        this.integrationKey = process.env.PAYNOW_KEY || '486538ea-63af-4400-a91b-8d9d1c67ccd3';
        this.resultUrl = process.env.PAYNOW_RESULT_URL;
        this.returnUrl = process.env.PAYNOW_RETURN_URL;
        
        console.log('💳 [PAYNOW] Initializing with SDK...');
        
        // Initialize PayNow SDK
        try {
            this.paynow = new Paynow(this.integrationId, this.integrationKey);
            
            // Set webhook URLs if provided
            if (this.resultUrl) {
                this.paynow.resultUrl = this.resultUrl;
            }
            
            if (this.returnUrl) {
                this.paynow.returnUrl = this.returnUrl;
            }
            
            console.log('✅ PayNow SDK initialized successfully');
            console.log('   Integration ID:', this.integrationId);
            console.log('   Result URL:', this.resultUrl || 'Not set');
            console.log('   Return URL:', this.returnUrl || 'Not set');
            
        } catch (error) {
            console.error('❌ Failed to initialize PayNow SDK:', error.message);
            throw error;
        }
    }
    
    /**
     * Initiate QuickPay (Mobile Money) payment
     * Uses official SDK's sendMobile method
     */
    async initiateQuickPay(paymentData) {
        console.log('💳 [PAYNOW-SDK] Initiating QuickPay payment...');
        console.log('📋 Payment data:', JSON.stringify(paymentData, null, 2));
        
        try {
            const { amount, reference, phone, service, customer } = paymentData;
            
            // Validate required parameters
            if (!amount || isNaN(amount)) {
                throw new Error('Invalid or missing amount');
            }
            
            if (!reference) {
                throw new Error('Reference is required');
            }
            
            if (!phone) {
                throw new Error('Phone number is required');
            }
            
            // Format phone number
            let formattedPhone = phone.toString().trim();
            formattedPhone = formattedPhone.replace(/\D/g, '');
            
            // Determine mobile money provider based on phone number
            const provider = this.detectMobileProvider(formattedPhone);
            
            if (!provider) {
                throw new Error(`Could not detect mobile money provider for phone: ${formattedPhone}`);
            }
            
            console.log(`📱 Detected provider: ${provider} for phone: ${formattedPhone}`);
            
            // Format amount (PayNow expects decimal with 2 places)
            const formattedAmount = parseFloat(amount).toFixed(2);
            
            // Get email from customer data or generate from phone
            const email = customer?.email || `${formattedPhone}@cchub.co.zw`;
            
            // Create payment using SDK
            const payment = this.paynow.createPayment(reference, email);
            
            // Add the airtime as an item
            const itemName = service || 'Airtime Purchase';
            payment.add(itemName, parseFloat(formattedAmount));
            
            // Send mobile payment request
            console.log(`📤 Sending mobile payment via ${provider} to ${formattedPhone}...`);
            
            const response = await this.paynow.sendMobile(
                payment,
                formattedPhone,
                provider.toLowerCase() // SDK expects lowercase: 'ecocash' or 'onemoney'
            );
            
            console.log('📥 [PAYNOW-SDK] Response received:', {
                success: response.success,
                error: response.error,
                hasInstructions: !!response.instructions,
                hasPollUrl: !!response.pollUrl
            });
            
            // Check if request was successful
            if (!response.success) {
                const errorMsg = response.error || 'Unknown error from PayNow';
                console.error('❌ PayNow SDK error:', errorMsg);
                throw new Error(`PayNow Error: ${errorMsg}`);
            }
            
            // Extract important information
            const instructions = response.instructions || 'Check your mobile money for payment prompt';
            const pollUrl = response.pollUrl;
            
            if (!pollUrl) {
                console.warn('⚠️ No poll URL in response');
            }
            
            console.log('✅ [PAYNOW-SDK] Mobile payment initiated successfully');
            console.log('   Instructions:', instructions.substring(0, 100) + '...');
            console.log('   Poll URL:', pollUrl);
            
            return {
                success: true,
                pollUrl: pollUrl,
                instructions: instructions,
                provider: provider,
                reference: reference,
                amount: formattedAmount,
                phone: formattedPhone
            };
            
        } catch (error) {
            console.error('❌ [PAYNOW-SDK] QuickPay error:', error.message);
            console.error('❌ Stack trace:', error.stack);
            
            // Provide user-friendly error message
            let userMessage = error.message;
            
            if (error.message.includes('Invalid integration')) {
                userMessage = 'PayNow integration credentials are invalid. Please check your Integration ID and Key.';
            } else if (error.message.includes('mobile money method')) {
                userMessage = 'Unsupported mobile money provider. Currently supports EcoCash and OneMoney only.';
            } else if (error.message.includes('phone number')) {
                userMessage = 'Invalid phone number format. Please use 077, 078, or 071 prefixes.';
            }
            
            return {
                success: false,
                error: userMessage,
                technicalError: error.message
            };
        }
    }
    
    /**
     * Detect mobile money provider from phone number
     */
    detectMobileProvider(phone) {
        // Clean phone number
        const cleanPhone = phone.toString().replace(/\D/g, '');
        
        // Check prefixes
        if (cleanPhone.startsWith('26377') || cleanPhone.startsWith('26378') || 
            cleanPhone.startsWith('077') || cleanPhone.startsWith('078') ||
            cleanPhone.startsWith('77') || cleanPhone.startsWith('78')) {
            return 'ecocash'; // EcoCash uses Econet numbers
        }
        
        if (cleanPhone.startsWith('26371') || cleanPhone.startsWith('071') || 
            cleanPhone.startsWith('71')) {
            return 'onemoney'; // OneMoney uses NetOne numbers
        }
        
        // Telecel (073) is not supported by PayNow QuickPay yet
        if (cleanPhone.startsWith('26373') || cleanPhone.startsWith('073') || 
            cleanPhone.startsWith('73')) {
            console.warn('⚠️ Telecel is not supported by PayNow QuickPay');
            return null;
        }
        
        return null;
    }
    
    /**
     * Check payment status using poll URL
     */
    async checkPaymentStatus(pollUrl) {
        try {
            console.log('🔍 [PAYNOW-SDK] Checking payment status:', pollUrl);
            
            if (!pollUrl) {
                throw new Error('Poll URL is required');
            }
            
            // Use SDK's pollTransaction method
            const status = await this.paynow.pollTransaction(pollUrl);
            
            console.log('📊 [PAYNOW-SDK] Status check result:', {
                paid: status.paid(),
                status: status.status,
                reference: status.reference,
                amount: status.amount
            });
            
            if (status.paid()) {
                return {
                    paid: true,
                    status: 'paid',
                    reference: status.reference,
                    amount: status.amount,
                    paynowref: status.paynowRef,
                    timestamp: new Date().toISOString()
                };
            } else {
                return {
                    paid: false,
                    status: status.status || 'pending',
                    reference: status.reference,
                    error: status.error
                };
            }
            
        } catch (error) {
            console.error('❌ [PAYNOW-SDK] Status check error:', error.message);
            return {
                paid: false,
                status: 'error',
                error: error.message
            };
        }
    }
    
    /**
     * Initiate web payment (for future use - bills, etc.)
     */
    async initiateWebPayment(paymentData) {
        try {
            const { amount, reference, description, email } = paymentData;
            
            const payment = this.paynow.createPayment(reference, email);
            payment.add(description, parseFloat(amount));
            
            const response = await this.paynow.send(payment);
            
            if (!response.success) {
                throw new Error(response.error || 'Web payment failed');
            }
            
            return {
                success: true,
                redirectUrl: response.redirectUrl,
                pollUrl: response.pollUrl,
                instructions: response.instructions,
                reference: reference
            };
            
        } catch (error) {
            console.error('❌ Web payment error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create singleton instance
module.exports = new PayNowService();