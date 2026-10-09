# おはぎを押しつけろ！ 仮素材版

おはぎKISSを土台にした、30秒の長押しアクションゲームです。

## 操作

- 画面を長押し：義勇がおはぎを押しつける
- 手を離す：義勇が回避する
- 実弥の反撃直前に離す：ジャスト回避
- 回避後すぐ長押し：押し込み速度アップ
- 押しつけゲージが100%：おはぎ1個成功

## ローカル確認

このフォルダで簡易サーバーを起動し、表示されたURLをブラウザで開きます。

```powershell
python -m http.server 8080
```

Pythonを使わない場合は、VS CodeのLive Serverなどでも確認できます。

## 現在流用している画像

| ゲーム内の動き | 画像 |
|---|---|
| 義勇・押しつけ | `images/giyu-attack.png` |
| 義勇・回避 | `images/giyu-kiss.png` |
| 義勇・成功 | `images/giyu-happy.png` |
| 実弥・待機 | `images/sanemi-normal.png` |
| 実弥・予兆／反撃 | `images/sanemi-angry.png` |
| 実弥・食べさせられる | `images/sanemi-kiss.png` |

画像は同じ1024×1024・背景透過で差し替えれば、そのまま表示されます。

## 公開前の確認事項

1. ランキングサーバー側でゲームID `push` を許可する
2. 新ゲーム用の `images/linkcard.png` を作り、`index.html` に `og:image` を追加する
3. 公開URLが異なる場合は、`index.html` の `og:url` と `game.js` のBluesky共有URLを変更する
4. 仮素材で難易度を確認後、必要な絵だけ描き下ろす

## 主な調整値

`game.js` の検索語 `const SETTINGS = {` にまとまっています。

- `pressurePerSecond`：通常時の押し込み速度
- `counterMultiplier`：回避後ボーナス倍率
- `hitPenalty`：被弾時に戻るゲージ量
- `warningMinMs` / `warningMaxMs`：反撃予兆の長さ
- `attackMinMs` / `attackMaxMs`：反撃間隔
- `justWindowMs`：ジャスト回避の受付時間
