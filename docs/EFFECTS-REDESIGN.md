# エフェクト再設計・計測報告

比較基準は着手時の最新main `b248539d8d9d615c81b7429205776c6ba8e8fc67`（PR #6取り込み済み）。着手前のopen PRは0件。既存リモートブランチ・ソース・テストを確認し、`feat/effects-consolidation` を新規作成。履歴改変・force push・mainへのマージは行わない。

## 実装

5音源（SINE / WAVETABLE / FM / NOISE RESONATOR / GRANULAR）は維持。和声・Journey・Autoplay・288配色のコードは変更なし。12シーン、15分チャプター、背景演奏、Depth / Wander / Edge、35秒保持＋12秒復帰、演奏用ADSR/Glideを維持した。

| 系統 | 変更 |
|---|---|
| INSTABILITY | Beating / Dry Driftを1深度へ統合。SpreadはDetuneのサブ制御。共有変調バッファ＋声ごとの不規則変調 |
| BLOOM | 倍音の時間展開とBloom Sustainを同じ4部分音で実現。振幅予算と基音の芯を維持 |
| TURBULENCE | 独立した不規則な振幅変調を維持 |
| FEEDBACK | 6声に最大1つずつのHowl。再帰経路を作らずハウリング音色を維持 |
| SATURATION | 2段×3並列シェイパーを1段×3へ。全音源に作用。Character / Mixはサブ制御。2倍oversampling、最終安全段は4倍 |
| CRUSH | ビット深度とサンプル保持の破壊的レンジを維持。Wet only→Full signalを追加。係数はamount変更時に計算 |
| DELAY | 独立した反復処理とTime / Repeatsを維持 |
| REVERB | 3秒ステレオConvolver・独立Shimmer残響・Wet Driftを撤去。4つの減衰comb＋2allpassを共有する単一の軽量アルゴリズミック残響。Size / Decay（0.25〜35秒）/ Density / Motion / Mix。Shimmer Feedは同じ空間へ投入 |

ネイティブの交差帰還FDNはChromeでのインパルス試験で異常増幅を検出したため採用しない。独立した受動ループに整理し、生の残響出力で減衰・ピーク・非共振フィルターを検証した。リミッターで問題を隠す設計にはしていない。

Reverb Mixは0〜100%。100%で原音の直通を0にし、追加音源も空間へ入る。旧1.7等のMix値は100%へ移行し、長大な尾・濃密さ・Motionは別制御にした。Shimmerはオクターブピッチシフターではなく、従来どおり上部倍音の高域ソースとして識別される処理。

Spectral Driftの独立ノブと部分音ごとのGlide倍率を削除。Glide自体は維持。InharmonicityはSOURCE内のPartial Stretchとして残し、通常の自動上限8%と手動オーバーライドを維持する。不要になったPRE/POST配置は単一Saturationに集約した。

## 実際の引き算

無音のFM・加算波形・共振器を計算しない。40ms平滑化後に-100dB以下で休止し、再開時も滑らかにつなぐ。共振器の三角関数係数とMIDI→周波数は制御変更時に計算し、音声側で係数を平滑化。Granularは最大30粒/秒×最大0.2秒から同時粒数6（計測でも6）なので予備込み8粒へ削減（旧24粒）。5秒の録音リングとFreeze / Reverseは維持し、SINE時も直前の音を記録する。粒状出力を再録音しない。

5Hz未満の制御波形は実効128Hzのバッファに格納する。ChromeのAudioBuffer最小3000Hzを満たしたバッファを `128/3000` の速度で再生し、周期を変えずに容量を削減。Bloomの将来ランプ間隔は0.25→0.5秒、UIは同じ値の再書き込みとCanvasの配列再生成を省く。

## CPU指標と測定条件

主指標は**Chrome音声レンダリングスレッドのCPU時間＋音声出力転送スレッドのCPU時間 / 測定窓の実時間**。Chrome Traceの`tdur`を使い、入れ子イベントは重複加算しない。1論理コアを100%とした値であり、OS全体のCPU表示ではない。WorkletのFunctionCallは音声CPUに含まれる内訳で、加算しない。

同じMac（macOS 14.3 / arm64）、Chrome 155.0.8059.80、44.1kHz、1366×768。固定6音 `[40,47,52,55,59,64]`。2.5秒ウォームアップ後、HOLLOW / GLASS / TIDAL / ECHO / DISSOLVE / MAX / TRANSITION / CHAPTERを順に各3回。通常窓は2.4秒、章境界は8秒フェード末尾から無音再生成と12秒フェード開始部を通す。パラメーターと実UI更新は1Hz、Canvasも動作。通常演奏集計は最初の5シーンの時間加重平均。各シーンの数分の定常状態を丸ごと測定した試験ではない。

比較中は他の重い試験を停止。旧新版は同じハーネス・入力・場面列を使う。音は最終段でミュートするが、計測対象の音声グラフ・analyser・描画を動作させる。バックグラウンドや録音の機能試験は別に実施する。

| 測定窓 | 旧 音声CPU | 新 音声CPU | 削減 |
|---|---:|---:|---:|
| HOLLOW | 32.92% | 20.23% | 38.6% |
| GLASS | 36.49% | 23.25% | 36.3% |
| TIDAL | 33.95% | 21.95% | 35.4% |
| ECHO | 32.33% | 23.26% | 28.1% |
| DISSOLVE | 34.18% | 21.57% | 36.9% |
| MAX | 33.82% | 26.23% | 22.5% |
| TRANSITION | 34.84% | 21.29% | 38.9% |
| CHAPTER | 32.30% | 21.66% | 32.9% |
| normal | 33.97% | 22.05% | 35.1% |
| all | 33.80% | 22.41% | 33.7% |

**通常演奏の主指標は35.1%減、旧比64.9%で30%目標を達成。全窓集計は33.7%減。** MAX単独は22.5%減で30%未達。全条件で30%を保証するものではない。

| 通常演奏の内訳 | 旧CPU | 新CPU | 備考 |
|---|---:|---:|---|
| 音声レンダリング | 33.52% | 21.53% | CPU時間 / 実時間 |
| 音声転送 | 0.45% | 0.52% | CPU時間 / 実時間 |
| Worklet callback（内数） | 10.10% | 3.60% | CPU時間 / 実時間 |
| メインスレッド | 7.16% | 8.29% | CPU時間 / 実時間 |

**メインスレッドは通常窓で7.16→8.29%と増加した。** 音声＋メインを合計した端末全体で30%軽くなった、とは主張しない。パラメーター更新＋render自体の平均は0.829→0.585ms、p95は1.200→0.900ms。全renderer CPUにはCanvas・スタイル・GC・ブラウザ側の処理も含む。

| 通常窓 / タスクCPU時間 | 旧 平均 / p95 / 最大 | 新 平均 / p95 / 最大 |
|---|---:|---:|
| 音声レンダリング | 1610.8 / 2493 / 4443 µs | 1088.8 / 2062 / 3270 µs |
| Worklet callback | 146.4 / 348 / 1363 µs | 52.3 / 142 / 1073 µs |
| メインスレッド | 247.3 / 2225 / 6432 µs | 287.0 / 2506 / 5316 µs |

全窓・各場面の平均/p95/最大、壁時計のコールバック時間、更新時間、生サンプルは `effects-bench/comparison.json`、`trace-summary.json`、`*-final-samples.json`。再解析可能なChrome生トレースは`*-final-trace.json.gz`。指標定義は`protocol.json`に固定した。

通常窓のanimation callbackは 30.0→30.0 回/秒。Canvasには従来の約30fps上限があり、この値は画面装置の実測FPSではない。手動ノブ入力の同期処理時間は `browser-validation.json` に記録。

## メモリとノード

初回6声＋Howlまで生成した文脈での生成数は、生ログに記録。Convolver 1→0、WaveShaper 7→4、Delay 9→7、Biquad 18→16、BufferSource 14→13。発振器上限42は維持。ステレオ残響用Pannerを4つ追加する。単なるノード数減をCPU改善の代用にはしていない。

同じ6声でAudioBufferサンプル領域＋5秒録音リングの容量は、長さからの算定で24,284,400→1,779,536バイト（約92.7%減）。Native Delay・Convolver内部FFT作業領域・OSの常駐メモリはこの算定に含めない。JS heapは別途GC後に確認する。録音リングは1つ、グレイン枠は24→8。

## 検証と制約

旧main 70/70、新版73/73のNodeテストとbuild。全音源、v1→v2互換、シーンの有限値と自動Inharmonicity上限、35秒保持＋12秒復帰、288配色、和声/章境界、ミュート・再開・廃棄を確認。ブラウザの個別結果は `effects-bench/*browser*.log` と `final-checks.json` を参照。

オフライン残響インパルスでは短い部屋の後半エネルギーがゼロへ落ちる一方、長い設定は12〜16秒に尾が残る。Density / Motionで波形が変わり、フィルターの最大周波数利得は1以下。全12シーンのピーク/RMS/NaN、歪みの180秒相当の安定性と消音後の減衰、拡張破壊レンジ、章境界の全出力フェードを確認する。数値の有限性だけで音質やポップの完全不在を保証するものではない。

30/60分はアクティブ時計を進めて4回の実AudioContext再生成を行い、旧文脈closed・6声・retiring=0・GC後heapの有界性を確認する。1時間連続の熱・電池・OSスリープ試験ではない。バックグラウンド試験は音声プローブの1秒窓で長い無音を検出し、native hiddenにならない自動操作環境では合成visibilityを明記する。ハードウェア/OSの短い音切れ回数までは断定しない。

**実耳による聴感評価は未実施。** 透明/破壊的シーン、ノブの効き、出力安全性は信号・UI試験で確認したが、最終的な音楽的な好みはPRでの試聴レビューが必要。オフライン描画速度はリアルタイムCPU使用率と同義ではなく、今回のCPU目標判定には使わない。1端末・1ブラウザの測定結果である。

## 再現

```sh
npm test
npm run build
# PlaywrightとChromeがある環境。別checkoutのbaselineを着手時HEADに固定する。
git worktree add --detach ../baseline b248539d8d9d615c81b7429205776c6ba8e8fc67
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs BENCH_ROOT=../baseline BENCH_TAG=baseline-final node tests/benchmark-effects.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs BENCH_TAG=new-final node tests/benchmark-effects.mjs
node scripts/summarize-effects.mjs
node scripts/analyze-effects-trace.mjs baseline-final new-final
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser-effects.mjs
```

`CHROME_PATH`でChrome実行ファイルを指定可能。既存ブラウザ試験は`PLAYWRIGHT_MODULE`と一部`OUTPUT_DIR`を使用する。CPU比較と他の重いテストを同時に実行しない。

## 履歴互換

HISTORY出力は`version:2, effectsVersion:2`。`migrateHistory(v1)`は音色イベントのvalues/targetだけを`migrateEffects`で変換し、和声・音符・チャプター時刻を変えない。旧Dry Drift / Beating→Instability、Wet Drift→Motion、Diffusion→Density、Shimmer Decay→Reverb Decay。旧Spectral Driftは削除し、旧PRE/POSTは単一Saturationへ集約。変換は元JSONを変更せず、v2の明示値を優先する。従来UIに履歴インポート機能はなく、今回もファイル選択UIは追加しない。
