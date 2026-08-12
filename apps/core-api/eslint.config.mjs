import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierConfig from 'eslint-config-prettier'
import jsdoc from 'eslint-plugin-jsdoc'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Complejidad ciclomática accionable: señala funciones >5 (no el promedio).
      // 'warn' por ahora: identifica candidatas a refactor sin bloquear commits.
      complexity: ['warn', 5],
    },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/main.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': ['error', {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
          MethodDefinition: false,
        },
        contexts: [
          'ExportNamedDeclaration',
          'ExportDefaultDeclaration',
        ],
        exemptEmptyConstructors: true,
        exemptEmptyFunctions: true,
      }],
    },
  },
)
