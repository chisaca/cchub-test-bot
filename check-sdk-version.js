// check-sdk-version.js
console.log('📦 Checking PayNow SDK Version and Source\n');

// Check installed version
try {
    const paynowPackage = require('paynow/package.json');
    console.log('SDK Version:', paynowPackage.version);
    console.log('SDK Path:', require.resolve('paynow'));
} catch (error) {
    console.log('Cannot read package.json:', error.message);
}

// Try to inspect the SDK source
try {
    const { Paynow } = require("paynow");
    
    console.log('\n🔍 Inspecting Paynow class:');
    console.log('Constructor length:', Paynow.length, 'parameters');
    
    // Create instance
    const instance = new Paynow('test', 'test');
    
    console.log('Instance methods:');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance));
    console.log(methods.filter(m => m !== 'constructor'));
    
} catch (error) {
    console.log('Error inspecting SDK:', error.message);
}