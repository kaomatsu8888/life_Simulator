// storage.js
// localStorage ラッパー。キーは lifeplan_* プレフィックスで統一。

const PREFIX = 'lifeplan_';
const SCENARIOS_KEY = `${PREFIX}scenarios`;

/**
 * シナリオ配列を保存する。
 * @param {Array} scenarios
 */
export function saveScenarios(scenarios) {
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  } catch (e) {
    console.warn('シナリオの保存に失敗しました', e);
  }
}

/**
 * 保存済みシナリオ配列を読み込む。
 * @returns {Array}
 */
export function loadScenarios() {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('シナリオの読み込みに失敗しました', e);
    return [];
  }
}

/**
 * 保存済みシナリオを全削除する。
 */
export function clearScenarios() {
  localStorage.removeItem(SCENARIOS_KEY);
}
