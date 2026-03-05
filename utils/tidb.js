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
 * Log transaction to TiDB Cloud with local queue fallback
 * Non-blocking - executes asynchronously without awaiting
 * 
 * @param {Object} transactionData - Complete transaction details
 * @param {string} serviceType - Type of service (airtime, zesa, nyaradzo)
 */
async function logToTiDB(transactionData, serviceType) {
  console.log(`📝 [TiDB] Logging ${serviceType} transaction`);
  
  // Validate required fields for debugging
  const requiredFields = ['reference', 'customerPhone', 'amount', 'currency', 'paymentMethod'];
  const missingFields = requiredFields.filter(field => !transactionData[field] && transactionData[field] !== 0);
  
  if (missingFields.length > 0) {
    console.log(`⚠️ [TiDB] Missing required fields:`, missingFields);
  }
  
  // Don't block the main flow - log asynchronously
  setTimeout(async () => {
    try {
      // Initialize pool if needed
      if (!pool) initTiDB();
      
      // Normalize currency
      let currency = transactionData.currency;
      if (currency === 'usd' || currency === 'USD') {
        currency = 'USD';
      } else if (currency === 'zig' || currency === 'ZiG' || currency === 'ZWL') {
        currency = 'ZiG';
      }
      
      // Generate transaction ID if not provided
      const transactionId = transactionData.reference || 
                           transactionData.agentReference || 
                           `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      
      // Calculate fee and total
      const fee = transactionData.fee || 0;
      const total = transactionData.totalAmount || 
                   (parseFloat(transactionData.amount) + fee);
      
      // Prepare metadata JSON
      const metadata = {
        ...transactionData.metadata,
        hotRechargeResponse: transactionData.rawResponse,
        agentReference: transactionData.agentReference,
        network: transactionData.metadata?.network,
        recipient: transactionData.metadata?.recipient,
        userAgent: 'CCHub-WhatsApp-Bot/1.0',
        environment: process.env.NODE_ENV || 'production'
      };
      
      // Insert into TiDB
      const sql = `
        INSERT INTO transactions (
          transaction_id, reference, service, sub_service, 
          user_phone, recipient_phone, meter_number, policy_number,
          amount, currency, fee, total_amount,
          payment_method, payment_reference, status, error_message, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        transactionId,
        transactionData.reference || null,
        serviceType,
        transactionData.metadata?.network || transactionData.metadata?.subService || null,
        transactionData.customerPhone || transactionData.userId || 'unknown',
        transactionData.metadata?.recipient || null,
        transactionData.metadata?.meterNumber || null,
        transactionData.metadata?.policyNumber || null,
        parseFloat(transactionData.amount) || 0,
        currency,
        fee,
        total,
        transactionData.paymentMethod || transactionData.paymentProvider || 'ecocash',
        transactionData.paymentReference || transactionData.ecocashReference || null,
        transactionData.success ? 'completed' : 'failed',
        transactionData.errorMessage || null,
        JSON.stringify(metadata)
      ];
      
      const [result] = await pool.execute(sql, values);
      console.log(`✅ [TiDB] Logged successfully: ${transactionId}`);
      
    } catch (error) {
      console.error(`❌ [TiDB] Logging failed:`, error.message);
      
      // Enhanced error logging
      if (error.code === 'ECONNREFUSED') {
        console.error(`❌ [TiDB] Connection refused - check your TiDB credentials`);
      } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error(`❌ [TiDB] Access denied - wrong username or password`);
      } else if (error.code === 'ER_BAD_DB_ERROR') {
        console.error(`❌ [TiDB] Database '${process.env.TIDB_DATABASE}' does not exist`);
      } else if (error.code === 'ETIMEDOUT') {
        console.error(`❌ [TiDB] Connection timeout - network issue`);
      }
      
      // Stack trace for development
      if (process.env.NODE_ENV === 'development') {
        console.error(`❌ [TiDB] STACK:`, error.stack);
      }
      
      // ========================================================================
      // LOCAL QUEUE FALLBACK (same pattern as WordPress)
      // ========================================================================
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
          transactionData,
          serviceType,
          retries: 0,
          error: error.message,
          errorCode: error.code || 'unknown'
        });
        
        fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
        console.log(`📦 [TiDB] Queued for retry in ${queueFile}`);
      } catch (queueError) {
        console.error(`❌ [TiDB] Queue failed:`, queueError.message);
      }
    }
  }, 0); // Execute immediately but asynchronously
}

module.exports = { initTiDB, logToTiDB };