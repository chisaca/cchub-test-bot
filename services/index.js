// services/index.js - Export all service modules

const airtimeService = require('./airtime');
const zesaService = require('./zesa');
const billsService = require('./bills');
const nyaradzoService = require('./nyaradzo');
const emergencyService = require('./emergency');
const helpService = require('./help');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');

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
