// ui/chart.js
// Chart.js のラッパー。複数シナリオの資産推移を折れ線で重ねて表示する。

const COLORS = [
  { line: '#4f8cff', fill: 'rgba(79,140,255,0.12)' },
  { line: '#ff7a59', fill: 'rgba(255,122,89,0.12)' },
  { line: '#34c759', fill: 'rgba(52,199,89,0.12)' },
  { line: '#c77dff', fill: 'rgba(199,125,255,0.12)' },
];

let chartInstance = null;

/**
 * シナリオ実行結果群からグラフを描画/更新する。
 * @param {HTMLCanvasElement} canvas
 * @param {Array} runResults compareScenarios() の出力 [{ id, name, results }]
 */
export function renderChart(canvas, runResults) {
  if (!runResults || runResults.length === 0) return;

  // X軸（年齢）は最初のシナリオを基準にする
  const labels = runResults[0].results.map(r => `${r.age}歳`);

  const datasets = runResults.map((run, i) => {
    const color = COLORS[i % COLORS.length];
    return {
      label: run.name,
      data: run.results.map(r => r.assets - r.debt), // 純資産で描画
      borderColor: color.line,
      backgroundColor: color.fill,
      fill: i === 0 && runResults.length === 1,
      tension: 0.25,
      pointRadius: 2,
      borderWidth: 2,
    };
  });

  if (chartInstance) {
    chartInstance.data.labels = labels;
    chartInstance.data.datasets = datasets;
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}万円`,
          },
        },
      },
      scales: {
        y: {
          title: { display: true, text: '純資産（万円）' },
          ticks: { callback: v => fmt(v) },
        },
        x: { title: { display: true, text: '年齢' } },
      },
    },
  });
}

function fmt(n) {
  return Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 0 });
}
