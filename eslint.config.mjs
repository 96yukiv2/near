import js from "@eslint/js";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/.nuxt/**", "**/.output/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/html-self-closing": "off",
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        defineNuxtConfig: "readonly",
        useRuntimeConfig: "readonly",
      },
    },
  },
);
