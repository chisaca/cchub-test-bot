// scripts/test-zesa-success.js
/**
 * Test script to simulate a successful ZESA purchase response
 * Based on actual successful transaction logs
 */

// Sample successful ZESA purchase response from your logs
const successfulZesaResponse = {
  successful: true,
  rechargeId: 189732173,
  amount: 5,
  discount: 1,
  balance: {
    accountTypeId: 4,
    name: 'Utility USD',
    balance: 0.05
  },
  message: 'Transaction processed successfully',
  rechargeData: {
    Network: 'ZESA',
    Target: '37261516290',
    Cost: '4.9500',
    Token: '2763 3259 5284 4779 8232',
    Units: '23.7',
    NetAmount: '126.63',
    TaxAmount: '0',
    Levy: '7.6',
    Arrears: '0'
  }
};

// Sample user session data
const userSession = {
  userId: '263775175454',
  meterNumber: '37261516290',
  amount: 5,
  currency: 'USD',
  notifyNumber: '0773745224',
  paymentPhone: '0771111111',
  customerName: 'TAFIRENYIKA CHABATA JOSEPH',
  agentReference: 'CCHUB-ZESA-USD-263775175454-1771334365533-B0BE'
};

// What your code should return after fixing zesausd.js
function processSuccessfulResponse(response, session) {
  console.log('\n🔍 PROCESSING SUCCESSFUL ZESA RESPONSE\n');
  console.log('='.repeat(60));
  
  // Check for success (should match your fixed code)
  const isSuccess = response.successful === true || 
                    response.Success === true || 
                    response.Status === 'Success' ||
                    response.Code === '0000' ||
                    response.TransactionId;
  
  console.log(`✅ Success detected: ${isSuccess}`);
  
  if (isSuccess) {
    // Extract token and units (as in the fixed code)
    let token = null;
    let units = null;
    let customerName = null;
    
    if (response.rechargeData) {
      token = response.rechargeData.Token || response.rechargeData.token;
      units = response.rechargeData.Units || response.rechargeData.units;
      customerName = response.rechargeData.AccountName || session.customerName;
    }
    
    // Fallback to root level
    if (!token) token = response.Token || response.Pin || response.token;
    if (!units) units = response.Units || response.Quantity || response.units;
    
    // Format token with spaces
    if (token && typeof token === 'string' && !token.includes(' ')) {
      token = token.replace(/(\d{4})(?=\d)/g, '$1 ');
    }
    
    console.log('\n📊 EXTRACTED DATA:');
    console.log('-'.repeat(40));
    console.log(`Token: ${token}`);
    console.log(`Units: ${units}`);
    console.log(`Recharge ID: ${response.rechargeId}`);
    console.log(`Amount: $${response.amount} USD`);
    console.log(`Discount: $${response.discount}`);
    console.log(`Net Cost: $${response.rechargeData?.Cost}`);
    console.log(`Balance Remaining: $${response.balance?.balance}`);
    
    // What the user will see
    console.log('\n📱 MESSAGE SENT TO USER:');
    console.log('-'.repeat(40));
    console.log(`✅ *ZESA Purchase Successful!*\n`);
    console.log(`Amount: $${session.amount}.00 USD`);
    console.log(`Meter: ${session.meterNumber}`);
    console.log(`Customer: ${session.customerName}`);
    console.log(`────────────────`);
    console.log(`Units: ${units}`);
    console.log(`Token: ${token}`);
    console.log(`────────────────\n`);
    console.log(`📲 Token sent to: ${session.notifyNumber.slice(0,5)}****${session.notifyNumber.slice(-3)}\n`);
    console.log(`Thank you for using CCHub! 💎`);
    
    return {
      success: true,
      token,
      units,
      transactionId: response.rechargeId,
      reference: session.agentReference
    };
  }
  
  return { success: false };
}

// Run the test
console.log('🧪 TESTING ZESA SUCCESS RESPONSE HANDLING\n');
console.log('Original API Response:');
console.log(JSON.stringify(successfulZesaResponse, null, 2));
console.log('\n' + '='.repeat(60) + '\n');

const result = processSuccessfulResponse(successfulZesaResponse, userSession);

console.log('\n' + '='.repeat(60));
console.log(`\n✅ Test complete. Success: ${result.success}`);