// Copyright 2023, University of Colorado Boulder

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