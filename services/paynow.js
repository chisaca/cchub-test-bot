// services/paynow.js - PRODUCTION READY
// UPDATED: Supports both USD and ZiG currencies

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
                provider = 'InnBucks';
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
                
                // Generate QR Code and deep link
                const qrCodeUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=schinn.wbpycode://innbucks.co.zw?pymInnCode=${authCode}`;
                const deepLink = `schinn.wbpycode://innbucks.co.zw?pymInnCode=${authCode}`;
                
                response = {
                    pollUrl: webResponse.pollUrl,
                    authorizationCode: authCode,
                    authorizationExpires: authExpires,
                    qrCodeUrl: qrCodeUrl,
                    deepLink: deepLink,
                    instructions: `💳 *InnBucks Payment*

🔑 *Authorization Code:* \`${authCode}\`
⏰ *Expires:* ${authExpires}
💰 *Amount:* ${amountDisplay}

📱 *Option 1: Mobile App*
Tap this link on your phone:
${deepLink}

📲 *Option 2: Scan QR Code*
${qrCodeUrl}

🔄 *Option 3: Manual*
1. Open InnBucks app
2. Enter code: ${authCode}
3. Approve payment

Reference: ${reference}

⏳ I'll notify you when payment is confirmed.`
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
                
                response.instructions = `📱 *EcoCash Payment*

A payment request has been sent to ${formattedPhone}.

✅ *Check your phone now:*
1. Enter your EcoCash PIN when prompted
2. Confirm payment of ${amountDisplay}
3. Wait for "Transaction Successful" message

Reference: ${reference}

⏳ I'll notify you when payment is confirmed.`;
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
                const provider = method === 'innbucks' ? 'InnBucks' : 'EcoCash';
                const currency = paymentData.currency || 'USD';
                const amountDisplay = this.formatAmountWithCurrency(paymentData.amount, currency);
                
                let instructions;
                
                if (method === 'innbucks') {
                    const mockAuthCode = 'INN' + Date.now().toString().slice(-8);
                    const mockExpires = new Date(Date.now() + 30*60000).toLocaleString();
                    const mockQrUrl = `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=schinn.wbpycode://innbucks.co.zw?pymInnCode=${mockAuthCode}`;
                    const mockDeepLink = `schinn.wbpycode://innbucks.co.zw?pymInnCode=${mockAuthCode}`;
                    
                    instructions = `🔴 *SIMULATION: InnBucks*

🔑 Auth Code: ${mockAuthCode}
⏰ Expires: ${mockExpires}
💰 Amount: ${amountDisplay}

📱 Deep Link: ${mockDeepLink}
📲 QR Code: ${mockQrUrl}

Reference: ${paymentData.reference || 'SIM-' + Date.now()}`;
                    
                    return {
                        success: true,
                        pollUrl: `https://cchub.co.zw/paynow/simulate/${Date.now()}`,
                        instructions: instructions,
                        provider: provider,
                        method: method,
                        reference: paymentData.reference || 'SIM-' + Date.now(),
                        amount: paymentData.amount,
                        currency: currency,
                        amountDisplay: amountDisplay,
                        authorizationCode: mockAuthCode,
                        authorizationExpires: mockExpires,
                        qrCodeUrl: mockQrUrl,
                        deepLink: mockDeepLink,
                        simulation: true
                    };
                    
                } else {
                    // EcoCash simulation
                    instructions = `🔴 *SIMULATION: EcoCash*

A payment request would be sent to ${paymentData.phone}

💰 Amount: ${amountDisplay}
Reference: ${paymentData.reference || 'SIM-' + Date.now()}`;
                    
                    return {
                        success: true,
                        pollUrl: `https://cchub.co.zw/paynow/simulate/${Date.now()}`,
                        instructions: instructions,
                        provider: provider,
                        method: method,
                        reference: paymentData.reference || 'SIM-' + Date.now(),
                        amount: paymentData.amount,
                        currency: currency,
                        amountDisplay: amountDisplay,
                        phone: paymentData.phone,
                        simulation: true
                    };
                }
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
        
        if (digits.startsWith('077') || digits.startsWith('078') || 
            digits.startsWith('26377') || digits.startsWith('26378')) {
            return 'EcoCash';
        }
        if (digits.startsWith('071') || digits.startsWith('26371')) {
            return 'OneMoney';
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