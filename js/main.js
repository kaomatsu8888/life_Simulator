// main.js
// アプリ全体のオーケストレーション。各モジュールを繋ぐだけで計算はしない。

import { createScenario, cloneScenario, compareScenarios } from './core/scenario.js';
import { normalizeEvent, EVENT_TYPES } from './core/events.js';
import { assessRisk } from './core/simulator.js';
import { renderForm, readEventParams } from './ui/form.js';
import { renderChart } from './ui/chart.js';
import { renderAdvice, renderDialog } from './ui/dialog.js';
import { saveScenarios, loadScenarios, clearScenarios } from './storage.js';

console.log('lifeplan ready');

// ---- アプリ状態 ----
const app = {
  scenarios: [],      // [{ id, name, input, events }]
  activeId: null,     // 編集中シナリオのID
  compareMode: false, // 全シナリオを重ねて比較表示するか
};

// ---- DOM参照 ----
const dom = {
  formRoot: document.getElementById('form-root'),
  chart: document.getElementById('assets-chart'),
  summaryRoot: document.getElementById('summary-root'),
  compareRoot: document.getElementById('compare-root'),
  adviceRoot: document.getElementById('advice-root'),
  dialogRoot: document.getElementById('dialog-root'),
  tabs: document.getElementById('scenario-tabs'),
};

let formApi = null;
let _lastRuns = []; // 直近のシナリオ実行結果（init→handleSimulate より前に初期化）

init();

function init() {
  // 保存済みシナリオを復元、なければ初期シナリオを1つ作る
  const saved = loadScenarios();
  if (saved.length > 0) {
    app.scenarios = saved;
    app.activeId = saved[0].id;
  } else {
    const s = createScenario({}, [], 'ルートA');
    app.scenarios = [s];
    app.activeId = s.id;
  }

  formApi = renderForm(dom.formRoot, {
    initial: getActive().input,
    onSimulate: handleSimulate,
  });

  bindEventAdder();
  bindScenarioControls();
  renderDialog(dom.dialogRoot, () => ({ simulationResult: lastResultsForActive() }));

  renderTabs();
  renderEventList();
  handleSimulate();
}

// ---- シナリオ操作 ----

function getActive() {
  return app.scenarios.find(s => s.id === app.activeId) || app.scenarios[0];
}

function lastResultsForActive() {
  const run = _lastRuns.find(r => r.id === app.activeId);
  return run ? run.results : [];
}

/**
 * 「シミュレーション実行」：フォーム値をアクティブシナリオに取り込み、再計算・再描画。
 */
function handleSimulate() {
  const active = getActive();
  active.input = formApi.getInput();

  const targets = app.compareMode ? app.scenarios : [active];
  _lastRuns = compareScenarios(targets);

  renderChart(dom.chart, _lastRuns);
  renderSummary();
  renderCompare();
  renderAdvice(dom.adviceRoot, lastResultsForActive());

  persist();
}

function persist() {
  saveScenarios(app.scenarios);
}

// ---- イベント追加 ----

function bindEventAdder() {
  const addBtn = document.getElementById('event-add-btn');
  addBtn.addEventListener('click', () => {
    const type = document.getElementById('event-type').value;
    const age = Number(document.getElementById('event-age').value);
    if (!age) {
      alert('イベントの年齢を入力してください。');
      return;
    }
    const params = readEventParams(document.getElementById('event-params'));
    const ev = normalizeEvent(type, age, params);
    getActive().events.push(ev);
    getActive().events.sort((a, b) => a.age - b.age);
    renderEventList();
    handleSimulate();
  });
}

function renderEventList() {
  const list = document.getElementById('event-list');
  const events = getActive().events;
  if (events.length === 0) {
    list.innerHTML = '<li class="empty">イベントはまだありません</li>';
    return;
  }
  list.innerHTML = events
    .map((ev, i) => {
      const meta = EVENT_TYPES[ev.type];
      return `
        <li class="event-item">
          <span>${meta ? meta.icon : ''} ${ev.age}歳：${meta ? meta.label : ev.type}</span>
          <button type="button" class="event-del" data-idx="${i}">✕</button>
        </li>`;
    })
    .join('');

  list.querySelectorAll('.event-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      getActive().events.splice(idx, 1);
      renderEventList();
      handleSimulate();
    });
  });
}

// ---- シナリオタブ・比較コントロール ----

function bindScenarioControls() {
  // ツールバーに操作ボタンを差し込む
  const bar = document.createElement('div');
  bar.className = 'scenario-actions';
  bar.innerHTML = `
    <button type="button" id="btn-clone" class="btn-mini">＋ 複製して比較</button>
    <button type="button" id="btn-compare" class="btn-mini">重ねて比較: OFF</button>
    <button type="button" id="btn-reset" class="btn-mini danger">全削除</button>
  `;
  dom.tabs.after(bar);

  bar.querySelector('#btn-clone').addEventListener('click', () => {
    // 現在のフォーム値を保存してから複製
    getActive().input = formApi.getInput();
    const copy = cloneScenario(getActive());
    app.scenarios.push(copy);
    app.activeId = copy.id;
    formApi = renderForm(dom.formRoot, { initial: copy.input, onSimulate: handleSimulate });
    bindEventAdder();
    renderTabs();
    renderEventList();
    handleSimulate();
  });

  bar.querySelector('#btn-compare').addEventListener('click', e => {
    app.compareMode = !app.compareMode;
    e.target.textContent = `重ねて比較: ${app.compareMode ? 'ON' : 'OFF'}`;
    e.target.classList.toggle('active', app.compareMode);
    handleSimulate();
  });

  bar.querySelector('#btn-reset').addEventListener('click', () => {
    if (!confirm('保存済みシナリオを全て削除しますか？')) return;
    clearScenarios();
    const s = createScenario({}, [], 'ルートA');
    app.scenarios = [s];
    app.activeId = s.id;
    app.compareMode = false;
    formApi = renderForm(dom.formRoot, { initial: s.input, onSimulate: handleSimulate });
    bindEventAdder();
    renderTabs();
    renderEventList();
    handleSimulate();
  });
}

function renderTabs() {
  dom.tabs.innerHTML = app.scenarios
    .map(
      s => `<button type="button" class="tab ${s.id === app.activeId ? 'active' : ''}" data-id="${s.id}">${s.name}</button>`
    )
    .join('');

  dom.tabs.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // 切替前に現在のフォーム値を保存
      getActive().input = formApi.getInput();
      app.activeId = tab.dataset.id;
      formApi = renderForm(dom.formRoot, { initial: getActive().input, onSimulate: handleSimulate });
      bindEventAdder();
      renderTabs();
      renderEventList();
      handleSimulate();
    });
  });
}

// ---- サマリー・比較表示 ----

function renderSummary() {
  const results = lastResultsForActive();
  if (!results.length) {
    dom.summaryRoot.innerHTML = '';
    return;
  }
  const last = results[results.length - 1];
  const { stars } = assessRisk(results);

  dom.summaryRoot.innerHTML = `
    ${card('60歳の資産', `${fmt(last.assets)}万円`)}
    ${card('ローン残高', `${fmt(last.debt)}万円`)}
    ${card('老後の安全度', '★'.repeat(stars) + '☆'.repeat(5 - stars))}
  `;
}

function renderCompare() {
  if (!app.compareMode || _lastRuns.length < 2) {
    dom.compareRoot.innerHTML = '';
    return;
  }
  const rows = _lastRuns
    .map(run => {
      const last = run.results[run.results.length - 1];
      return `
        <div class="compare-card">
          <div class="compare-name">${run.name}</div>
          <div class="compare-value">${fmt(last.assets - last.debt)}<span>万円</span></div>
          <div class="compare-stars">${'★'.repeat(run.risk.stars)}${'☆'.repeat(5 - run.risk.stars)}</div>
        </div>`;
    })
    .join('');
  dom.compareRoot.innerHTML = `<h3>60歳・純資産の比較</h3><div class="compare-row">${rows}</div>`;
}

function card(title, value) {
  return `<div class="summary-card"><div class="summary-title">${title}</div><div class="summary-value">${value}</div></div>`;
}

function fmt(n) {
  return Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 0 });
}
