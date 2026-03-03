import { DEFAULT_TYPECODES, type CategoryKey } from './amap-poi-types.js';

const AMAP_AROUND_URL = 'https://restapi.amap.com/v5/place/around';

type AmapV5Poi = {
  id: string;
  name: string;
  type?: string;
  typecode?: string;
  address?: string;
  location: string; // "lng,lat"
  distance?: string; // meters as string
};

function amapPoiLink(p: { name: string; location: string }): string {
  // Use AMap H5 URL so Telegram will always render it as a clickable link.
  // Tested: https://uri.amap.com/marker?position=lng,lat&name=xxx redirects to ditu.amap.com.
  const [lngStr, latStr] = p.location.split(',');
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';

  const u = new URL('https://uri.amap.com/marker');
  u.searchParams.set('position', `${toFixed6(lng)},${toFixed6(lat)}`);
  u.searchParams.set('name', p.name);
  return u.toString();
}

type AmapV5AroundResponse = {
  status: '0' | '1';
  info: string;
  infocode?: string;
  count?: string;
  pois?: AmapV5Poi[];
};

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required environment variable: ${key}`);
  return v;
}

function toFixed6(n: number): string {
  return (Math.round(n * 1e6) / 1e6).toFixed(6);
}

function fmtDistanceMeters(m?: string): string {
  const n = m ? Number(m) : NaN;
  if (!Number.isFinite(n)) return '-';
  if (n < 1000) return `${Math.round(n)}m`;
  return `${(n / 1000).toFixed(1)}km`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function amapAroundV5(params: {
  key: string;
  location: { lng: number; lat: number };
  radius: number;
  types: string[];
  pageSize?: number;
  pageNum?: number;
}): Promise<AmapV5AroundResponse> {
  const u = new URL(AMAP_AROUND_URL);
  u.searchParams.set('key', params.key);
  u.searchParams.set('location', `${toFixed6(params.location.lng)},${toFixed6(params.location.lat)}`);
  u.searchParams.set('radius', String(params.radius));
  u.searchParams.set('sortrule', 'distance');
  u.searchParams.set('types', params.types.join('|'));
  u.searchParams.set('page_size', String(params.pageSize ?? 25));
  u.searchParams.set('page_num', String(params.pageNum ?? 1));
  u.searchParams.set('output', 'json');
  // Keep response slim: omit optional blocks.
  // If you later want ratings/opentime etc, we'll add show_fields back explicitly.

  const res = await fetch(u);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`AMap HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as AmapV5AroundResponse;
}

async function aroundWithBackoff(
  args: Parameters<typeof amapAroundV5>[0]
): Promise<AmapV5AroundResponse> {
  const delays = [0, 350, 900, 1600];
  let last: AmapV5AroundResponse | null = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await sleep(delays[i]);
    const data = await amapAroundV5(args);
    last = data;
    if (data.status === '1') return data;
    // 10021: limit exceeded; retry with backoff
    if (data.infocode !== '10021') return data;
  }
  return last!;
}

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  // Haversine; good enough for ~km-scale gating.
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export async function recommendAroundAndFormat(params: {
  center: { latitude: number; longitude: number };
  radiusMeters?: number;
  topN?: number;
}): Promise<string> {
  // Keep compatibility with existing deployments: prefer AMP_WEB_API, but also accept common AMap key names.
  const key =
    process.env.AMP_WEB_API ||
    process.env.AMAP_WEB_API ||
    process.env.AMAP_KEY ||
    process.env.VITE_AMAP_KEY ||
    '';
  if (!key) throw new Error('Missing required AMap key (set AMP_WEB_API or AMAP_WEB_API/AMAP_KEY)');
  const radius = params.radiusMeters ?? Number(process.env.AMAP_AROUND_RADIUS ?? '3000');
  const topN = Math.max(1, Math.min(3, params.topN ?? 3));

  const center = {
    lng: params.center.longitude,
    lat: params.center.latitude,
  };

  const categories: Array<{ title: string; emoji: string; keys: CategoryKey[]; take: number }> = [
    { title: '充电', emoji: '⚡', keys: ['charging'], take: topN },
    { title: '停车', emoji: '🅿️', keys: ['parking'], take: topN },
    { title: '美食', emoji: '🍜', keys: ['food'], take: topN },
    { title: '咖啡', emoji: '☕', keys: ['coffee'], take: topN },
    { title: '便利店', emoji: '🏪', keys: ['convenience'], take: topN },
    { title: '超市', emoji: '🛒', keys: ['supermarket'], take: topN },
    { title: '商场', emoji: '🏬', keys: ['mall'], take: topN },
    { title: '洗车', emoji: '🚿', keys: ['carwash'], take: topN },
    { title: '药店', emoji: '💊', keys: ['pharmacy'], take: topN },
    { title: '酒店', emoji: '🏨', keys: ['hotel'], take: topN },
    { title: '厕所', emoji: '🚻', keys: ['toilet'], take: topN },
  ];

  const lines: string[] = [];
  lines.push(`📍停车后周边（半径${radius >= 1000 ? `${radius / 1000}km` : `${radius}m`}）`);

  const allTypes = Array.from(
    new Set(
      categories.flatMap((c) => c.keys.flatMap((k) => DEFAULT_TYPECODES[k]))
    )
  );

  const pageSize = Math.max(1, Math.min(25, Number(process.env.AMAP_AROUND_PAGE_SIZE ?? '25')));

  const first = await aroundWithBackoff({
    key,
    location: center,
    radius,
    types: allTypes,
    pageSize,
    pageNum: 1,
  });

  if (first.status !== '1') {
    return `📍停车后周边（半径${radius}m）\n高德查询失败: ${first.info}${first.infocode ? ` (${first.infocode})` : ''}`;
  }

  const all: AmapV5Poi[] = [...(first.pois ?? [])];

  // If we didn't get enough results to fill categories, try a second page.
  if (all.length < categories.length * topN) {
    const second = await aroundWithBackoff({
      key,
      location: center,
      radius,
      types: allTypes,
      pageSize,
      pageNum: 2,
    });

    if (second.status === '1' && second.pois?.length) {
      all.push(...second.pois);
    }
  }

  const allPois = all
    .slice()
    .sort((a, b) => Number(a.distance ?? 1e18) - Number(b.distance ?? 1e18));

  for (const c of categories) {

    const typesForCategory = new Set(c.keys.flatMap((k) => DEFAULT_TYPECODES[k]));

    const pois = allPois
      .filter((p) => {
        const tc = p.typecode;
        if (!tc) return false;
        // Treat listed typecodes as prefixes, to include subtypes under the category.
        for (const t of typesForCategory) {
          if (tc.startsWith(t)) return true;
        }
        return false;
      })
      .slice(0, c.take);

    if (pois.length === 0) {
      continue;
    }

    lines.push(`${c.emoji} ${c.title}:`);
    for (const p of pois) {
      const dist = fmtDistanceMeters(p.distance);
      const link = amapPoiLink({ name: p.name, location: p.location });
      lines.push(link ? `- [${p.name} (${dist})](${link})` : `- ${p.name} (${dist})`);
    }
  }

  return lines.join('\n');
}
