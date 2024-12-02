// Copyright 2024, University of Colorado Boulder

/**
 * ESLint configuration for aqua.
 *
 * @author Sam Reid (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import nodeEslintConfig from '../../../perennial-alias/js/eslint/config/node.eslint.config.mjs';

export default [
  ...nodeEslintConfig,
  {
    // TODO: remove once the path works in root config againt, https://github.com/phetsims/chipper/issues/1483/
    rules: {
      '@typescript-eslint/no-floating-promises': 'off'
    }
  }
];