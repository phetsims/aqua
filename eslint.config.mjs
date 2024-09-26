// Copyright 2024, University of Colorado Boulder

/**
 * ESlint configuration for aqua.
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
  }
];