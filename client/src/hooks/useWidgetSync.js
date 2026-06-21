import { useCallback, useEffect, useRef, useState } from 'react';

const GEOM = ['x', 'y', 'width', 'height'];

/** 이 기기 override 가 있으면 위치/크기를 그 값으로 치환 */
function applyDeviceLayout(widget, deviceId) {
  const ov = widget.content?.layouts?.[deviceId];
  if (!ov) return widget;
  return {
    ...widget,
    x: ov.x ?? widget.x,
    y: ov.y ?? widget.y,
    width: ov.width ?? widget.width,
    height: ov.height ?? widget.height,
  };
}

/**
 * 위젯 상태를 관리하고 Notion DB(단일 진실 소스)와 동기화한다.
 * - 진입 시 list() 로 전체 복원 (이 기기 override 적용)
 * - 위치/크기 변경은 기기별(layouts[deviceId]) 로 Content 에 저장 → 기기마다 자기 배치 유지
 * - 그 외(텍스트/색/순서 등)는 공통 저장
 * - 위젯 데이터는 절대 localStorage 에 저장하지 않음 (식별자만 별도)
 */
export function useWidgetSync(api, deviceId, { debounceMs = 800 } = {}) {
  const [widgets, setWidgets] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const pending = useRef(new Map());
  const timers = useRef(new Map());
  const widgetsRef = useRef([]);
  widgetsRef.current = widgets;

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    api
      .list()
      .then((data) => {
        if (!alive) return;
        setWidgets((data.widgets || []).map((w) => applyDeviceLayout(w, deviceId)));
        setStatus('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message);
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [api, deviceId]);

  const flush = useCallback(
    (id) => {
      const patch = pending.current.get(id);
      pending.current.delete(id);
      timers.current.delete(id);
      if (!patch || Object.keys(patch).length === 0) return;
      api.update(id, patch).catch((e) => setError(e.message));
    },
    [api]
  );

  const updateWidget = useCallback(
    (id, patch, { commit = false } = {}) => {
      const geom = {};
      const rest = {};
      for (const k of Object.keys(patch)) {
        if (GEOM.includes(k)) geom[k] = patch[k];
        else rest[k] = patch[k];
      }
      const hasGeom = Object.keys(geom).length > 0;

      // 로컬 상태: 지오메트리는 즉시 반영 + content.layouts[deviceId] 갱신
      setWidgets((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          const nw = { ...w, ...patch };
          if (hasGeom) {
            nw.content = {
              ...(nw.content || {}),
              layouts: {
                ...(nw.content?.layouts || {}),
                [deviceId]: { x: nw.x, y: nw.y, width: nw.width, height: nw.height },
              },
            };
          }
          return nw;
        })
      );

      // 저장용 patch: 지오메트리는 Content(layouts)로, 나머지는 그대로
      const cur = widgetsRef.current.find((w) => w.id === id) || {};
      const merged = { ...cur, ...patch };
      const persist = { ...rest };
      if (hasGeom) {
        const baseContent = rest.content ?? merged.content ?? {};
        persist.content = {
          ...baseContent,
          layouts: {
            ...(merged.content?.layouts || {}),
            [deviceId]: { x: merged.x, y: merged.y, width: merged.width, height: merged.height },
          },
        };
      }

      const acc = pending.current.get(id) || {};
      pending.current.set(id, { ...acc, ...persist });

      if (timers.current.has(id)) clearTimeout(timers.current.get(id));
      if (commit) flush(id);
      else timers.current.set(id, setTimeout(() => flush(id), debounceMs));
    },
    [flush, debounceMs, deviceId]
  );

  const addWidget = useCallback(
    async (widget) => {
      try {
        const data = await api.create(widget);
        setWidgets((prev) => [...prev, applyDeviceLayout(data.widget, deviceId)]);
        return data.widget;
      } catch (e) {
        setError(e.message);
        return null;
      }
    },
    [api, deviceId]
  );

  const removeWidget = useCallback(
    async (id) => {
      setWidgets((prev) => prev.filter((w) => w.id !== id));
      try {
        await api.remove(id);
      } catch (e) {
        setError(e.message);
      }
    },
    [api]
  );

  return { widgets, status, error, updateWidget, addWidget, removeWidget };
}
