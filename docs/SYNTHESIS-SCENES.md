# 12 synthesis scenes

基準: main 628a5bd / PR #5。open PRなし。remoteの既存5ブランチを確認。適用AGENTS.mdなし。完成済みのchapter / effect ranges / paletteを維持。Journeyと和声採点は変更していない。

SOURCEタブ: FM Amount / Ratio、Wave Morph、Resonant Noise / String→Cavity、Live Grains、Live Freeze、Grain Reverse。FreezeとReverseは50%で切替。全操作がDepth、自動モーフ、35秒保持＋12秒復帰、汎用HISTORY JSONに参加。

|Scene|主役|脇役・中心値|
|---|---|---|
|HOLLOW|既存の裸のsine|新音源0、低Bloom|
|GLASS|FM .85 / ratio 3.5|透明な既存CLEAR回路|
|AURORA|柔らかい波形 .32|従来HAZEのBloom・Shimmer・広域空間|
|CHOIR|Beating 1.1|波形 .15|
|TIDAL|noise .65 / string寄り|Turbulence 1.6、Shimmer .18|
|TAPE|波形 .55|Dry Tape 1.6 / Crush .3|
|HALO|noise .75 / cavity|拡散残響|
|ECHO|grains .55|Delay .85 / 1.1秒|
|HOWL|noise .8 / 中間材質|Wandering 1.1|
|STATIC|noise .9 / 摩擦|Crush 1.7、Drive .4|
|EMBER|波形 .95 / FM .65 ratio 1|従来の破壊的Drive・fold|
|DISSOLVE|grains 1 / freeze .85 / reverse 1|Crush .8、Drive .6|

値は固定presetでなく目標中心。25%の訪問で新音源強度を30–55%にし、その他は85–100%、通常パラメータ変動とmacroを重ねる。近隣と遠隔の確率選択を継承。全シーンへ到達可能だが1時間以内に全種が出る保証はない。

## DSPと寿命

既存の6声は維持。追加音源は一つのAudioWorklet、固定6声、最大24粒、mono5秒Float32循環録音。ノードや粒をコードごとに増やさない。FM indexは声別、周波数とsampleRateに応じて上限を下げる。波形は2–10倍音の有限加算で連続モーフ。FM側帯波のaliasを完全除去する設計ではない。

ノイズは共有の白色励振を各声の減衰2極共振器に通す。材質は共鳴比率と減衰帯域を連続変更する。厳密な弦／金属の物理シミュレーションではない。新音源の合計強度でゲイン補正し、DC除去とsoft ceiling、既存最終リミッター／chapter gateを通す。

録音は既存ドライ音＋追加合成音のみ。グレイン出力を録音入力へ戻さない。40–200ms粒、5–30粒/秒、最大24粒、Hann状窓、線形補間。高強度は半速、Reverseで逆行、Freezeで書込停止。独立した長さ・密度・ピッチのノブは増やさずAmountに統合。

STOPで発音停止と録音flush。RESUMEは空のバッファで再開。章境界では前回実装の無音時AudioContext破棄で古いグレイン・録音・ノードごと解放する。suspendでは音声時計と処理が止まる。非表示タブに独自キュー／timerは作らない。

Workletの静的URLと依存は全体ハッシュbuild対象。Worklet失敗時は1024フレームScriptProcessorで同じDSP。互換経路はmain thread依存のためbackground時の連続性に制約がある。両APIがない環境は既存音源を継続し新音源は無効。

## 検証の読み方

Node testsはDSP信号のpeak/RMS/隣接差/零交差、固定バッファ／粒、freeze・flush、2/15/60分の疑似時計、288配色とコントラスト、既存和声と章・手動保持・buildを確認。零交差は粗いスペクトル指標で、聴感評価やFFTによるalias全域測定ではない。

実時間60分のレンダリング、OS音声CPU使用率、実スピーカー試聴、Safari/Firefox/iOS実機、OSによるタブ凍結、Pages本番配信は未検証。固定資源上限はCPUの全端末での安定性を保証しない。

実行結果: 全70 Node tests pass、ハッシュ付きbuild pass。Chrome実Workletで12シーンすべて有限・非無音、観測ピーク最大0.09555。章2〜6の旧Context閉鎖、STOP/RESUME、suspend、hiddenイベント、1366/390幅、手動広レンジ操作は既存browser-chapters試験で通過（pageerror 0）。測定窓は各0.5秒で、数分の自動モーフ聴感や最大値の全組合せを網羅しない。

ChromeでWorklet読込を意図的に失敗させた互換経路も12シーン全てfinite、pageerror 0。測定値はsynthesis-compatibility-results.json参照。ScriptProcessorの廃止予定API警告は既知の互換制約。
