/**
 * Helper to trigger opening the Cookie & Ad Consent Preferences modal from anywhere.
 */
export function openConsentPreferences() {
  if (typeof window !== 'undefined') {
    // If Google Privacy & Messaging CMP revocation API is available on page, attempt to invoke it
    const gfc = (window as any).googlefc;
    if (gfc && typeof gfc.showRevocationMessage === 'function') {
      try {
        gfc.showRevocationMessage();
      } catch (err) {
        console.warn('Could not show Google CMP revocation message:', err);
      }
    }
    // Always trigger the GravityVerse preferences dialog
    window.dispatchEvent(new CustomEvent('gv-open-cookie-settings'));
  }
}
