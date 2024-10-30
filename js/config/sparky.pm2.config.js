// Copyright 2023, University of Colorado Boulder

/**
 * From sparky run:
 * cd aqua;
 * pm2 startOrReload js/config/sparky.pm2.config.js --update-env;
 * pm2 save;
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
      name: 'ct-node-puppeteer-client',
      cwd: '/data/share/phet/continuous-testing/ct-node-client/aqua',

      // This is the static IP for sparky, but it gets around the DNS, which was causing trouble in https://github.com/phetsims/aqua/issues/185#issuecomment-1604337447
      args: 'ct-node-client --ctID="Sparky Node Puppeteer" --serverURL=http://128.138.93.172/ --fileServerURL=http://128.138.93.172/continuous-testing',
      script: 'grunt',
      exec_mode: 'cluster',
      instances: 30,
      time: true
    },
    {
      name: 'ct-node-firefox-client',
      cwd: '/data/share/phet/continuous-testing/ct-node-client/aqua',
      args: 'ct-node-client --ctID="Sparky Node Firefox" --browser=firefox --serverURL=http://127.0.0.1 --fileServerURL=http://127.0.0.1/continuous-testing',
      script: 'grunt',
      exec_mode: 'cluster',
      instances: 10,
      time: true
    }
  ]
};