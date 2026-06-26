// ai/advisor.js
// AIアドバイザーのモック実装。
// 関数シグネチャは将来の OpenAI / Gemini API 接続時にそのまま使える形にしておく。
// 中身はパターンマッチで固定文を返すだけ。

import { assessRisk } from '../core/simulator.js';

/**
 * シミュレーション結果から助言を生成する（モック）。
 *
 * 将来の実API版でも同じシグネチャを使う：
 *   async function getAdvice(simulationResult) -> { summary, risks, suggestions }
 *
 * @param {Array} simulationResult simulate() の出力（年次配列）
 * @returns {{ summary: string, risks: string[], suggestions: string[] }}
 */
export function getAdvice(simulationResult) {
  if (!simulationResult || simulationResult.length === 0) {
    return {
      summary: 'シミュレーション結果がありません。条件を入力して実行してください。',
      risks: [],
      suggestions: [],
    };
  }

  const last = simulationResult[simulationResult.length - 1];
  const { stars, net, finalDebt } = assessRisk(simulationResult);

  // 資産が最小になる年（資金ショートの兆候）を探す
  const minYear = simulationResult.reduce((min, y) => (y.assets < min.assets ? y : min), simulationResult[0]);

  const risks = [];
  const suggestions = [];

  // --- パターンマッチで固定文を組み立てる ---
  let summary;
  if (net >= 5000) {
    summary = `60歳時点の純資産は約${fmt(net)}万円の見込みです。非常に余裕のある計画です（安全度★${stars}）。`;
    suggestions.push('余剰資金は早期リタイア（FIRE）や教育・住宅のグレードアップにも回せます。');
  } else if (net >= 3000) {
    summary = `60歳時点の純資産は約${fmt(net)}万円の見込みです。標準的な老後資金は確保できそうです（安全度★${stars}）。`;
    suggestions.push('現状維持で問題ありませんが、投資利回りの分散も検討しましょう。');
  } else {
    summary = `60歳時点の純資産は約${fmt(net)}万円の見込みです。老後資金が不足する可能性があります（安全度★${stars}）。`;
    risks.push('老後資金が不足する見込みです。投資額の見直しか、退職年齢の引き上げを検討してください。');
    suggestions.push('毎月の積立額を増やす、または年収アップ（転職）を試してみましょう。');
  }

  if (minYear.assets < 0) {
    risks.push(`${minYear.age}歳前後で資産がマイナス（約${fmt(minYear.assets)}万円）になります。大型支出の時期を見直してください。`);
  }

  if (finalDebt > 0) {
    risks.push(`60歳時点で住宅ローンが約${fmt(finalDebt)}万円残ります。繰上返済の検討余地があります。`);
  }

  if (risks.length === 0) {
    risks.push('大きなリスクは検出されませんでした。');
  }

  return { summary, risks, suggestions };
}

/**
 * 会話形式のアドバイス（モック）。
 *
 * 将来の実API版でも同じシグネチャを使う：
 *   async function chat(history, userMessage) -> { reply }
 *
 * @param {Array} history 過去の会話 [{ role, text }]
 * @param {string} userMessage ユーザーの発話
 * @param {object} [context] { simulationResult } 数値計算のための補助情報
 * @returns {{ reply: string }}
 */
export function chat(history, userMessage, context = {}) {
  const msg = (userMessage || '').toLowerCase();
  const result = context.simulationResult;

  // FIRE 関連
  if (msg.includes('fire') || userMessage.includes('早期')) {
    if (result && result.length) {
      const { net } = assessRisk(result);
      // 純資産から年間生活費を逆算（4%ルールの素朴版）
      const annualSpend = Math.round((net * 0.04) * 10) / 10;
      return {
        reply: `現在の計画だと60歳時点の純資産は約${fmt(net)}万円。いわゆる「4%ルール」では年間生活費を約${fmt(annualSpend)}万円に抑えられればFIREが視野に入ります。生活費をさらに抑えるか、投資利回りを上げると達成年齢を前倒しできます。`,
      };
    }
    return { reply: 'まずシミュレーションを実行すると、FIRE達成に必要な数値を計算できます。' };
  }

  // 子ども・教育
  if (userMessage.includes('子ども') || userMessage.includes('教育')) {
    return {
      reply: '子どもが1人増えるごとに、教育費は大学までの累計でおよそ1,000万円前後かかる想定です。出産イベントを追加してグラフの変化を見てみましょう。',
    };
  }

  // 住宅
  if (userMessage.includes('家') || userMessage.includes('住宅') || userMessage.includes('マンション')) {
    return {
      reply: '住宅購入は頭金とローン金利の影響が大きいです。住宅購入イベントの「頭金」や「金利」を変えて、複数ルートで比較するのがおすすめです。',
    };
  }

  // 転職・年収
  if (userMessage.includes('転職') || userMessage.includes('年収')) {
    return {
      reply: '転職イベントで年収を変えると、手取り（約78%換算）を通じて資産推移に反映されます。年収+100万円がどれだけ効くか試してみてください。',
    };
  }

  // 既定の応答
  return {
    reply: 'なるほど。条件を変えてシナリオを複製・比較すると、選択の違いが資産推移にどう出るか分かりやすいですよ。「FIRE」「子ども」「住宅」「転職」などのキーワードでも質問できます。',
  };
}

function fmt(n) {
  return Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 0 });
}
