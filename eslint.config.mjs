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
        // Browser globals the Remotion components and their browser-based
        // layout measurement legitimately use (ST-094).
        document: "readonly",
        requestAnimationFrame: "readonly",
        process: "readonly",
        Response: "readonly",
        fetch: "readonly",
        window: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**"] },
];
