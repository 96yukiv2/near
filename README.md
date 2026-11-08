# Near

承認した友達とだけ位置を共有するサービス。現在は **第1段階のデモ** です。表示される位置と友達は架空で、認証、実際の位置取得、位置の送信・保存はありません。共有スイッチも画面上のデモです。

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
