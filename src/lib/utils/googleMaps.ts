/**
 * Generates a Google Maps Universal Link for real-time turn-by-turn navigation
 * directly opening the Google Maps app on iOS/Android or web browser.
 * 
 * Nếu có địa chỉ bằng chữ cụ thể, ưu tiên truyền địa chỉ dạng text vào destination
 * để Google Maps tự động phân giải bằng chính engine AI/bản đồ của Google.
 * Nếu không có địa chỉ chữ (hoặc chỉ có tọa độ), sẽ dẫn đường theo tọa độ GPS (lat, lng).
 */
export function getGoogleMapsNavigationUrl(
  latitude: number,
  longitude: number,
  address?: string | null
): string {
  const cleanAddr = address?.trim();
  if (cleanAddr && !cleanAddr.startsWith('Tọa độ GPS') && cleanAddr.length > 3) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleanAddr)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}
