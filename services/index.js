// services/index.js - Export all service modules

const airtimeService = require('./airtime');
const zesaService = require('./zesa');
const billsService = require('./bills');
const nyaradzoService = require('./nyaradzo');
const emergencyService = require('./emergency');
const helpService = require('./help');
const paynowService = require('./paynow');
const hotrecharge = require('./hotrecharge');

// TelOne Services
const teloneVoice = require('./telone_voice');
const teloneBroadband = require('./telone_broadband');
const teloneLte = require('./telone_lte');
const teloneVoip = require('./telone_voip');
const teloneUsd = require('./telone_usd');

module.exports = {
    airtimeService,
    zesaService,
    billsService,
    nyaradzoService,
    emergencyService,
    helpService,
    paynowService,
    hotrecharge,
    
    // TelOne Services
    teloneVoice,
    teloneBroadband,
    teloneLte,
    teloneVoip,
    teloneUsd
};
