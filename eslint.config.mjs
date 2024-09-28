// Copyright 2024, University of Colorado Boulder

/**
 * ESLint configuration for aqua.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import nodeEslintConfig from '../chipper/eslint/node.eslint.config.mjs';

export default [
  ...nodeEslintConfig,
  {
    languageOptions: {
      globals: {
        aqua: 'readonly',
        XMLHttpRequest: 'readonly',
        Hashes: 'readonly',
        phetCore: 'readonly',
        axon: 'readonly',
        dot: 'readonly',
        kite: 'readonly',
        scenery: 'readonly',
        __dirname: 'readonly'
      }
    }
  },
  {
    files: [
      './js/browser-tools/**',
      './js/client/**',
      './js/report/**'
    ],
    extends: '../chipper/eslint/phet-library_eslintrc.js',
    rules: {
      'bad-sim-text': 'off'
    },
    env: {
      browser: true,
      node: false
    }
  }, {
    files: [ 'js/grunt/tasks/**/*' ],
    rules: {

      // We travel with perennial, always on main and do not allow dependencies on versioned repos like phet-core,
      // so cannot use IntentionalAny
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: [ '**/*.ts' ],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off'
    }
  }
];