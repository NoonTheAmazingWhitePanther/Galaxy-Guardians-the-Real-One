"use strict";

/**
 * js/modules/monetization/ads.js
 * Optional, user-initiated reward system. 
 * No forced ads. Pure vanilla JS structure ready for any ad network SDK.
 */
export const AdsManager = {
    isEnabled: false, // Set to true via UI toggle if user opts in
    isReady: false,
    rewardCallback: null,

    init: (userOptedIn = false) => {
        AdsManager.isEnabled = userOptedIn;
        console.log(`[AdsManager] Initialized. Opted in: ${AdsManager.isEnabled}`);
        
        // TODO: Initialize your specific Ad Network SDK here (e.g., AdMob, Unity Ads)
        // sdk.init().then(() => { AdsManager.isReady = true; });
        AdsManager.isReady = true; // Mock ready state
    },

    /**
     * Call this when the user clicks a "Watch Ad for Bonus" button.
     * @param {Function} onRewardGranted - Callback to execute when reward is earned.
     */
    requestRewardAd: (onRewardGranted) => {
        if (!AdsManager.isEnabled) {
            console.log("[AdsManager] Ads disabled by user. Granting reward anyway or skipping.");
            if (onRewardGranted) onRewardGranted();
            return;
        }

        if (!AdsManager.isReady) {
            console.warn("[AdsManager] Ad network not ready yet.");
            return;
        }

        AdsManager.rewardCallback = onRewardGranted;
        console.log("[AdsManager] Requesting reward ad...");
        
        // TODO: Replace with actual SDK call
        // sdk.showRewardAd().then(() => { AdsManager.onRewardComplete(); });
        
        // Mock success for testing:
        setTimeout(() => AdsManager.onRewardComplete(), 1000);
    },

    onRewardComplete: () => {
        console.log("[AdsManager] Reward ad completed successfully!");
        if (AdsManager.rewardCallback) {
            AdsManager.rewardCallback();
            AdsManager.rewardCallback = null;
        }
    },

    toggleAds: (enabled) => {
        AdsManager.isEnabled = enabled;
        console.log(`[AdsManager] Ads toggled: ${enabled ? 'ON' : 'OFF'}`);
    }
};