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
    
    // Build details from listing data
    const car = listing.car_details;
    const contact = listing.contact_details;
    
    // Format the car details message
    let detailsMessage = `🚗 *${car.make} ${car.model}`;
    if (car.year) detailsMessage += ` ${car.year}`;
    detailsMessage += `*\n━━━━━━━━━━━━━━━━━━\n\n`;
    detailsMessage += `💰 *Price:* $${car.price}\n`;
    detailsMessage += `📍 *Location:* ${car.location}\n`;
    if (car.mileage) detailsMessage += `📊 *Mileage:* ${Number(car.mileage).toLocaleString()} km\n`;
    detailsMessage += `\n📞 *Contact:* ${contact.name || 'Seller'}\n`;
    detailsMessage += `📱 *Phone:* ${contact.phone || 'Contact via website'}\n`;
    detailsMessage += `━━━━━━━━━━━━━━━━━━\n\n`;
    detailsMessage += `💡 *Tip:* View the full listing on our website for photos and more details!`;
    
    // Send the car details
    await messaging.sendMessage(userId, detailsMessage);
    
    // ========================================================================
    // TRY TO SEND IMAGE - Check all possible image URL locations
    // ========================================================================
    let imageUrl = null;
    
    // Check all possible places the image URL could be
    if (car.image_url) {
      imageUrl = car.image_url;
      console.log('📸 Found image in car_details.image_url');
    } else if (listing.featured_image) {
      imageUrl = listing.featured_image;
      console.log('📸 Found image in featured_image');
    } else if (listing.car_details?.image) {
      imageUrl = listing.car_details.image;
      console.log('📸 Found image in car_details.image');
    } else if (listing.image) {
      imageUrl = listing.image;
      console.log('📸 Found image in listing.image');
    }
    
    let imageSent = false;
    
    if (imageUrl) {
      try {
        // Try to send as image
        await messaging.sendImageMessage(
          userId, 
          imageUrl, 
          `📸 ${car.make} ${car.model} - Tap to view and download`
        );
        imageSent = true;
        console.log('✅ Image sent successfully');
      } catch (imageError) {
        console.error('Failed to send image:', imageError.message);
        // Image failed - will send fallback URL below
        imageSent = false;
      }
    }
    
    // ========================================================================
    // SEND WEBSITE URL AS FALLBACK (if image failed or no image)
    // ========================================================================
    if (!imageSent && listing.permalink) {
      await messaging.sendMessage(
        userId, 
        `🔗 *View full listing with photos:*\n${listing.permalink}\n\n📸 All car photos available on our website.`
      );
      console.log('🔗 Sent website URL as fallback');
    } else if (!imageSent && !listing.permalink) {
      // No image and no permalink - send generic message
      await messaging.sendMessage(
        userId, 
        `📸 *Photos available on website*\n\nVisit https://cchub.co.zw/car-listings to view photos of this vehicle.`
      );
    }
    
    // ========================================================================
    // SEND NAVIGATION BUTTONS
    // ========================================================================
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
  }

  /**
 * Handle job listings selection
 * Tap 2: User selects Job Listings from marketplace menu
 */
async handleJobListings(userId, session, page = 1) {
    try {
        const result = await wordpressApi.fetchJobListings(page, 5);
        
        if (!result.success || result.data.length === 0) {
            await messaging.sendMessage(userId,
                '💼 *No Job Listings*\n\n' +
                'There are currently no active job listings.\n\n' +
                'Employers: Visit our website to post jobs:\n' +
                'https://cchub.co.zw/post-job'
            );
            return this.handleMarketplaceMain(userId, session);
        }
        
        const jobs = result.data;
        const pagination = result.pagination;
        
        // Format the jobs message
        let message = `💼 *Job Listings* (Page ${pagination.current_page} of ${pagination.total_pages})\n\n`;
        message += '───────────────────\n\n';
        
        jobs.forEach((job, index) => {
            const details = job.job_details;
            const jobNumber = ((pagination.current_page - 1) * pagination.per_page) + index + 1;
            
            message += `*${jobNumber}. ${details.title}*\n`;
            message += `🏢 ${details.company}\n`;
            message += `📍 ${details.location}\n`;
            message += `💰 ${details.salary || 'Not specified'}\n`;
            message += `📋 ${details.job_type}\n`;
            message += `───────────────────\n\n`;
        });
        
        message += `Reply with the job number to see full details.\n`;
        
        if (pagination.current_page < pagination.total_pages) {
            message += `\nReply *MORE* for next page`;
        }
        if (pagination.current_page > 1) {
            message += `\nReply *BACK* for previous page`;
        }
        message += `\n\nReply *MENU* to return to marketplace`;
        
        await messaging.sendMessage(userId, message);
        
        // Store pagination info in session
        if (session) {
            session.state = FLOW_STATES.MARKETPLACE.JOB_LISTINGS_BROWSE;
            session.data = {
                ...session.data,
                current_page: pagination.current_page,
                total_pages: pagination.total_pages,
                jobs: jobs
            };
        }
        
        return { message: null, session };
        
    } catch (error) {
        console.error('Error fetching job listings:', error.message);
        await messaging.sendMessage(userId,
            '⚠️ *Service Temporarily Unavailable*\n\n' +
            'Unable to fetch job listings at the moment. Please try again later.\n\n' +
            'You can also view listings directly on our website:\n' +
            'https://cchub.co.zw/jobs'
        );
        return { message: null, session };
    }
}

/**
 * View a single job listing
 * Tap 3: User selects a specific job number
 */
  async viewJobListing(userId, messageText, session) {
      const input = messageText.toUpperCase().trim();
      const currentPage = session?.data?.current_page || 1;
      const jobs = session?.data?.jobs || [];
      
      // Handle pagination
      if (input === 'MORE') {
          const nextPage = currentPage + 1;
          return this.handleJobListings(userId, session, nextPage);
      }
      
      if (input === 'BACK') {
          const prevPage = currentPage - 1;
          return this.handleJobListings(userId, session, prevPage);
      }
      
      if (input === 'MENU') {
          return this.handleMarketplaceMain(userId, session);
      }
      
      // Try to parse as job number
      const jobNumber = parseInt(messageText);
      if (isNaN(jobNumber) || jobNumber < 1 || jobNumber > jobs.length) {
          await messaging.sendMessage(userId, 
              'Invalid selection. Please reply with the job number shown in the message, or type MENU to go back.'
          );
          return { message: null, session };
      }
      
      const job = jobs[jobNumber - 1];
      const details = job.job_details;
      const employer = job.employer_details;
      
      // Format job details for WhatsApp
      let message = `💼 *${details.title}*\n`;
      message += `🏢 ${details.company}\n`;
      message += `━━━━━━━━━━━━━━━━━━\n\n`;
      message += `📋 *Type:* ${details.job_type}\n`;
      message += `📍 *Location:* ${details.location}\n`;
      message += `💰 *Salary:* ${details.salary || 'Negotiable'}\n`;
      
      if (details.experience && details.experience !== 'Not specified') {
          message += `📚 *Experience:* ${details.experience}\n`;
      }
      if (details.education && details.education !== 'Not specified') {
          message += `🎓 *Education:* ${details.education}\n`;
      }
      
      message += `\n📝 *Description:*\n${details.description}\n\n`;
      message += `✓ *Requirements:*\n${details.requirements}\n\n`;
      message += `📅 *Closing:* ${details.closing_date}\n\n`;
      
      message += `📞 *Contact:*\n`;
      if (employer.contact_person) {
          message += `👤 ${employer.contact_person}\n`;
      }
      if (employer.phone) {
          // Mask phone number for privacy
          const masked = employer.phone.slice(0, 4) + '****' + employer.phone.slice(-3);
          message += `📱 ${masked}\n`;
      }
      if (employer.email) {
          message += `📧 ${employer.email}\n`;
      }
      
      message += `\n━━━━━━━━━━━━━━━━━━\n`;
      message += `💡 *How to apply:*\n${details.how_to_apply}`;
      
      await messaging.sendMessage(userId, message);
      
      // Send navigation buttons
      const navigationButtons = [
          { id: "MORE", title: "📋 Back to Jobs" },
          { id: "MARKETPLACE", title: "🏪 Marketplace" },
          { id: "HI", title: "🏠 Main Menu" }
      ];
      
      await messaging.sendButtonMessage(
          userId,
          "What would you like to do next?",
          navigationButtons
      );
      
      return { message: null, session };
  }
}

module.exports = new MarketplaceHandler();