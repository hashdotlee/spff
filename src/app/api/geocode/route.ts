import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  try {
    // 1. Forward Geocoding: Tra cứu tọa độ từ địa chỉ chính xác
    if (q) {
      const trimmedQuery = q.trim();
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmedQuery)}&limit=5`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SPFF-Delivery-App/1.0' },
        cache: 'no-store',
      });

      if (!res.ok) {
        return NextResponse.json({ results: [] });
      }

      const json = await res.json();
      const features = json.features || [];

      const results = features.map((f: any) => {
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

        return {
          latitude: coords[1],
          longitude: coords[0],
          displayName,
          street: p.street || null,
          district: p.district || p.suburb || null,
          city: p.city || p.state || null,
        };
      });

      return NextResponse.json({ results });
    }

    // 2. Reverse Geocoding: Lấy tên địa chỉ từ tọa độ GPS
    if (lat && lon) {
      const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SPFF-Delivery-App/1.0' },
        cache: 'no-store',
      });

      if (!res.ok) {
        return NextResponse.json({ address: null });
      }

      const json = await res.json();
      const first = json.features?.[0]?.properties;
      if (!first) {
        return NextResponse.json({ address: null });
      }

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

    return NextResponse.json({ error: 'Thiếu tham số q hoặc lat/lon' }, { status: 400 });
  } catch (err: any) {
    console.error('API Geocode Error:', err);
    return NextResponse.json({ error: err.message, results: [] }, { status: 500 });
  }
}
