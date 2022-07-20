// Copyright 2022, University of Colorado Boulder

/**
 * Displays a self-updating report of continuous test results
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Property from '../../../axon/js/Property.js';
import escapeHTML from '../../../phet-core/js/escapeHTML.js';

const popupIframeProperty = new Property( null );

const popup = ( triggerNode, message ) => {
  const messageHTML = message.split( '\n' ).map( escapeHTML ).join( '<br>' );

  const iframe = document.createElement( 'iframe' );
  document.body.appendChild( iframe );

  // Content
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(
    `${'<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head><title>CT Info</title></head>' +
    '<body style="font-size: 12px; font-family: Arial">'}${messageHTML}</body>` +
    '</html>'
  );
  iframe.contentWindow.document.close();

  // Styles
  iframe.contentWindow.document.body.style.background = 'white';
  iframe.style.border = '1px solid black';

  // Make it wide before measuring
  iframe.style.width = `${1000}px`;

  // Measure the width and adjust
  iframe.style.width = `${iframe.contentWindow.document.documentElement.scrollWidth}px`;

  // Set height after, measuring after the width change to make sure it has room
  iframe.style.height = `${iframe.contentWindow.document.documentElement.scrollHeight}px`;

  // Positioning
  const point = triggerNode.parentToGlobalPoint( triggerNode.rightTop );
  iframe.style.position = 'absolute';
  iframe.style.left = `${Math.ceil( point.x )}px`;
  iframe.style.top = `${Math.ceil( point.y )}px`;
  iframe.style.zIndex = '10000';

  popupIframeProperty.value = iframe;
};

export default popup;
export { popupIframeProperty };
