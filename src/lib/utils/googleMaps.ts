/**
 * Generates a Google Maps Universal Link for real-time turn-by-turn navigation
 * directly opening the Google Maps app on iOS/Android or web browser.
 */
export function getGoogleMapsNavigationUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}
