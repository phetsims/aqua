// Copyright 2024, University of Colorado Boulder

/**
 * ESLint configuration for aqua.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import { getBrowserConfiguration } from '../perennial-alias/js/eslint/config/browser.eslint.config.mjs';
import rootEslintConfig from '../perennial-alias/js/eslint/config/root.eslint.config.mjs';
import getNodeConfiguration from '../perennial-alias/js/eslint/config/util/getNodeConfiguration.mjs';

const nodeJSDirs = [
  'js/config/**',
  'js/grunt/**',
  'js/local/**',
  'js/node-client/**',
  'js/server/**'
];
export default [
  ...rootEslintConfig,
  ...getBrowserConfiguration( {
    files: [ '**/*' ],
    ignores: nodeJSDirs
  } ),
  ...getNodeConfiguration( {
    files: nodeJSDirs
  } ),
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
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off' // TODO: use IntentionalAny, see https://github.com/phetsims/chipper/issues/1465
    }
  }
];