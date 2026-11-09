# Near

承認した友達とだけ位置を共有する Web サービスです。Nuxt、Supabase、MapLibre を使い、位置情報は最新の 1 件のみ保存します。

## 現在の状態

表示名とプリセットアイコン、招待・友達管理、位置共有と地図表示は実装済みです。友達の名前を選ぶと、その位置へ地図が移動します。アイコンには DB マイグレーションが必要です。位置共有は初期状態でオフです。ブラウザの位置画面を開いている間に更新し、画面を閉じた後も共有状態と最後の位置が残ります。停止するには「位置共有を停止」を押してください。

パスキー登録・ログイン、任意の復旧メール、アカウント削除は実装されています。通常の Near ドメインではパスキー認証を有効にしていますが、実際の利用前には友達追加・位置共有・削除の確認が必要です。コードの既定値はパスキー認証オフで、Supabase の従来のメール・パスワード認証はまだ無効化されていません。復旧メールは未設定です。Google ログインは移行方針に含めず、既定で無効です。実際の友達と使う前に [今後のステップ](docs/roadmap.md) を完了してください。

地図は OpenStreetMap の標準タイルを使います。提供元に IP アドレスと表示範囲が伝わります。[利用ポリシー](https://operations.osmfoundation.org/policies/tiles/)と無料枠・可用性を公開前に確認します。 `NUXT_PUBLIC_MAP_STYLE_URL` に HTTPS の MapLibre スタイル URL を指定すると地図の見た目を試せます。未設定または読み込みに失敗した場合は標準地図に戻ります。別のスタイルを採用する前に、地図・フォント・画像それぞれの提供条件、帰属表示、無料枠、利用者の接続情報の送信先を確認してください。

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

CI は lint、formatter、型チェック、ビルドを実行します。テストは一時的に CI から外しており、`npm test` で単体テストを実行できます。位置情報などの API 権限テストのファイルも `scripts/` に残しています。CI では安全性を自動確認しないため、実際の位置を共有する前に権限テストと実機確認が必要です。Dependabot は npm と GitHub Actions の更新を確認します。

API 権限テストを手動で実行する場合は、Docker を用意し、使い捨てのローカル Supabase のみを使います。

```sh
npx supabase start
eval "$(npx supabase status -o env)"
export TEST_SUPABASE_URL="$API_URL"
export TEST_SUPABASE_ANON_KEY="$ANON_KEY"
export TEST_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
node --test scripts/test-profile-api.mjs scripts/test-friends-api.mjs scripts/test-location-api.mjs
```

削除 API も確認する場合は、別のターミナルで `npx supabase functions serve delete-account` を起動し、同じ環境変数を設定したターミナルで `node --test scripts/test-delete-account-api.mjs` を実行します。これらのテストにはローカルの使い捨てキーだけを使い、秘密値をチャットやリポジトリに貼りません。

## 構成

- `apps/web`: Nuxt の Web アプリ
- `apps/mobile`: 将来の Expo アプリ用
- `supabase`: DB マイグレーション、RLS、Edge Functions
- [設計](docs/design.md)・[今後のステップ](docs/roadmap.md)・[パスキー認証](docs/passkey-auth.md)
