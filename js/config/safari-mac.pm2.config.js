// Copyright 2023, University of Colorado Boulder

/**
 * From bayes run:
 * cd aqua;
 * pm2 startOrReload js/config/safari-mac.pm2.config.js --update-env;
 * pm2 save;
 *
 * In general or for testing run:
 * pm2 start safari-mac.pm2.config.js
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

module.exports = {
  apps: [
    {
      name: 'ct-node-safari-client',
      cwd: '/Users/phet-dev/PhET/continuous-testing/aqua',
      args: 'ct-node-client --ctID="Safari from Node"',
      script: 'grunt',
      exec_mode: 'cluster',
      instances: 16,
      time: true
    }
  ]
};