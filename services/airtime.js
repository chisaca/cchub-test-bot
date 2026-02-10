// services/airtime.js - Simplified
async handleAirtimeRequest(userId, message) {
    const session = getActiveSession(userId);
    
    if (!session || session.service !== 'airtime') {
        // Not in airtime flow - start new
        return await this.startAirtimeFlow(userId);
    }
    
    // Route based on current step
    const currentStep = session.step || 'select_network';
    
    switch(currentStep) {
        case 'select_network':
            return await this.handleNetworkSelection(userId, message, session);
        case 'enter_phone':
            return await this.handlePhoneNumber(userId, message, session);
        case 'enter_amount':
            return await this.handleAmount(userId, message, session);
        case 'confirm_payment':
            return await this.handleConfirmation(userId, message, session);
        default:
            // Invalid step - reset
            deleteSession(userId);
            return await this.startAirtimeFlow(userId);
    }
}