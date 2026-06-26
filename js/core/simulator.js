// core/simulator.js
// 資産・教育費・ローンの年次計算（純粋関数）
// すべて「万円」を基本単位とする。UIに依存しない。

import { applyEvents, summarizeEventsAtAge } from './events.js';

// ---- 定数 ----

export const CONSTANTS = {
  RETIRE_AGE: 60,          // シミュレーション終端
  BASE_LIVING_SINGLE: 180, // 単身の年間生活費（万円）
  PARTNER_LIVING_ADD: 90,  // パートナー分の追加生活費（万円/年）
  RAISE_RATE: 0.015,       // 定期昇給の年率（在職中・既定1.5%）
};

// 年収帯別の手取り率テーブル（税・社会保険料の累進をざっくり近似）。
// 年収が上がるほど手取り率は下がる。境界は「以下」で判定。
export const TAKE_HOME_TABLE = [
  { upTo: 300, rate: 0.80 },
  { upTo: 500, rate: 0.78 },
  { upTo: 700, rate: 0.76 },
  { upTo: 1000, rate: 0.73 },
  { upTo: Infinity, rate: 0.68 },
];

// 子ども1人あたりの年間教育費テーブル（子の年齢段階別・万円/年）
export const EDUCATION_TABLE = [
  { from: 0, to: 2, cost: 20 },    // 乳児
  { from: 3, to: 5, cost: 35 },    // 幼児（保育・幼稚園）
  { from: 6, to: 11, cost: 40 },   // 小学校
  { from: 12, to: 14, cost: 55 },  // 中学校
  { from: 15, to: 17, cost: 70 },  // 高校
  { from: 18, to: 21, cost: 120 }, // 大学
];

/**
 * 年収帯に応じた手取り率を返す（累進の近似）。
 * @param {number} income 年収（万円）
 * @returns {number} 手取り率（0〜1）
 */
export function takeHomeRate(income) {
  const row = TAKE_HOME_TABLE.find(r => income <= r.upTo);
  return row ? row.rate : 0.68;
}

/**
 * 年収から手取りを概算する（年収帯別の率を適用）。
 * @param {number} income 年収（万円）
 * @returns {number} 手取り（万円）
 */
export function takeHome(income) {
  return income * takeHomeRate(income);
}

/**
 * ある子の年齢に対する1年あたりの教育費を返す。
 * @param {number} childAge 子の年齢
 * @returns {number} 教育費（万円/年）
 */
export function educationCostForChildAge(childAge) {
  const row = EDUCATION_TABLE.find(r => childAge >= r.from && childAge <= r.to);
  return row ? row.cost : 0;
}

/**
 * 住宅ローンの毎月返済額（元利均等）を計算し、年額（万円）で返す。
 * @param {number} principal 借入元本（万円）
 * @param {number} annualRate 年利（例: 0.015）
 * @param {number} years 返済年数
 * @returns {number} 年間返済額（万円）
 */
export function annualLoanPayment(principal, annualRate, years) {
  if (principal <= 0 || years <= 0) return 0;
  const n = years * 12;
  const r = annualRate / 12;
  let monthly;
  if (r === 0) {
    monthly = principal / n;
  } else {
    monthly = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }
  return monthly * 12;
}

/**
 * 生活費の基礎部分を返す（住居・教育を除く）。
 * @param {object} state その年の状態
 * @returns {number} 万円/年
 */
function baseLivingCost(state) {
  let cost = CONSTANTS.BASE_LIVING_SINGLE;
  if (state.partner) cost += CONSTANTS.PARTNER_LIVING_ADD;
  return cost;
}

/**
 * 子どもたちの教育費合計を返す。
 * @param {number[]} childrenAges 各子の現在年齢
 * @returns {number} 万円/年
 */
function totalEducationCost(childrenAges) {
  return childrenAges.reduce((sum, age) => sum + educationCostForChildAge(age), 0);
}

/**
 * ライフプランをシミュレーションし、年次の配列を返す。
 *
 * @param {object} input 入力スキーマ（README参照）
 * @param {Array} events ライフイベント配列 [{ type, age, params }]
 * @returns {Array<object>} 年次結果 [{ age, assets, debt, expenses, income, events }]
 */
export function simulate(input, events = []) {
  const startAge = input.age;
  const endAge = CONSTANTS.RETIRE_AGE;

  // 可変状態（イベントで書き換わる）
  let state = {
    income: input.income,
    partner: !!input.partner,
    monthlyInvest: input.monthlyInvest || 0,
    investReturn: input.investReturn || 0,
    retired: false,
    // 子どもは「現在の年齢」配列で保持。出産イベントで0歳を追加。
    childrenAges: buildInitialChildren(input.children || 0, startAge),
  };

  // 資産は「現金(cash)」と「投資残高(invested)」に分けて管理する。
  // 投資リターンは invested にのみ適用する（現金には付かない）。
  let cash = input.savings || 0;
  let invested = 0;
  let debt = 0;

  // 住宅ローン年額（購入後に発生）
  let activeLoan = null; // { remainingYears, annualPayment, remainingPrincipal, rate }

  // 初期住宅プラン（入力フォーム由来）をイベント化して統合
  const allEvents = mergeHousingPlan(input.housing, events);

  const results = [];

  for (let age = startAge; age <= endAge; age++) {
    const yearEvents = allEvents.filter(e => e.age === age);

    // --- イベント適用（状態・資産・ローンを書き換える） ---
    // イベントの入出金は現金(cash)に対して行う。
    const applied = applyEvents({ state, assets: cash, debt, activeLoan }, yearEvents, {
      annualLoanPayment,
    });
    state = applied.state;
    cash = applied.assets;
    debt = applied.debt;
    activeLoan = applied.activeLoan;

    // --- 収入 ---
    const grossIncome = state.retired ? 0 : state.income;
    const netIncome = takeHome(grossIncome);

    // --- 支出 ---
    const living = baseLivingCost(state);
    const education = totalEducationCost(state.childrenAges);
    const loanPay = activeLoan ? activeLoan.annualPayment : 0;
    const expenses = living + education + loanPay;

    // --- 投資の複利（投資残高にのみ年率を適用） ---
    const investContribution = state.monthlyInvest * 12;
    const investGrowth = invested * state.investReturn;
    invested = invested + investGrowth + investContribution;

    // --- 現金の収支（積立分は現金から投資へ移すため差し引く） ---
    cash = cash + netIncome - expenses - investContribution;

    // --- ローン残高の減少 ---
    if (activeLoan) {
      debt = Math.max(0, activeLoan.remainingPrincipal);
      activeLoan.remainingYears -= 1;
      activeLoan.remainingPrincipal = Math.max(
        0,
        activeLoan.remainingPrincipal - (activeLoan.annualPayment - activeLoan.remainingPrincipal * activeLoan.rate)
      );
      if (activeLoan.remainingYears <= 0) {
        debt = 0;
        activeLoan = null;
      }
    }

    // 総資産は現金＋投資残高。内訳も出力して透明性を保つ。
    const assets = cash + invested;

    results.push({
      age,
      assets: round1(assets),
      cash: round1(cash),
      invested: round1(invested),
      debt: round1(debt),
      expenses: round1(expenses),
      income: round1(netIncome),
      events: summarizeEventsAtAge(yearEvents),
    });

    // --- 定期昇給（在職中のみ。翌年の年収に反映） ---
    if (!state.retired) {
      const raise = input.raiseRate ?? CONSTANTS.RAISE_RATE;
      state.income = state.income * (1 + raise);
    }

    // --- 年齢を1つ進める（子どもも歳をとる） ---
    state.childrenAges = state.childrenAges.map(a => a + 1);
  }

  return results;
}

/**
 * 入力の子ども人数から、初期の子年齢配列を作る。
 * 既存の子は便宜上「親年齢 - 28」を起点に均等配置（素朴な仮定）。
 */
function buildInitialChildren(count, parentAge) {
  const ages = [];
  for (let i = 0; i < count; i++) {
    // 直近に生まれたと仮定し 0,2,4... 歳でずらす
    ages.push(Math.max(0, i * 2));
  }
  return ages;
}

/**
 * 入力フォームの housing プランを events 配列に統合する。
 */
function mergeHousingPlan(housing, events) {
  const merged = [...events];
  if (housing && housing.plan && housing.age) {
    const exists = merged.some(e => e.type === 'housing' && e.age === housing.age);
    if (!exists) {
      merged.push({
        type: 'housing',
        age: housing.age,
        params: {
          price: housing.price,
          loanYears: housing.loanYears,
          rate: housing.rate,
          downPayment: housing.downPayment || 0,
        },
      });
    }
  }
  return merged;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * 60歳時点の老後リスクを★1〜5で評価する。
 * 資産が多いほどリスクは低い（★は安全度）。
 * @param {Array} results simulate() の出力
 * @returns {{ stars: number, finalAssets: number, finalDebt: number }}
 */
export function assessRisk(results) {
  const last = results[results.length - 1];
  const finalAssets = last ? last.assets : 0;
  const finalDebt = last ? last.debt : 0;
  const net = finalAssets - finalDebt;

  let stars;
  if (net >= 5000) stars = 5;
  else if (net >= 3000) stars = 4;
  else if (net >= 1500) stars = 3;
  else if (net >= 500) stars = 2;
  else stars = 1;

  return { stars, finalAssets, finalDebt, net };
}
