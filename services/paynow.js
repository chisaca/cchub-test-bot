// services/paynow.js
const crypto = require('crypto');
const axios = require('axios');

class PayNowService {
    constructor() {
        this.id = process.env.PAYNOW_ID;
        this.key = process.env.PAYNOW_KEY;
        this.baseUrl = process.env.PAYNOW_URL || 'https://www.paynow.co.zw/Interface/API';
        this.resultUrl = process.env.PAYNOW_RESULT_URL;
        this.returnUrl = process.env.PAYNOW_RETURN_URL;
        
        if (!this.id || !this.key) {
            console.error('❌ PAYNOW_ID and PAYNOW_KEY must be set in .env file');
        }
    }

    // Generate PayNow hash
    generateHash(data) {
        const values = Object.values(data).join('');
        const hash = crypto.createHmac('sha512', this.key)
            .update(values)
            .digest('hex')
            .toUpperCase();
        return hash;
    }

    // Create QuickPay payment
    async initiateQuickPay(paymentData) {
        try {
            const { amount, reference, phone, service, customer } = paymentData;
            
            // Format amount (PayNow expects string with 2 decimal places)
            const formattedAmount = parseFloat(amount).toFixed(2);
            
            // PayNow request data
            const requestData = {
                id: this.id,
                reference: reference,
                amount: formattedAmount,
                additionalinfo: service,
                authemail: customer.phone + '@cchub.co.zw',
                status: 'Message',
                returnurl: this.returnUrl,
                resulturl: this.resultUrl,
                mobile: phone // Must be in 26377... format
            };
            
            // Generate hash
            requestData.hash = this.generateHash(requestData);
            
            console.log('📤 Sending PayNow request:', {
                ...requestData,
                hash: 'HIDDEN_FOR_SECURITY'
            });
            
            // Send to PayNow
            const response = await axios.post(`${this.baseUrl}/InitiateTransaction`, requestData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            // Parse PayNow response
            const responseData = this.parseResponse(response.data);
            
            if (responseData.status.toLowerCase() === 'error') {
                throw new Error(responseData.error || 'PayNow API error');
            }
            
            if (responseData.status.toLowerCase() !== 'ok') {
                throw new Error(`PayNow returned status: ${responseData.status}`);
            }
            
            // Extract poll URL and instructions
            const pollUrl = responseData.pollurl;
            const instructions = responseData.instructions || 'Check your phone for payment instructions';
            
            return {
                success: true,
                pollUrl: pollUrl,
                instructions: instructions,
                browserUrl: responseData.browserurl,
                reference: reference,
                amount: formattedAmount
            };
            
        } catch (error) {
            console.error('❌ PayNow QuickPay error:', error.message);
            return {
                success: false,
                error: error.message || 'Failed to initiate payment'
            };
        }
    }

    // Check payment status
    async checkPaymentStatus(pollUrl) {
        try {
            console.log('🔍 Checking payment status:', pollUrl);
            
            const response = await axios.get(pollUrl);
            const responseData = this.parseResponse(response.data);
            
            if (responseData.status.toLowerCase() === 'paid') {
                return {
                    paid: true,
                    status: 'paid',
                    reference: responseData.reference,
                    amount: responseData.amount,
                    paynowref: responseData.paynowref,
                    timestamp: new Date().toISOString()
                };
            } else if (responseData.status.toLowerCase() === 'cancelled') {
                return {
                    paid: false,
                    status: 'cancelled',
                    reference: responseData.reference
                };
            } else if (responseData.status.toLowerCase() === 'sent') {
                return {
                    paid: false,
                    status: 'pending',
                    reference: responseData.reference
                };
            } else {
                return {
                    paid: false,
                    status: responseData.status.toLowerCase() || 'unknown',
                    reference: responseData.reference
                };
            }
            
        } catch (error) {
            console.error('❌ PayNow status check error:', error.message);
            return {
                paid: false,
                status: 'error',
                error: error.message
            };
        }
    }

    // Parse PayNow response (key=value format)
    parseResponse(responseText) {
        const data = {};
        const lines = responseText.split('&');
        
        lines.forEach(line => {
            const [key, value] = line.split('=');
            if (key && value !== undefined) {
                data[key.toLowerCase()] = decodeURIComponent(value);
            }
        });
        
        return data;
    }

    // Validate PayNow webhook (if you have webhooks)
    validateWebhook(data, hash) {
        const generatedHash = this.generateHash(data);
        return generatedHash === hash;
    }
}

module.exports = new PayNowService();