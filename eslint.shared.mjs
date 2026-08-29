import jsdoc from 'eslint-plugin-jsdoc'

// Compartido por apps/core-api y apps/ui: TSDoc solo en functions/classes
// publicas con cuerpo >=3 lineas. Nunca en types/interfaces/consts.
export const requireJsdocConfig = {
  files: ['src/**/*.{ts,tsx}'],
  plugins: { jsdoc },
  rules: {
    'jsdoc/require-jsdoc': [
      'error',
      {
        publicOnly: true,
        require: {
          FunctionDeclaration: true,
          ClassDeclaration: true,
          ArrowFunctionExpression: false,
          FunctionExpression: false,
          MethodDefinition: false,
        },
        minLineCount: 3,
        exemptEmptyConstructors: true,
        exemptEmptyFunctions: true,
      },
    ],
  },
}
