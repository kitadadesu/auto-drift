# AutoDrift

ひとつの和音から、和声も音色も自律的に漂流する独立Web楽器。
固定された1時間の曲ではなく、共通音を持つコードの偶発的な連鎖と、数分ごとの音響モーフ、数十分の大きな濃淡が重なります。1時間を超えても演奏を続けます。

## 使い方

1. 出発点に6声の音名を入力（低音から高音、例 `E2 B2 E3 G3 B3 E4`）。休符は `x`。音域はC0〜C7相当の入力範囲内。
2. **START**で音声・和声・AUTO TEXTUREが同時に開始。
3. **Depth**は音色変化の深さ（初期100%）。平均**Pace**は和声の歩み。実際の間隔は移動量・音色の複雑さに応じて変化します。
4. ノブは実際に適用される値を表示。操作すると35秒間その値を保ち、12秒かけて自動演奏へ戻ります。AUTO TEXTUREを外すと現在の音色を保持します。
5. **STOP**はリリースを残して停止。**RESUME**で和声・音色・経過時間の続きから再開。**新しい旅**は経過をリセットし、入力した出発点からやり直します。

非表示タブでは音声とタイムラインを停止し、復帰時に同じ場所から再開します。ブラウザがAudioContextを中断した場合はSTARTで復帰してください。画面ロックやOSによる強制終了後の永続復元はありません。音色変化は数分単位なので、最初の数秒はゆっくりです。

HISTORYは最初の和音・開始シーンから和声採用と音色目標・25%ごとの進捗・到達を記録します。パネル内スクロール、直近600イベント、JSON出力に対応。STOP/RESUMEで保持し、新しい旅で消去します。時刻は旅の経過時間です。

Inharmonicityは起動1%、通常シーン0〜3%程度、DISSOLVE約6%、自動生成上限8%。手動操作は全範囲を維持し、35秒保持＋12秒で自動範囲へ戻ります。

## 実装

- `audio.js` / `autoplay.js` / `harmony.js` / `music.js` / `chords.js` / `notes.js`: Fret Drift main `46d7c1a`から再利用。声部の共通音、Wander、Edge→通常解決、可変間隔、採用履歴と180秒以上の実証的転調を維持。
- `journey.js`: 和声の長時間進行。到着には主音低音・主和音反復・直近履歴の調性支持・滞在が必要。未成立目標は7分で破棄し、ラベルだけの転調をしません。密な音響では和声間隔を延ばします。
- `texture.js`: 試作コミット `453ec051893be67d5b45a54211d2337609ff5d7c`を拡張。HOLLOW / CLEAR / HAZE / GLOW / DISSOLVEを確率選択し、毎回異なる目標値・継続時間・パラメーター別オフセットでモーフ。約25分周期の緩い大局的傾向を重ね、シーン順は固定しません。
- `app.js`: 共有のアクティブ時間。500msごとの軽いUI/進行更新、`Drone.update`は最大1Hz。既存AudioParam平滑化、最大36発振器、固定エフェクト網を維持。Volumeは初期55%で固定し、無音シーンを作りません。
- Shimmerの非共振LP/HP、feedback上限0.94、固定PRE/POST Saturation、DC除去を保持。自動制御のDecayは最大10.5秒で、高Drive・高Character時はDecay≤8秒、Shimmer≤65%。人工Feedback演奏は未実装。

## 開発と公開

追加依存なし。Node.js 22以上で実行:

```sh
npm test
npm run build
# 静的サーバーでdist/を開く（例: python3 -m http.server 8787 -d dist）
```

GitHub Settings → Pages → Source を **GitHub Actions** に設定。mainへのpushで `.github/workflows/pages.yml` がテスト・ビルド後に独立Pagesへ公開します。ビルドは全モジュールのハッシュ付きURLを生成し、旧キャッシュとの混在を防ぎます。

## 由来・ライセンス

独立プロジェクトとして、リポジトリ所有者の明示的な依頼に基づき `kitadadesu/fret-drift` のエンジンと回帰テストを再利用しています。取得時点のFret Driftにライセンスファイルはありません。ここで新たなオープンソースライセンスは付与していません。第三者による再配布・利用条件は所有者に確認してください。`kitadadesu/fret-drift` のmain・既存ブランチ、および `kitadadesu/chord-atlas` に本プロジェクトからの変更はありません。

検証結果・制約は [VALIDATION.md](VALIDATION.md) を参照。


## Background performance / バックグラウンド演奏

別タブ・別ウィンドウへの切替では、演奏・和声・Texture・旅の時間を停止しません。停止はSTOP、終了はページ離脱です。Canvasのみ非表示時に休止し、復帰時は最新音高・時間へ追従します。

進行時間はAudioContext.currentTimeを使用します。500msのDedicated Worker通知は未処理1件に制限し、停止・再開・AudioContextのsuspendでは時計の基点を更新します。通知が遅れた場合は実際の音声クロック差を反映し、1回につき和声変更とTexture次計画を各1回までに抑制します。失われた和声を大量に再生することはなく、実際に採用した状態をHISTORYに記録します。23音色操作はSPECTRUM / SPACE / COLOR / ENVELOPEの4タブで開きます。Escapeまたは×で閉じられます。

ブラウザによるWorker停止・タブ破棄、端末のスリープや省電力、iOS/Androidの画面ロック時にはOSがWebAudioを停止・中断する場合があります。この状態での無停止演奏は保証できません。AudioContextが中断した場合、音声クロックも止まり、必要に応じてSTART/RESUMEから再開してください。中断時間を無音の演奏時間として加算しません。自動操作下のnative visibility試験の制約はREDESIGN-VALIDATION.mdに記載しています。
