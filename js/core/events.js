// core/events.js
// ライフイベントの定義と適用ロジック（純粋関数）
// 各イベントは { type, age, params } の形に正規化される。

/**
 * イベント種類のメタ情報（UIのフォーム生成にも使う）。
 * fields: ユーザーが入力するパラメータ定義
 */
export const EVENT_TYPES = {
  job: {
    label: '転職',
    icon: '💼',
    fields: [{ key: 'income', label: '新しい年収（万円）', type: 'number', default: 400 }],
  },
  marriage: {
    label: '結婚',
    icon: '💍',
    fields: [{ key: 'cost', label: '結婚費用（万円）', type: 'number', default: 200 }],
  },
  birth: {
    label: '出産',
    icon: '👶',
    fields: [{ key: 'cost', label: '出産費用（万円）', type: 'number', default: 50 }],
  },
  housing: {
    label: '住宅購入',
    icon: '🏠',
    fields: [
      { key: 'price', label: '物件価格（万円）', type: 'number', default: 4000 },
      { key: 'downPayment', label: '頭金（万円）', type: 'number', default: 500 },
      { key: 'loanYears', label: '返済年数', type: 'number', default: 35 },
      { key: 'rate', label: '金利（年率 例:0.015）', type: 'number', default: 0.015, step: 0.001 },
    ],
  },
  retire: {
    label: '退職',
    icon: '🌴',
    fields: [{ key: 'severance', label: '退職金（万円）', type: 'number', default: 1500 }],
  },
  inherit: {
    label: '相続',
    icon: '📜',
    fields: [{ key: 'amount', label: '相続額（万円）', type: 'number', default: 1000 }],
  },
  care: {
    label: '親の介護',
    icon: '🧑‍🦽',
    fields: [
      { key: 'cost', label: '年間介護費（万円）', type: 'number', default: 100 },
      { key: 'years', label: '継続年数', type: 'number', default: 5 },
    ],
  },
};

/**
 * その年に発生するイベント群を状態に適用する。
 * @param {object} ctx { state, assets, debt, activeLoan }
 * @param {Array} yearEvents その年のイベント [{ type, age, params }]
 * @param {object} helpers { annualLoanPayment }
 * @returns {object} 更新後の { state, assets, debt, activeLoan }
 */
export function applyEvents(ctx, yearEvents, helpers) {
  let { state, assets, debt, activeLoan } = ctx;
  // stateは浅いコピーで書き換える（呼び出し側の不変性を尊重）
  state = { ...state, childrenAges: [...state.childrenAges] };

  for (const ev of yearEvents) {
    const p = ev.params || {};
    switch (ev.type) {
      case 'job':
        state.income = p.income ?? state.income;
        break;

      case 'marriage':
        state.partner = true;
        assets -= p.cost || 0;
        break;

      case 'birth':
        state.childrenAges.push(0); // 0歳を追加
        assets -= p.cost || 0;
        break;

      case 'housing': {
        const price = p.price || 0;
        const down = p.downPayment || 0;
        const principal = Math.max(0, price - down);
        assets -= down;
        const annualPayment = helpers.annualLoanPayment(principal, p.rate || 0, p.loanYears || 0);
        activeLoan = {
          remainingYears: p.loanYears || 0,
          remainingPrincipal: principal,
          annualPayment,
          rate: p.rate || 0,
        };
        debt = principal;
        break;
      }

      case 'retire':
        state.retired = true;
        assets += p.severance || 0;
        break;

      case 'inherit':
        assets += p.amount || 0;
        break;

      case 'care':
        // 介護は一時的な支出増。ここでは簡易に当年に総額を計上。
        assets -= (p.cost || 0) * (p.years || 1);
        break;

      default:
        // 未知のイベントは無視
        break;
    }
  }

  return { state, assets, debt, activeLoan };
}

/**
 * その年のイベントを表示用ラベル配列に変換する。
 * @param {Array} yearEvents
 * @returns {string[]}
 */
export function summarizeEventsAtAge(yearEvents) {
  return yearEvents.map(ev => {
    const meta = EVENT_TYPES[ev.type];
    return meta ? `${meta.icon} ${meta.label}` : ev.type;
  });
}

/**
 * 生のイベント入力を正規化する。
 * @param {string} type
 * @param {number} age
 * @param {object} params
 * @returns {{ type, age, params }}
 */
export function normalizeEvent(type, age, params = {}) {
  return { type, age: Number(age), params: { ...params } };
}
