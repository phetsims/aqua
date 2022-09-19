// Copyright 2022, University of Colorado Boulder

/**
 * Sends a Slack message to dev-public
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

const buildLocal = require( '../../../perennial/js/common/buildLocal' );

const { App } = require( '@slack/bolt' ); // eslint-disable-line require-statement-match

let app;

module.exports = async ( messageText, testing = false ) => {

  // Lazily initialized so we don't force the App creation when this file is required
  if ( !app ) {
    app = new App( {
      token: buildLocal.slackBotToken,
      signingSecret: buildLocal.slackSigningSecret
    } );
  }

  if ( testing ) {
    await app.client.chat.postMessage( {
      // #ctq-testing chat ID
      channel: 'C03G9D6NY07',
      text: messageText
    } );
  }
  else {
    await app.client.chat.postMessage( {
      // #continuous-testing chat ID
      channel: 'C03D6JMPAHF',
      text: messageText
    } );
  }
};
