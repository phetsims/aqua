// Copyright 2023-2024, University of Colorado Boulder

/**
 * From bayes run:
 * cd aqua;
 * pm2 startOrReload js/config/bayes.pm2.config.js --update-env;
 * pm2 save;
 *
 * In general or for testing run:
 * pm2 start bayes.pm2.config.js
 *
 * Likely to be run as `phet-admin` user on bayes.colorado.edu
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
      interpreter: '/bin/bash',
      script: '../perennial/bin/sage',
      args: 'run js/reports/yotta-server.js',
      time: true
    },
    {
      name: 'phettest-server',
      cwd: '/data/web/htdocs/dev/phettest/phettest',
      interpreter: '/bin/bash',
      script: '../perennial/bin/sage',
      args: 'run phettest-server.js',
      time: true
    },
    {
      name: 'monday-server',
      cwd: '/data/share/phet/monday/monday',
      interpreter: '/bin/bash',
      script: '../perennial/bin/sage',
      args: 'run js/app.js',
      time: true
    },
    {
      name: 'ct-chrome-client',
      cwd: '/data/share/phet/continuous-testing/ct-node-clients/aqua',

      // This is the static IP for sparky, but it gets around the DNS, which was causing trouble in https://github.com/phetsims/aqua/issues/185#issuecomment-1604337447
      args: 'ct-node-client --ctID="Bayes Node Chrome" --serverURL=http://128.138.93.172/ --fileServerURL=http://128.138.93.172/continuous-testing',
      script: 'grunt',
      exec_mode: 'cluster',
      instances: 10,
      time: true
    }
  ]
};