import { NextResponse } from 'next/server';

function cleanArcGISAddress(addr: string): string {
  if (!addr) return '';
  return addr
    .replace(/,\s*\d{5,6}(,\s*VNM)?$/i, '')
    .replace(/,\s*VNM$/i, '')
    .trim();
}

function generateVietnameseAddressVariants(query: string): string[] {
  const clean = query.trim().replace(/\s+/g, ' ');
  const variants: string[] = [clean];

  // Nếu có dạng "số 25 ngõ 102 [đường/phố] Nguyễn Hoàng" -> thêm biến thể "ngõ 102 Nguyễn Hoàng" & "102 Nguyễn Hoàng"
  const soNgoMatch = clean.match(/(?:số\s*\d+[a-zA-Z]?\s+)?(?:ngõ|hẻm|ngách)\s*(\d+[a-zA-Z]?)\s+(?:đường\s+|phố\s+)?(.+)/i);
  if (soNgoMatch) {
    const num = soNgoMatch[1];
    const rest = soNgoMatch[2];
    variants.push(`Ngõ ${num} ${rest}`);
    variants.push(`${num} ${rest}`);
  }

  // Nếu có dạng "số 25 [đường/phố] Nguyễn Hoàng" -> thêm biến thể "25 Nguyễn Hoàng"
  const soMatch = clean.match(/số\s*(\d+[a-zA-Z]?)\s+(?:đường\s+|phố\s+)?(.+)/i);
  if (soMatch && !soNgoMatch) {
    const num = soMatch[1];
    const rest = soMatch[2];
    variants.push(`${num} ${rest}`);
  }

  return Array.from(new Set(variants));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  try {
    // 1. Forward Geocoding: Tra cứu tọa độ từ địa chỉ chính xác
    if (q) {
      const trimmedQuery = q.trim();
      const variants = generateVietnameseAddressVariants(trimmedQuery);
      const results: Array<{
        latitude: number;
        longitude: number;
        displayName: string;
        street?: string | null;
        district?: string | null;
        city?: string | null;
      }> = [];

      // A. Thử lần lượt các biến thể qua ArcGIS World Geocoding (nhận diện cực tốt số nhà & ngõ ngách VN)
      for (const variant of variants) {
        try {
          const arcUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(
            variant
          )}&outFields=Match_addr,Addr_type,PlaceName,City,Subregion&maxLocations=5`;
          const arcRes = await fetch(arcUrl, { cache: 'no-store' });

          if (arcRes.ok) {
            const arcData = await arcRes.json();
            const candidates = arcData.candidates || [];

            for (const c of candidates) {
              if (
                c.location &&
                typeof c.location.y === 'number' &&
                typeof c.location.x === 'number' &&
                (c.score || 0) >= 75
              ) {
                const cleanDisplay = cleanArcGISAddress(c.address || c.attributes?.Match_addr || variant);
                results.push({
                  latitude: c.location.y,
                  longitude: c.location.x,
                  displayName: cleanDisplay || trimmedQuery,
                  street: c.attributes?.PlaceName || null,
                  district: c.attributes?.Subregion || null,
                  city: c.attributes?.City || null,
                });
              }
            }

            // Nếu đã tìm thấy kết quả PointAddress hoặc kết quả có độ tin cậy cao, dừng tìm biến thể
            if (results.length > 0) {
              break;
            }
          }
        } catch (arcErr) {
          console.warn('Lỗi ArcGIS geocode variant:', variant, arcErr);
        }
      }

      // B. Nếu ArcGIS không tìm thấy, dự phòng bằng Photon OpenStreetMap
      if (results.length === 0) {
        try {
          const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedQuery)}&limit=5`;
          const phRes = await fetch(photonUrl, {
            headers: { 'User-Agent': 'SPFF-Delivery-App/1.0' },
            cache: 'no-store',
          });

          if (phRes.ok) {
            const json = await phRes.json();
            const features = json.features || [];

            for (const f of features) {
              const p = f.properties || {};
              const coords = f.geometry?.coordinates || [0, 0];
              const parts = [
                p.housenumber ? `Số ${p.housenumber}` : null,
                p.name && p.name !== p.street ? p.name : null,
                p.street,
                p.locality || p.district || p.suburb,
                p.city || p.county || p.state,
              ].filter(Boolean);

              const displayName = parts.length > 0 ? parts.join(', ') : p.name || trimmedQuery;
              results.push({
                latitude: coords[1],
                longitude: coords[0],
                displayName,
                street: p.street || null,
                district: p.district || p.suburb || null,
                city: p.city || p.state || null,
              });
            }
          }
        } catch (phErr) {
          console.warn('Photon geocode fallback error:', phErr);
        }
      }

      return NextResponse.json({ results });
    }

    // 2. Reverse Geocoding: Lấy tên địa chỉ từ tọa độ GPS
    if (lat && lon) {
      // Ưu tiên 1: ArcGIS reverse geocoding để lấy số nhà và tên đường chi tiết
      try {
        const arcRevUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${lon},${lat}`;
        const arcRevRes = await fetch(arcRevUrl, { cache: 'no-store' });

        if (arcRevRes.ok) {
          const arcData = await arcRevRes.json();
          const addr = arcData.address;
          if (addr) {
            const parts = [
              addr.Address || addr.Match_addr,
              addr.Neighborhood || addr.District,
              addr.City,
              addr.Region,
            ].filter(Boolean);

            if (parts.length > 0) {
              const cleanAddress = cleanArcGISAddress(parts.join(', '));
              if (cleanAddress) {
                return NextResponse.json({ address: cleanAddress });
              }
            }
          }
        }
      } catch (arcRevErr) {
        console.warn('Lỗi ArcGIS reverse geocode:', arcRevErr);
      }

      // Dự phòng 2: Photon reverse geocoding
      try {
        const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'SPFF-Delivery-App/1.0' },
          cache: 'no-store',
        });

        if (res.ok) {
          const json = await res.json();
          const first = json.features?.[0]?.properties;
          if (first) {
            const parts = [
              first.housenumber ? `Số ${first.housenumber}` : null,
              first.name && first.name !== first.street ? first.name : null,
              first.street,
              first.locality || first.district || first.suburb,
              first.city || first.county || first.state,
            ].filter(Boolean);

            const address = parts.length > 0 ? parts.join(', ') : first.name || null;
            return NextResponse.json({ address });
          }
        }
      } catch (phRevErr) {
        console.warn('Lỗi Photon reverse geocode:', phRevErr);
      }

      return NextResponse.json({ address: null });
    }

    return NextResponse.json({ error: 'Thiếu tham số q hoặc lat/lon' }, { status: 400 });
  } catch (err: any) {
    console.error('API Geocode Error:', err);
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 });
  }
}
