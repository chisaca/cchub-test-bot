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
 * Generate a unique transaction ID
 */
const generateTransactionId = (prefix = 'TXN') => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
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
    paynow_reference = null,
    hotrecharge_reference = null
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
      let normalizedNetwork = network;
      if (network.toLowerCase().includes('econet')) normalizedNetwork = 'Econet';
      else if (network.toLowerCase().includes('netone')) normalizedNetwork = 'NetOne';
      else if (network.toLowerCase().includes('telecel')) normalizedNetwork = 'Telecel';
      
      const query = `
        INSERT INTO airtime_transactions 
        (user_phone, transaction_id, amount, currency, recipient_phone, network, status, payment_method, paynow_reference, hotrecharge_reference)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        user_phone,
        transaction_id,
        parseFloat(amount) || 0,
        normalizedCurrency,
        recipient_phone,
        normalizedNetwork,
        status,
        payment_method,
        paynow_reference,
        hotrecharge_reference
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
        if (allowedFields.includes(key) && value !== undefined) {
          setClauses.push(`${key} = ?`);
          values.push(value);
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
    customer_name = null,
    units_purchased = null,
    status = 'pending',
    payment_method,
    paynow_reference = null,
    hotrecharge_reference = null,
    token_number = null
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
      
      const values = [
        user_phone,
        transaction_id,
        parseFloat(amount) || 0,
        normalizedCurrency,
        meter_number,
        customer_name,
        units_purchased ? parseFloat(units_purchased) : null,
        status,
        payment_method,
        paynow_reference,
        hotrecharge_reference,
        token_number
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

/**
 * Update ZESA transaction
 */
async function updateZesaTransaction(transaction_id, updates) {
  console.log(`📝 [TiDB] Updating ZESA transaction: ${transaction_id}`);
  
  setTimeout(async () => {
    try {
      if (!pool) initTiDB();
      
      const allowedFields = ['status', 'paynow_reference', 'hotrecharge_reference', 'token_number', 'units_purchased', 'customer_name', 'completed_at'];
      const setClauses = [];
      const values = [];
      
      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key) && value !== undefined) {
          setClauses.push(`${key} = ?`);
          values.push(value);
        }
      });
      
      if (setClauses.length === 0) return;
      
      // Auto-set completed_at if status becomes 'completed'
      if (updates.status === 'completed' && !updates.completed_at) {
        setClauses.push('completed_at = CURRENT_TIMESTAMP');
      }
      
      values.push(transaction_id);
      const query = `UPDATE zesa_transactions SET ${setClauses.join(', ')} WHERE transaction_id = ?`;
      
      const [result] = await pool.execute(query, values);
      console.log(`✅ [TiDB] ZESA transaction updated: ${transaction_id}`);
      
    } catch (error) {
      console.error(`❌ [TiDB] Failed to update ZESA transaction:`, error.message);
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
    customer_name = null,
    bill_reference = null,
    status = 'pending',
    payment_method,
    paynow_reference = null,
    hotrecharge_reference = null,
    receipt_number = null
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
      let normalizedBiller = biller_type;
      const validBillers = ['Nyaradzo', 'City Council', 'ZINWA', 'Other'];
      if (!validBillers.includes(biller_type)) {
        normalizedBiller = 'Other';
      }

      const query = `
        INSERT INTO bills_transactions 
        (user_phone, transaction_id, biller_type, amount, currency, account_number, customer_name, bill_reference, status, payment_method, paynow_reference, hotrecharge_reference, receipt_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        user_phone,
        transaction_id,
        normalizedBiller,
        parseFloat(amount) || 0,
        normalizedCurrency,
        account_number,
        customer_name,
        bill_reference,
        status,
        payment_method,
        paynow_reference,
        hotrecharge_reference,
        receipt_number
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
        if (allowedFields.includes(key) && value !== undefined) {
          setClauses.push(`${key} = ?`);
          values.push(value);
        }
      });
      
      if (setClauses.length === 0) return;
      
      // Auto-set completed_at if status becomes 'completed'
      if (updates.status === 'completed' && !updates.completed_at) {
        setClauses.push('completed_at = CURRENT_TIMESTAMP');
      }
      
      values.push(transaction_id);
      const query = `UPDATE bills_transactions SET ${setClauses.join(', ')} WHERE transaction_id = ?`;
      
      const [result] = await pool.execute(query, values);
      console.log(`✅ [TiDB] Bill transaction updated: ${transaction_id}`);
      
    } catch (error) {
      console.error(`❌ [TiDB] Failed to update bill transaction:`, error.message);
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
        
        const values = [
          transactionId,
          transactionData.reference || null,
          serviceType,
          transactionData.customerPhone || transactionData.userId || 'unknown',
          parseFloat(transactionData.amount) || 0,
          transactionData.currency || 'ZiG',
          transactionData.paymentMethod || 'ecocash',
          transactionData.success ? 'completed' : 'pending',
          JSON.stringify(transactionData.metadata || {})
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

module.exports = { 
  initTiDB, 
  logToTiDB,
  saveAirtimeTransaction,
  updateAirtimeTransaction,
  saveZesaTransaction,
  updateZesaTransaction,
  saveBillTransaction,
  updateBillTransaction,
  generateTransactionId
};