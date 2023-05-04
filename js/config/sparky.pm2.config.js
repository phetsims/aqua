// Copyright 2023, University of Colorado Boulder

/**
 * From sparky run:
 * pm2 startOrReload sparky.pm2.config.js --update-env
 *
 * In general or for testing run:
 * pm2 start sparky.pm2.config.js
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
      args: 'continuous-server --localCount=20',
      time: true
    },
    {
      name: 'ct-quick',
      cwd: '/data/share/phet/continuous-testing/ct-quick/aqua',
      script: 'grunt',
      args: 'quick-server',
      time: true
    },
    {
      name: 'ct-browser-clients',
      cwd: '/data/share/phet/continuous-testing/ct-browser-clients/aqua',
      script: 'grunt',
      args: 'client-server --puppeteerClients=70 --firefoxClients=30 --serverURL=http://127.0.0.1',
      time: true
    }
  ]
};