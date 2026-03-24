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
  'Type hi for Main Menu'
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
  
  // In viewCarListing() function

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
    
    if (input === 'MENU' || input === 'MARKETPLACE') {
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
    
    try {
      const result = await wordpressApi.fetchCarListingById(listing.id, 'whatsapp');
      
      if (!result.success) {
        await messaging.sendMessage(userId, result.formatted || '⚠️ Unable to fetch listing details.');
        return { message: null, session };
      }
      
      // STEP 1: Send formatted details with contact info
      const car = listing.car_details;
      const contact = listing.contact_details;
      
      let detailsMessage = `🚗 *${car.make} ${car.model}`;
      if (car.year) detailsMessage += ` ${car.year}`;
      detailsMessage += `*\n\n`;
      detailsMessage += `💰 *Price:* $${car.price}\n`;
      detailsMessage += `📍 *Location:* ${car.location}\n`;
      if (car.mileage) detailsMessage += `📊 *Mileage:* ${car.mileage.toLocaleString()} km\n`;
      detailsMessage += `\n📞 *Contact:* ${contact.name || 'Seller'}\n`;
      detailsMessage += `📱 *Phone:* ${contact.phone || 'Contact via website'}\n`;
      detailsMessage += `\n💡 *Tip:* Tap the image to view full size, then tap the download icon to save to your phone!`;
      
      await messaging.sendMessage(userId, detailsMessage);
      
      // STEP 2: Send image directly (with download option)
      const imageUrl = car.image_url || listing.featured_image;
      if (imageUrl) {
        // Send with caption that encourages download
        await messaging.sendImageMessage(
          userId, 
          imageUrl, 
          `📸 ${car.make} ${car.model} - Tap to view and download`
        );
      } else {
        // Fallback: send URL if no image
        if (listing.permalink) {
          await messaging.sendMessage(userId, `🔗 View online: ${listing.permalink}`);
        }
      }
      
      // STEP 3: Send contact as clickable if phone number exists
      if (contact.phone) {
        // Clean phone number (remove spaces, ensure format)
        let cleanPhone = contact.phone.replace(/\s/g, '');
        if (!cleanPhone.startsWith('+')) {
          cleanPhone = '+263' + cleanPhone.replace(/^0/, '');
        }
        
        await messaging.sendButtonMessage(
          userId,
          "📞 *Contact Seller*",
          [
            { id: `call_${cleanPhone}`, title: "Call Seller" }
          ]
        );
      }
      
      // STEP 4: Send navigation buttons
      const navigationButtons = [
        { id: "MORE", title: "📋 Back to Listings" },
        { id: "MARKETPLACE", title: "🏪 Marketplace" },
        { id: "HI", title: "🏠 Main Menu" }
      ];
      
      await messaging.sendButtonMessage(
        userId,
        "What would you like to do next?",
        navigationButtons
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