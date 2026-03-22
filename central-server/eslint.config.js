// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['src/controllers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../config/database',
              message:
                "Controllers must use repositories instead of direct database access. Import from '../repositories'.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/handlers/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.property.name='data'][object.object.name='socket']",
          message:
            "Don't use socket.data — use (socket as any).prop instead. Socket.IO v4 socket.data is a separate empty object, NOT the same as properties set via (socket as any).prop in socket.service.ts.",
        },
      ],
    },
  },
  {
    ignores: ['**/*.test.ts', '**/__tests__/**', 'dist/**', 'node_modules/**'],
  }
);
