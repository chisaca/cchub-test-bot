// services/paynow.js - WITH CORRECT ENDPOINTS
const crypto = require('crypto');
const axios = require('axios');

class PayNowService {
    constructor() {
        this.id = process.env.PAYNOW_ID;
        this.key = process.env.PAYNOW_KEY;
        // Try different endpoints
        this.baseUrl = process.env.PAYNOW_URL || 'https://www.paynow.co.zw';
        this.resultUrl = process.env.PAYNOW_RESULT_URL;
        this.returnUrl = process.env.PAYNOW_RETURN_URL;
        
        if (!this.id || !this.key) {
            console.error('❌ PAYNOW_ID and PAYNOW_KEY must be set in .env file');
        }
        
        console.log('💳 [PAYNOW] Service initialized with:', {
            id: this.id ? 'SET' : 'MISSING',
            key: this.key ? 'SET' : 'MISSING',
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
            
            // Try different PayNow endpoints
            const endpoints = [
                'https://www.paynow.co.zw/Interface/InitiateTransaction',  // Most common
                'https://www.paynow.co.zw/Interface/API/InitiateTransaction',
                'https://www.paynow.co.zw/Interface/api/InitiateTransaction',
                'https://www.paynow.co.zw/api/v1/initiatetransaction'  // Try v1 API
            ];
            
            let lastError = null;
            
            // Try each endpoint
            for (const endpoint of endpoints) {
                try {
                    console.log('📤 [PAYNOW] Trying endpoint:', endpoint);
                    console.log('📤 [PAYNOW] Request data:', {
                        id: requestData.id,
                        reference: requestData.reference,
                        amount: requestData.amount,
                        additionalinfo: requestData.additionalinfo,
                        authemail: requestData.authemail,
                        mobile: requestData.mobile,
                        hash: 'HIDDEN_FOR_SECURITY'
                    });
                    
                    const response = await axios.post(endpoint, requestData, {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        timeout: 30000,
                        validateStatus: function (status) {
                            return status >= 200 && status < 500; // Accept 4xx errors for diagnosis
                        }
                    });
                    
                    console.log('📥 [PAYNOW] Response status:', response.status);
                    console.log('📥 [PAYNOW] Response headers:', JSON.stringify(response.headers));
                    
                    // Check if response is HTML (error page)
                    if (typeof response.data === 'string' && 
                        (response.data.includes('<!doctype') || 
                         response.data.includes('<html') ||
                         response.data.includes('DOCTYPE'))) {
                        console.log('❌ [PAYNOW] Received HTML error page from endpoint:', endpoint);
                        lastError = new Error(`PayNow returned HTML error page from ${endpoint}`);
                        continue; // Try next endpoint
                    }
                    
                    console.log('📥 [PAYNOW] Raw response data (first 500 chars):', 
                        response.data.toString().substring(0, 500));
                    
                    // Parse PayNow response
                    const responseData = this.parseResponse(response.data);
                    
                    console.log('📊 [PAYNOW] Parsed response:', responseData);
                    
                    // Check if we got a valid response
                    if (Object.keys(responseData).length === 0) {
                        console.log('⚠️ [PAYNOW] Empty parsed response from endpoint:', endpoint);
                        lastError = new Error(`Empty response from ${endpoint}`);
                        continue;
                    }
                    
                    // SAFE status check
                    const status = responseData.status || '';
                    const statusLower = status.toString().toLowerCase();
                    
                    if (statusLower === 'error') {
                        const errorMsg = responseData.error || responseData.errordescription || 'PayNow API error';
                        throw new Error(`PayNow Error: ${errorMsg}`);
                    }
                    
                    if (statusLower !== 'ok' && statusLower !== 'created') {
                        console.log('⚠️ [PAYNOW] Unexpected status from endpoint:', endpoint, 'Status:', status);
                        lastError = new Error(`PayNow returned status: "${status}" from ${endpoint}`);
                        continue;
                    }
                    
                    // Extract poll URL and instructions
                    const pollUrl = responseData.pollurl;
                    if (!pollUrl) {
                        console.log('⚠️ [PAYNOW] No poll URL from endpoint:', endpoint);
                        lastError = new Error(`No poll URL from ${endpoint}`);
                        continue;
                    }
                    
                    const instructions = responseData.instructions || 'Check your phone for payment instructions';
                    const browserUrl = responseData.browserurl || '';
                    
                    console.log('✅ [PAYNOW] SUCCESS with endpoint:', endpoint);
                    console.log('✅ [PAYNOW] Payment initiated:', {
                        pollUrl: pollUrl,
                        instructions: instructions.substring(0, 100) + '...',
                        reference: reference
                    });
                    
                    return {
                        success: true,
                        pollUrl: pollUrl,
                        instructions: instructions,
                        browserUrl: browserUrl,
                        reference: reference,
                        amount: formattedAmount,
                        endpointUsed: endpoint
                    };
                    
                } catch (endpointError) {
                    console.log(`❌ [PAYNOW] Endpoint ${endpoint} failed:`, endpointError.message);
                    lastError = endpointError;
                    // Continue to next endpoint
                }
            }
            
            // If we get here, all endpoints failed
            throw lastError || new Error('All PayNow endpoints failed');
            
        } catch (error) {
            console.error('❌ [PAYNOW] QuickPay error:', error.message);
            
            // Check for axios specific errors
            if (error.response) {
                console.error('❌ [PAYNOW] Response error:', {
                    status: error.response.status,
                    headers: error.response.headers,
                    data: error.response.data ? error.response.data.toString().substring(0, 500) : 'No data'
                });
                
                // Try to parse error from HTML
                if (error.response.data && typeof error.response.data === 'string') {
                    const errorMatch = error.response.data.match(/<div[^>]*class="[^"]*error[^"]*"[^>]*>([^<]+)<\/div>/i);
                    if (errorMatch) {
                        console.error('❌ [PAYNOW] Extracted error from HTML:', errorMatch[1].trim());
                    }
                }
            } else if (error.request) {
                console.error('❌ [PAYNOW] No response received. Network issue?');
            } else {
                console.error('❌ [PAYNOW] Setup error:', error.message);
            }
            
            console.error('❌ [PAYNOW] Error stack:', error.stack);
            
            return {
                success: false,
                error: error.message || 'Failed to initiate payment',
                details: 'All PayNow endpoints failed. Check console for details.'
            };
        }
    }

    // Check payment status - Keep this similar to before
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
        
        console.log('🔍 [PAYNOW] Parsing response text (first 300 chars):', 
            responseText.substring(0, 300));
        
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