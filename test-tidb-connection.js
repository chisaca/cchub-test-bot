// test-tidb-connection.js
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testTiDBConnection() {
    console.log('🔍 Testing TiDB Cloud Connection...');
    console.log('----------------------------------------');
    
    // Check environment variables
    console.log('📋 Environment variables:');
    console.log(`TIDB_HOST: ${process.env.TIDB_HOST || '❌ NOT SET'}`);
    console.log(`TIDB_PORT: ${process.env.TIDB_PORT || '❌ NOT SET'}`);
    console.log(`TIDB_USER: ${process.env.TIDB_USER || '❌ NOT SET'}`);
    console.log(`TIDB_DATABASE: ${process.env.TIDB_DATABASE || '❌ NOT SET'}`);
    console.log(`TIDB_PASSWORD: ${process.env.TIDB_PASSWORD ? '✅ SET' : '❌ NOT SET'}`);
    console.log('----------------------------------------');
    
    if (!process.env.TIDB_HOST || !process.env.TIDB_USER || !process.env.TIDB_PASSWORD) {
        console.log('❌ Missing required environment variables');
        return;
    }
    
    let connection;
    try {
        // Attempt connection
        console.log('🔄 Connecting to TiDB Cloud...');
        connection = await mysql.createConnection({
            host: process.env.TIDB_HOST,
            port: process.env.TIDB_PORT || 4000,
            user: process.env.TIDB_USER,
            password: process.env.TIDB_PASSWORD,
            database: process.env.TIDB_DATABASE,
            ssl: { rejectUnauthorized: true },
            connectTimeout: 10000
        });
        
        console.log('✅ CONNECTION SUCCESSFUL!');
        console.log('----------------------------------------');
        
        // Check if table exists
        console.log('🔄 Checking if transactions table exists...');
        const [tables] = await connection.execute(`
            SELECT TABLE_NAME 
            FROM information_schema.tables 
            WHERE table_schema = ? AND table_name = 'transactions'
        `, [process.env.TIDB_DATABASE]);
        
        if (tables.length === 0) {
            console.log('❌ Transactions table does NOT exist!');
            console.log('🔄 Creating transactions table...');
            
            // Create table
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS transactions (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    transaction_id VARCHAR(100) UNIQUE NOT NULL,
                    reference VARCHAR(100),
                    service VARCHAR(50) NOT NULL,
                    sub_service VARCHAR(50),
                    user_phone VARCHAR(20) NOT NULL,
                    recipient_phone VARCHAR(20),
                    meter_number VARCHAR(50),
                    policy_number VARCHAR(50),
                    amount DECIMAL(15,2) NOT NULL,
                    currency VARCHAR(10) NOT NULL,
                    fee DECIMAL(15,2),
                    total_amount DECIMAL(15,2),
                    payment_method VARCHAR(50),
                    payment_reference VARCHAR(100),
                    status VARCHAR(20) DEFAULT 'pending',
                    error_message TEXT,
                    metadata JSON,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_user_phone (user_phone),
                    INDEX idx_service (service),
                    INDEX idx_status (status),
                    INDEX idx_created_at (created_at),
                    INDEX idx_currency (currency)
                )
            `);
            console.log('✅ Transactions table created!');
        } else {
            console.log('✅ Transactions table exists');
        }
        
        console.log('----------------------------------------');
        
        // Insert a test record
        console.log('🔄 Inserting test transaction...');
        const testId = `TEST-${Date.now()}`;
        const [insertResult] = await connection.execute(`
            INSERT INTO transactions (
                transaction_id, service, user_phone, amount, currency, status, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            testId,
            'test',
            '263775175454',
            1.00,
            'USD',
            'test',
            JSON.stringify({ test: true, message: 'Connection test' })
        ]);
        
        console.log(`✅ Test record inserted with ID: ${testId}`);
        
        // Verify it was inserted
        const [rows] = await connection.execute(`
            SELECT * FROM transactions WHERE transaction_id = ?
        `, [testId]);
        
        if (rows.length > 0) {
            console.log('✅ Test record verified in database');
            console.log('----------------------------------------');
            console.log('📊 Sample data:');
            console.log(rows[0]);
        }
        
        // Count total records
        const [countResult] = await connection.execute(`
            SELECT COUNT(*) as count FROM transactions
        `);
        console.log(`----------------------------------------`);
        console.log(`📊 Total transactions in database: ${countResult[0].count}`);
        
        console.log('----------------------------------------');
        console.log('🎉 ALL TESTS PASSED! TiDB is working perfectly!');
        
    } catch (error) {
        console.log('----------------------------------------');
        console.log('❌ CONNECTION FAILED!');
        console.log('Error details:');
        console.log(`- Code: ${error.code || 'N/A'}`);
        console.log(`- Message: ${error.message}`);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('🔴 The connection was refused. Check:');
            console.log('   - Hostname is correct');
            console.log('   - Port is correct (4000)');
            console.log('   - TiDB cluster is running');
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.log('🔴 Access denied. Check:');
            console.log('   - Username is correct');
            console.log('   - Password is correct');
            console.log('   - User has access to the database');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.log('🔴 Database does not exist. Run: CREATE DATABASE cchub;');
        } else if (error.code === 'ETIMEDOUT') {
            console.log('🔴 Connection timeout. Check:');
            console.log('   - Network connectivity');
            console.log('   - Firewall is not blocking');
            console.log('   - TiDB cluster is publicly accessible');
        }
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Connection closed');
        }
    }
}

// Add a manual insert function you can call separately
async function manualInsert() {
    require('dotenv').config();
    const mysql = require('mysql2/promise');
    
    const connection = await mysql.createConnection({
        host: process.env.TIDB_HOST,
        port: process.env.TIDB_PORT || 4000,
        user: process.env.TIDB_USER,
        password: process.env.TIDB_PASSWORD,
        database: process.env.TIDB_DATABASE,
        ssl: { rejectUnauthorized: true }
    });
    
    const transactionId = `MANUAL-${Date.now()}`;
    await connection.execute(`
        INSERT INTO transactions (
            transaction_id, service, user_phone, amount, currency, status
        ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
        transactionId,
        'manual',
        '263775175454',
        99.99,
        'USD',
        'manual_test'
    ]);
    
    console.log(`✅ Manually inserted: ${transactionId}`);
    await connection.end();
}

// Run the test
if (require.main === module) {
    testTiDBConnection();
}

module.exports = { testTiDBConnection, manualInsert };