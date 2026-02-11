// services/airtime.js - UPDATED with HotRecharge integration
const { getActiveSession, deleteSession, createSession, updateSessionStep, incrementRetries } = require('../handlers/sessionHandlers');
const messaging = require('../utils/messaging');
const validation = require('../utils/validation');
const paynowService = require('./paynow');
const hotrechargeService = require('./hotrecharge'); // NEW: HotRecharge service
const { FLOW_STATES, AIRTIME_NETWORKS, PAYMENT_CONFIG, RESPONSE_MESSAGES, ERROR_MESSAGES } = require('../config/constants');

class AirtimeService {
    
    // [Previous methods remain the same until payment monitoring...]
    
    /**
     * Monitor payment status (using polling - webhook is better for production)
     */
    async monitorPaymentStatus(userId, pollUrl, session) {
        const { network, phone, amount, serviceFee, totalAmount, reference } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayPhone = phone.replace('263', '0');
        
        console.log(`🔍 Starting payment monitoring for ${userId}, reference: ${reference}`);
        
        let attempts = 0;
        const maxAttempts = 60; // 10 minutes at 10-second intervals
        const pollInterval = 10000; // Check every 10 seconds
        
        const checkStatus = async () => {
            attempts++;
            
            // Check if session still exists
            const currentSession = getActiveSession(userId);
            if (!currentSession || currentSession.service !== 'airtime') {
                console.log(`🛑 Stopping monitoring - session ended for ${userId}`);
                clearInterval(intervalId);
                return;
            }
            
            if (attempts > maxAttempts) {
                clearInterval(intervalId);
                console.log(`⏰ Payment timeout for ${userId}, reference: ${reference}`);
                
                await messaging.sendMessage(userId,
                    `⏰ *Payment Timeout*\n\n` +
                    `Payment was not completed in time.\n\n` +
                    `Reference: ${reference}\n` +
                    `Amount: ${totalAmount.toLocaleString()} ${currency}\n\n` +
                    `Type "hi" to try again.`
                );
                
                deleteSession(userId);
                return;
            }
            
            try {
                const status = await paynowService.checkPaymentStatus(pollUrl);
                console.log(`🔍 Payment status for ${userId}:`, status.status);
                
                if (status.paid) {
                    clearInterval(intervalId);
                    console.log(`✅ Payment completed for ${userId}, reference: ${reference}`);
                    
                    // PAYMENT SUCCESS - Trigger HotRecharge fulfillment
                    await this.fulfillAirtimePurchase(userId, session, status);
                    
                } else if (status.status === 'cancelled') {
                    clearInterval(intervalId);
                    console.log(`❌ Payment cancelled for ${userId}, reference: ${reference}`);
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Cancelled*\n\n` +
                        `Payment was cancelled.\n\n` +
                        `Reference: ${reference}\n` +
                        `Amount: ${totalAmount.toLocaleString()} ${currency}\n\n` +
                        `Type "hi" to try again.`
                    );
                    
                    deleteSession(userId);
                } else if (status.status === 'error') {
                    clearInterval(intervalId);
                    console.log(`❌ Payment error for ${userId}, reference: ${reference}`);
                    
                    await messaging.sendMessage(userId,
                        `❌ *Payment Error*\n\n` +
                        `There was an error processing your payment.\n\n` +
                        `Error: ${status.error || 'Unknown error'}\n\n` +
                        `Please try again or contact support.`
                    );
                    
                    deleteSession(userId);
                }
                // If still pending, continue polling
                
            } catch (error) {
                console.error(`❌ Error checking payment status for ${userId}:`, error.message);
                // Continue polling on error
            }
        };
        
        // Start polling
        const intervalId = setInterval(checkStatus, pollInterval);
        // Initial check
        setTimeout(checkStatus, 2000);
    }
    
    /**
     * NEW: Fulfill airtime purchase via HotRecharge
     * Called after successful PayNow payment
     */
    async fulfillAirtimePurchase(userId, session, paymentStatus) {
        const { network, phone, amount, serviceFee, totalAmount, reference } = session.data;
        const currency = PAYMENT_CONFIG.CURRENCIES.AIRTIME;
        const displayPhone = phone.replace('263', '0');
        
        try {
            // Notify user that airtime is being processed
            await messaging.sendMessage(userId,
                `✅ *Payment Confirmed!*\n\n` +
                `💰 *Purchasing airtime via HotRecharge...*\n\n` +
                `• Amount: ${amount.toLocaleString()} ${currency}\n` +
                `• Network: ${network}\n` +
                `• Phone: ${displayPhone}\n\n` +
                `⏳ *Processing...*`
            );
            
            console.log(`🔌 [HOTRECHARGE] Calling API for ${userId}:`, {
                phone: phone,
                amount: amount,
                network: network,
                paynowReference: paymentStatus.paynowref,
                transactionId: reference
            });
            
            // Call HotRecharge API to buy airtime
            const hotrechargeResult = await hotrechargeService.buyAirtime(
                phone,
                amount,
                network
            );
            
            console.log(`🔌 [HOTRECHARGE] Result for ${userId}:`, hotrechargeResult);
            
            // Send receipt with HotRecharge details
            if (hotrechargeResult.success) {
                const receiptMessage = `✅ *Airtime Purchase Successful!*\n\n` +
                    `📋 *Receipt:*\n` +
                    `• Transaction ID: ${reference}\n` +
                    `• PayNow Ref: ${paymentStatus.paynowref || 'N/A'}\n` +
                    `• HotRecharge ID: ${hotrechargeResult.transactionId || 'N/A'}\n` +
                    `• Network: ${network}\n` +
                    `• Phone: ${displayPhone}\n` +
                    `• Airtime Amount: ${amount.toLocaleString()} ${currency}\n` +
                    `• Service Fee: ${serviceFee.toLocaleString()} ${currency}\n` +
                    `• Total Paid: ${totalAmount.toLocaleString()} ${currency}\n` +
                    `• Date: ${new Date().toLocaleString()}\n\n` +
                    `🎉 *Airtime sent successfully!*\n\n` +
                    `💡 You should receive it within 2 minutes.\n\n` +
                    `Type "hi" for another transaction.`;
                
                await messaging.sendMessage(userId, receiptMessage);
                
            } else {
                // HotRecharge failed - refund needed in production
                const errorMessage = `⚠️ *Airtime Processing Issue*\n\n` +
                    `Payment was successful but airtime could not be delivered.\n\n` +
                    `*Details:*\n` +
                    `• Reference: ${reference}\n` +
                    `• Error: ${hotrechargeResult.message || 'Unknown error'}\n\n` +
                    `🛠️ *Support:*\n` +
                    `Please contact support with your reference number.\n\n` +
                    `Type "hi" to try again.`;
                
                await messaging.sendMessage(userId, errorMessage);
                console.error(`❌ HotRecharge failed after payment:`, hotrechargeResult);
            }
            
        } catch (error) {
            console.error(`❌ Error in fulfillAirtimePurchase for ${userId}:`, error.message);
            
            await messaging.sendMessage(userId,
                `❌ *Fulfillment Error*\n\n` +
                `Payment was successful but there was an error processing your airtime.\n\n` +
                `*Reference:* ${reference}\n\n` +
                `🛠️ *Support:*\n` +
                `Please contact support with this reference number.\n\n` +
                `Type "hi" to try again.`
            );
        } finally {
            // Always clean up session
            deleteSession(userId);
        }
    }
}

// Export singleton instance
module.exports = new AirtimeService();