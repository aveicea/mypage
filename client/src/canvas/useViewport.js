import { useCallback, useRef, useState } from 'react';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

/**
 * 캔버스 패닝/줌 상태 관리.
 * pan: 화면 좌표상 캔버스 레이어의 좌상단 오프셋(px)
 * zoom: 배율
 */
export function useViewport() {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const stateRef = useRef({ pan, zoom });
  stateRef.current = { pan, zoom };

  /** 화면 좌표 -> 캔버스(월드) 좌표 */
  const screenToWorld = useCallback((sx, sy) => {
    const { pan: p, zoom: z } = stateRef.current;
    return { x: (sx - p.x) / z, y: (sy - p.y) / z };
  }, []);

  /** 특정 화면 지점을 기준으로 줌 (휠/핀치) */
  const zoomAt = useCallback((sx, sy, factor) => {
    const { pan: p, zoom: z } = stateRef.current;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
    if (next === z) return;
    // 줌 후에도 (sx,sy) 아래의 월드 좌표가 그대로 유지되도록 pan 보정
    const wx = (sx - p.x) / z;
    const wy = (sy - p.y) / z;
    setPan({ x: sx - wx * next, y: sy - wy * next });
    setZoom(next);
  }, []);

  const panBy = useCallback((dx, dy) => {
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const reset = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const setViewport = useCallback((z, p) => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)));
    setPan(p);
  }, []);

  /** 주어진 월드 영역(rect)이 화면에 꽉 차게 pan/zoom 을 맞춘다 */
  const fitTo = useCallback((rect) => {
    if (!rect || !rect.width || !rect.height) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(vw / rect.width, vh / rect.height)));
    setZoom(z);
    setPan({
      x: (vw - rect.width * z) / 2 - rect.x * z,
      y: (vh - rect.height * z) / 2 - rect.y * z,
    });
  }, []);

  return { pan, zoom, screenToWorld, zoomAt, panBy, reset, fitTo, setViewport, MIN_ZOOM, MAX_ZOOM };
}
