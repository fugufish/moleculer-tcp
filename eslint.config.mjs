// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    rules: {
      quotes: ['error', 'double'],
      'object-curly-spacing': ['error', 'always'],
      // line width
      'max-len': ['error', { code: 120, ignoreComments: true }],
    }
  }
);