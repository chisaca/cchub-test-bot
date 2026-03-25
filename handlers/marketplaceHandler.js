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
   * Main marketplace menu - NOW USING INTERACTIVE LIST
   * Tap 1: User selects MARKETPLACE from main menu
   */
  async handleMarketplaceMain(userId, session) {
    // Send the interactive list menu instead of numbered menu
    const messaging = require('../utils/messaging');
    
    const sections = [{
      title: "MARKETPLACE",
      rows: [
        {
          id: "car_listings",
          title: "🚗 Car Sales",
          description: "Browse cars for sale"
        },
        {
          id: "job_listings",
          title: "💼 Job Listings",
          description: "Find employment opportunities"
        },
        {
          id: "hi",
          title: "🏠 Main Menu",
          description: "Return to main menu"
        }
      ]
    }];
    
    await messaging.sendListMessage(
      userId,
      "MARKETPLACE",
      "What would you like to browse?",
      "View Options",
      sections
    );
    
    if (session) {
      session.state = FLOW_STATES.MARKETPLACE.MAIN;
    }
    
    return { message: null, session };
  }
  
  /**
   * Handle main menu selection
   */
  async handleMarketplaceSelection(userId, messageText, session) {
    // This function should only handle text input (1, 2, car, job)
    // Since we're using interactive lists now, this might not be needed
    // But keep it for backward compatibility
    
    const input = messageText.toLowerCase().trim();
    
    if (input === '1' || input === 'cars' || input === 'car' || input === '🚗 car sales') {
      return this.handleCarListings(userId, session, 1);
    } else if (input === '2' || input === 'jobs' || input === 'job' || input === '💼 job listings') {
      return this.handleJobListings(userId, session, 1);
    } else {
      // If invalid text input, show the interactive menu
      return this.handleMarketplaceMain(userId, session);
    }
  }
  
  /**
   * Fetch and display car listings (paginated)
   */
  async handleCarListings(userId, session, page = 1) {
    try {
      const result = await wordpressApi.fetchCarListings(
        page, 
        MARKETPLACE_CONFIG.CAR_LISTINGS.items_per_page || 5,
        {}
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
      
      if (session) {
        session.state = FLOW_STATES.MARKETPLACE.CAR_LISTINGS_BROWSE;
        session.data = {
          ...session.data,
          current_page: pagination.current_page,
          total_pages: pagination.total_pages,
          listings: listings
        };
      }
      
      return { message: null, session };
      
    } catch (error) {
      console.error('Error fetching car listings:', error.message);
      await messaging.sendMessage(userId,
        '⚠️ *Service Temporarily Unavailable*\n\n' +
        'Unable to fetch car listings at the moment. Please try again later.'
      );
      return { message: null, session };
    }
  }
  
  /**
   * View a single car listing
   */
  async viewCarListing(userId, messageText, session) {
    const input = messageText.toUpperCase().trim();
    const currentPage = session?.data?.current_page || 1;
    const listings = session?.data?.listings || [];
    
    if (input === 'MORE') {
      return this.handleCarListings(userId, session, currentPage + 1);
    }
    
    if (input === 'BACK') {
      return this.handleCarListings(userId, session, currentPage - 1);
    }
    
    if (input === 'MENU') {
      return this.handleMarketplaceMain(userId, session);
    }
    
    const listingNumber = parseInt(messageText);
    if (isNaN(listingNumber) || listingNumber < 1 || listingNumber > listings.length) {
      await messaging.sendMessage(userId, 
        'Invalid selection. Please reply with the listing number shown in the message, or type MENU to go back.'
      );
      return { message: null, session };
    }
    
    const listing = listings[listingNumber - 1];
    const car = listing.car_details;
    const contact = listing.contact_details;
    
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
    
    await messaging.sendMessage(userId, detailsMessage);
    
    let imageUrl = car.image_url || listing.featured_image;
    let imageSent = false;
    
    if (imageUrl) {
      try {
        await messaging.sendImageMessage(userId, imageUrl, `📸 ${car.make} ${car.model}`);
        imageSent = true;
      } catch (imageError) {
        console.error('Failed to send image:', imageError.message);
      }
    }
    
    if (!imageSent && listing.permalink) {
      await messaging.sendMessage(userId, `🔗 *View full listing:*\n${listing.permalink}`);
    }
    
    const navigationButtons = [
      { id: "MORE", title: "📋 Back to Listings" },
      { id: "MARKETPLACE", title: "🏪 Marketplace" },
      { id: "HI", title: "🏠 Main Menu" }
    ];
    
    await messaging.sendButtonMessage(userId, "What would you like to do next?", navigationButtons);
    
    return { message: null, session };
  }

  /**
   * Handle job listings selection
   */
  async handleJobListings(userId, session, page = 1) {
    try {
      const result = await wordpressApi.fetchJobListings(page, 5);
      console.log('🔍 JOB LISTINGS RESULT:', JSON.stringify(result, null, 2));
      
      if (!result.success || result.data.length === 0) {
        console.log('⚠️ No job listings found, showing fallback');
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
        'Unable to fetch job listings at the moment. Please try again later.'
      );
      return { message: null, session };
    }
  }

  /**
   * View a single job listing
   */
  async viewJobListing(userId, messageText, session) {
    const input = messageText.toUpperCase().trim();
    const currentPage = session?.data?.current_page || 1;
    const jobs = session?.data?.jobs || [];
    
    if (input === 'MORE') {
      return this.handleJobListings(userId, session, currentPage + 1);
    }
    
    if (input === 'BACK') {
      return this.handleJobListings(userId, session, currentPage - 1);
    }
    
    if (input === 'MENU') {
      return this.handleMarketplaceMain(userId, session);
    }
    
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
      const masked = employer.phone.slice(0, 4) + '****' + employer.phone.slice(-3);
      message += `📱 ${masked}\n`;
    }
    if (employer.email) {
      message += `📧 ${employer.email}\n`;
    }
    
    message += `\n━━━━━━━━━━━━━━━━━━\n`;
    message += `💡 *How to apply:*\n${details.how_to_apply}`;
    
    await messaging.sendMessage(userId, message);
    
    const navigationButtons = [
      { id: "MORE", title: "📋 Back to Jobs" },
      { id: "MARKETPLACE", title: "🏪 Marketplace" },
      { id: "HI", title: "🏠 Main Menu" }
    ];
    
    await messaging.sendButtonMessage(userId, "What would you like to do next?", navigationButtons);
    
    return { message: null, session };
  }
}

module.exports = new MarketplaceHandler();