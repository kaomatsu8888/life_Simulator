// core/simulator.js
// 資産・教育費・ローンの年次計算（純粋関数）
// すべて「万円」を基本単位とする。UIに依存しない。

import { applyEvents, summarizeEventsAtAge } from './events.js';

// ---- 定数（最初は素朴な定義で開始） ----

export const CONSTANTS = {
  TAKE_HOME_RATE: 0.78,   // 年収 → 手取り係数
  RETIRE_AGE: 60,         // シミュレーション終端
  BASE_LIVING_SINGLE: 180, // 単身の年間生活費（万円）
  PARTNER_LIVING_ADD: 90,  // パートナー分の追加生活費（万円/年）
};

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
 * 年収から手取りを概算する（ざっくり係数掛け）。
 * @param {number} income 年収（万円）
 * @returns {number} 手取り（万円）
 */
export function takeHome(income) {
  return income * CONSTANTS.TAKE_HOME_RATE;
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

  let assets = input.savings || 0;
  let debt = 0;

  // 住宅ローン年額（購入後に発生）
  let activeLoan = null; // { remainingYears, annualPayment, remainingPrincipal, rate }

  // 初期住宅プラン（入力フォーム由来）をイベント化して統合
  const allEvents = mergeHousingPlan(input.housing, events);

  const results = [];

  for (let age = startAge; age <= endAge; age++) {
    const yearEvents = allEvents.filter(e => e.age === age);

    // --- イベント適用（状態・資産・ローンを書き換える） ---
    const applied = applyEvents({ state, assets, debt, activeLoan }, yearEvents, {
      annualLoanPayment,
    });
    state = applied.state;
    assets = applied.assets;
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

    // --- 投資の複利（年初の資産に対して年率を適用） ---
    const investContribution = state.monthlyInvest * 12;
    const investGrowth = assets * state.investReturn;

    // --- 年次キャッシュフロー ---
    assets = assets + investGrowth + netIncome + investContribution - expenses;

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

    results.push({
      age,
      assets: round1(assets),
      debt: round1(debt),
      expenses: round1(expenses),
      income: round1(netIncome),
      events: summarizeEventsAtAge(yearEvents),
    });

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
