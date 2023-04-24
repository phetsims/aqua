// Copyright 2023, University of Colorado Boulder

/**
 * From
 * run like:
 * pm2 start pm2.config.js --time
 * pm2 save
 *
 * Likely to be run as `phet` user on sparky.colorado.edu
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 * @author Jonathan Olson (PhET Interactive Simulations)
 * @author Matt Pennington (PhET Interactive Simulations)
 */

module.exports = {
  apps: [
    {
      name: 'ct-main',
      cwd: '/data/share/phet/continuous-testing/ct-main/aqua',
      script: 'grunt',
      args: 'continuous-server --localCount=20'
    },
    {
      name: 'ct-quick',
      cwd: '/data/share/phet/continuous-testing/ct-quick/aqua',
      script: 'grunt',
      args: 'quick-server'
    },
    {
      name: 'ct-chrome-clients',
      cwd: '/data/share/phet/continuous-testing/ct-chrome-clients/aqua',
      script: 'grunt',
      args: 'client-server --clients=100'
    }
  ]
};