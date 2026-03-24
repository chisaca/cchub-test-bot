/**
 * Marketplace Handler - Car Sales and Job Listings
 * Follows 3-tap maximum pattern
 */

const { MARKETPLACE_CONFIG, FLOW_STATES, SERVICE_TYPES } = require('../config/constants');
const messaging = require('../utils/messaging');
const wordpressApi = require('../utils/wordpressApi');
const { getActiveSession, createSession } = require('./sessionHandlers');

class MarketplaceHandler {
  
  /**
   * Main marketplace menu
   * Tap 1: User selects MARKETPLACE from main menu
   */
  async handleMarketplaceMain(userId, session) {
    // Use messaging.sendMessage
    await messaging.sendMessage(userId, 
  '🏪 *MARKETPLACE*\n' +
  '━━━━━━━━━━━━━━━━━━\n\n' +
  '1. 🚗 *Car Sales*\n' +
  '2. 💼 *Job Listings*\n' +
  '━━━━━━━━━━━━━━━━━━\n' +
  'Reply with *1* or *2*\n' +
  'Type *MENU* to return'
);
    
    // Update session state directly
    if (session) {
      session.state = FLOW_STATES.MARKETPLACE.MAIN;
      // No need for updateUserSession - session is already in memory
    }
    
    return { message: null, session };
  }
  
  /**
   * Handle main menu selection
   */
  async handleMarketplaceSelection(userId, messageText, session) {
    const input = messageText.toLowerCase().trim();
    
    if (input === '1' || input === 'cars' || input === 'car' || input === '🚗 car sales') {
      return this.handleCarListings(userId, session, 1);
    } else if (input === '2' || input === 'jobs' || input === 'job') {
      await messaging.sendMessage(userId, 'Job listings coming soon!');
      return this.handleMarketplaceMain(userId, session);
    } else {
      await messaging.sendMessage(userId, 'Please reply with 1 for Car Sales or 2 for Job Listings');
      return { message: null, session };
    }
  }
  
  /**
   * Fetch and display car listings (paginated)
   * Tap 2: User selects Car Sales from marketplace menu
   */
  async handleCarListings(userId, session, page = 1) {
    try {
      // Fetch listings using wordpressApi
      const result = await wordpressApi.fetchCarListings(
        page, 
        MARKETPLACE_CONFIG.CAR_LISTINGS.items_per_page || 5,
        {} // No filters for now
      );
      
      if (!result.success || !result.data || result.data.length === 0) {
        await messaging.sendMessage(userId,
          '🚗 *No Car Listings*\n\n' +
          'There are currently no active car listings.\n\n' +
          'Want to sell your car? Visit our website to list it:\n' +
          'https://cchub.co.zw/sell-car'
        );
        return this.handleMarketplaceMain(userId, session);
      }
      
      const listings = result.data;
      const pagination = result.pagination;
      
      // Format the listings message
      let message = `🚗 *Car Listings* (Page ${pagination.current_page} of ${pagination.total_pages})\n\n`;
      message += '───────────────────\n\n';
      
      listings.forEach((listing, index) => {
        const car = listing.car_details;
        const listingNumber = ((pagination.current_page - 1) * pagination.per_page) + index + 1;
        
        message += `*${listingNumber}. ${car.make} ${car.model}`;
        if (car.year) message += ` ${car.year}`;
        message += '*\n';
        message += `💰 $${car.price}\n`;
        message += `📍 ${car.location}\n`;
        message += `───────────────────\n\n`;
      });
      
      message += `Reply with the listing number to see full details.\n`;
      
      if (pagination.current_page < pagination.total_pages) {
        message += `\nReply *MORE* for next page`;
      }
      
      if (pagination.current_page > 1) {
        message += `\nReply *BACK* for previous page`;
      }
      
      message += `\n\nReply *MENU* to return to marketplace`;
      
      await messaging.sendMessage(userId, message);
      
      // Store pagination info in session directly
      if (session) {
        session.state = FLOW_STATES.MARKETPLACE.CAR_LISTINGS_BROWSE;
        session.data = {
          ...session.data,
          current_page: pagination.current_page,
          total_pages: pagination.total_pages,
          listings: listings // Store current page listings for quick lookup
        };
        // Session is already in memory, no need to update
      }
      
      return { message: null, session };
      
    } catch (error) {
      console.error('Error fetching car listings:', error.message);
      await messaging.sendMessage(userId,
        '⚠️ *Service Temporarily Unavailable*\n\n' +
        'Unable to fetch car listings at the moment. Please try again later.\n\n' +
        'You can also view listings directly on our website:\n' +
        'https://cchub.co.zw/car-listings'
      );
      return { message: null, session };
    }
  }
  
  /**
   * View a single car listing
   * Tap 3: User selects a specific listing number
   */
  async viewCarListing(userId, messageText, session) {
    const input = messageText.toUpperCase().trim();
    const currentPage = session?.data?.current_page || 1;
    const listings = session?.data?.listings || [];
    
    // Handle pagination
    if (input === 'MORE') {
      const nextPage = currentPage + 1;
      return this.handleCarListings(userId, session, nextPage);
    }
    
    if (input === 'BACK') {
      const prevPage = currentPage - 1;
      return this.handleCarListings(userId, session, prevPage);
    }
    
    if (input === 'MENU') {
      return this.handleMarketplaceMain(userId, session);
    }
    
    // Try to parse as listing number
    const listingNumber = parseInt(messageText);
    if (isNaN(listingNumber) || listingNumber < 1 || listingNumber > listings.length) {
      await messaging.sendMessage(userId, 
        'Invalid selection. Please reply with the listing number shown in the message, or type MENU to go back.'
      );
      return { message: null, session };
    }
    
    const listing = listings[listingNumber - 1];
    
    // Fetch full listing details using wordpressApi
    try {
      const result = await wordpressApi.fetchCarListingById(listing.id, 'whatsapp');
      
      if (!result.success) {
        // Use fallback message from result if available
        await messaging.sendMessage(userId, result.formatted || '⚠️ Unable to fetch listing details. The listing may have expired.');
        return { message: null, session };
      }
      
      // Send the formatted WhatsApp text
      await messaging.sendMessage(userId, result.formatted);
      
      // Also send the URL separately so WhatsApp shows a link preview
      if (listing.permalink) {
        await messaging.sendMessage(userId, 
          `🔗 *View full listing with photo:*\n${listing.permalink}`
        );
      }
      
      // Return to browse after viewing
      await messaging.sendMessage(userId, 
        'Reply *MORE* for more listings, or *MENU* to return to marketplace'
      );
      
      return { message: null, session };
      
    } catch (error) {
      console.error('Error fetching listing details:', error.message);
      await messaging.sendMessage(userId,
        '⚠️ Unable to fetch listing details. The listing may have expired.\n\n' +
        'Try browsing again with *MORE* or *MENU*'
      );
      return { message: null, session };
    }
  }
}

module.exports = new MarketplaceHandler();