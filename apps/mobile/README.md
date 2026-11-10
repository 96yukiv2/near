# Near モバイルアプリ

React Native + Expo のアプリです。パスキー認証、プロフィールと友達の管理を実装しています。地図と Android のバックグラウンド位置共有を追加しています。招待リンクのアプリ内受け取りは未実装です。Android を先に進め、iOS は後で対応します。

## 準備

`.nvmrc` に指定された Node.js と npm、Android Studio、Android SDK、JDK を用意します。リポジトリのルートで依存関係をインストールします。

```sh
npm ci
```

`apps/mobile/.env.example` を `apps/mobile/.env` にコピーし、公開用 Supabase URL と publishable key、Web URL を設定します。これらの値は APK に含まれます。秘密キーは入れません。

パスキー認証からアプリへ戻るには、Supabase Authentication → URL Configuration → Redirect URLs に `near://auth/callback` の追加が必要です。カスタム URL スキームは他アプリが登録できる可能性があるため、OAuth の PKCE を使います。本番配布前に Android App Links の採用を検討します。

## Pixel 実機で実行する

以下は友達に配布する APK を作る手順ではなく、手元の Pixel に開発用アプリを入れて、PC の開発サーバーに接続する手順です。Android Studio と Android SDK をインストールし、SDK Manager で Android SDK Platform-Tools も用意します。`adb` が見つからない場合は、Android SDK の `platform-tools` フォルダーを PATH に追加するか、そのフォルダーの `adb` を使ってください。

1. Pixel の **設定 → デバイス情報 → ビルド番号** を 7 回タップして開発者向けオプションを有効にします。画面名は Android のバージョンにより多少異なります。
2. **設定 → システム → 開発者向けオプション → USB デバッグ** をオンにします。Pixel をデータ通信に対応した USB ケーブルで PC につなぎ、端末に表示される「USB デバッグを許可しますか？」で許可します。必要に応じて Windows では Google USB Driver を設定します。
3. PC のターミナルで `adb devices` を実行し、Pixel が `device` と表示されることを確認します。`unauthorized` の場合は Pixel 側の許可画面を確認します。
4. リポジトリのルートで次を実行し、表示された端末一覧から Pixel を選びます。初回は Android プロジェクトを生成し、開発版をビルドして端末へインストールします。多少時間がかかります。

   ```sh
   npm run android -w @near/mobile -- --device
   ```

   このコマンドは通常、開発サーバーも起動します。端末で Near が開かないときは、インストールされた Near を起動し、表示される開発サーバーを選びます。

5. 開発サーバーを停止した後、アプリをもう一度開く場合は、リポジトリのルートで `npm run dev:mobile` を実行してから Pixel の Near を開きます。PC と Pixel を同じネットワークにつなぎます。USB 接続中に開発サーバーへ届かない場合は `adb reverse tcp:8081 tcp:8081` を試せます。

最初の動作確認では、ログインと画面表示を確認します。位置共有はテストアカウントを使い、共有開始・停止と通知を確認してください。実機では端末の実際の位置が使われるため、共有先と表示場所を確認してから開始します。ダミー位置を試す場合は Android エミュレーターを使えます。

Expo が生成した `apps/mobile/android` は Android Studio でも開けます。このディレクトリは Git 管理外です。地図や位置情報などネイティブの依存関係・設定を変更した後、既存の `android` ディレクトリがある場合は、変更を生成し直してから再インストールします。

```sh
cd apps/mobile
npx expo prebuild --clean --platform android
cd ../..
npm run android -w @near/mobile -- --device
```

`--clean` は生成済みの `apps/mobile/android` を削除して再生成します。Android Studio などで直接加えた変更も消えるため、必要な変更は事前に保存し、原則 `app.json` などの Expo 設定で管理します。

## 開発サーバー

開発ビルドをインストールした後、ルートから次を実行し、端末の Near 開発アプリで開きます。

```sh
npm run dev:mobile
```

PC とスマホを同じネットワークにつなぎます。TypeScript や画面の変更は開発サーバー経由で反映できます。この開発ビルドは開発サーバーが必要なため、友達に配布する単体のプレビュー APK とは異なります。配布用 APK の署名・作成手順は、機能が整った段階で追加します。

MapLibre やバックグラウンド位置情報は Expo Go では使えないため、Near 専用の開発ビルドが必要です。今後予定するバックグラウンド位置情報なども確認するため、Near 専用の開発ビルドを使います。Android では共有開始時に位置情報の許可を求め、共有中は通知を表示します。更新の目安は 5 分・100m ですが、OS が決めるため保証されません。強制停止や電池節約などで更新が止まることがあります。停止ボタンはサーバー側の位置も削除します。ログアウト時にも共有を停止します。

## 検証

ルートから `npm run typecheck`、`npm run lint`、`npm test` を実行します。実機で開発ビルドが起動し、画面の変更が反映されるかも確認してください。

## 未完了と確認

- Supabase へのリダイレクト URL 設定と、実際の Android 端末での認証・友達操作は未確認です。
- Web の招待リンクは現在 Web 側で開きます。アプリ内受け取りは未対応です。
- 位置共有、通知、許可、停止・再起動時の動作は Android 実機・エミュレーターで未確認です。テストアカウントとダミー位置を使ってください。
- 復旧と削除のアプリ内操作は今後対応します。
- 地図には OpenStreetMap の画像タイルを使います。[利用条件](https://operations.osmfoundation.org/policies/tiles/)と提供制限を確認してください。
- ログアウトはアプリの Supabase セッションを終了します。ブラウザ側の認証セッションは別途残る場合があります。
