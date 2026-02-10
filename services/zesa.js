// services/zesa.js - Similar pattern
async handleZesaRequest(userId, message, session) {
    const currentStep = session.step || 'enter_meter';
    
    switch(currentStep) {
        case 'enter_meter':
            return await this.handleMeterEntry(userId, message, session);
        case 'enter_amount':
            return await this.handleAmountEntry(userId, message, session);
        case 'select_wallet':
            return await this.handleWalletSelection(userId, message, session);
        default:
            deleteSession(userId);
            return await this.startZesaFlow(userId);
    }
}