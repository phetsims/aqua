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
      script: 'js/reports/yotta-server.js',
      time: true
    },
    {
      name: 'phettest-server',
      cwd: '/data/web/htdocs/dev/phettest/phettest',
      script: 'phettest-server.js',
      time: true
    },
    {
      name: 'ct-chrome-clients',
      cwd: '/data/share/phet/continuous-testing/ct-chrome-clients/aqua',
      script: 'grunt',
      time: true,
      args: 'client-server --clients=16 --ctID=Bayes%20Puppeteer'
    }
  ]
};