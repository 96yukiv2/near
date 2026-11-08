# Near

承認した友達とだけ位置を共有するサービス。現在は **第2段階の認証・プロフィール** を実装中です。地図の位置と友達は架空で、実際の位置取得や位置の送信・保存はありません。共有スイッチも画面上のデモです。

## 動かす

Node.js 26.13.0（LTS、`.nvmrc` で指定）と npm を用意し、リポジトリのルートで実行します。

```sh
npm ci
npm run dev
```

表示されたローカル URL を開きます。地図の読み込みにはインターネット接続が必要です。友達の行または地図上のマーカーを選択すると地図が移動します。狭い画面でも確認できます。

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

`npm run format` で整形できます。CI は同じ検証を実行します。依存関係と GitHub Actions は Dependabot で週次更新します。

## 構成と今後

- `apps/web`: Nuxt のブラウザ版
- `apps/mobile`: 将来の Expo アプリ
- `supabase`: 今後追加するマイグレーション、RLS、Edge Functions、テスト
- [設計と実装ステップ](docs/design.md)

デモ地図は MapLibre の公開デモスタイルを使用しています。可用性や商用利用を前提にできないため、公開前にタイル事業者の無料枠、利用規約、帰属表示を確認し、設定可能な提供元に切り替えます。現段階では Supabase や Vercel のアカウント設定は不要です。

## ローカル認証の確認（第2段階）

Docker と Node.js 26.13.0 が必要です。実サービスの契約やクラウドプロジェクトは不要です。以下はリポジトリのルートで実行します。

1. `npm ci` の後に `npx supabase start` を実行します。初回はコンテナイメージのダウンロードに時間がかかります。
2. `apps/web/.env.example` を `apps/web/.env` にコピーします。`npx supabase status` に表示されるローカルの API URL と publishable key（または anon key）をそれぞれ設定します。`secret` / `service_role` キーをこのファイルに入れないでください。
3. `npm run dev` で起動し、`http://localhost:3000/account` を開きます。メールアドレスとパスワードで登録します。ローカルでは実際のメールを送らず、`http://127.0.0.1:54324` のメール画面から確認リンクを開けます。
4. 確認後にログインし、表示名の保存・変更、ログアウト、パスワード再設定を確認します。メールのリンクは設定した `localhost:3000` で開きます。
5. 終了時は `npx supabase stop`。データも消したい場合のみ、CLIの `--no-backup` の挙動を確認してから停止します。

Google OAuth は初期状態で無効です。Supabase と Google Cloud の OAuth 設定、許可するリダイレクト先、同一メールの連携挙動を確認後、Web の `NUXT_PUBLIC_GOOGLE_AUTH_ENABLED` を有効にします。[Supabase の仕様](https://supabase.com/docs/guides/auth/auth-identity-linking)では、OAuth でログインすると同じメールの既存ユーザーへの自動連携が試みられ、未確認の ID は事前乗っ取り防止のため削除される場合があります。Google 連携を有効にする前に、確認済み・未確認メールそれぞれで実際の挙動を検証します。秘密情報はサービス側の設定にのみ入力します。Google の検証には実際のプロバイダー設定が必要です。

プロフィールのRLSを直接 API で検証するには、**ローカルの使い捨て環境のみ**で `npx supabase status -o env` の出力から `TEST_SUPABASE_URL`、`TEST_SUPABASE_ANON_KEY`、`TEST_SUPABASE_SERVICE_ROLE_KEY` をシェルに設定して `npm run test:profile-api` を実行します。service_role キーはテストアカウントの作成・削除のみに使い、ブラウザには渡しません。CI でもローカル Supabase を起動して実行します。キーはチャットやコミットに貼らないでください。

## 招待と友達（第3段階）

表示名を保存してログイン後、`/friends` で招待リンクを作成できます。リンクは24時間有効・1回限りで、開いた人が申請し、作成した人が承認すると友達になります。友達削除、申請の拒否、ブロックと解除ができます。ブロックすると友達関係と保留中の申請を取り消し、解除しても自動で復元しません。

招待リンクは秘密の合言葉として扱い、信頼できる相手にだけ共有してください。URLのフラグメントに含めることで通常のHTTPリクエストには送信せず、使用時にのみAPIに渡します。リンクを開いた後の申請にはログインと表示名が必要です。位置共有はまだ実装されておらず、地図の友達は引き続き架空のデモです。

友達機能の権限テストは、プロフィールテストと同じローカルSupabaseと `TEST_SUPABASE_*` 環境変数を用いて `npm run test:friends-api` で実行します。CIでも直接APIを呼びます。実際のアカウントを使わず、使い捨てテストユーザーを作成・削除します。
