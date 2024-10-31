// Copyright 2023-2024, University of Colorado Boulder

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
      script: 'bash',
      args: '../perennial/bin/sage run js/grunt/tasks/continuous-server.ts --localCount=20',
      time: true
    },
    {
      name: 'ctq',
      cwd: '/data/share/phet/continuous-testing/ct-quick/aqua',
      script: 'bash',
      args: '../perennial/bin/sage run js/grunt/tasks/quick-server.ts --testing',
      time: true
    },
    {
      name: 'ct-puppeteer-client',
      cwd: '/data/share/phet/continuous-testing/ct-node-client/aqua',

      // This is the static IP for sparky, but it gets around the DNS, which was causing trouble in https://github.com/phetsims/aqua/issues/185#issuecomment-1604337447
      args: '--ctID="Sparky Node Puppeteer" --serverURL=http://128.138.93.172/ --fileServerURL=http://128.138.93.172/continuous-testing',
      script: 'js/grunt/tasks/ct-node-client.ts',
      exec_mode: 'cluster',
      instances: 2,
      merge_logs: true,
      time: true
    },
    {
      name: 'ct-firefox-client',
      cwd: '/data/share/phet/continuous-testing/ct-node-client/aqua',
      args: '--ctID="Sparky Node Firefox" --browser=firefox --serverURL=http://127.0.0.1 --fileServerURL=http://127.0.0.1/continuous-testing',
      script: 'js/grunt/tasks/ct-node-client.ts',
      exec_mode: 'cluster',
      instances: 2,
      merge_logs: true,
      time: true
    }
  ]
};