# 自分の目・まわりの目

自分で答えた16タイプと、まわりの人が自分について答えた16タイプを比べるツールです。
GitHub Pages で公開し、回答は Firebase（Firestore）に保存します。ログインは不要です。

## しくみ

- 「グループを作る」を押すと `#g-xxxxxxxxxx` が付いたリンクができます。同じリンクを開いた人どうしで診断し合えます。
- 開いた人には、Firebase の匿名ログインで端末ごとのIDが自動で付きます。自分のデータしか書き換えられません（`firestore.rules`）。
- 同じ人でも、別の端末や別のブラウザで開くと別人として扱われます。

## セットアップ（最初の1回だけ）

### 1. Firebase のプロジェクトを作る

1. https://console.firebase.google.com/ で「プロジェクトを追加」（Google アナリティクスはオフで大丈夫です）
2. 左メニュー「構築 → Authentication」→「始める」→「Sign-in method」で **匿名** を有効にする
3. 左メニュー「構築 → Firestore Database」→「データベースを作成」→ 本番環境モード、ロケーションは `asia-northeast1`（東京）
4. Firestore の「ルール」タブに `firestore.rules` の中身を貼って「公開」
5. 「プロジェクトの設定（歯車）→ マイアプリ」でウェブアプリ（`</>`）を追加し、表示された `firebaseConfig` の値を `firebase-config.js` に貼る

### 2. GitHub Pages で公開する

1. このフォルダを GitHub のリポジトリに push
2. リポジトリの「Settings → Pages」で、Source を `Deploy from a branch`、ブランチを `main` / `/(root)` にして保存
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で開けます

## 手元で確認する

`index.html` を直接ダブルクリックするとモジュールが読み込めないので、簡単なサーバーで開いてください。

```bash
npx serve .
```

## ファイル

| ファイル | 中身 |
|---|---|
| `index.html` | 見た目（CSS）と画面の骨組み |
| `app.js` | 質問・採点・タイプ解説・キャラ・画面の描画・保存 |
| `firebase-config.js` | Firebase の接続情報（公開しても問題ない値） |
| `firestore.rules` | 保存のルール（自分のデータだけ書ける、あだ名は20字まで など） |
