export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
  street?: string | null;
  district?: string | null;
  city?: string | null;
}

/**
 * Tìm kiếm tọa độ từ địa chỉ chính xác người dùng nhập vào
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  if (!query || query.trim().length < 3) return [];

  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.warn('Lỗi khi tra cứu địa chỉ geocode:', err);
    return [];
  }
}

/**
 * Lấy tên địa chỉ thực tế từ tọa độ GPS định vị (Reverse geocode)
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;

  try {
    const res = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.address || null;
  } catch (err) {
    console.warn('Lỗi khi reverse geocode:', err);
    return null;
  }
}
