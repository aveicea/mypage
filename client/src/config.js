/**
 * 설정(config) 관리:
 * - config = { apiKey, databaseId }
 * - URL-safe base64 로 인코딩하여 ?config= 쿼리로 공유
 * - localStorage 에는 오직 이 설정값만 캐싱 (위젯 데이터는 절대 저장 안 함)
 */

const STORAGE_KEY = 'widget-board:config';
const DEVICE_KEY = 'widget-board:device';

/**
 * 이 기기(브라우저)의 안정적인 식별자. 위젯 데이터가 아니라 "어느 기기인지"만 저장한다.
 * 기기별 위치/크기 override 를 구분하는 데 사용.
 */
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = 'd-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function toBase64Url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(b64) {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(padded)));
}

export function encodeConfig(config) {
  return toBase64Url(JSON.stringify(config));
}

export function decodeConfig(encoded) {
  try {
    const obj = JSON.parse(fromBase64Url(encoded));
    if (obj && obj.apiKey && obj.databaseId) return obj;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function loadStoredConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && obj.apiKey && obj.databaseId) return obj;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearStoredConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 현재 사용할 config 결정:
 * 1) URL ?config= 가 있으면 디코딩 후 사용 (+ localStorage 동기화)
 * 2) 없으면 localStorage
 * 3) 둘 다 없으면 null
 */
export function resolveConfig() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('config');
  if (encoded) {
    const cfg = decodeConfig(encoded);
    if (cfg) {
      saveConfig(cfg);
      return cfg;
    }
  }
  return loadStoredConfig();
}

/** 홈(처음 보일 영역) rect 는 기기/보드별 뷰 설정이라 localStorage 에 둔다 */
export function loadHomeRect(dbId) {
  try {
    const r = JSON.parse(localStorage.getItem('widget-board:home:' + dbId));
    if (r && r.width && r.height) return r;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveHomeRect(dbId, rect) {
  localStorage.setItem('widget-board:home:' + dbId, JSON.stringify(rect));
}

/** 저장된 뷰(북마크) 목록 — 기기별 localStorage */
export function loadViews(dbId) {
  try {
    const v = JSON.parse(localStorage.getItem('widget-board:views:' + dbId));
    if (Array.isArray(v)) return v;
  } catch {
    /* ignore */
  }
  return [];
}

export function saveViews(dbId, views) {
  localStorage.setItem('widget-board:views:' + dbId, JSON.stringify(views));
}

/** 인코딩된 config 를 포함한 전체 보드 URL 생성 */
export function buildShareUrl(config) {
  const encoded = encodeConfig(config);
  return `${window.location.origin}/?config=${encoded}`;
}
