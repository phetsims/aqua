// Copyright 2023, University of Colorado Boulder

/**
 * From bayes run:
 * pm2 startOrReload bayes.pm2.config.js --update-env
 *
 * In general or for testing run:
 * pm2 start bayes.pm2.config.js --time
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
      name: 'yotta-server',
      cwd: '/data/share/phet/yotta-statistics/yotta/',
      script: 'js/reports/yotta-server.js'
    },
    {
      name: 'phettest-server',
      cwd: '/data/web/htdocs/dev/phettest/phettest',
      script: 'phettest-server.js'
    }
  ]
};