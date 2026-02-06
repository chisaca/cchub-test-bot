// handlers/paycodeHandler.js
const axios = require('axios');
const validationUtils = require('../utils/validation');
const sessionHandler = require('./sessionHandler');
const messaging = require('../utils/messaging');

const { updateSession, userActivity } = sessionHandler;

async function handlePayCodeMessage(from, message) {
    console.log(`🔐 Processing PayCode from ${from}: "${message}"`);
    
    // Debug environment variables
    console.log('🔧 DEBUG - Environment Check:');
    console.log('📦 WordPress URL:', process.env.WORDPRESS_API_URL || 'Not set');
    console.log('🔑 Token exists:', !!process.env.CCHUB_BOT_TOKEN);
    console.log('🔑 Token length:', process.env.CCHUB_BOT_TOKEN?.length || 0);
    
    try {
        // Step 1: Extract PayCode from message
        const extractedPayCode = validationUtils.extractPayCodeFromMessage(message);
        
        if (!extractedPayCode) {
            console.log(`❌ No PayCode extracted from message`);
            
            // Check if user is in a session that expects amount
            const session = sessionHandler.getActiveSession(from);
            if (session && session.flow === 'bill_amount_entry' && /^\d+$/.test(message.trim())) {
                console.log(`📝 User is in bill amount entry, not PayCode`);
                return;
            }
            
            await messaging.sendMessage(from, `❌ *PAYCODE NOT DETECTED*\n\nTo pay a bill, you need a PayCode from our website.\n\n📋 *CORRECT FORMAT:* CCH123456\n\n✅ *Examples:*\n• CCH789012\n• PayCode: CCH345678\n• cchub://pay/CCH901234\n\n🔗 *Get PayCode:* https://cchub.co.zw\n\nOr type "hi" to see other options.`);
            return;
        }
        
        console.log(`🔍 Extracted PayCode: "${extractedPayCode}"`);
        
        // Step 2: Validate the PayCode format
        let validatedPayCode;
        try {
            validatedPayCode = validationUtils.validatePayCode(extractedPayCode, from, userActivity, sessionHandler.RATE_LIMIT_CONFIG);
        } catch (validationError) {
            console.log(`❌ PayCode validation failed:`, validationError.message);
            throw validationError;
        }
        
        // PayCode validated successfully
        console.log(`✅ Valid PayCode detected: ${validatedPayCode} from ${from}`);
        
        // Step 3: Call WordPress API to decode PayCode
        if (!process.env.WORDPRESS_API_URL || !process.env.CCHUB_BOT_TOKEN) {
            throw new Error('API configuration missing. Please check environment variables.');
        }
        
        const response = await axios.get(
            `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/get-biller-code/${validatedPayCode}`,
            {
                headers: {
                    'X-CCHUB-TOKEN': process.env.CCHUB_BOT_TOKEN || ''
                },
                timeout: 10000
            }
        );
        
        console.log(`📡 API Response Status: ${response.status}`);
        
        const data = response.data;
        
        if (data.status !== 'success') {
            userActivity[from].attempts++;
            userActivity[from].lastAttempt = Date.now();
            await messaging.sendMessage(from, `❌ *INVALID PAYCODE*\n\nPayCode *${validatedPayCode}* is not valid.\n\nPossible reasons:\n• Already used\n• Expired (10-minute limit)\n• Incorrect format\n\n🔗 *Get a new PayCode:* https://cchub.co.zw\n\nOr type "hi" to see other options.`);
            return;
        }
        
        // Map WordPress service types
        const serviceMapping = {
            'schools': 'school_fees',
            'city_council': 'city_council', 
            'insurance': 'insurance',
            'retail': 'retail_subscriptions'
        };
        
        const botCategory = serviceMapping[data.service_type] || data.service_type;
        const emojiMapping = {
            'school_fees': '🏫',
            'city_council': '🏛️',
            'insurance': '🛡️',
            'retail_subscriptions': '🛒'
        };
        
        const emoji = emojiMapping[botCategory] || '💳';
        const categoryName = data.service_type ? data.service_type.replace('_', ' ').toUpperCase() : 'BILL PAYMENT';
        
        // Update session
        const sessionId = updateSession(from, {
            flow: 'bill_amount_entry',
            service: 'bill_payment',
            billCategory: botCategory,
            billCategoryName: categoryName,
            billEmoji: emoji,
            billerCode: data.biller_code,
            billerName: data.provider_name,
            paycode: validatedPayCode,
            paycodeVerified: true,
            testTransaction: false,
            skipBillerSearch: true,
            paycodeValidatedAt: Date.now()
        });
        
        await messaging.sendMessage(from, `${emoji} *PAYCODE VERIFIED ✅*\n\n🔐 *Secure PayCode:* ${validatedPayCode}\n✅ *Status:* Valid\n⏰ *Expires:* 10 minutes\n\n🏢 *Biller:* ${data.provider_name}\n📋 *Service:* ${categoryName}\n🔢 *Biller Code:* ${data.biller_code}\n\n💰 *READY FOR PAYMENT*\n\n*Enter amount in ZWL:*\nExample: 100000 for ZWL 100,000\n\n💡 *Minimum amount:* ZWL 50,000\n\nOr type "hi" to cancel.`);
        
    } catch (error) {
        console.error('❌ Error processing PayCode:', error.message);
        console.error('❌ Error stack:', error.stack);
        
        const userState = userActivity[from] || { attempts: 0 };
        
        if (error.message.includes('RATE_LIMIT') || error.message.includes('SECURITY') || error.message.includes('FORMAT')) {
            userState.attempts = (userState.attempts || 0) + 1;
            userState.lastAttempt = Date.now();
            
            // Apply lockout if too many attempts
            if (userState.attempts >= sessionHandler.RATE_LIMIT_CONFIG.maxAttempts) {
                userState.lockoutUntil = Date.now() + sessionHandler.RATE_LIMIT_CONFIG.lockoutDuration;
                const lockoutMinutes = Math.ceil(sessionHandler.RATE_LIMIT_CONFIG.lockoutDuration / (60 * 1000));
                
                await messaging.sendMessage(from, `🔒 *ACCOUNT TEMPORARILY LOCKED*\n\nToo many invalid attempts detected.\n\n⏰ *Lockout duration:* ${lockoutMinutes} minutes\n🔢 *Attempts:* ${userState.attempts}\n\n🔐 *For security reasons, please wait before trying again.*\n\nContact support if this is an error.`);
                return;
            }
            
            const errorType = error.message.split(':')[0];
            const errorDetail = error.message.split(':')[1]?.trim() || error.message;
            
            await messaging.sendMessage(from, `❌ *${errorType} ERROR*\n\n${errorDetail}\n\n🔢 *Attempt ${userState.attempts} of ${sessionHandler.RATE_LIMIT_CONFIG.maxAttempts}*\n\n📋 *CORRECT FORMAT:* CCH123456\n\n✅ *Examples:*\n• CCH789012\n• Send only: CCH345678\n\n🔗 *Get valid PayCode:* https://cchub.co.zw\n\nOr type "hi" to see other options.`);
            
        } else if (error.response?.status === 401) {
            await messaging.sendMessage(from, `🔒 *API AUTHENTICATION ERROR*\n\nTechnical issue with PayCode verification.\n\nPlease:\n1. Try again in 2 minutes\n2. Contact support if problem persists\n3. Type "hi" for other options`);
            
        } else if (error.response?.status === 404) {
            await messaging.sendMessage(from, `❌ *PAYCODE NOT FOUND*\n\nThis PayCode doesn't exist in our system.\n\nPossible reasons:\n• Generated more than 10 minutes ago\n• Already used successfully\n• Invalid format\n\n🔗 *Get a new PayCode:* https://cchub.co.zw\n\nEach PayCode is valid for 10 minutes and single use only.`);
            
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            await messaging.sendMessage(from, `⚠️ *CONNECTION TIMEOUT*\n\nUnable to verify PayCode at the moment.\n\nPlease:\n1. Try again in 1 minute\n2. Check your internet connection\n3. Type "hi" for manual bill payment`);
            
        } else {
            await messaging.sendMessage(from, `⚠️ *TEMPORARY SYSTEM ERROR*\n\nWe're unable to process your PayCode right now.\n\nPlease:\n1. Try again in 2 minutes\n2. Get a new PayCode from website\n3. Type "hi" for other options\n\nError: ${error.message.substring(0, 50)}`);
        }
    }
}

module.exports = {
    handlePayCodeMessage
};