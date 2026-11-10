# Near モバイルアプリ

React Native + Expo のアプリです。パスキー認証、プロフィールと友達の管理を実装しています。地図と位置共有、招待リンクのアプリ内受け取りは未実装です。Android を先に進め、iOS は後で対応します。

## 準備

`.nvmrc` に指定された Node.js と npm、Android Studio、Android SDK、JDK を用意します。リポジトリのルートで依存関係をインストールします。

```sh
npm ci
```

`apps/mobile/.env.example` を `apps/mobile/.env` にコピーし、公開用 Supabase URL と publishable key、Web URL を設定します。これらの値は APK に含まれます。秘密キーは入れません。

パスキー認証からアプリへ戻るには、Supabase Authentication → URL Configuration → Redirect URLs に `near://auth/callback` の追加が必要です。カスタム URL スキームは他アプリが登録できる可能性があるため、OAuth の PKCE を使います。本番配布前に Android App Links の採用を検討します。

Android 実機で確認する場合は、USB デバッグを有効にし、USB 接続してデバイスの認証を行います。エミュレーターでも始められます。

## 開発ビルドのインストール

初回は、リポジトリのルートから次を実行します。Android プロジェクトの生成、開発ビルドの作成、接続した端末へのインストールを行います。Android Studio と SDK の設定が必要です。

```sh
npm run android -w @near/mobile
```

Expo が生成した `apps/mobile/android` は Android Studio でも開けます。生成物は Git で管理しません。アプリのネイティブ設定は、原則として `app.json` や Expo の設定に記載します。ネイティブ依存や設定を変えた場合は、生成・ビルドをやり直す必要があります。

## 開発サーバー

開発ビルドをインストールした後、ルートから次を実行し、端末の Near 開発アプリで開きます。

```sh
npm run dev:mobile
```

PC とスマホを同じネットワークにつなぎます。TypeScript や画面の変更は開発サーバー経由で反映できます。この開発ビルドは開発サーバーが必要なため、友達に配布する単体のプレビュー APK とは異なります。配布用 APK の署名・作成手順は、機能が整った段階で追加します。

Expo Go ではネイティブの安全な保存機能などが必要なため動作確認できない場合があります。今後予定するバックグラウンド位置情報なども確認するため、Near 専用の開発ビルドを使います。位置情報の許可や追跡機能はこの雛形では追加しません。

## 検証

ルートから `npm run typecheck`、`npm run lint`、`npm test` を実行します。実機で開発ビルドが起動し、画面の変更が反映されるかも確認してください。

## 未完了と確認

- Supabase へのリダイレクト URL 設定と、実際の Android 端末での認証・友達操作は未確認です。
- Web の招待リンクは現在 Web 側で開きます。アプリ内受け取りは未対応です。
- 地図、位置共有、バックグラウンド更新、復旧と削除のアプリ内操作は今後対応します。
- ログアウトはアプリの Supabase セッションを終了します。ブラウザ側の認証セッションは別途残る場合があります。
