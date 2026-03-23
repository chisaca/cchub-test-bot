/**
 * Marketplace Handler - Car Sales and Job Listings
 * Follows 3-tap maximum pattern
 */

const axios = require('axios');
const { MARKETPLACE_CONFIG } = require('../config/constants');
const { sendText, sendButtons } = require('../utils/messaging');
const { updateUserSession } = require('./sessionHandlers');

const WP_API_URL = process.env.WORDPRESS_API_URL || 'https://cchub.co.zw/wp-json/cchub/v1';

class MarketplaceHandler {
  
  /**
   * Main marketplace menu
   * Tap 1: User selects MARKETPLACE from main menu
   */
  async handleMarketplaceMain(userId, phoneNumber, session) {
    const options = [
      { id: 'cars', title: '🚗 Car Sales', description: 'Browse cars for sale' },
      { id: 'jobs', title: '💼 Job Listings', description: 'Find jobs in Zimbabwe' }
    ];
    
    // Send buttons if available, or text menu
    await sendText(phoneNumber, 
      '🏪 *Marketplace*\n\n' +
      'What would you like to browse?\n\n' +
      '1️⃣ Car Sales - Browse cars for sale\n' +
      '2️⃣ Job Listings - Find employment opportunities\n\n' +
      'Reply with the number (1 or 2)'
    );
    
    await updateUserSession(userId, {
      state: 'MARKETPLACE_MAIN',
      data: {}
    });
    
    return true;
  }
  
  /**
   * Handle main menu selection
   */
  async handleMarketplaceSelection(userId, phoneNumber, selection, session) {
    if (selection === '1' || selection.toLowerCase() === 'cars' || selection === '🚗 Car Sales') {
      return this.handleCarListings(userId, phoneNumber, session);
    } else if (selection === '2' || selection.toLowerCase() === 'jobs' || selection === '💼 Job Listings') {
      // Will implement jobs later
      await sendText(phoneNumber, 'Job listings coming soon!');
      return this.handleMarketplaceMain(userId, phoneNumber, session);
    } else {
      await sendText(phoneNumber, 'Please reply with 1 for Car Sales or 2 for Job Listings');
      return false;
    }
  }
  
  /**
   * Fetch and display car listings (paginated)
   * Tap 2: User selects Car Sales from marketplace menu
   */
  async handleCarListings(userId, phoneNumber, session, page = 1) {
    try {
      // Fetch listings from WordPress API
      const response = await axios.get(`${WP_API_URL}/car-listings`, {
        params: {
          page: page,
          limit: MARKETPLACE_CONFIG.CAR_LISTINGS.items_per_page,
          format: 'json'
        },
        timeout: 10000
      });
      
      const listings = response.data.data;
      const pagination = response.data.pagination;
      
      if (!listings || listings.length === 0) {
        await sendText(phoneNumber,
          '🚗 *No Car Listings*\n\n' +
          'There are currently no active car listings.\n\n' +
          'Want to sell your car? Visit our website to list it:\n' +
          'https://cchub.co.zw/sell-car'
        );
        return this.handleMarketplaceMain(userId, phoneNumber, session);
      }
      
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
      
      await sendText(phoneNumber, message);
      
      // Store pagination info in session
      await updateUserSession(userId, {
        state: 'CAR_LISTINGS_BROWSE',
        data: {
          current_page: pagination.current_page,
          total_pages: pagination.total_pages,
          listings: listings // Store current page listings for quick lookup
        }
      });
      
      return true;
      
    } catch (error) {
      console.error('Error fetching car listings:', error.message);
      await sendText(phoneNumber,
        '⚠️ *Service Temporarily Unavailable*\n\n' +
        'Unable to fetch car listings at the moment. Please try again later.\n\n' +
        'You can also view listings directly on our website:\n' +
        'https://cchub.co.zw/car-listings'
      );
      return false;
    }
  }
  
  /**
   * View a single car listing
   * Tap 3: User selects a specific listing number
   */
  async viewCarListing(userId, phoneNumber, session, selection) {
    const currentPage = session.data.current_page || 1;
    const listings = session.data.listings || [];
    
    // Parse the selection (could be number or "MORE"/"BACK")
    if (selection.toUpperCase() === 'MORE') {
      const nextPage = currentPage + 1;
      return this.handleCarListings(userId, phoneNumber, session, nextPage);
    }
    
    if (selection.toUpperCase() === 'BACK') {
      const prevPage = currentPage - 1;
      return this.handleCarListings(userId, phoneNumber, session, prevPage);
    }
    
    if (selection.toUpperCase() === 'MENU') {
      return this.handleMarketplaceMain(userId, phoneNumber, session);
    }
    
    // Try to parse as listing number
    const listingNumber = parseInt(selection);
    if (isNaN(listingNumber) || listingNumber < 1 || listingNumber > listings.length) {
      await sendText(phoneNumber, 
        'Invalid selection. Please reply with the listing number shown in the message, or type MENU to go back.'
      );
      return false;
    }
    
    const listing = listings[listingNumber - 1];
    
    // Fetch full listing details from API
    try {
      const response = await axios.get(`${WP_API_URL}/car-listings/${listing.id}`, {
        params: { format: 'whatsapp' },
        timeout: 10000
      });
      
      // The API returns formatted WhatsApp text when format=whatsapp
      await sendText(phoneNumber, response.data);
      
      // Also send the URL separately so WhatsApp shows a link preview
      if (listing.permalink) {
        await sendText(phoneNumber, 
          `🔗 *View full listing with photo:*\n${listing.permalink}`
        );
      }
      
      // Return to browse after viewing
      await sendText(phoneNumber, 
        'Reply *MORE* for more listings, or *MENU* to return to marketplace'
      );
      
      // Keep session in browse state
      return true;
      
    } catch (error) {
      console.error('Error fetching listing details:', error.message);
      await sendText(phoneNumber,
        '⚠️ Unable to fetch listing details. The listing may have expired.\n\n' +
        'Try browsing again with *MORE* or *MENU*'
      );
      return false;
    }
  }
}

module.exports = new MarketplaceHandler();