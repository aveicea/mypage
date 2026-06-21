import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 위젯 상태를 관리하고 Notion DB(단일 진실 소스)와 동기화한다.
 * - 진입 시 list() 로 전체 복원
 * - 변경은 디바운스(기본 800ms) 후 PATCH
 * - 위젯 데이터는 절대 localStorage 에 저장하지 않음 (메모리 상태만 유지)
 */
export function useWidgetSync(api, { debounceMs = 800 } = {}) {
  const [widgets, setWidgets] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);

  const pending = useRef(new Map()); // id -> patch(누적)
  const timers = useRef(new Map()); // id -> timeout

  // 초기 로드
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    api
      .list()
      .then((data) => {
        if (!alive) return;
        setWidgets(data.widgets || []);
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
  }, [api]);

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

  /** 로컬 상태 갱신 + 디바운스 저장 예약. commit=true 면 즉시 flush */
  const updateWidget = useCallback(
    (id, patch, { commit = false } = {}) => {
      setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));

      const acc = pending.current.get(id) || {};
      pending.current.set(id, { ...acc, ...patch });

      if (timers.current.has(id)) clearTimeout(timers.current.get(id));
      if (commit) {
        flush(id);
      } else {
        timers.current.set(id, setTimeout(() => flush(id), debounceMs));
      }
    },
    [flush, debounceMs]
  );

  const addWidget = useCallback(
    async (widget) => {
      try {
        const data = await api.create(widget);
        setWidgets((prev) => [...prev, data.widget]);
        return data.widget;
      } catch (e) {
        setError(e.message);
        return null;
      }
    },
    [api]
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
