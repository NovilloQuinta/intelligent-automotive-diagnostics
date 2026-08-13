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
    // Limite de 40 lineas de AGENTS.md, hasta ahora solo en prosa: lo aplicaban
    // @reviewer y GGA a ojo. Mecanizarlo da un marcador estandar para las
    // excepciones legitimas: `eslint-disable-next-line max-lines-per-function -- razon`.
    // Ver "Excepciones al limite de 40 lineas" en AGENTS.md para cuando vale.
    //
    // Solo en src/: en tests cada `describe` es una funcion, y un bloque con 20
    // casos supera 40 lineas por definicion. Aplicarlo alli son ~145 falsos
    // positivos que enterrarian los avisos reales de produccion.
    files: ['src/**/*.ts'],
    rules: {
      'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
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
