// ui/form.js
// 入力フォームの生成と値の取得。DOM操作のみ（計算は core/ に委譲）。

import { EVENT_TYPES } from '../core/events.js';

const DEFAULT_INPUT = {
  age: 36,
  income: 300,
  savings: 800,
  monthlyInvest: 5,
  investReturn: 0.03,
  partner: true,
  children: 2,
  housing: { plan: false, age: 38, price: 4000, downPayment: 500, loanYears: 35, rate: 0.015 },
};

/**
 * フォームを描画する。
 * @param {HTMLElement} root
 * @param {object} options { onSimulate, onAddEvent, initial }
 * @returns {object} { getInput, getEvents, setEvents }
 */
export function renderForm(root, { onSimulate, initial } = {}) {
  const input = { ...DEFAULT_INPUT, ...(initial || {}) };

  root.innerHTML = `
    <form id="life-form" class="life-form">
      ${numberField('age', '現在の年齢', input.age)}
      ${numberField('income', '年収（万円）', input.income)}
      ${numberField('savings', '貯金（万円）', input.savings)}
      ${numberField('monthlyInvest', '毎月の積立（万円）', input.monthlyInvest)}
      ${numberField('investReturn', '想定利回り（年率）', input.investReturn, 0.005)}

      <div class="field-row">
        <label class="checkbox">
          <input type="checkbox" name="partner" ${input.partner ? 'checked' : ''} />
          パートナーあり
        </label>
        ${numberField('children', '子どもの人数', input.children, 1, 'inline')}
      </div>

      <fieldset class="housing-fieldset">
        <legend>
          <label class="checkbox">
            <input type="checkbox" name="housingPlan" ${input.housing.plan ? 'checked' : ''} />
            🏠 住宅購入プランあり
          </label>
        </legend>
        <div class="housing-fields ${input.housing.plan ? '' : 'disabled'}">
          ${numberField('housingAge', '購入年齢', input.housing.age)}
          ${numberField('housingPrice', '物件価格（万円）', input.housing.price)}
          ${numberField('housingDown', '頭金（万円）', input.housing.downPayment)}
          ${numberField('housingLoanYears', '返済年数', input.housing.loanYears)}
          ${numberField('housingRate', '金利（年率）', input.housing.rate, 0.001)}
        </div>
      </fieldset>

      <button type="submit" class="btn-primary">▶ シミュレーション実行</button>
    </form>

    <div class="event-adder">
      <h3>ライフイベントを追加</h3>
      <div class="event-adder-controls">
        <select id="event-type">
          ${Object.entries(EVENT_TYPES)
            .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`)
            .join('')}
        </select>
        <input type="number" id="event-age" placeholder="年齢" min="0" max="100" />
        <button type="button" id="event-add-btn" class="btn-secondary">＋追加</button>
      </div>
      <div id="event-params" class="event-params"></div>
      <ul id="event-list" class="event-list"></ul>
    </div>
  `;

  const form = root.querySelector('#life-form');

  // 住宅フィールドの有効/無効トグル
  const housingPlanCb = form.querySelector('[name="housingPlan"]');
  const housingFields = form.querySelector('.housing-fields');
  housingPlanCb.addEventListener('change', () => {
    housingFields.classList.toggle('disabled', !housingPlanCb.checked);
  });

  // イベントパラメータ欄を選択種別に応じて描画
  const typeSelect = root.querySelector('#event-type');
  const paramsBox = root.querySelector('#event-params');
  const renderParams = () => {
    paramsBox.innerHTML = renderEventParamFields(typeSelect.value);
  };
  typeSelect.addEventListener('change', renderParams);
  renderParams();

  form.addEventListener('submit', e => {
    e.preventDefault();
    onSimulate && onSimulate();
  });

  return {
    getInput: () => readInput(form),
    formEl: form,
  };
}

/**
 * フォームから入力スキーマを読み取る。
 * @param {HTMLFormElement} form
 * @returns {object}
 */
export function readInput(form) {
  const v = name => {
    const el = form.querySelector(`[name="${name}"]`);
    return el ? el.value : '';
  };
  const num = name => Number(v(name)) || 0;
  const checked = name => form.querySelector(`[name="${name}"]`)?.checked || false;

  return {
    age: num('age'),
    income: num('income'),
    savings: num('savings'),
    monthlyInvest: num('monthlyInvest'),
    investReturn: num('investReturn'),
    partner: checked('partner'),
    children: num('children'),
    housing: {
      plan: checked('housingPlan'),
      age: num('housingAge'),
      price: num('housingPrice'),
      downPayment: num('housingDown'),
      loanYears: num('housingLoanYears'),
      rate: num('housingRate'),
    },
  };
}

/**
 * イベント種別ごとのパラメータ入力欄HTMLを返す。
 */
export function renderEventParamFields(type) {
  const meta = EVENT_TYPES[type];
  if (!meta) return '';
  return meta.fields
    .map(f => {
      const step = f.step || 1;
      return `
        <label class="event-param">
          <span>${f.label}</span>
          <input type="${f.type}" data-param="${f.key}" value="${f.default}" step="${step}" />
        </label>`;
    })
    .join('');
}

/**
 * イベントパラメータ欄から値を読み取る。
 * @param {HTMLElement} paramsBox
 * @returns {object}
 */
export function readEventParams(paramsBox) {
  const params = {};
  paramsBox.querySelectorAll('[data-param]').forEach(el => {
    params[el.dataset.param] = Number(el.value);
  });
  return params;
}

// ---- HTMLテンプレート補助 ----

function numberField(name, label, value, step = 1, variant = '') {
  return `
    <label class="field ${variant}">
      <span class="field-label">${label}</span>
      <input type="number" name="${name}" value="${value}" step="${step}" />
    </label>`;
}
