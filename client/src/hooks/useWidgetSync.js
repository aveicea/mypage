import { useCallback, useEffect, useRef, useState } from 'react';

const GEOM = ['x', 'y', 'width', 'height'];
const GAP = 16;

/** 겹치지 않는 가장 가까운 빈 공간 탐색 */
function findFreePosition(x, y, w, h, others) {
  const overlaps = (px, py) => others.some(
    (o) => px < o.x + o.width + GAP && px + w + GAP > o.x &&
            py < o.y + o.height + GAP && py + h + GAP > o.y
  );
  if (!overlaps(x, y)) return { x, y };
  for (let row = 0; row < 30; row++) {
    for (let col = 0; col < 30; col++) {
      if (row === 0 && col === 0) continue;
      const nx = Math.round(x + col * (w + GAP));
      const ny = Math.round(y + row * (h + GAP));
      if (!overlaps(nx, ny)) return { x: nx, y: ny };
    }
  }
  return { x: Math.round(x + w + GAP), y: Math.round(y + h + GAP) };
}

/**
 * 이 기기에 레이아웃이 없는 위젯들에 빈 공간을 찾아 배치하고 Notion에 저장.
 * rawWidgets를 직접 수정(content.layouts)하고 jobs를 채운다.
 */
function autoAssignLayouts(rawWidgets, deviceId, deviceName, api) {
  const needsLayout = rawWidgets.filter((w) => !w.content?.layouts?.[deviceId]);
  if (needsLayout.length === 0) return;

  // 모든 위젯의 현재 기기 기준 위치 계산
  const positioned = rawWidgets.map((w) => {
    const ov = w.content?.layouts?.[deviceId];
    return { id: w.id, x: ov?.x ?? w.x, y: ov?.y ?? w.y, width: ov?.width ?? w.width, height: ov?.height ?? w.height };
  });

  for (const w of needsLayout) {
    const others = positioned.filter((p) => p.id !== w.id);
    const pos = findFreePosition(w.x, w.y, w.width, w.height, others);

    // positioned 업데이트 (이후 위젯 배치 시 반영)
    const idx = positioned.findIndex((p) => p.id === w.id);
    if (idx >= 0) { positioned[idx].x = pos.x; positioned[idx].y = pos.y; }

    // 로컬 content 업데이트 (applyDeviceLayout이 이 값을 읽도록)
    w.content = {
      ...(w.content || {}),
      layouts: {
        ...(w.content?.layouts || {}),
        [deviceId]: { x: pos.x, y: pos.y, width: w.width, height: w.height, name: deviceName },
      },
    };

    // Notion에 저장 (fire-and-forget)
    api.update(w.id, { content: w.content }).catch(() => {});
  }
}

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
export function useWidgetSync(api, deviceId, { debounceMs = 800, deviceName = '' } = {}) {
  const [widgets, setWidgets] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const pending = useRef(new Map());
  const timers = useRef(new Map());
  const widgetsRef = useRef([]);
  widgetsRef.current = widgets;

  const reload = useCallback(() => {
    setStatus('loading');
    return api
      .list()
      .then((data) => {
        const raw = data.widgets || [];
        autoAssignLayouts(raw, deviceId, deviceName, api);
        setWidgets(raw.map((w) => applyDeviceLayout(w, deviceId)));
        setStatus('ready');
      })
      .catch((e) => {
        setError(e.message);
        setStatus('error');
      });
  }, [api, deviceId, deviceName]);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    api
      .list()
      .then((data) => {
        if (!alive) return;
        const raw = data.widgets || [];
        autoAssignLayouts(raw, deviceId, deviceName, api);
        setWidgets(raw.map((w) => applyDeviceLayout(w, deviceId)));
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
  }, [api, deviceId, deviceName]);

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
                [deviceId]: { x: nw.x, y: nw.y, width: nw.width, height: nw.height, name: deviceName },
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
            [deviceId]: { x: merged.x, y: merged.y, width: merged.width, height: merged.height, name: deviceName },
          },
        };
      }

      const acc = pending.current.get(id) || {};
      pending.current.set(id, { ...acc, ...persist });

      if (timers.current.has(id)) clearTimeout(timers.current.get(id));
      if (commit) flush(id);
      else timers.current.set(id, setTimeout(() => flush(id), debounceMs));
    },
    [flush, debounceMs, deviceId, deviceName]
  );

  // 이 보드에 위치 정보(layout)를 저장한 기기 목록 (현재 기기 제외 여부는 호출부에서)
  const listDeviceLayouts = useCallback(() => {
    const map = new Map(); // id -> { id, name, count }
    widgetsRef.current.forEach((w) => {
      const L = w.content?.layouts;
      if (!L) return;
      for (const id of Object.keys(L)) {
        const cur = map.get(id) || { id, name: L[id]?.name || '', count: 0 };
        if (!cur.name && L[id]?.name) cur.name = L[id].name;
        cur.count += 1;
        map.set(id, cur);
      }
    });
    return [...map.values()];
  }, []);

  // 이 기기의 위치 정보 전부 삭제 → 위젯이 공통(기본) 위치/크기로 복귀
  // 특정 기기(id)의 위치 정보를 모든 위젯에서 삭제
  const deleteDeviceLayout = useCallback(async (id) => {
    if (!id) return;
    // 대기 중인 flush가 삭제 후에 발화해 데이터를 복원하지 않도록 취소
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    pending.current.clear();
    const jobs = [];
    widgetsRef.current.forEach((w) => {
      const L = w.content?.layouts;
      if (L && L[id]) {
        const next = { ...L };
        delete next[id];
        jobs.push(api.update(w.id, { content: { ...w.content, layouts: next } }));
      }
    });
    try {
      await Promise.all(jobs);
    } catch (e) {
      setError(e.message);
    }
    await reload();
  }, [api, reload]);

  // 이 기기의 위치 정보 전부 삭제
  const clearDeviceLayout = useCallback(() => deleteDeviceLayout(deviceId), [deleteDeviceLayout, deviceId]);

  // 다른 기기의 위치 정보를 이 기기로 덮어쓰기
  const copyDeviceLayout = useCallback(async (srcId) => {
    if (!srcId || srcId === deviceId) return;
    const jobs = [];
    widgetsRef.current.forEach((w) => {
      const src = w.content?.layouts?.[srcId];
      if (src) {
        const next = {
          ...(w.content?.layouts || {}),
          // 소스 기기 레이아웃 전체(위치·크기·확대 비율 등) 복사, 이름만 이 기기로
          [deviceId]: { ...src, name: deviceName },
        };
        jobs.push(api.update(w.id, { content: { ...w.content, layouts: next } }));
      }
    });
    try {
      await Promise.all(jobs);
    } catch (e) {
      setError(e.message);
    }
    await reload();
  }, [api, deviceId, deviceName, reload]);

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

  return {
    widgets, status, error,
    updateWidget, addWidget, removeWidget,
    listDeviceLayouts, clearDeviceLayout, copyDeviceLayout, deleteDeviceLayout,
  };
}
