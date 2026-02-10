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
            console.log('💳 [PAYNOW] Initiating QuickPay:', JSON.stringify(paymentData, null, 2));
            
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
            
            // Format amount (PayNow expects string with 2 decimal places)
            const formattedAmount = parseFloat(amount).toFixed(2);
            
            // Format phone number safely
            let formattedPhone = phone.toString().trim();
            
            // Remove any non-digit characters
            formattedPhone = formattedPhone.replace(/\D/g, '');
            
            // Ensure it's in 26377... format
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '263' + formattedPhone.substring(1);
            } else if (formattedPhone.length === 9) {
                formattedPhone = '263' + formattedPhone;
            }
            
            // Validate phone format for PayNow
            if (!/^2637[1378]\d{8}$/.test(formattedPhone)) {
                throw new Error(`Invalid phone format for PayNow. Must be 2637[1378]XXXXXX. Got: ${formattedPhone}`);
            }
            
            // Safely create email
            const email = customer && customer.email 
                ? customer.email.toString().trim().toLowerCase()
                : `${formattedPhone}@cchub.co.zw`.toLowerCase();
            
            // PayNow request data
            const requestData = {
                id: this.id,
                reference: reference,
                amount: formattedAmount,
                additionalinfo: service || 'Airtime Purchase',
                authemail: email,
                status: 'Message',
                returnurl: this.returnUrl,
                resulturl: this.resultUrl,
                mobile: formattedPhone // Must be in 26377... format
            };
            
            // Generate hash
            requestData.hash = this.generateHash(requestData);
            
            console.log('📤 [PAYNOW] Sending request:', {
                ...requestData,
                hash: 'HIDDEN_FOR_SECURITY'
            });
            
            // Send to PayNow
            const response = await axios.post(`${this.baseUrl}/InitiateTransaction`, requestData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            
            console.log('📥 [PAYNOW] Raw response:', response.data);
            
            // Parse PayNow response
            const responseData = this.parseResponse(response.data);
            
            console.log('📊 [PAYNOW] Parsed response:', responseData);
            
            // SAFE status check - always check if status exists
            const status = responseData.status || '';
            const statusLower = status.toString().toLowerCase();
            
            if (statusLower === 'error') {
                const errorMsg = responseData.error || 'PayNow API error';
                console.error('❌ [PAYNOW] API error:', errorMsg);
                throw new Error(`PayNow: ${errorMsg}`);
            }
            
            if (statusLower !== 'ok') {
                throw new Error(`PayNow returned unexpected status: ${status}`);
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
            console.error('❌ [PAYNOW] QuickPay error:', error.message);
            console.error('❌ [PAYNOW] Error stack:', error.stack);
            
            return {
                success: false,
                error: error.message || 'Failed to initiate payment',
                details: 'Check console for more details'
            };
        }
    }

    // Check payment status
    async checkPaymentStatus(pollUrl) {
        try {
            console.log('🔍 [PAYNOW] Checking payment status:', pollUrl);
            
            if (!pollUrl) {
                throw new Error('Poll URL is required');
            }
            
            const response = await axios.get(pollUrl);
            const responseData = this.parseResponse(response.data);
            
            console.log('📊 [PAYNOW] Status response:', responseData);
            
            // SAFE status check
            const status = responseData.status || 'unknown';
            const statusLower = status.toString().toLowerCase();
            
            if (statusLower === 'paid') {
                return {
                    paid: true,
                    status: 'paid',
                    reference: responseData.reference,
                    amount: responseData.amount,
                    paynowref: responseData.paynowref,
                    timestamp: new Date().toISOString()
                };
            } else if (statusLower === 'cancelled') {
                return {
                    paid: false,
                    status: 'cancelled',
                    reference: responseData.reference
                };
            } else if (statusLower === 'sent' || statusLower === 'created') {
                return {
                    paid: false,
                    status: 'pending',
                    reference: responseData.reference
                };
            } else {
                return {
                    paid: false,
                    status: statusLower,
                    reference: responseData.reference,
                    error: responseData.error
                };
            }
            
        } catch (error) {
            console.error('❌ [PAYNOW] Status check error:', error.message);
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
        
        if (!responseText || typeof responseText !== 'string') {
            console.error('❌ [PAYNOW] Invalid response text:', responseText);
            return data;
        }
        
        const lines = responseText.split('&');
        
        lines.forEach(line => {
            const [key, value] = line.split('=');
            if (key && value !== undefined) {
                try {
                    data[key.toLowerCase()] = decodeURIComponent(value);
                } catch (e) {
                    data[key.toLowerCase()] = value; // Use raw value if decode fails
                }
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