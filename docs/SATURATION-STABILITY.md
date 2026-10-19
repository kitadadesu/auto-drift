# Saturationの広帯域化と安定性修正

## 調査の基準

2026-10-19、main `42ba208d6e1448e434f9489160d433e05eea7542`を取得。open PRなし、リモートの既存ブランチに同問題の修正なし。PR #7（8系統再設計）は統合済み。適用されるAGENTS.mdなし。和声・音源・シーン・Reverb・UI・他リポジトリは変更していない。

報告は「1〜2分で砂嵐になり、Driveを下げると戻る」。聴感上の現象そのものの一致は確認できていないが、同じ時間幅で自動値を上昇させると、Saturationで過大入力・高域増加が発生することを実音声グラフで確認した。全ての原因がこれだけだとは断定しない。

## 回路上の問題と切り分け

旧入力ゲインは `1 + drive*12 + max(0,character-1)*16 + max(0,mix-.76)*8`。Characterの波形選択は1で頭打ちなのに、上半分はゲインだけを増やす。Mixも混合以外にゲインを増やす。現行DISSOLVEはDrive .6で26.92倍。旧DISSOLVEのDrive 1.7を継承する現行EMBERは40.12倍、手動全上限は44.68倍となる。

折り返し曲線 `sin(5*x)/4` は正の最大入力に負を返す。大入力はWebAudio WaveShaperのテーブル端でクランプされるため、強い入力で極性反転・高域の増加を起こす。入力に依存する非線形相互変調もあり、単にピークを制限しても音色の広帯域化は防げない。

4チャンネルで最終出力、Saturation直前、直後、入力ゲイン直後を分離測定。前後版で歪み直前の信号は同等で、直後に広帯域化が増えた。Reverb/Delay/Shimmerを外しても再現し、Crushを外しても残る。Saturationバイパスでは後半の指標は一致する。少なくとも今回の試験はReverbの発散では説明されない。低Driveだけを固定しても旧Character/Mixの増幅が残り、完全バイパスにはならない点にも注意する。

## 変更

- Drive 0–1.8を `1 + 8*(drive/1.8)^2` の1–9倍へ連続的にマッピング。Character/Mixからの追加ゲインを撤去。
- Character 0–2を暖かい対称→非対称→有界の単一折り返しへ割り当て、上半分も音色に使う。
- Mix 0–1.52を原音/加工音の0–100%へ正規化。旧実装の.95上限・過大入力への転用を廃止。
- Drive=0の完全バイパスを保持しつつ、0–.04のごく低い範囲で加工音を連続的に導入。従来のゼロ境界の不連続を除去する。
- 加工音を `1/sqrt(inputGain)` で補償。折り返しを `sin(2.4*tanh(1.6*x))/3` にし、テーブル端でも極性を保持。強い歪み・非対称成分・折り返しは残す。
- 既存35msパラメーター平滑化、2倍oversampling、加工音の30Hz HP/6.5kHz LP、最終4倍oversampling安全段を維持。AudioNode/Worklet/音源数は追加しない。

これは音色を変える修正。旧Character=1は新しい全範囲の中央になり、Mixの表示値の意味も全範囲で一貫する。旧セッションの完全な音色一致は目的にしていない。STATICのNoise/Crush、EMBERのFM/Wave、DISSOLVEのGranular/Freeze/Reverseなどのシーン値や音源は変更していない。

## 音声計測

Chrome 155.0.8059.80 / macOS、OfflineAudioContext 24kHz、固定6声、30秒ごとの2和音交代。前後で同じseed。出力先を4chメーターへ置換し音声データを実際にレンダーしている。時計だけを180秒進めた試験ではない。人の試聴ではない。

`audio.json`: HOLLOW→DISSOLVEを120秒で補間する180秒比較（seed 11）、同じ遷移を16秒へ圧縮した24秒の組合せ比較（seed 11/6174）。条件は通常上昇、Drive .015固定、Reverb系OFF、Crush OFF、Saturation OFF、Character 2固定、Mix 1.52固定。全28レンダー。この最初の記録の `highRatio` は4kHzの1極LPからの残差エネルギー比であり、厳密な4kHz以上のFFT比ではない。

`spectra.json`: 残響OFF・Character/Mix上限の前後6レンダーに4096点Hann窓FFTを追加。`above4k` は4kHz以上のFFTエネルギー比、`centroidHz` は重心、`flatness` は平坦度。過渡を除いた窓の指標であり、エイリアシングだけを分離する指標ではない。

`high-drive.json`: HOLLOW→EMBERの180秒遷移（120秒で到達）とDrive 1.8/Character 2/Mix 1.52の24秒全上限、前後4レンダー。`auto-timeline.json`: 実TextureDrift制御ONとHOLLOW固定OFFを各180秒。seed 11、同じ6声/和音交代。自然なAUTOが全シーンを180秒で巡るとは主張しない。

代表値（最終2秒窓、seed 11）:

| 条件 | 指標 | 旧 | 新 |
|---|---|---:|---:|
| DISSOLVEへ180秒 | 出力RMS | .01417 | .01474 |
| 同上 | 高域残差比 | .012263 | .002595 |
| 同上 | 歪み入力ゲイン直後の全期間peak | 2.4835 | .3840 |
| Reverb系OFF | 出力RMS | .02087 | .01992 |
| 同上 | 4kHz以上FFT比 | .0027894 | .0000022 |
| EMBERへ180秒 | 出力RMS | .004924 | .019514 |
| 同上 | 4kHz以上FFT比 | .036726 | .00001596 |
| 同上 | 歪み入力ゲイン直後の全期間peak | 4.6985 | .9528 |
| 手動全上限 | 4kHz以上FFT比 | .015168 | .00003569 |

DISSOLVEの高域残差は約79%低減し、RMSは維持。EMBERは旧実装で失われていた低域/音量が戻り、RMSは約4倍になる。単なる出力音量低下によるマスクではない。最終出力のpeakは新最大約.206、NaN/Infは全測定chで0。有限なピークだけをもって快音の保証とはしていない。

回帰ガードは最終peak <.81、隣接差 <.15、終盤RMSが直前窓の2倍+.001を超えないこと、該当する強歪み条件の高域残差が旧版の半分未満、EMBER/全上限の最終FFT比 <.005。ノイズを意図するSTATICにこの帯域制約は適用しない。保存された全結果も最終のガード条件で検査済み。

## 回帰・長期・性能

- Node全75テスト成功、build成功。新テストはゲイン独立性、ゼロ近傍の連続性、全範囲、3 seed×60分の実TextureDriftパラメーターシミュレーション。全12シーンと500ms刻みのゲイン変化を検査。
- 既存の和声、FM/Noise/Granular、15分チャプター、35秒手動保持/12秒復帰、配色、ミュート/停止/破棄のテストも成功。
- Chrome実Workletの全12シーンで非無音・有限出力。STATIC/EMBER/DISSOLVEのRMSはそれぞれ.00427/.00988/.00513（短いsnapshotで、シーン間音量評価には使えない）。Reverbの長短・密度・モーション・帰還フィルター非共振検査を通過。
- 実グラフを交換しつつ章時計を60分相当まで進めた試験で、6声、retiring 0、旧Context closed。GC後heapは3.093→3.148MB（途中最大3.166MB）。連続60分音声やWorklet側メモリの直接計測ではない。
- 別の章試験で5回の遠隔転調、STOP/RESUME、Context suspend/resume、広範囲の手動操作、デスクトップ/モバイルレイアウトを通過。
- 背景試験はnative hiddenにならず合成visibilityで実施。36 oscillatorを保持、時間・音声継続。OSによる凍結/実タブ非表示の完全検証ではない。
- 追加AudioNode/Workletなし、既存の3 shaper×2倍と最終4倍を維持。前回の軽量化構造は保持。ただし今回はリアルタイムの音声スレッドCPUを再計測しておらず、30%削減の再認証やCPU増減の数値は出さない。JSONのrenderMsはOfflineの経過時間で、同時検証負荷もありCPU比較に使わない。

## 再現手順

Node、Playwright、Chromeを用意してリポジトリルートで実行。`PLAYWRIGHT_MODULE`/`CHROME_PATH`で実行環境のパスを指定できる。baselineは`42ba208:audio.js`をgitから取得し、同じ不変の音源・Reverbと組み合わせる。

```sh
npm test
npm run build
node tests/browser-drive-stability.mjs
SCENARIOS=no-reverb,max-character,max-mix SEEDS=11 REPORT=spectra node tests/browser-drive-stability.mjs
SCENARIOS=ember-auto,max-drive SEEDS=11 REPORT=high-drive node tests/browser-drive-stability.mjs
VERSIONS=after SCENARIOS=actual-auto,fixed SEEDS=11 REPORT=auto-timeline node tests/browser-drive-stability.mjs
node tests/browser-effects.mjs
node tests/browser-chapters.mjs
node tests/browser-background.mjs
```

記録は[drive-stability](drive-stability/)参照。`audio.json`の初回計測は後からFFTを追加する前のためFFTフィールドを含まない。他の3音声記録はFFT・duration・sampleRateを含む。

## 残る確認

実機での聴感上の「砂嵐」の完全再現、6声とコード変化の聴き分け、意図した強歪みの好みはユーザーの試聴が必要。Safari/Firefox/iOS、OS凍結、実時間15/60分の熱・電池・CPU耐久試験、ハードウェア音切れは未検証。FMやCrushなど意図的な非線形/ノイズ成分のalias完全除去は行っていない。今回の対策以外の原因が残る場合は、seed/シーン/設定/音声出力を採取して継続調査する。
