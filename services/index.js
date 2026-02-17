// services/index.js - Export all service modules

const airtimeService = require('./airtime');
const zesaService = require('./zesa');
const billsService = require('./bills');
const emergencyService = require('./emergency');
const helpService = require('./help');
const paynowService = require('./paynow'); // Add this
const hotrecharge = require('./hotrecharge');

module.exports = {
    airtimeService,
    zesaService,
    billsService,
    emergencyService,
    helpService,
    paynowService,  // Export it
    hotrecharge
};