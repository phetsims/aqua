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
      name: 'ct-browser-clients',
      cwd: '/data/share/phet/continuous-testing/ct-browser-clients/aqua',
      script: 'grunt',
      args: 'client-server --puppeteerClients=5 --firefoxClients=5 --serverURL=http://127.0.0.1',
      time: true
    },
    {
      name: 'ct-node-puppeteer-client',
      cwd: '/data/share/phet/continuous-testing/ct-node-client/aqua',
      args: 'ct-node-client --ctID="Sparky Node Puppeteer" --serverURL=http://127.0.0.1',
      script: 'grunt',
      exec_mode: 'cluster',
      instances: 65,
      time: true
    },
    {
      name: 'ct-node-firefox-client',
      cwd: '/data/share/phet/continuous-testing/ct-node-client/aqua',
      args: 'ct-node-client --ctID="Sparky Node Firefox" --browser=firefox --serverURL=http://127.0.0.1',
      script: 'grunt',
      exec_mode: 'cluster',
      instances: 25,
      time: true
    }
  ]
};