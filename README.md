# Near

承認した友達とだけ位置を共有する Web サービスです。Nuxt、Supabase、MapLibre を使い、位置情報は最新の 1 件のみ保存します。

## 現在の状態

表示名、招待・友達管理、位置共有と地図表示は実装済みです。位置共有は初期状態でオフです。ブラウザの位置画面を開いている間に更新し、画面を閉じた後も共有状態と最後の位置が残ります。停止するには「位置共有を停止」を押してください。

パスキー登録・ログイン、任意の復旧メール、アカウント削除は実装されていますが、Supabase と Vercel の接続設定や実環境での検証は未完了です。パスキー認証は既定で無効で、従来のメール・パスワード認証が残っています。Google ログインは移行方針に含めず、既定で無効です。実際の友達と使う前に [今後のステップ](docs/roadmap.md) を完了してください。

地図は OpenStreetMap の標準タイルを使います。提供元に IP アドレスと表示範囲が伝わります。[利用ポリシー](https://operations.osmfoundation.org/policies/tiles/)と無料枠・可用性を公開前に確認します。

## 開発

`.nvmrc` に指定した Node.js 26.13.0 と npm を用意します。

```sh
npm ci
npm run dev
```

表示された URL から画面を開けます。ログインや友達・位置共有など DB を使う機能には Supabase が必要です。ローカルの使い捨て環境を使う場合は Docker を起動し、次を実行します。

```sh
npx supabase start
```

`apps/web/.env.example` を `apps/web/.env` にコピーし、`npx supabase status` のローカル API URL と publishable key（または anon key）を `NUXT_PUBLIC_SUPABASE_URL` と `NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` に設定します。ここには secret / service_role キーを入れません。初期状態では従来のメール・パスワード認証を利用し、ローカルのメール画面は `http://127.0.0.1:54324` です。作業終了時は `npx supabase stop` を実行します。

パスキー認証の設定と制約は [パスキー認証](docs/passkey-auth.md) を参照してください。`.env` や Vercel の環境変数には実際の秘密値を含むことがあるため、リポジトリやチャットに貼りません。

## 検証

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

CI はこれらに加え、使い捨てのローカル Supabase に API を直接呼び出す権限テストを実行します。Dependabot は npm と GitHub Actions の更新を確認します。画面や実機の確認は Vercel などで行います。

## 構成

- `apps/web`: Nuxt の Web アプリ
- `apps/mobile`: 将来の Expo アプリ用
- `supabase`: DB マイグレーション、RLS、Edge Functions
- [設計](docs/design.md)・[今後のステップ](docs/roadmap.md)・[パスキー認証](docs/passkey-auth.md)
