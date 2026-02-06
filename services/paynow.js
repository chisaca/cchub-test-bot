const axios = require('axios');
require('dotenv').config();

class PayNowService {
    constructor() {
        this.integrationKey = process.env.PAYNOW_INTEGRATION_KEY;
        this.paynowId = process.env.PAYNOW_ID;
        this.merchantEmail = process.env.PAYNOW_MERCHANT_EMAIL;
        this.baseURL = 'https://www.paynow.co.zw/interface/initiatetransaction';
        
        this.validateConfig();
    }

    validateConfig() {
        if (!this.integrationKey || !this.paynowId || !this.merchantEmail) {
            throw new Error('PayNow configuration missing. Check your .env file');
        }
    }

    generateHash(params) {
        // PayNow uses SHA512 hash of concatenated values
        const crypto = require('crypto');
        const values = Object.values(params).join('');
        return crypto.createHash('sha512').update(values + this.integrationKey).digest('hex').toUpperCase();
    }

    async initiatePayment(paymentData) {
        try {
            const { amount, reference, phone, service, customer } = paymentData;
            
            // Validate input
            if (!amount || amount <= 0) {
                throw new Error('Invalid amount');
            }

            // Construct PayNow parameters
            const params = {
                id: this.paynowId,
                reference: reference || `CC-${Date.now()}`,
                amount: amount.toFixed(2),
                additionalinfo: `${service} for ${customer || phone}`,
                returnurl: 'https://cchub.co.zw/payment-success',
                resulturl: 'https://cchub.co.zw/payment-webhook', // For status updates
                authemail: this.merchantEmail,
                phone: phone || '',
                email: customer?.email || '',
                merchantemail: this.merchantEmail,
                status: 'Message'
            };

            // Generate hash
            params.hash = this.generateHash(params);

            // Make request to PayNow
            const response = await axios.post(this.baseURL, null, {
                params: params,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            // Parse PayNow response
            const responseData = this.parseResponse(response.data);
            
            if (responseData.status.toLowerCase() === 'ok') {
                return {
                    success: true,
                    pollUrl: responseData.pollurl,
                    browserUrl: responseData.browserurl,
                    instructions: responseData.instructions,
                    reference: params.reference,
                    amount: amount
                };
            } else {
                throw new Error(responseData.error || 'Payment initiation failed');
            }

        } catch (error) {
            console.error('PayNow payment error:', error);
            return {
                success: false,
                error: error.message || 'Payment processing failed'
            };
        }
    }

    parseResponse(responseString) {
        // PayNow returns data in format: status=ok&pollurl=...&browserurl=...
        const params = new URLSearchParams(responseString);
        const result = {};
        
        for (const [key, value] of params) {
            result[key] = value;
        }
        
        return result;
    }

    async checkPaymentStatus(pollUrl) {
        try {
            const response = await axios.get(pollUrl);
            const data = this.parseResponse(response.data);
            
            return {
                status: data.status,
                paid: data.status === 'paid',
                reference: data.reference,
                amount: data.amount,
                paynowref: data.paynowreference
            };
        } catch (error) {
            console.error('Payment status check error:', error);
            return { status: 'error', error: error.message };
        }
    }
}

module.exports = new PayNowService();