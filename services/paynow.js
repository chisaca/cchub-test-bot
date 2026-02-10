// services/paynow.js - WITH ENHANCED DEBUGGING
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
        
        console.log('💳 [PAYNOW] Service initialized:', {
            id: this.id,
            baseUrl: this.baseUrl,
            resultUrl: this.resultUrl,
            returnUrl: this.returnUrl
        });
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
            } else if (formattedPhone.length === 9 && !formattedPhone.startsWith('263')) {
                formattedPhone = '263' + formattedPhone;
            }
            
            // Validate phone format for PayNow
            if (!/^2637[1378]\d{7}$/.test(formattedPhone)) {
                console.error('❌ [PAYNOW] Phone validation failed:', {
                    phone: formattedPhone,
                    length: formattedPhone.length,
                    pattern: '2637[1378] + 7 digits'
                });
                throw new Error(`Invalid phone format. Expected: 2637[1378]XXXXXXX (12 digits). Got: ${formattedPhone} (${formattedPhone.length} digits)`);
            }
            
            console.log('✅ [PAYNOW] Phone validated:', formattedPhone);
            
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
                mobile: formattedPhone
            };
            
            // Generate hash
            requestData.hash = this.generateHash(requestData);
            
            console.log('📤 [PAYNOW] Sending request to:', `${this.baseUrl}/InitiateTransaction`);
            console.log('📤 [PAYNOW] Request data:', {
                id: requestData.id,
                reference: requestData.reference,
                amount: requestData.amount,
                additionalinfo: requestData.additionalinfo,
                authemail: requestData.authemail,
                mobile: requestData.mobile,
                returnurl: requestData.returnurl,
                resulturl: requestData.resulturl,
                status: requestData.status,
                hash: 'HIDDEN_FOR_SECURITY'
            });
            
            // Send to PayNow
            const response = await axios.post(`${this.baseUrl}/InitiateTransaction`, requestData, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 30000 // 30 second timeout
            });
            
            console.log('📥 [PAYNOW] Response status:', response.status);
            console.log('📥 [PAYNOW] Response headers:', response.headers);
            console.log('📥 [PAYNOW] Raw response data:', response.data);
            
            // Parse PayNow response
            const responseData = this.parseResponse(response.data);
            
            console.log('📊 [PAYNOW] Parsed response:', responseData);
            
            // Check if we got a valid response
            if (Object.keys(responseData).length === 0) {
                console.error('❌ [PAYNOW] Empty response from PayNow');
                console.error('❌ [PAYNOW] Raw response was:', response.data);
                throw new Error('Empty response from PayNow API');
            }
            
            // SAFE status check
            const status = responseData.status || '';
            const statusLower = status.toString().toLowerCase();
            
            if (statusLower === 'error') {
                const errorMsg = responseData.error || responseData.errordescription || 'PayNow API error';
                console.error('❌ [PAYNOW] API error:', errorMsg);
                throw new Error(`PayNow Error: ${errorMsg}`);
            }
            
            if (statusLower !== 'ok' && statusLower !== 'created') {
                console.error('❌ [PAYNOW] Unexpected status:', status);
                console.error('❌ [PAYNOW] Full response:', responseData);
                throw new Error(`PayNow returned unexpected status: "${status}". Full response: ${JSON.stringify(responseData)}`);
            }
            
            // Extract poll URL and instructions
            const pollUrl = responseData.pollurl;
            if (!pollUrl) {
                console.error('❌ [PAYNOW] No poll URL in response:', responseData);
                throw new Error('PayNow did not return a poll URL');
            }
            
            const instructions = responseData.instructions || 'Check your phone for payment instructions';
            const browserUrl = responseData.browserurl || '';
            
            console.log('✅ [PAYNOW] Payment initiated successfully:', {
                pollUrl: pollUrl,
                instructions: instructions,
                reference: reference
            });
            
            return {
                success: true,
                pollUrl: pollUrl,
                instructions: instructions,
                browserUrl: browserUrl,
                reference: reference,
                amount: formattedAmount
            };
            
        } catch (error) {
            console.error('❌ [PAYNOW] QuickPay error:', error.message);
            
            // Check for axios specific errors
            if (error.response) {
                console.error('❌ [PAYNOW] Response error:', {
                    status: error.response.status,
                    data: error.response.data,
                    headers: error.response.headers
                });
            } else if (error.request) {
                console.error('❌ [PAYNOW] No response received:', error.request);
            } else {
                console.error('❌ [PAYNOW] Setup error:', error.message);
            }
            
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
            
            const response = await axios.get(pollUrl, {
                timeout: 10000
            });
            
            console.log('📥 [PAYNOW] Status check response:', response.data);
            
            const responseData = this.parseResponse(response.data);
            
            console.log('📊 [PAYNOW] Parsed status response:', responseData);
            
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
            } else if (statusLower === 'sent' || statusLower === 'created' || statusLower === 'awaiting delivery') {
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
                    error: responseData.error || responseData.errordescription
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
        
        console.log('🔍 [PAYNOW] Parsing response text:', responseText);
        
        const lines = responseText.split('&');
        
        lines.forEach(line => {
            const [key, value] = line.split('=');
            if (key && value !== undefined) {
                try {
                    data[key.toLowerCase()] = decodeURIComponent(value);
                } catch (e) {
                    console.warn(`⚠️ [PAYNOW] Failed to decode: ${key}=${value}`);
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