# CCHub WhatsApp Bot

A state-driven WhatsApp bot integrated with WordPress that allows users to purchase services (Airtime, ZESA tokens, Nyaradzo payments) using multiple currencies and payment methods, with automatic transaction logging.

## 🚀 Features

- **8 Payment Methods**: EcoCash, Zimswitch, PayGo, OneMoney (ZiG) + EcoCash, Zimswitch, PayGo, InnBucks (USD)
- **Dual Currency**: Full support for ZiG and USD with separate PayNow credentials
- **Services**: Airtime, ZESA tokens, Nyaradzo funeral payments
- **WordPress Integration**: Automatic transaction logging with local queue fallback
- **Token Management**: Zimswitch recurring payment support (store/reuse cards)
- **Session Management**: 10-minute timeout with payment method awareness
- **HotRecharge Integration**: Instant service fulfillment
- **Emergency Services**: Live contacts database for all 10 provinces
- **Rate Limiting**: 3-attempt limit with 15-minute lockout
- **Network Detection**: Automatic detection of Econet/NetOne/Telecel

## 📋 Prerequisites

- Node.js v16 or higher
- npm or yarn package manager
- WhatsApp Business API access (Meta Developer account)
- PayNow merchant accounts (separate for USD and ZiG)
- HotRecharge API credentials
- WordPress site with CCHub plugin installed
- Render.com account (for deployment) or any Node.js hosting

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/cchub-whatsapp-bot.git
   cd cchub-whatsapp-bot

   Install dependencies

bash
npm install
Copy environment configuration

bash
cp .env.example .env
Edit .env with your credentials (see Configuration section below)

Start the bot

bash
# Production mode
npm start

# Development mode with auto-reload
npm run dev
⚙️ Configuration
Create a .env file with the following variables:

env
# Server
PORT=3000

# WhatsApp Meta API
WHATSAPP_ACCESS_TOKEN=your_facebook_access_token
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token
PHONE_NUMBER_ID=your_whatsapp_phone_number_id

# PayNow USD
PAYNOW_ID=23374
PAYNOW_KEY=486538ea-63af-4400-a91b-8d9d1c67ccd3

# PayNow ZiG
PAYNOW_ID_ZIG=23556
PAYNOW_KEY_ZIG=55213442-3155-49b9-8bb4-4d4acfce9c6c

# PayNow URLs (update with your domain)
PAYNOW_RESULT_URL=https://your-domain.com/webhook/paynow-result
PAYNOW_RETURN_URL=https://your-domain.com/payment-complete
PAYNOW_MERCHANT_EMAIL=your-email@example.com

# HotRecharge
HOT_ACCESS_CODE=your_hotrecharge_email
HOT_PASSWORD=your_hotrecharge_password
HOT_API_BASE_URL=https://ssl.hot.co.zw/api/v3
HOT_MAX_RETRIES=3

# WordPress Integration
WORDPRESS_API_URL=https://your-wordpress-site.com
WP_API_KEY=your_64_character_api_key
📁 Project Structure
text
cchub-whatsapp-bot/
├── config/
│   └── constants.js           # All system constants and messages
├── handlers/
│   ├── mainMenuHandler.js      # Main menu routing
│   ├── messageHandler.js       # Main message processor
│   ├── sessionHandlers.js      # Session management
│   ├── subMenuHandler.js       # Submenu definitions
│   └── submenuSessionHandler.js # Submenu session storage
├── services/
│   ├── airtime.js              # Airtime purchase flow
│   ├── bills.js                # Bill payment routing
│   ├── currencyGate.js         # Currency availability rules
│   ├── emergency.js            # Emergency contacts flow
│   ├── help.js                 # Help system
│   ├── hotrecharge.js          # Main HotRecharge orchestrator
│   ├── index.js                # Services export
│   ├── nyaradzo.js             # Nyaradzo payment flow
│   ├── paynow.js               # PayNow payment gateway
│   ├── zesa.js                 # ZESA token flow
│   └── hotrecharge-services/    # HotRecharge API modules
│       ├── airtimeusd.js
│       ├── airtimezig.js
│       ├── nyaradzo.js
│       ├── zesausd.js
│       └── zesazig.js
├── utils/
│   ├── messaging.js            # WhatsApp message sender
│   └── validation.js           # Input validation utilities
├── logs/
│   └── wp-queue.json           # Queue for failed WordPress logs
├── index.js                     # Main entry point
├── .env                         # Environment variables (not in git)
├── .env.example                 # Example environment variables
├── .gitignore                   # Git ignore file
├── package.json                 # Dependencies and scripts
└── README.md                    # This file
🎯 Usage
Main Menu Options
text
1 📱 Airtime
2 ⚡ ZESA
3 📄 Bills
4 🚨 Emergency
5 ❓ Help
Payment Methods by Currency
ZiG Payments:

1 💰 EcoCash ZiG - (077/078 numbers)

2 💳 Zimswitch ZiG - Card payments

3 📱 PayGo ZiG - (071/077/078 numbers)

4 📱 OneMoney ZiG - (071 numbers)

USD Payments:

1 💰 EcoCash USD - (077/078 numbers)

2 💳 Zimswitch USD - Card payments

3 📱 PayGo USD - (071/077/078 numbers)

4 🏦 InnBucks USD - Voucher/QR code

Commands
hi - Restart from main menu (anytime, anywhere)

help - Show comprehensive help message

Numbers 1-5 - Menu navigation

Numbers 1-11 - Emergency service selection

YES or NO - Confirm or cancel transactions

🔄 Flow Architecture
The bot uses a strict state-driven architecture ensuring one flow at a time:

User sends message → messageHandler.js

Session check → Active? Route to service / No? Main menu

Service flow → Step-by-step prompts (currency → amount → payment)

Payment → paynow.js initiates with 1 of 8 methods

Fulfillment → hotrecharge.js delivers service

Logging → WordPress transaction log with queue fallback

State Flow Example (Airtime)
text
START → SELECT_CURRENCY → ENTER_AMOUNT → ENTER_PHONE → 
SELECT_PAYMENT_METHOD → (PAYMENT_PHONE if needed) → 
CONFIRM_PAYMENT → PROCESSING → COMPLETE
💳 Payment Methods - Detailed
Method	        Currency	        Type	        Requires Phone	      Notes
EcoCash	        USD & ZiG	        Mobile Money	Yes	                  USSD push, no dialing
OneMoney	      ZiG only	        Mobile Money	Yes	                  USSD push, no dialing
PayGo	          USD & ZiG	        Mobile Money	Yes	                  USSD push, no dialing
Zimswitch	      USD & ZiG	        Card	        No	                  Token storage available
InnBucks	      USD only	        Voucher	      No	                  QR code & deep link

💾 WordPress Integration
Database Table: wpvv_cchub_transactions
Field	            Type	            Description
id	              bigint(20)	      Primary key
transaction_id	  varchar(50)	      Unique reference
service	          varchar(50)	      airtime/zesa/nyaradzo
user_phone	      varchar(20)	      Customer phone
amount	          decimal(15,2)	    Transaction amount
currency	        varchar(10)	      USD or ZiG
status	          varchar(20)	      completed/failed/pending
payment_method	  varchar(50)	      Payment method used
metadata	        longtext	        JSON data (network, token, etc.)
created_at	      datetime	        Auto timestamp

Local Queue Fallback
If WordPress is unreachable, transactions are queued in:

text
logs/wp-queue.json

Testing
Development Mode (No Real Payments)
bash
NODE_ENV=development npm start
This enables simulation mode with mock PayNow responses.

Run Tests
bash
npm test

Manual Testing Flow
1.Send "hi" to bot

2.Select option 1 (Airtime)

3.Choose currency

4.Enter amount (e.g., 5 for USD)

5.Enter recipient (077...)

6.Select payment method

7.Confirm with YES

🚀 Deployment
Deploy on Render.com (Recommended)
1.Push code to GitHub

bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/cchub-bot.git
git push -u origin main

2.Create Web Service on Render
Go to render.com
Click "New +" → "Web Service"
Connect your GitHub repository

Configure:
  Name: cchub-whatsapp-bot
  Environment: Node
  Build Command: npm install
  Start Command: npm start

3.Add Environment Variables
  Copy all variables from your .env file
  Add them in Render's "Environment" section

4.Deploy
  Click "Create Web Service"
  Wait for build and deploy (first time takes 3-5 minutes)

IP Whitelisting for Imunify360
If your WordPress hosting uses Imunify360, whitelist Render's outbound IPs:

Render Static Outbound IPs:

text
54.144.132.152
18.209.55.74
34.192.70.54
18.209.160.111
34.205.22.73
34.192.173.156
Contact your hosting provider to add these to the whitelist.

Set up WhatsApp Webhook
  Go to your Meta Developer App
  Navigate to WhatsApp → Configuration
  Set Webhook URL:

text
https://your-render-url.onrender.com/webhook
Verify token: Use your WHATSAPP_VERIFY_TOKEN

Monitoring
Check Logs
bash
# On Render.com
# Go to Dashboard → Your Service → Logs

# Locally
tail -f logs/wp-queue.json  # Monitor failed WordPress logs
Health Checks
The bot includes a health endpoint:

text
GET https://your-domain.com/health
Session Stats (Admin Only)
text
GET https://your-domain.com/admin/stats
Returns active sessions, locked users, and transaction counts.

🆘 Troubleshooting
Common Issues
"Message not delivered"

Check WhatsApp token expiry (refresh every 60 days)

Verify phone number ID is correct

Check Meta webhook configuration

"Payment failed"

Verify PayNow credentials (USD vs ZiG - don't mix them!)

Check PayNow account balance

Ensure callback URLs are publicly accessible

"Service fulfillment failed"

Check HotRecharge balance

Verify HotRecharge credentials

Check logs/wp-queue.json for failed transactions

"WordPress not logging"

Verify WP_API_KEY is correct (64 characters)

Check if IP is whitelisted in Imunify360

Check WordPress site is accessible

Error Codes
Code	Meaning	Action
400	Bad request	Check input format
401	Unauthorized	Refresh tokens
403	Forbidden	Check IP whitelist
404	Not found	Check endpoints
429	Rate limited	Wait 15 minutes
500	Server error	Contact support
🔐 Security Notes
Never commit .env file to Git

Rotate WhatsApp tokens every 60 days

Use different PayNow credentials for USD and ZiG

Keep HotRecharge password secure

WordPress API key should be 64+ random characters

All sensitive data masked in logs

📝 License
Copyright © 2024 CCHub. All rights reserved.

👥 Support
Email: cchisango@cchub.co.zw

Phone: +263 71 286 1483

Website: https://cchub.co.zw

WhatsApp: +263 71 286 1483 (for testing)

🙏 Acknowledgments
PayNow - Payment gateway integration

HotRecharge - Service fulfillment API

Meta - WhatsApp Business Platform

Render - Hosting platform

WordPress - CMS and database

🎉 Version History
v2.0.0 (Current)

Full integration of all 8 payment methods

Dual currency support (USD/ZiG)

Token management for Zimswitch

WordPress transaction logging with queue fallback

Production-ready architecture

v1.0.0

Basic airtime and ZESA functionality

Single currency support

Initial release

Built with 💎 by the CCHub Team

text

This README is comprehensive and ready to paste into your file. It includes everything a new developer would need to understand, set up, and maintain the system.
