// utils/personality.js - NEW FILE
// ============================================================================
// PERSONALITY UTILITY
// Handles all bot personality features:
// - Time-based greetings
// - Random responses (thanks, errors, encouragement)
// - Jokes every 5th interaction
// - Zimbabwe facts
// - Interaction tracking
// ============================================================================

const { PERSONALITY_CONFIG, DAILY_ENGAGEMENT_CONFIG } = require('../config/constants');

/**
 * Track user interaction count for personality features
 * 
 * @param {string} userId - WhatsApp user ID
 * @param {Map} interactionMap - Map storing interaction counts
 * @returns {number} Current interaction count
 */
function trackInteraction(userId, interactionMap) {
    const currentCount = interactionMap.get(userId) || 0;
    const newCount = currentCount + 1;
    interactionMap.set(userId, newCount);
    
    // Reset after 20 interactions to prevent too many jokes
    if (newCount > 20) {
        interactionMap.set(userId, 1);
    }
    
    console.log(`🎭 [PERSONALITY] User ${userId} interaction #${newCount}`);
    return newCount;
}

/**
 * Get time-based greeting based on hour of day
 * 
 * @returns {string} Appropriate greeting
 */
function getTimeBasedGreeting() {
    const hour = new Date().getHours();
    
    if (hour < 12) {
        return PERSONALITY_CONFIG.GREETINGS.morning;
    } else if (hour < 17) {
        return PERSONALITY_CONFIG.GREETINGS.afternoon;
    } else if (hour < 20) {
        return PERSONALITY_CONFIG.GREETINGS.evening;
    } else {
        return PERSONALITY_CONFIG.GREETINGS.night;
    }
}

/**
 * Get a random response from a category
 * 
 * @param {string} category - Response category (greeting, thanks, error, goodbye, encouragement)
 * @returns {string} Random response
 */
function getRandomResponse(category) {
    const responses = PERSONALITY_CONFIG.FUN_RESPONSES[category];
    if (!responses || responses.length === 0) {
        return '';
    }
    
    const randomIndex = Math.floor(Math.random() * responses.length);
    return responses[randomIndex];
}

/**
 * Add a random Zimbabwe fact to a message (20% chance)
 * 
 * @param {string} message - Original message
 * @returns {string} Message with fact added (or original)
 */
function addRandomFact(message) {
    // 20% chance to add a fact
    if (Math.random() < 0.2) {
        const facts = PERSONALITY_CONFIG.ZIM_FACTS;
        const randomFact = facts[Math.floor(Math.random() * facts.length)];
        return message + '\n\n' + randomFact;
    }
    return message;
}

/**
 * Add a joke to message if it's user's 5th interaction
 * 
 * @param {string} message - Original message
 * @param {string} userId - WhatsApp user ID
 * @param {Map} interactionMap - Map storing interaction counts
 * @returns {string} Message with joke added (or original)
 */
function maybeAddJoke(message, userId, interactionMap) {
    const count = interactionMap.get(userId) || 0;
    
    // Add joke on 5th, 10th, 15th, 20th interaction
    if (count > 0 && count % 5 === 0) {
        const jokes = PERSONALITY_CONFIG.FUN_RESPONSES.joke;
        const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
        return message + '\n\n😂 *P.S.* ' + randomJoke;
    }
    
    return message;
}

/**
 * Get encouragement message for in-progress transactions
 * 
 * @returns {string} Random encouragement
 */
function getEncouragement() {
    return getRandomResponse('encouragement');
}

/**
 * Get a random daily tip
 * 
 * @returns {string} Daily tip
 */
function getDailyTip() {
    const tips = DAILY_ENGAGEMENT_CONFIG.TIPS;
    return tips[Math.floor(Math.random() * tips.length)];
}

/**
 * Check if today is a special holiday and return greeting
 * 
 * @returns {string|null} Holiday greeting or null
 */
function getHolidayGreeting() {
    const today = new Date();
    const dateStr = `${today.getMonth() + 1}-${today.getDate()}`;
    
    return DAILY_ENGAGEMENT_CONFIG.HOLIDAYS[dateStr] || null;
}

/**
 * Get streak milestone message based on streak count
 * 
 * @param {number} streak - Current streak count
 * @returns {string|null} Milestone message or null
 */
function getStreakMilestoneMessage(streak) {
    return DAILY_ENGAGEMENT_CONFIG.STREAK_MILESTONES[streak] || null;
}

/**
 * Add personality to a payment confirmation message
 * 
 * @param {string} baseMessage - The base confirmation message
 * @returns {string} Message with personality added
 */
function addPaymentPersonality(baseMessage) {
    const randomConfirm = PERSONALITY_CONFIG.PAYMENT_CONFIRMATIONS[
        Math.floor(Math.random() * PERSONALITY_CONFIG.PAYMENT_CONFIRMATIONS.length)
    ];
    
    return baseMessage + '\n\n' + randomConfirm;
}

/**
 * Get a personalized welcome message for returning user
 * 
 * @param {string} userName - User's name (if known)
 * @param {number} transactionCount - Number of past transactions
 * @param {number} streak - Current streak
 * @returns {string} Personalized welcome
 */
function getPersonalizedWelcome(userName, transactionCount, streak) {
    let message = `👋 Welcome back`;
    
    if (userName) {
        message += `, ${userName}`;
    }
    
    message += `!\n\n`;
    
    // Add personalized stats
    if (transactionCount > 0) {
        message += `📊 You've made *${transactionCount} transactions* with us.\n`;
    }
    
    if (streak > 0) {
        const streakEmoji = streak >= 7 ? '🔥' : '⭐';
        message += `${streakEmoji} You're on a *${streak}-day streak*!\n`;
    }
    
    // Add random fact or tip
    if (Math.random() < 0.3) {
        message += '\n💡 *Tip:* ' + getDailyTip();
    }
    
    return message;
}

/**
 * Format error message with personality (less scary)
 * 
 * @param {string} errorType - Type of error
 * @param {string} technicalMessage - Technical error message
 * @returns {string} Friendly error message
 */
function getFriendlyErrorMessage(errorType, technicalMessage = '') {
    const friendlyError = getRandomResponse('error');
    
    let message = friendlyError;
    
    if (technicalMessage) {
        message += '\n\n`' + technicalMessage + '`';
    }
    
    message += '\n\nTry again or type *hi* to restart.';
    
    return message;
}

/**
 * Get goodbye message
 * 
 * @returns {string} Random goodbye
 */
function getGoodbyeMessage() {
    return getRandomResponse('goodbye');
}

/**
 * Get thanks message
 * 
 * @returns {string} Random thanks
 */
function getThanksMessage() {
    return getRandomResponse('thanks');
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
    trackInteraction,
    getTimeBasedGreeting,
    getRandomResponse,
    addRandomFact,
    maybeAddJoke,
    getEncouragement,
    getDailyTip,
    getHolidayGreeting,
    getStreakMilestoneMessage,
    addPaymentPersonality,
    getPersonalizedWelcome,
    getFriendlyErrorMessage,
    getGoodbyeMessage,
    getThanksMessage
};