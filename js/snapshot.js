// Copyright 2017, University of Colorado Boulder

/**
 * TODO doc
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */
/* eslint-env node */
'use strict';

var options = QueryStringMachine.getAll( {
  url: {
    type: 'string',
    defaultValue: ''
  },
  simQueryParameters: {
    type: 'string',
    defaultValue: ''
  },
  numFrames: {
    type: 'number',
    defaultValue: 100
  }
} );

var iframe = document.createElement( 'iframe' );
iframe.setAttribute( 'frameborder', '0' );
iframe.setAttribute( 'seamless', '1' );
iframe.setAttribute( 'width', 1024 / 2 );
iframe.setAttribute( 'height', 768 / 2 );
document.body.appendChild( iframe );

var queryParams = 'audioVolume=0&randomSeed=5&playbackMode=true&postMessageOnLoad&postMessageOnError&postMessageOnReady';
iframe.src = '../../molarity/molarity_en.html?brand=phet&ea&' + queryParams;

var isMouseDown = false;
var mouseLastMoved = false;
var mouseX = 0;
var mouseY = 0;
var random = null;

function sendStep( dt ) {
  iframe.contentWindow.phet.joist.sim.stepSimulation( dt );
}
function sendMouseToggleEvent() {
  var input = iframe.contentWindow.phet.joist.display._input;
  var domEvent = iframe.contentWindow.document.createEvent( 'MouseEvent' );

  // technically deprecated, but DOM4 event constructors not out yet. people on #whatwg said to use it
  domEvent.initMouseEvent( isMouseDown ? 'mouseup' : 'mousedown', true, true, iframe.contentWindow, 1, // click count
    mouseX, mouseY, mouseX, mouseY,
    false, false, false, false,
    0, // button
    null );

  input.validatePointers();

  if ( isMouseDown ) {
    input.mouseUp( new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), domEvent );
    isMouseDown = false;
  }
  else {
    input.mouseDown( new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), domEvent );
    isMouseDown = true;
  }

  mouseLastMoved = false;
}
function sendMouseMoveEvent() {
  var input = iframe.contentWindow.phet.joist.display._input;
  mouseX = Math.floor( random.nextDouble() * iframe.contentWindow.phet.joist.display.width );
  mouseY = Math.floor( random.nextDouble() * iframe.contentWindow.phet.joist.display.height );

  // our move event
  var domEvent = document.createEvent( 'MouseEvent' ); // not 'MouseEvents' according to DOM Level 3 spec

  // technically deprecated, but DOM4 event constructors not out yet. people on #whatwg said to use it
  domEvent.initMouseEvent( 'mousemove', true, true, iframe.contentWindow, 0, // click count
    mouseX, mouseY, mouseX, mouseY,
    false, false, false, false,
    0, // button
    null );

  input.validatePointers();
  input.mouseMove( new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), domEvent );

  mouseLastMoved = true;
}
function sendFuzz( averageEventQuantity ) {
  var chance;

  // run a variable number of events, with a certain chance of bailing out (so no events are possible)
  // models a geometric distribution of events
  // See https://github.com/phetsims/joist/issues/343 for notes on the distribution.
  while ( ( chance = random.nextDouble() ) < 1 - 1 / ( averageEventQuantity + 1 ) ) {
    if ( chance < ( mouseLastMoved ? 0.7 : 0.4 ) ) {
      sendMouseToggleEvent();
    }
    else {
      sendMouseMoveEvent();
    }
  }
}
function getScreenshot( callback ) {
  iframe.contentWindow.phet.joist.sim.display.foreignObjectRasterization( function( url ) {
    callback( url );
  } );
}
function hash( str ) {
  return new Hashes.MD5().hex( str );
}

var count = 0;
var screenshotHashes = '';
var loaded = false;
var received = true;
function handleFrame() {
  setTimeout( handleFrame, 0 );

  if ( loaded && received && count < options.numFrames ) {
    count++;
    console.log( 'screenshot ' + count );
    received = false;

    for ( var i = 0; i < 10; i++ ) {
      sendFuzz( 100 );
      sendStep( random.nextDouble() * 0.5 + 0.016 );
    }

    getScreenshot( function( url ) {
      received = true;
      screenshotHashes += hash( url );
      if ( count === options.numFrames ) {
        var fullHash = hash( screenshotHashes );

        window.parent && window.parent.postMessage( JSON.stringify( {
          type: 'snapshotHash',
          hash: fullHash,
          url: window.location.href
        } ), '*' );

        console.log( fullHash );
      }
    } );
  }
}
handleFrame();

// handling messages from sims
window.addEventListener( 'message', function( evt ) {
  var data = JSON.parse( evt.data );

  // Sent by Joist due to the postMessage* query parameters
  if ( data.type === 'ready' ) {
    console.log( 'ready' );

    // Don't allow popups
    iframe.contentWindow.open = function() {
      return {
        focus: function() {},
        blur: function() {}
      };
    };
    // FileSaver don't allow popup
    iframe.contentWindow.saveAs = function() {};

    random = new iframe.contentWindow.phet.dot.Random( { seed: 2.3 } );

    iframe.contentWindow.phetLaunchSimulation();
    iframe.contentWindow.phet.joist.sim.display.interactive = false;
  }
  else if ( data.type === 'load' ) {
    console.log( 'loaded' );
    sendStep( 0.016 );
    loaded = true;
  }
  else if ( data.type === 'error' ) {
    console.log( 'error' );
  }
} );
