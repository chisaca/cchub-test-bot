// services/hotrecharge-services/teloneusd.js
// TelOne USD Bundle Purchases (Product ID: 40)
// TelOne USD services use accountTypeId: 3

const axios = require('axios');
const { HOTRECHARGE_CONFIG } = require('../../config/constants');

class TelOneUSDService {
    constructor(tokenManager) {
        this.tokenManager = tokenManager;
        this.baseURL = process.env.HOT_API_BASE_URL || 'https://ssl.hot.co.zw/api/v3';
        this.accountTypeId = 3; // USD account type for TelOne
        this.serviceName = 'TelOne USD';
        
        // Product ID for USD
        this.PRODUCTS = {
            USD_BUNDLE: 40  // TelOne USD product
        };

        // Product names for reference
        this.PRODUCT_NAMES = {
            40: 'TelOne USD Bundle'
        };

        // Minimum and maximum amounts (USD)
        this.minAmount = 1;    // $1 USD minimum
        this.maxAmount = 1000;  // $1000 USD maximum
    }

    /**
     * Get auth token from manager
     */
    async getToken() {
        try {
            return await this.tokenManager.getToken(this.serviceName);
        } catch (error) {
            console.error('[TelOneUSD] Token acquisition error:', error.message);
            throw new Error('Failed to get authentication token');
        }
    }

    /**
     * Validate account number format
     * TelOne accounts are typically 8 digits
     */
    validateAccount(accountNumber) {
        return /^\d{8}$/.test(accountNumber);
    }

    /**
     * Validate amount range (USD)
     */
    validateAmount(amount) {
        return amount >= this.minAmount && amount <= this.maxAmount;
    }

    /**
     * Validate product ID (should be 40 for USD)
     */
    validateProductId(productId) {
        return productId === this.PRODUCTS.USD_BUNDLE;
    }

    /**
     * Check balance for TelOne USD account type (type 3)
     */
    async checkBalance() {
        try {
            const token = await this.getToken();
            
            console.log(`[TelOneUSD] Checking balance for account type ${this.accountTypeId}`);
            
            const response = await axios.get(
                `${this.baseURL}/balance/accounttype/${this.accountTypeId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: HOTRECHARGE_CONFIG.REQUEST_TIMEOUT
                }
            );

            console.log('[TelOneUSD] Balance response:', JSON.stringify(response.data, null, 2));

            if (response.data) {
                const balance = response.data.balance || 
                               response.data.availableBalance || 
                               response.data.amount || 
                               0;
                
                return {
                    success: true,
                    balance: parseFloat(balance),
                    currency: 'USD',
                    accountType: this.accountTypeId,
                    raw: response.data
                };
            }

            return {
                success: false,
                error: 'Failed to fetch balance',
                balance: 0
            };

        } catch (error) {
            console.error('[TelOneUSD] Balance check error:', error.response?.data || error.message);
            
            if (error.response) {
                const { status, data } = error.response;
                
                if (status === 401) {
                    return {
                        success: false,
                        error: 'Authentication failed',
                        balance: 0,
                        retryable: true
                    };
                } else if (status === 403) {
                    return {
                        success: false,
                        error: 'Unauthorized to access this account type',
                        balance: 0,
                        retryable: false
                    };
                }
            }
            
            return {
                success: false,
                error: error.message || 'Network error',
                balance: 0,
                retryable: true
            };
        }
    }

    /**
     * Verify TelOne account exists
     */
    async verifyAccount(accountNumber) {
        try {
            if (!this.validateAccount(accountNumber)) {
                return {
                    success: false,
                    error: 'Invalid account number format. Must be 8 digits.',
                    exists: false
                };
            }

            // For USD verification, we can try a minimum amount query
            try {
                const token = await this.getToken();
                
                const response = await axios.post(
                    `${this.baseURL}/account/verify`,
                    {
                        AccountNumber: accountNumber,
                        ProductId: this.PRODUCTS.USD_BUNDLE,
                        AccountTypeId: this.accountTypeId
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: HOTRECHARGE_CONFIG.REQUEST_TIMEOUT
                    }
                );

                if (response.data && response.data.success) {
                    return {
                        success: true,
                        exists: true,
                        accountNumber: accountNumber,
                        customerName: response.data.customerName || `TelOne Account ${accountNumber}`,
                        verified: true
                    };
                }
            } catch (verifyError) {
                console.log('[TelOneUSD] Account verification endpoint not available, using format validation only');
            }

            return {
                success: true,
                exists: true,
                accountNumber: accountNumber,
                customerName: `TelOne Account ${accountNumber}`,
                verified: false
            };

        } catch (error) {
            console.error('[TelOneUSD] Account verification error:', error.message);
            return {
                success: false,
                error: error.message,
                exists: false
            };
        }
    }

    /**
     * Purchase TelOne USD bundle
     * @param {Object} params - Purchase parameters
     * @param {string} params.accountNumber - TelOne account number (8 digits)
     * @param {number} params.amount - Amount in USD
     * @param {string} params.notifyNumber - Phone number to notify
     * @param {string} params.reference - Client reference
     * @param {number} params.productId - Optional: Override product ID (defaults to 40)
     */
    async purchase({ accountNumber, amount, notifyNumber, reference, productId = 40 }) {
        try {
            // Validate inputs
            if (!this.validateAccount(accountNumber)) {
                return {
                    success: false,
                    error: 'Invalid TelOne account number format. Must be 8 digits.'
                };
            }

            if (!this.validateProductId(productId)) {
                return {
                    success: false,
                    error: `Invalid product ID for USD. Must be 40.`
                };
            }

            if (!this.validateAmount(amount)) {
                return {
                    success: false,
                    error: `Amount must be between $${this.minAmount} and $${this.maxAmount} USD.`
                };
            }

            // Format notify number
            const formattedNotify = notifyNumber.startsWith('0') 
                ? '263' + notifyNumber.substring(1) 
                : notifyNumber;

            const token = await this.getToken();
            
            const txReference = reference || `TELUSD${Date.now()}${Math.floor(Math.random() * 1000)}`;
            
            const payload = {
                ProductId: productId,
                AccountTypeId: this.accountTypeId,
                Target: accountNumber,
                Amount: amount,
                Reference: txReference,
                NotifyNumber: formattedNotify
            };

            console.log('[TelOneUSD] Purchase payload:', JSON.stringify(payload, null, 2));

            const response = await axios.post(
                `${this.baseURL}/vend`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: HOTRECHARGE_CONFIG.REQUEST_TIMEOUT
                }
            );

            console.log('[TelOneUSD] Purchase response:', JSON.stringify(response.data, null, 2));

            if (response.data) {
                const isSuccess = response.data.success || 
                                 response.data.status === 'success' || 
                                 response.data.status === 'approved' ||
                                 response.data.transactionId;

                if (isSuccess) {
                    return {
                        success: true,
                        reference: response.data.reference || txReference,
                        transactionId: response.data.transactionId || response.data.id,
                        accountNumber: accountNumber,
                        amount: amount,
                        currency: 'USD',
                        productId: productId,
                        productName: 'TelOne USD Bundle',
                        raw: response.data
                    };
                }
            }

            return {
                success: false,
                error: response.data?.message || response.data?.description || 'Purchase failed',
                raw: response.data
            };

        } catch (error) {
            console.error('[TelOneUSD] Purchase error:', error.response?.data || error.message);
            
            if (error.response) {
                const { status, data } = error.response;
                
                switch (status) {
                    case 400:
                        return {
                            success: false,
                            error: data?.message || 'Invalid request. Please check account number and amount.',
                            retryable: false
                        };
                    
                    case 401:
                        return {
                            success: false,
                            error: 'Authentication failed. Please try again.',
                            retryable: true
                        };
                    
                    case 403:
                        return {
                            success: false,
                            error: 'Insufficient USD balance for this transaction.',
                            retryable: false
                        };
                    
                    case 404:
                        return {
                            success: false,
                            error: 'TelOne USD service temporarily unavailable.',
                            retryable: true
                        };
                    
                    case 422:
                        return {
                            success: false,
                            error: data?.message || 'Invalid account number.',
                            retryable: false
                        };
                    
                    default:
                        return {
                            success: false,
                            error: data?.message || `Error ${status}: ${error.message}`,
                            retryable: status >= 500
                        };
                }
            }
            
            return {
                success: false,
                error: error.message || 'Network error. Please try again.',
                retryable: true
            };
        }
    }

    /**
     * Get product name from ID
     */
    getProductName(productId) {
        return this.PRODUCT_NAMES[productId] || 'TelOne USD Bundle';
    }

    /**
     * Check transaction status
     */
    async checkStatus(reference) {
        try {
            const token = await this.getToken();
            
            console.log(`[TelOneUSD] Checking status for reference: ${reference}`);
            
            const response = await axios.get(
                `${this.baseURL}/transaction/${reference}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: HOTRECHARGE_CONFIG.REQUEST_TIMEOUT
                }
            );

            if (response.data) {
                let status = 'unknown';
                if (response.data.status) {
                    status = response.data.status.toLowerCase();
                } else if (response.data.transactionStatus) {
                    status = response.data.transactionStatus.toLowerCase();
                }

                const isCompleted = status === 'success' || 
                                   status === 'completed' || 
                                   status === 'approved';

                return {
                    success: true,
                    status: status,
                    completed: isCompleted,
                    reference: reference,
                    transactionId: response.data.transactionId || response.data.id,
                    amount: response.data.amount,
                    currency: 'USD',
                    raw: response.data
                };
            }

            return {
                success: false,
                error: 'Failed to check transaction status',
                completed: false
            };

        } catch (error) {
            console.error('[TelOneUSD] Status check error:', error.response?.data || error.message);
            
            if (error.response && error.response.status === 404) {
                return {
                    success: false,
                    error: 'Transaction not found',
                    completed: false,
                    notFound: true
                };
            }
            
            return {
                success: false,
                error: error.message || 'Failed to check status',
                completed: false,
                retryable: true
            };
        }
    }

    /**
     * Get available USD products
     */
    async getAvailableProducts() {
        return {
            success: true,
            products: [
                { id: 40, name: 'TelOne USD Bundle', minAmount: this.minAmount, maxAmount: this.maxAmount, currency: 'USD' }
            ]
        };
    }

    /**
     * Health check for TelOne USD service
     */
    async healthCheck() {
        try {
            const token = await this.getToken();
            
            const response = await axios.get(
                `${this.baseURL}/balance/accounttype/${this.accountTypeId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                }
            );

            return {
                success: true,
                status: 'healthy',
                service: this.serviceName,
                accountType: this.accountTypeId,
                reachable: true
            };

        } catch (error) {
            console.error('[TelOneUSD] Health check failed:', error.message);
            return {
                success: false,
                status: 'unhealthy',
                service: this.serviceName,
                error: error.message,
                reachable: false
            };
        }
    }

    /**
     * Format amount as USD
     */
    formatAmount(amount) {
        return `$${amount.toFixed(2)} USD`;
    }
}

module.exports = TelOneUSDService;
