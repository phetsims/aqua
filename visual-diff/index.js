// Copyright 2020, University of Colorado Boulder

/**
 * Compare two running sims interactively. They must be running on the same origin and specified via ?a= and &b=
 * @author Sam Reid (PhET Interactive Simulations)
 */

const a = document.getElementById( 'aFrame' );
const b = document.getElementById( 'bFrame' );

const split = window.location.search.split( '&b=' );
if ( split.length !== 2 ) {
  throw new Error( 'bad URL, requires ?a= and &b=' );
}
const bSrc = split[ 1 ];
const aSrc = split[ 0 ].split( '?a=' )[ 1 ];

a.src = aSrc;
b.src = bSrc;

/**
 * Determine if a simulation is ready for input
 * @param {Object} iframe
 * @returns {boolean}
 */
const isReady = iframe => {
  return iframe.contentWindow &&
         iframe.contentWindow.phet &&
         iframe.contentWindow.phet.joist &&
         iframe.contentWindow.phet.joist.display &&
         iframe.contentWindow.phet.joist.display._input;
};

/**
 * Sends the mouse event to the specified iframe. Adapted from snapshot.js
 * @param {Object} iframe
 * @param {number} mouseX
 * @param {number} mouseY
 * @param {string} type
 */
function sendMouseMoveEvent( iframe, mouseX, mouseY, type ) {
  if ( isReady( iframe ) ) {

    const input = iframe.contentWindow.phet.joist.display._input;

    // our move event
    const domEvent = iframe.contentWindow.document.createEvent( 'MouseEvent' ); // not 'MouseEvents' according to DOM Level 3 spec

    // technically deprecated, but DOM4 event constructors not out yet. people on #whatwg said to use it
    domEvent.initMouseEvent( type, true, true, iframe.contentWindow, 0, // click count
      mouseX, mouseY, mouseX, mouseY,
      false, false, false, false,
      0, // button
      null );

    input.validatePointers();
    if ( type === 'mousemove' ) {
      input.mouseMove( new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), domEvent );
    }
    else if ( type === 'mousedown' ) {
      input.mouseDown( null, new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), domEvent );
    }
    else if ( type === 'mouseup' ) {
      input.mouseUp( new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), domEvent );
    }
  }
}

const body = document.getElementById( 'body' );

// Listen for events on the body, and pass them to both sims
body.addEventListener( 'mousemove', e => {

  const rect = body.getBoundingClientRect();
  sendMouseMoveEvent( a, e.clientX - rect.left, e.clientY - rect.top, 'mousemove' );
  sendMouseMoveEvent( b, e.clientX - rect.left, e.clientY - rect.top, 'mousemove' );
} );

body.addEventListener( 'mousedown', e => {

  const rect = body.getBoundingClientRect();
  sendMouseMoveEvent( a, e.clientX - rect.left, e.clientY - rect.top, 'mousedown' );
  sendMouseMoveEvent( b, e.clientX - rect.left, e.clientY - rect.top, 'mousedown' );
} );

body.addEventListener( 'mouseup', e => {

  const rect = body.getBoundingClientRect();
  sendMouseMoveEvent( a, e.clientX - rect.left, e.clientY - rect.top, 'mouseup' );
  sendMouseMoveEvent( b, e.clientX - rect.left, e.clientY - rect.top, 'mouseup' );
} );

// Capture a screenshot from the given iframe
function getScreenshot( iframe, callback ) {
  iframe.contentWindow.phet.joist.display.canvasSnapshot( callback );
}

/**
 * Compare the two screenshots.
 * @param aCanvas
 * @param aData
 * @param bCanvas
 * @param bData
 */
const compare = ( aCanvas, aData, bCanvas, bData ) => {

  const diffCanvas = document.getElementById( 'diff' );
  const diffContext = diffCanvas.getContext( '2d' );
  const diffData = diffContext.createImageData( aData );

  try {
    pixelmatch( aData.data, bData.data, diffData.data, 512, 309, { threshold: 0.1 } ); // eslint-disable-line no-undef

    diffContext.putImageData( diffData, 0, 0 );
  }
  catch( e ) {
    console.log( e );
  }
};

// At a given interval, compare screenshots from both sims.
setInterval( () => {
  let aCanvas = null;
  let aData = null;
  let bCanvas = null;
  let bData = null;
  if ( isReady( a ) && isReady( b ) ) {
    getScreenshot( a, ( canvas, data ) => {
      aCanvas = canvas;
      aData = data;

      if ( aCanvas && bCanvas ) {
        compare( aCanvas, aData, bCanvas, bData );
      }
    } );
    getScreenshot( b, ( canvas, data ) => {
      bCanvas = canvas;
      bData = data;

      if ( aCanvas && bCanvas ) {
        compare( aCanvas, aData, bCanvas, bData );
      }
    } );
  }
}, 1000 );