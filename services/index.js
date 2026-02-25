// services/index.js
// ============================================================================
// SERVICES INDEX - CENTRAL EXPORT HUB
// Aggregates and exports all service modules for easy import throughout the app
// 
// This file provides a single entry point for importing services:
// const { airtimeService, zesaService } = require('./services');
// ============================================================================

const airtimeService = require('./airtime');
const zesaService = require('./zesa');
const billsService = require('./bills');
const nyaradzoService = require('./nyaradzo');
const emergencyService = require('./emergency');
const helpService = require('./help');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');

// ============================================================================
// EXPORT ALL SERVICES
// Each service handles a specific business domain:
// 
// airtimeService   - Airtime purchase flow (USD/ZiG, all networks)
// zesaService      - ZESA token purchase flow (USD/ZiG)
// billsService     - Bill payment selection and routing
// nyaradzoService  - Nyaradzo funeral policy payments
// emergencyService - Emergency contacts lookup
// helpService      - Help information and error recovery
// paynowService    - Payment gateway integration (all 8 methods)
// hotrecharge      - Service fulfillment orchestrator
// ============================================================================
module.exports = {
    airtimeService,
    zesaService,
    billsService,
    nyaradzoService,
    emergencyService,
    helpService,
    paynowService,
    hotrecharge,
};
