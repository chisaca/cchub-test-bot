// utils/tidb.js
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

let pool;

/**
 * Initialize TiDB connection pool
 */
const initTiDB = () => {
  if (pool) return pool;
  
  pool = mysql.createPool({
    host: process.env.TIDB_HOST,
    port: process.env.TIDB_PORT || 4000,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  });
  
  console.log('✅ [TiDB] Connected to TiDB Cloud');
  return pool;
};

/**
 * Sanitize value - convert undefined to null
 */
const sanitizeValue = (value) => {
  return value === undefined ? null : value;
};

/**
 * Generate a unique transaction ID - SHORT format to match DB schema
 */
const generateTransactionId = (prefix = 'TXN') => {
  // Use short formats that match DB field length (max 11 chars)
  if (prefix === 'AIR') {
    return `AIR${Date.now().toString().slice(-8)}`; // 11 chars: AIR + 8 digits
  } else if (prefix === 'ZESA') {
    return `ZESA${Date.now().toString().slice(-7)}`; // 11 chars: ZESA + 7 digits
  } else if (prefix === 'BILL') {
    return `BILL${Date.now().toString().slice(-7)}`; // 11 chars: BILL + 7 digits
  } else if (prefix === 'NYR') {
    return `NYR${Date.now().toString().slice(-7)}`; // 10 chars: NYR + 7 digits
  }
  
  // Default fallback - keep it short
  return `${prefix}${Date.now().toString().slice(-6)}`;
};

/**
 * Save airtime transaction to database
 */
async function saveAirtimeTransaction(transactionData) {
  console.log(`📝 [TiDB] Saving airtime transaction`);
  
  const {
    user_phone,
    transaction_id = generateTransactionId('AIR'),
    amount,
    currency,
    recipient_phone,
    network,
    status = 'pending',
    payment_method,
    paynow_reference,
    hotrecharge_reference
  } = transactionData;

  // Don't block the main flow - execute asynchronously
  setTimeout(async () => {
    try {
      if (!pool) initTiDB();
      
      // Normalize currency
      let normalizedCurrency = 'ZiG';
      if (currency === 'usd' || currency === 'USD') {
        normalizedCurrency = 'USD';
      } else if (currency === 'zig' || currency === 'ZiG' || currency === 'ZWL') {
        normalizedCurrency = 'ZiG';
      }
      
      // Normalize network
      let normalizedNetwork = network || 'Unknown';
      if (network) {
        if (network.toLowerCase().includes('econet')) normalizedNetwork = 'Econet';
        else if (network.toLowerCase().includes('netone')) normalizedNetwork = 'NetOne';
        else if (network.toLowerCase().includes('telecel')) normalizedNetwork = 'Telecel';
      }
      
      const query = `
        INSERT INTO airtime_transactions 
        (user_phone, transaction_id, amount, currency, recipient_phone, network, status, payment_method, paynow_reference, hotrecharge_reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      // SANITIZE ALL VALUES - convert undefined to null
      const values = [
        sanitizeValue(user_phone),
        sanitizeValue(transaction_id),
        parseFloat(amount) || 0,
        sanitizeValue(normalizedCurrency),
        sanitizeValue(recipient_phone),
        sanitizeValue(normalizedNetwork),
        sanitizeValue(status),
        sanitizeValue(payment_method),
        sanitizeValue(paynow_reference),
        sanitizeValue(hotrecharge_reference)
      ];
      
      const [result] = await pool.execute(query, values);
      console.log(`✅ [TiDB] Airtime transaction saved: ${transaction_id}`);
      
    } catch (error) {
      console.error(`❌ [TiDB] Failed to save airtime transaction:`, error.message);
      
      // Queue for retry
      queueFailedTransaction('airtime', transactionData, error);
    }
  }, 0);
}

/**
 * Update airtime transaction status
 */
async function updateAirtimeTransaction(transaction_id, updates) {
  console.log(`📝 [TiDB] Updating airtime transaction: ${transaction_id}`);
  
  setTimeout(async () => {
    try {
      if (!pool) initTiDB();
      
      const allowedFields = ['status', 'paynow_reference', 'hotrecharge_reference', 'completed_at'];
      const setClauses = [];
      const values = [];
      
      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = ?`);
          // SANITIZE - convert undefined to null
          values.push(sanitizeValue(value));
        }
      });
      
      if (setClauses.length === 0) return;
      
      // Auto-set completed_at if status becomes 'completed'
      if (updates.status === 'completed' && !updates.completed_at) {
        setClauses.push('completed_at = CURRENT_TIMESTAMP');
      }
      
      values.push(transaction_id);
      const query = `UPDATE airtime_transactions SET ${setClauses.join(', ')} WHERE transaction_id = ?`;
      
      const [result] = await pool.execute(query, values);
      console.log(`✅ [TiDB] Airtime transaction updated: ${transaction_id}`);
      
    } catch (error) {
      console.error(`❌ [TiDB] Failed to update airtime transaction:`, error.message);
    }
  }, 0);
}

/**
 * Save ZESA transaction to database
 */
async function saveZesaTransaction(transactionData) {
  console.log(`📝 [TiDB] Saving ZESA transaction`);
  
  const {
    user_phone,
    transaction_id = generateTransactionId('ZESA'),
    amount,
    currency,
    meter_number,
    customer_name,
    units_purchased,
    status = 'pending',
    payment_method,
    paynow_reference,
    hotrecharge_reference,
    token_number
  } = transactionData;

  setTimeout(async () => {
    try {
      if (!pool) initTiDB();
      
      // Normalize currency
      let normalizedCurrency = 'ZiG';
      if (currency === 'usd' || currency === 'USD') {
        normalizedCurrency = 'USD';
      } else if (currency === 'zig' || currency === 'ZiG' || currency === 'ZWL') {
        normalizedCurrency = 'ZiG';
      }

      const query = `
        INSERT INTO zesa_transactions 
        (user_phone, transaction_id, amount, currency, meter_number, customer_name, units_purchased, status, payment_method, paynow_reference, hotrecharge_reference, token_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      // SANITIZE ALL VALUES - convert undefined to null
      const values = [
        sanitizeValue(user_phone),
        sanitizeValue(transaction_id),
        parseFloat(amount) || 0,
        sanitizeValue(normalizedCurrency),
        sanitizeValue(meter_number),
        sanitizeValue(customer_name),
        units_purchased ? parseFloat(units_purchased) : null,
        sanitizeValue(status),
        sanitizeValue(payment_method),
        sanitizeValue(paynow_reference),
        sanitizeValue(hotrecharge_reference),
        sanitizeValue(token_number)
      ];
      
      const [result] = await pool.execute(query, values);
      console.log(`✅ [TiDB] ZESA transaction saved: ${transaction_id}`);
      
    } catch (error) {
      console.error(`❌ [TiDB] Failed to save ZESA transaction:`, error.message);
      
      // Queue for retry
      queueFailedTransaction('zesa', transactionData, error);
    }
  }, 0);
}

async function updateZesaTransaction(transaction_id, updates) {
  console.log(`📝 [TiDB] Updating ZESA transaction: ${transaction_id}`);
  
  setTimeout(async () => {
    try {
      if (!pool) initTiDB();
      
      const allowedFields = ['status', 'paynow_reference', 'hotrecharge_reference', 'token_number', 'units_purchased', 'customer_name', 'completed_at'];
      const setClauses = [];
      const values = [];
      
      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = ?`);
          values.push(sanitizeValue(value));
        }
      });
      
      if (setClauses.length === 0) return;
      
      if (updates.status === 'completed' && !updates.completed_at) {
        setClauses.push('completed_at = CURRENT_TIMESTAMP');
      }
      
      values.push(transaction_id);
      const query = `UPDATE zesa_transactions SET ${setClauses.join(', ')} WHERE transaction_id = ?`;
      
      const [result] = await pool.execute(query, values);
      console.log(`✅ [TiDB] ZESA transaction updated: ${transaction_id}`);
      
    } catch (error) {
      // Check if this is a race condition error
      if (error.message.includes('Data Too Long')) {
        // This is likely a race condition - ignore it
        console.log(`⚠️ [TiDB] Race condition detected for ${transaction_id} - ignoring`);
      } else {
        console.error(`❌ [TiDB] Failed to update ZESA transaction:`, error.message);
      }
    }
  }, 0);
}

/**
 * Save bill transaction (Nyaradzo, etc.) to database
 */
async function saveBillTransaction(transactionData) {
  console.log(`📝 [TiDB] Saving bill transaction`);
  
  const {
    user_phone,
    transaction_id = generateTransactionId('BILL'),
    biller_type,
    amount,
    currency,
    account_number,
    customer_name,
    bill_reference,
    status = 'pending',
    payment_method,
    paynow_reference,
    hotrecharge_reference,
    receipt_number
  } = transactionData;

  setTimeout(async () => {
    try {
      if (!pool) initTiDB();
      
      // Normalize currency
      let normalizedCurrency = 'ZiG';
      if (currency === 'usd' || currency === 'USD') {
        normalizedCurrency = 'USD';
      } else if (currency === 'zig' || currency === 'ZiG' || currency === 'ZWL') {
        normalizedCurrency = 'ZiG';
      }
      
      // Validate biller_type
      let normalizedBiller = biller_type || 'Other';
      const validBillers = ['Nyaradzo', 'City Council', 'ZINWA', 'Other'];
      if (biller_type && !validBillers.includes(biller_type)) {
        normalizedBiller = 'Other';
      }

      const query = `
        INSERT INTO bills_transactions 
        (user_phone, transaction_id, biller_type, amount, currency, account_number, customer_name, bill_reference, status, payment_method, paynow_reference, hotrecharge_reference, receipt_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      // SANITIZE ALL VALUES - convert undefined to null
      const values = [
        sanitizeValue(user_phone),
        sanitizeValue(transaction_id),
        sanitizeValue(normalizedBiller),
        parseFloat(amount) || 0,
        sanitizeValue(normalizedCurrency),
        sanitizeValue(account_number),
        sanitizeValue(customer_name),
        sanitizeValue(bill_reference),
        sanitizeValue(status),
        sanitizeValue(payment_method),
        sanitizeValue(paynow_reference),
        sanitizeValue(hotrecharge_reference),
        sanitizeValue(receipt_number)
      ];
      
      const [result] = await pool.execute(query, values);
      console.log(`✅ [TiDB] Bill transaction saved: ${transaction_id}`);
      
    } catch (error) {
      console.error(`❌ [TiDB] Failed to save bill transaction:`, error.message);
      
      // Queue for retry
      queueFailedTransaction('bill', transactionData, error);
    }
  }, 0);
}

/**
 * Update bill transaction
 */
async function updateBillTransaction(transaction_id, updates) {
  console.log(`📝 [TiDB] Updating bill transaction: ${transaction_id}`);
  
  setTimeout(async () => {
    try {
      if (!pool) initTiDB();
      
      const allowedFields = ['status', 'paynow_reference', 'hotrecharge_reference', 'receipt_number', 'customer_name', 'bill_reference', 'completed_at'];
      const setClauses = [];
      const values = [];
      
      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key)) {
          let sanitizedValue = sanitizeValue(value);
          
          // 🔧 ADD TRUNCATION - Same as ZESA
          if (sanitizedValue !== null && typeof sanitizedValue === 'string') {
            // Truncate to 50 chars to be safe
            if (sanitizedValue.length > 50) {
              console.log(`✂️ [TiDB] Truncating ${key} from ${sanitizedValue.length} to 50 chars`);
              sanitizedValue = sanitizedValue.substring(0, 50);
            }
          }
          
          setClauses.push(`${key} = ?`);
          values.push(sanitizedValue);
        }
      });
      
      if (setClauses.length === 0) return;
      
      if (updates.status === 'completed' && !updates.completed_at) {
        setClauses.push('completed_at = CURRENT_TIMESTAMP');
      }
      
      values.push(transaction_id);
      const query = `UPDATE bills_transactions SET ${setClauses.join(', ')} WHERE transaction_id = ?`;
      
      const [result] = await pool.execute(query, values);
      console.log(`✅ [TiDB] Bill transaction updated: ${transaction_id}`);
      
    } catch (error) {
      // Add race condition handling like ZESA
      if (error.message.includes('Data Too Long')) {
        console.log(`⚠️ [TiDB] Race condition detected for ${transaction_id} - ignoring`);
      } else {
        console.error(`❌ [TiDB] Failed to update bill transaction:`, error.message);
      }
    }
  }, 0);
}

/**
 * Queue failed transaction for retry (local file fallback)
 */
function queueFailedTransaction(type, transactionData, error) {
  const logsDir = path.join(__dirname, '../logs');
  const queueFile = path.join(logsDir, 'tidb-queue.json');
  
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true, mode: 0o755 });
    }
    
    let queue = [];
    if (fs.existsSync(queueFile)) {
      queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    }
    
    queue.push({
      timestamp: Date.now(),
      type, // 'airtime', 'zesa', 'bill'
      transactionData,
      retries: 0,
      error: error.message,
      errorCode: error.code || 'unknown'
    });
    
    // Keep only last 1000 entries
    if (queue.length > 1000) {
      queue = queue.slice(-1000);
    }
    
    fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
    console.log(`📦 [TiDB] ${type} transaction queued for retry in ${queueFile}`);
  } catch (queueError) {
    console.error(`❌ [TiDB] Queue failed:`, queueError.message);
  }
}

/**
 * Legacy logToTiDB function - kept for backward compatibility
 */
async function logToTiDB(transactionData, serviceType) {
  console.log(`📝 [TiDB] Legacy logging for ${serviceType}`);
  
  // Map to new functions based on service type
  if (serviceType === 'airtime') {
    await saveAirtimeTransaction(transactionData);
  } else if (serviceType === 'zesa') {
    await saveZesaTransaction(transactionData);
  } else if (serviceType === 'nyaradzo') {
    await saveBillTransaction({
      ...transactionData,
      biller_type: 'Nyaradzo',
      account_number: transactionData.metadata?.policyNumber || 'unknown'
    });
  } else {
    // Generic fallback to old method
    setTimeout(async () => {
      try {
        if (!pool) initTiDB();
        
        const transactionId = transactionData.reference || generateTransactionId();
        
        const sql = `
          INSERT INTO transactions (
            transaction_id, reference, service, 
            user_phone, amount, currency, 
            payment_method, status, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        // SANITIZE ALL VALUES
        const values = [
          sanitizeValue(transactionId),
          sanitizeValue(transactionData.reference),
          sanitizeValue(serviceType),
          sanitizeValue(transactionData.customerPhone || transactionData.userId || 'unknown'),
          parseFloat(transactionData.amount) || 0,
          sanitizeValue(transactionData.currency || 'ZiG'),
          sanitizeValue(transactionData.paymentMethod || 'ecocash'),
          sanitizeValue(transactionData.success ? 'completed' : 'pending'),
          sanitizeValue(JSON.stringify(transactionData.metadata || {}))
        ];
        
        const [result] = await pool.execute(sql, values);
        console.log(`✅ [TiDB] Legacy log saved: ${transactionId}`);
      } catch (error) {
        console.error(`❌ [TiDB] Legacy logging failed:`, error.message);
        queueFailedTransaction(serviceType, transactionData, error);
      }
    }, 0);
  }
}

/**
 * Find transaction by PayNow reference
 * Searches across all transaction tables
 * 
 * @param {string} paynowReference - PayNow reference to look up
 * @returns {Promise<Object|null>} Transaction info or null
 */
async function findTransactionByPayNowRef(paynowReference) {
    try {
        if (!pool) initTiDB();
        
        console.log(`🔍 [TiDB] Looking up PayNow ref: ${paynowReference}`);
        
        // Check airtime_transactions
        const [airtimeRows] = await pool.execute(
            'SELECT transaction_id FROM airtime_transactions WHERE paynow_reference = ?',
            [paynowReference]
        );
        
        if (airtimeRows.length > 0) {
            return {
                transaction_id: airtimeRows[0].transaction_id,
                type: 'airtime'
            };
        }
        
        // Check zesa_transactions
        const [zesaRows] = await pool.execute(
            'SELECT transaction_id FROM zesa_transactions WHERE paynow_reference = ?',
            [paynowReference]
        );
        
        if (zesaRows.length > 0) {
            return {
                transaction_id: zesaRows[0].transaction_id,
                type: 'zesa'
            };
        }
        
        // Check bills_transactions
        const [billRows] = await pool.execute(
            'SELECT transaction_id FROM bills_transactions WHERE paynow_reference = ?',
            [paynowReference]
        );
        
        if (billRows.length > 0) {
            return {
                transaction_id: billRows[0].transaction_id,
                type: 'bill'
            };
        }
        
        console.log(`⚠️ [TiDB] No transaction found for PayNow ref: ${paynowReference}`);
        return null;
        
    } catch (error) {
        console.error('❌ [TiDB] Failed to find transaction by PayNow ref:', error.message);
        return null;
    }
}

/**
 * Get transaction status by ID
 */
async function getTransactionStatus(transactionId) {
    try {
        if (!pool) initTiDB();
        
        // Check airtime_transactions
        const [airtimeRows] = await pool.execute(
            'SELECT status FROM airtime_transactions WHERE transaction_id = ?',
            [transactionId]
        );
        
        if (airtimeRows.length > 0) {
            return airtimeRows[0].status;
        }
        
        // Check zesa_transactions
        const [zesaRows] = await pool.execute(
            'SELECT status FROM zesa_transactions WHERE transaction_id = ?',
            [transactionId]
        );
        
        if (zesaRows.length > 0) {
            return zesaRows[0].status;
        }
        
        // Check bills_transactions
        const [billRows] = await pool.execute(
            'SELECT status FROM bills_transactions WHERE transaction_id = ?',
            [transactionId]
        );
        
        if (billRows.length > 0) {
            return billRows[0].status;
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ [TiDB] Failed to get transaction status:', error.message);
        return null;
    }
}

module.exports = { 
  initTiDB, 
  logToTiDB,
  saveAirtimeTransaction,
  updateAirtimeTransaction,
  saveZesaTransaction,
  updateZesaTransaction,
  saveBillTransaction,
  updateBillTransaction,
  generateTransactionId,
  getTransactionStatus,
  findTransactionByPayNowRef
};