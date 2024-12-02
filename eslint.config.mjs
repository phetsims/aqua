// Copyright 2024, University of Colorado Boulder

/**
 * ESLint configuration for aqua.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import browserEslintConfig from '../perennial-alias/js/eslint/config/browser.eslint.config.mjs';

export default [
  ...browserEslintConfig,
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
  }
];