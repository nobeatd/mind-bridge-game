// 진행 상태는 학생의 브라우저 안에만 저장한다. 서버로 보내지 않는다.
export const STORAGE_KEY = 'mind-bridge-game:v1';
export const TEXT_SIZE_KEY = 'mind-bridge-text-size:v1';

export function saveSession(storage, nodeId, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, nodeId, state }));
    return true;
  } catch {
    return false;
  }
}

export function loadSession(storage) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (saved?.version !== 1 || typeof saved.nodeId !== 'string' || !saved.state) return null;
    return saved;
  } catch {
    return null;
  }
}

export function clearSession(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // 저장을 막은 브라우저에서도 게임 자체는 계속할 수 있다.
  }
}

export function saveTextSize(storage, value) {
  try {
    storage.setItem(TEXT_SIZE_KEY, value === 'large' ? 'large' : 'normal');
  } catch {
    // 설정 저장이 불가능하면 현재 탭에만 적용한다.
  }
}

export function loadTextSize(storage) {
  try {
    return storage.getItem(TEXT_SIZE_KEY) === 'large' ? 'large' : 'normal';
  } catch {
    return 'normal';
  }
}
