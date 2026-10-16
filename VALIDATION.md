# 検証記録

2026-10-16 / AutoDrift 初期版

## 元リポジトリの確認

- Fret Drift最新main: `46d7c1a2a5936ad256c0fa40009c19af952ce8e6`。PR #9までマージ済み、着手時open PRなし。
- 既存Pagesはmainへのpushでテスト→ハッシュ付き静的ビルド→GitHub Actionsから配信する構成。既存Pages APIの未認証GETは404となったため、workflowと公開画面で確認。
- Fret Driftにライセンスファイルなし。所有者の明示的再利用指示を根拠に移植し、新ライセンスは付与していない。
- GitHub接続ユーザーはkitadadesu。新規auto-drift作成・admin/push権限を確認。auto-driftだけへ書き込み、PagesをActions方式で有効化。
- Fret Driftの作業用取得は変更なし。Fret Driftのリモートmain・既存ブランチ、chord-atlasには書き込みなし。

## 自動検査

`npm test`: **47/47成功**。既存45件の音声・和声・Wander・Edge解決・転調・clock pause・stale callback・ノード再利用・解放を継承。AutoDrift用にseeded長時間検査とpause/再現性/手動介入検査を追加。

`npm run build`: 成功。全モジュールのキャッシュ世代管理を含む静的ビルド。

固定乱数の500msアクティブ時計で実chooserを実行（和声seed23 / 音色seed91）:

| 経過 | 和声遷移 | 転調到着 | 訪問音響状態 |
|---|---:|---:|---:|
| 2分 | 6 | 0 | 2 |
| 10分 | 33 | 1 | 3 |
| 30分 | 103 | 3 | 4 |
| 60分 | 202 | 6 | 5 |

初回D major到着262秒。転調はタイマー表示変更ではなく実際の採用コード・主音支持に基づく。全23音色パラメーターが自身の制御範囲の15%以上変化。Bloom約3〜96%、harmonics約0〜82%、Shimmer約0〜75%、Character約0〜78%、Decay約1.93〜9.67秒を観測。各500msの最大正規化変化4%未満。採用履歴16件、転調履歴3件の上限を維持。

## 実Chrome / Web Audio

48kHz OfflineAudioContextで既存エンジンの実回路を検査。ウォーム・wavefold・バイパス・Bloom0比較に加え、180秒×2（最大Decay安定条件／パラメーター変更stress）をレンダリング。すべて有限値、ピーク・隣接sample差・tail減衰の境界検査を通過。

| 条件 | 出力peak | Shimmer return peak | 終端tail RMS |
|---|---:|---:|---:|
| Decay最大・安定 | 0.31809 | 0.003306 | 3.23e-9 |
| 連続変更stress | 0.34687 | 0.005469 | 5.68e-8 |

stress隣接sample最大差0.013286。ループ内LP/HPの4096点周波数応答は振幅≤1.000001。PRE/POSTバイパス比較差約5.94e-6、Bloom0比較差約1.49e-7。stress中も同じAudioContext・声ノードを保持。

実Chrome UI: STARTで自動和声・音色の同時開始、ノブの実値変化、連続演奏時の発振器数不変、STOP中の時間固定、再開、AudioContext.suspendからの復帰、visibilitychangeの非表示/復帰、1440px/390pxの横はみ出しなし、ページ例外なしを確認。スクリーンショット目視後に配色の不具合を修正して再確認。

ブラウザ検査の再現（Playwrightを別途利用できる環境で）:

```sh
node tests/browser-ui.mjs
node tests/browser-saturation.mjs
```

`PLAYWRIGHT_MODULE`でPlaywrightのimport先、`CHROME_PATH`でChrome実行パス、`PORT`で一時ローカルポート、`OUTPUT_DIR`でスクリーンショット/数値出力先を指定可能。出力先を無音化してテストするため、聴感評価とは別。

## 確認範囲と制約

1時間検査は時計を進めるロジック検査。1時間の実時間CPU/ヒープ測定、Safari/iOS/Android実機、人による音質・ノイズ・音楽性の試聴は未確認。ノード数と履歴の上限はブラウザ全体のヒープや低性能端末の負荷の保証ではない。転調到着条件は音楽的ヒューリスティックであり、目標によっては5分で破棄して再探索する。
