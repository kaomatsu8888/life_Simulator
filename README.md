# 🧭 ライフプランシミュレーター

人生の意思決定を試せる対話型シミュレーター。
現状（年齢・年収・貯金・家族構成など）を入力し、「転職したら？」「子ども3人なら？」「FIREしたら？」といったシナリオを切り替えて、**60歳時点の資産推移やリスク**を比較できます。

家計簿アプリとの差別化ポイント：

- 複数シナリオを並べて比較（A/B/Cルート）
- ライフイベント（結婚・出産・住宅購入・転職など）を時系列で追加
- 結果を AI が要約＋アドバイスとして解説（現状はモック実装）

ゲーム的に「未来を試して遊べる」体験を目指しています。

---

## 使い方

ビルド不要の静的サイトです。`index.html` をブラウザで開くだけで動きます。

> ES Modules を使っているため、ローカルでは `file://` 直開きではなく簡易サーバ経由を推奨します。
>
> ```bash
> # Python があれば
> python -m http.server 8000
> # → http://localhost:8000 を開く
> ```

GitHub Pages にそのままデプロイ可能です（リポジトリの Settings → Pages で公開）。

---

## 技術スタック

- Vanilla JS + ES Modules（ビルドなし）
- HTML / CSS（フレームワークなし、CSS変数でテーマ管理）
- [Chart.js](https://www.chartjs.org/) — 資産推移グラフ（CDN）
- [Day.js](https://day.js.org/) — 年齢・年計算（CDN）
- localStorage — シナリオ保存（キーは `lifeplan_*`）

設計方針：

- シミュレーション計算は**純粋関数**として `js/core/` に集約。UIに依存させない。
- AI解説部分はインターフェース（`getAdvice` / `chat`）だけ定義し、中身はモックで固定文を返す。後で OpenAI / Gemini API に差し替え可能。

---

## ディレクトリ構成

```
/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── main.js            ← 全体のオーケストレーション
│   ├── core/
│   │   ├── simulator.js   ← 資産・教育費・ローンの年次計算（純粋関数）
│   │   ├── events.js      ← ライフイベント定義と適用ロジック
│   │   └── scenario.js    ← シナリオ管理（複製・比較）
│   ├── ui/
│   │   ├── form.js        ← 入力フォーム
│   │   ├── chart.js       ← Chart.js ラッパー
│   │   └── dialog.js      ← AI会話パネル
│   ├── ai/
│   │   └── advisor.js     ← モック実装（後で差し替え）
│   └── storage.js         ← localStorage ラッパー
└── README.md
```

---

## 入力スキーマ（Phase 1）

`simulate(input, events)` に渡す `input` の形：

```js
{
  age: 26,               // 現在の年齢
  income: 350,           // 年収（万円）
  savings: 150,          // 貯金（万円）
  monthlyInvest: 3,      // 毎月の積立額（万円）
  investReturn: 0.04,    // 想定利回り（年率）
  partner: false,        // パートナーの有無
  children: 0,           // 子どもの人数
  housing: {             // 住宅購入プラン（任意）
    plan: true,
    age: 32,             // 購入年齢
    price: 3500,         // 物件価格（万円）
    downPayment: 300,    // 頭金（万円）
    loanYears: 35,       // 返済年数
    rate: 0.015          // 金利（年率）
  }
}
```

### ライフイベント `events`

`{ type, age, params }` の配列。種類：

| type      | 説明      | params 例 |
|-----------|-----------|-----------|
| `job`     | 転職      | `{ income: 400 }` |
| `marriage`| 結婚      | `{ cost: 200 }` |
| `birth`   | 出産      | `{ cost: 50 }` |
| `housing` | 住宅購入  | `{ price, downPayment, loanYears, rate }` |
| `retire`  | 退職      | `{ severance: 1500 }` |
| `inherit` | 相続      | `{ amount: 1000 }` |
| `care`    | 親の介護  | `{ cost: 100, years: 5 }` |

---

## 出力スキーマ（Phase 1）

`simulate()` は現在年齢から60歳までの年次配列を返します：

```js
[
  { age: 36, assets: 800, cash: 740, invested: 60, debt: 0, expenses: 280, income: 240, events: [] },
  { age: 37, assets: 826.2, cash: 762, invested: 64.2, debt: 0, expenses: 280, income: 243.6, events: [] },
  // ...
  { age: 60, assets: 4200, cash: 1200, invested: 3000, debt: 0, expenses: 270, income: 0, events: ['🌴 退職'] }
]
```

- すべて**万円**単位。
- `income` は手取り（**年収帯別の率**で換算。`TAKE_HOME_TABLE` 参照）。
- `assets` は総資産（`cash` ＋ `invested`）。
- `cash` は現金残高、`invested` は投資残高。**投資リターンは `invested` にのみ適用**され、現金には付かない。
- `debt` は住宅ローン残高。

### 計算モデルの主な前提

- **手取り**：年収帯別の手取り率（300万以下=80% 〜 1000万超=68%）で累進を近似。
- **昇給**：在職中は毎年 `RAISE_RATE`（既定1.5%）で年収が上昇。`input.raiseRate` で上書き可。
- **投資**：毎月の積立は現金から投資へ移し、投資残高にのみ年率リターンを複利適用。

`assessRisk(results)` で60歳時点の老後リスクを `★1〜5`（安全度）として取得できます。

---

## AIアドバイザー（モック）

`js/ai/advisor.js` に2つのインターフェースを定義しています。

```js
getAdvice(simulationResult) // => { summary, risks, suggestions }
chat(history, userMessage, context) // => { reply }
```

現状は**固定文をパターンマッチで返すモック**です。関数シグネチャは実API接続時にそのまま使えるように設計しています。会話パネルで `FIRE` / `子ども` / `住宅` / `転職` などのキーワードに反応します。

---

## フェーズ進捗

- [x] Phase 0: 環境構築（ファイル一式・最小起動・README）
- [x] Phase 1: シミュレーションコア（純粋関数）
- [x] Phase 2: 入力UI + 結果グラフ
- [x] Phase 3: ライフイベント追加
- [x] Phase 4: シナリオ比較（A/B/Cルート）
- [x] Phase 5: AIアドバイザー（モック実装）
