// core/scenario.js
// シナリオ管理（複製・比較）。純粋なデータ操作のみ。

import { simulate, assessRisk } from './simulator.js';

let idCounter = 0;

/**
 * 新しいシナリオを生成する。
 * @param {object} input 入力スキーマ
 * @param {Array} events ライフイベント
 * @param {string} [name]
 * @returns {object} シナリオ
 */
export function createScenario(input, events = [], name) {
  idCounter += 1;
  return {
    id: `s${Date.now()}_${idCounter}`,
    name: name || `ルート${String.fromCharCode(64 + (idCounter % 26 || 26))}`,
    input: { ...input },
    events: events.map(e => ({ ...e, params: { ...e.params } })),
  };
}

/**
 * シナリオを複製する（条件を後から変えて比較するため）。
 * @param {object} scenario
 * @param {string} [newName]
 * @returns {object}
 */
export function cloneScenario(scenario, newName) {
  const copy = createScenario(scenario.input, scenario.events, newName);
  copy.name = newName || `${scenario.name}のコピー`;
  return copy;
}

/**
 * シナリオを実行して結果を返す。
 * @param {object} scenario
 * @returns {{ id, name, results, risk }}
 */
export function runScenario(scenario) {
  const results = simulate(scenario.input, scenario.events);
  const risk = assessRisk(results);
  return { id: scenario.id, name: scenario.name, results, risk };
}

/**
 * 複数シナリオを比較用に実行する。
 * @param {Array} scenarios
 * @returns {Array} runScenario の結果配列
 */
export function compareScenarios(scenarios) {
  return scenarios.map(runScenario);
}
