# Living Texture: Digital Crush / Beating / Turbulence / Wandering Feedback

通常AutoDriftのLIVING TEXTURE → TEXTUREタブに4操作を追加。DOPA MODEとは独立。

- **Digital Crush**: Amountで14→5 bit相当の量子化、18k→1.2kHzのサンプル&ホールドを連動。Reverb / Delay / Dreamの戻りにのみ作用し、最大でも戻りの25%は非Crush。元のドライ経路は保持。前段LP、再構成LP、DC除去、80Hz HP / 4.8kHz LPを使用。非線形処理のためaliasを完全除去するものではない。
- **Beating**: 既存の2基音を再利用。各声に異なる1.1–3.15 centsの追加差と独立した不規則変調を加える。Detuneを0にすると差が分かりやすい。ゼロでは追加差も変調もゼロ。
- **Turbulence**: 声別の不規則な滑らか補間ノイズ＋複数周期の成分と、共通の遅い呼吸を重ねる。最大でもゲインは概ね0.38–0.98で、増幅や突然の無音を作らない。ドライ／Dreamの両方に同じ声の動きを適用。
- **Wandering Feedback**: 各声に最大1個のsine音源。実際のMIDIの3/4倍音へ追従し、±19 centsの漂流と遅い音量変動。4.2kHz / sampleRate×0.2以下。声のADSRとミュートに従い、Amount=0で無音。再帰フィードバックはなく、6声合計の追加信号の理論振幅予算は0.042以下（master前）。

AUTO TEXTUREはシーンごとに違う役割を与える。HAZEはBeating/Turbulence、GLOWはFeedback、DISSOLVEはCrushを中心に変化。密度・Crushが強い場面のFeedbackを抑制。従来のInharmonicity上限8%（通常シーン0–2.5%、DISSOLVE 6%）は維持。手動保持35秒、復帰12秒、HISTORYの汎用スナップショットに4値も含まれる。

## 実装と互換性

Crushは静的ES module AudioWorklet。build.jsはworkletとそのDSP依存も同じハッシュで更新。AudioWorklet失敗時は128段のネイティブWaveShaper量子化へ切り替える。fallbackはサンプルレート低下を含まない。UI/main threadの音声コールバックなし。

制御信号はAudioBufferSourceの連続ループ（3kHz control buffer）で、タブのUIタイマーが止まっても続く。音声側のゲイン／detuneは滑らかに追従。6声の基本36 oscillatorにFeedback最大6を追加し、その後は再利用。声終了時に制御ソース／接続を解放。単一AudioContextをSTOP/RESUMEで再利用。

## 検証

- `npm test`: 61/61 pass。既存和声／HISTORY／バックグラウンド時刻／ビルド検証を含む。
- `npm run build`: pass。ハッシュ付きworklet依存も参照検証。
- 固定乱数2 / 10 / 60分: 全4値が変化し、有限・安全上限内。60分の最大値: Crush .782 / Beating .673 / Turbulence .781 / Feedback .341。
- Crush単体44.1 / 48 / 96kHz: peak .203–.207、RMS .0836–.0840、最大隣接差 .0133–.0280、無入力2秒後に絶対値1e-10未満。
- Chrome OfflineAudioContextの18秒×6条件: `living-audio-results.json`。単機能・全操作最大、強いReverb/Delay/Dream、静止和音と移動／STOPを測定。測定結果は自動検証であり、人間による聴感評価ではない。
- Chrome UI: Start/Stop、resume、suspend、hiddenイベント、ライブノブ、固定oscillator数、1440×900 / 1366×768 / 390×844 / 1093×614通過。
- 専用AudioContextモック: 100回のコード／ノブ変更で42 oscillator固定、全ミュート、0 bypass、STOPで全ソース終了・接続解除。

未検証: Safari/Firefox/iOS実機、実際のOSによる長時間タブ凍結、実時間60分の音声レンダリング、Pages本番デプロイ、実スピーカーでの聴感。60分はパラメーターシミュレーションであり60分音声測定ではない。IRや出力機器によって聴感上の差はある。
