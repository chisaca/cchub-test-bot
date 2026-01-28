const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Store payment sessions
const paymentSessions = {};

// ==================== HELPER FUNCTIONS ====================

// A + B: Extract ALL PayCodes from free text
function extractPayCodes(message) {
    if (!message) return [];

    const normalized = message.toUpperCase().replace(/\s+/g, ' ').trim();

    // Detect CCH followed by EXACTLY 6 digits, anywhere in text
    const matches = normalized.match(/\bCCH\d{6}\b/g);

    return matches || [];
}

// Send WhatsApp message
async function sendMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v17.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    } catch (error) {
        console.error('❌ Error sending message:', error.message);
    }
}

function getServiceEmoji(serviceType) {
    return {
        schools: '🏫',
        city_council: '🏛️',
        insurance: '🛡️',
        retail: '🛒'
    }[serviceType] || '💳';
}

function getServiceDisplayName(serviceType) {
    return {
        schools: 'School Fees',
        city_council: 'City Council',
        insurance: 'Insurance',
        retail: 'Retail'
    }[serviceType] || serviceType;
}

// ==================== PAYCODE HANDLING ====================

async function handlePayCode(from, message) {
    console.log(`🔍 PayCode scan from ${from}: "${message}"`);

    const payCodes = extractPayCodes(message);

    // B: No paycode
    if (payCodes.length === 0) {
        return;
    }

    // B: Multiple paycodes (STOP)
    if (payCodes.length > 1) {
        await sendMessage(
            from,
            `⚠️ I found *more than one PayCode* in your message.\n\n` +
            `Please send *only one PayCode* to continue.\n\n` +
            `Example:\nCCH123456`
        );
        return;
    }

    // Exactly ONE paycode
    const payCode = payCodes[0];

    try {
        console.log(`🔐 Verifying PayCode: ${payCode}`);

        const response = await axios.get(
            `${process.env.WORDPRESS_API_URL}/wp-json/cchub/v1/get-biller-code/${payCode}`,
            {
                headers: { 'X-CCHUB-TOKEN': process.env.CCHUB_BOT_TOKEN },
                timeout: 10000
            }
        );

        const data = response.data;

        if (data.status !== 'success') {
            await sendMessage(
                from,
                `❌ This PayCode is not valid.\n\n` +
                `It may be expired or already used.\n\n` +
                `Please generate a new PayCode from the website.`
            );
            return;
        }

        paymentSessions[from] = {
            payCode,
            serviceType: data.service_type,
            providerName: data.provider_name,
            billerCode: data.biller_code,
            stage: 'amount_entry',
            timestamp: Date.now()
        };

        await sendMessage(
            from,
            `${getServiceEmoji(data.service_type)} *Payment detected ✅*\n\n` +
            `Service: ${getServiceDisplayName(data.service_type)}\n` +
            `Provider: ${data.provider_name}\n` +
            `Biller Code: ${data.biller_code}\n\n` +
            `Please enter the amount to pay.`
        );

    } catch (error) {
        console.error('❌ PayCode verification error:', error.message);

        await sendMessage(
            from,
            `⚠️ Unable to verify PayCode right now.\n\nPlease try again in a moment.`
        );
    }
}

// ==================== MAIN MENU ====================

async function sendWelcomeMessage(from) {
    delete paymentSessions[from];

    await sendMessage(
        from,
        `👋 *Welcome to CCHub*\n\n` +
        `What would you like to do?\n\n` +
        `1. Pay Bill (with PayCode)\n` +
        `2. Buy ZESA\n` +
        `3. Buy Airtime\n` +
        `4. Help\n\n` +
        `Reply with 1, 2, 3 or 4`
    );
}

// ==================== MAIN MESSAGE PROCESSOR ====================

async function processMessage(from, messageText) {
    console.log(`📩 From ${from}: "${messageText}"`);

    const clean = messageText.trim().toLowerCase();

    if (clean === 'hi' || clean === 'hello') {
        await sendWelcomeMessage(from);
        return;
    }

    // A + B: PayCode ALWAYS takes priority
    const payCodes = extractPayCodes(messageText);
    if (payCodes.length > 0) {
        await handlePayCode(from, messageText);
        return;
    }

    const session = paymentSessions[from];

    if (!session) {
        await sendWelcomeMessage(from);
        return;
    }

    if (session.stage === 'amount_entry') {
        const amount = parseInt(clean);
        if (isNaN(amount) || amount <= 0) {
            await sendMessage(from, `❌ Please enter a valid amount.`);
            return;
        }

        await sendMessage(
            from,
            `✅ Amount received: ZWL ${amount.toLocaleString()}\n\n` +
            `Payment will proceed via EcoCash (test mode).`
        );

        delete paymentSessions[from];
        return;
    }

    await sendWelcomeMessage(from);
}

// ==================== WEBHOOK ====================

app.post('/webhook', async (req, res) => {
    try {
        const entry = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (entry) {
            await processMessage(entry.from, entry.text.body);
        }
        res.sendStatus(200);
    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
});

app.listen(PORT, () => {
    console.log(`🚀 CCHub Bot running on port ${PORT}`);
});
