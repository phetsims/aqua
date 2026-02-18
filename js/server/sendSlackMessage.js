// Copyright 2022-2026, University of Colorado Boulder

/**
 * Sends a Slack message to dev-public
 *
 * @author Jonathan Olson (PhET Interactive Simulations)
 */

const buildLocal = require( '../../../perennial/js/common/buildLocal' );
const { App } = require( '@slack/bolt' );
const winston = require( '../../../perennial/js/npm-dependencies/winston' ).default;

let app;

module.exports = async ( messageText, testing = false ) => {

  // Lazily initialized so we don't force the App creation when this file is required
  if ( !app ) {
    app = new App( {
      token: buildLocal.slackBotToken,
      signingSecret: buildLocal.slackSigningSecret,
      logger: {
        debug: ( ...msgs ) => { winston.debug( JSON.stringify( msgs ) ); },
        info: ( ...msgs ) => { winston.info( JSON.stringify( msgs ) ); },
        warn: ( ...msgs ) => { winston.warn( JSON.stringify( msgs ) ); },
        error: ( ...msgs ) => { winston.error( JSON.stringify( msgs ) ); },
        setLevel: () => { },
        getLevel: () => winston.default.transports.console.level,
        setName: () => { }
      }
    } );
  }

  await app.client.chat.postMessage( {
    channel: testing ? 'C03G9D6NY07' : 'C03D6JMPAHF',
    text: messageText
  } );
};