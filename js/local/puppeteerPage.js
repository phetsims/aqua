// Copyright 2018-2022, University of Colorado Boulder

const puppeteerLoad = require( '../../../perennial-alias/js/common/puppeteerLoad' );

module.exports = async function puppeteerPage( browser, targetURL, timeout ) {

  try {
    await puppeteerLoad( targetURL, {
      waitAfterLoad: timeout,
      browser: browser
    } );
    return { ok: true };
  }
  catch( e ) {
    return { ok: false, message: `caught exception: ${e}` };
  }
};