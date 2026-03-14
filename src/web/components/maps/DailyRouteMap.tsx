import { useCallback } from 'react';
import { AMapContainer } from './AMapContainer';
import { getSpeedColorByRoute } from '../../lib/utils';
import type { DrivePosition } from '../../../types/drive';
import type { ThemeType } from '../../hooks/useTheme';

interface DailyRouteMapProps {
  allPositions: DrivePosition[][];
  theme?: ThemeType;
}

export function DailyRouteMap({ allPositions, theme = 'tesla' }: DailyRouteMapProps) {
  const handleMapReady = useCallback(
    (map: any, AMap: any) => {
      // 过滤掉空轨迹
      const validPositions = allPositions.filter((positions) => positions.length > 0);
      if (validPositions.length === 0) return;

      const allOverlays: any[] = [];

      // 为每条轨迹绘制路线。
      // 之前是“每两个点画一小段 polyline”，多段行程 + 大量点时 overlay 数量会爆炸，
      // AMap 在截图场景里容易出现前半段轨迹没完整渲染出来的问题。
      // 改成“每条行程一条 polyline”，优先保证整条轨迹稳定显示。
      validPositions.forEach((positions, routeIndex) => {
        if (positions.length < 2) return;

        const path = positions.map((p) => new AMap.LngLat(p.longitude, p.latitude));

        const speeds = positions
          .map((p) => Number(p.speed))
          .filter((v) => Number.isFinite(v));
        const avgSpeed = speeds.length > 0
          ? speeds.reduce((sum, v) => sum + v, 0) / speeds.length
          : 0;
        const color = getSpeedColorByRoute(avgSpeed, routeIndex, theme);

        const polyline = new AMap.Polyline({
          path,
          strokeColor: color,
          strokeWeight: 4,
          strokeOpacity: 0.9,
          lineJoin: 'round',
          lineCap: 'round',
          showDir: false,
        });

        allOverlays.push(polyline);
        map.add(polyline);
      });

      // Daily 是多条行程轨迹叠加：起点/终点应取“全量 positions 的最早/最晚时间点”。
      // 避免用 route 数组顺序推断（可能与真实时间顺序不一致）。
      const flatPositions = validPositions
        .flat()
        .filter((p) => typeof p?.longitude === 'number' && typeof p?.latitude === 'number' && p?.date);
      if (flatPositions.length === 0) return;

      flatPositions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const firstPoint = flatPositions[0];
      const lastPoint = flatPositions[flatPositions.length - 1];

      const startPos = new AMap.LngLat(firstPoint.longitude, firstPoint.latitude);
      const endPos = new AMap.LngLat(lastPoint.longitude, lastPoint.latitude);

      // Option 2: If start/end overlap (e.g. commute loop), merge into one marker with combined label.
      const distanceMeters = AMap.GeometryUtil?.distance(startPos, endPos) ?? Infinity;
      const merged = distanceMeters < 50;

      // Try a few candidate offsets to avoid covering route lines.
      // We do a pragmatic check: compare pixel distance from marker anchor to nearby route points.
      const routeLatLngs: any[] = [];
      validPositions.forEach((positions) => {
        positions.forEach((p) => {
          routeLatLngs.push(new AMap.LngLat(p.longitude, p.latitude));
        });
      });

      const candidateOffsets = [
        new AMap.Pixel(-14, -34),
        new AMap.Pixel(14, -34),
        new AMap.Pixel(-14, 8),
        new AMap.Pixel(14, 8),
        new AMap.Pixel(-34, -14),
        new AMap.Pixel(34, -14),
      ];

      function pickBestOffset(anchor: any): any {
        const toPt = (ll: any) => map.lngLatToContainer(ll);
        const anchorPt = toPt(anchor);
        if (!anchorPt) return candidateOffsets[0];

        const sampleCount = Math.min(routeLatLngs.length, 120);
        const step = Math.max(1, Math.floor(routeLatLngs.length / sampleCount));
        const sampled: any[] = [];
        for (let i = 0; i < routeLatLngs.length; i += step) sampled.push(routeLatLngs[i]);

        let best = candidateOffsets[0];
        let bestScore = -Infinity;

        for (const off of candidateOffsets) {
          const mx = anchorPt.x + off.getX();
          const my = anchorPt.y + off.getY();
          let minD2 = Infinity;
          for (const ll of sampled) {
            const pt = toPt(ll);
            if (!pt) continue;
            const dx = pt.x - mx;
            const dy = pt.y - my;
            const d2 = dx * dx + dy * dy;
            if (d2 < minD2) minD2 = d2;
          }
          // Prefer offsets that keep marker away from lines.
          const score = minD2;
          if (score > bestScore) {
            bestScore = score;
            best = off;
          }
        }
        return best;
      }

      const startOffset = pickBestOffset(startPos);
      const endOffset = pickBestOffset(endPos);

      const markerHtml = merged
        ? `<div style="background:rgba(17,24,39,0.65);color:white;padding:2px 6px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;line-height:14px;box-shadow:0 2px 8px rgba(0,0,0,0.25);">起/终</div>`
        : `<div style="background:rgba(34,197,94,0.75);color:white;padding:2px 6px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;line-height:14px;box-shadow:0 2px 8px rgba(0,0,0,0.25);">起</div>`;

      const startMarker = new AMap.Marker({
        position: startPos,
        content: markerHtml,
        offset: startOffset,
        zIndex: 200,
      });
      map.add(startMarker);
      allOverlays.push(startMarker);

      if (!merged) {
        const endMarker = new AMap.Marker({
          position: endPos,
          content: `<div style="background:rgba(239,68,68,0.75);color:white;padding:2px 6px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;line-height:14px;box-shadow:0 2px 8px rgba(0,0,0,0.25);">终</div>`,
          offset: endOffset,
          zIndex: 200,
        });
        map.add(endMarker);
        allOverlays.push(endMarker);
      }

      map.setFitView(allOverlays, false, [60, 60, 60, 60]);
    },
    [allPositions, theme]
  );

  const cardClass =
    theme === 'cyberpunk'
      ? 'theme-card cyber-border rounded-lg overflow-hidden'
      : theme === 'glass'
      ? 'theme-card glass-card rounded-xl overflow-hidden'
      : 'theme-card rounded-lg overflow-hidden';

  // 过滤掉空轨迹
  const validPositions = allPositions.filter((positions) => positions.length > 0);
  if (validPositions.length === 0) {
    return null;
  }

  return (
    <div className={cardClass}>
      <AMapContainer
        onMapReady={handleMapReady}
        className="h-80 w-full"
        theme={theme}
      />
    </div>
  );
}
