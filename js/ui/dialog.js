// ui/dialog.js
// AI会話パネル。getAdvice / chat（モック）を呼び出して表示する。

import { getAdvice, chat } from '../ai/advisor.js';

/**
 * アドバイス欄を描画する。
 * @param {HTMLElement} root
 * @param {Array} simulationResult simulate() の出力
 */
export function renderAdvice(root, simulationResult) {
  const advice = getAdvice(simulationResult);
  root.innerHTML = `
    <div class="advice-summary">${escapeHtml(advice.summary)}</div>
    ${section('⚠️ リスク', advice.risks)}
    ${section('💡 提案', advice.suggestions)}
  `;
}

function section(title, items) {
  if (!items || items.length === 0) return '';
  return `
    <div class="advice-section">
      <h4>${title}</h4>
      <ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    </div>`;
}

/**
 * 会話パネルを描画し、入力ハンドラを接続する。
 * @param {HTMLElement} root
 * @param {function} getContext () => ({ simulationResult })
 */
export function renderDialog(root, getContext) {
  const history = [];

  root.innerHTML = `
    <div class="dialog">
      <div id="dialog-log" class="dialog-log"></div>
      <form id="dialog-form" class="dialog-form">
        <input type="text" id="dialog-input" placeholder="FIRE・子ども・住宅・転職について質問…" autocomplete="off" />
        <button type="submit" class="btn-secondary">送信</button>
      </form>
    </div>
  `;

  const log = root.querySelector('#dialog-log');
  const form = root.querySelector('#dialog-form');
  const inputEl = root.querySelector('#dialog-input');

  const append = (role, text) => {
    history.push({ role, text });
    const div = document.createElement('div');
    div.className = `bubble bubble-${role}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };

  append('ai', 'こんにちは！ライフプランについて何でも聞いてください。');

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    append('user', text);
    inputEl.value = '';

    const ctx = getContext ? getContext() : {};
    const { reply } = chat(history, text, ctx);
    // 少しだけ間を置いて応答（チャットらしさ）
    setTimeout(() => append('ai', reply), 250);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
