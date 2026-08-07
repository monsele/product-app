import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  eslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { projectService: true },
      globals: {
        console: "readonly",
        process: "readonly",
        Response: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"] },
];
