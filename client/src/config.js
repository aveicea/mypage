/**
 * 설정(config) 관리:
 * - config = { apiKey, databaseId }
 * - URL-safe base64 로 인코딩하여 ?config= 쿼리로 공유
 * - localStorage 에는 오직 이 설정값만 캐싱 (위젯 데이터는 절대 저장 안 함)
 */

const STORAGE_KEY = 'widget-board:config';

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

/** 인코딩된 config 를 포함한 전체 보드 URL 생성 */
export function buildShareUrl(config) {
  const encoded = encodeConfig(config);
  return `${window.location.origin}/?config=${encoded}`;
}
