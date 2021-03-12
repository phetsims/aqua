// Copyright 2017-2020, University of Colorado Boulder

/**
 * Runs a snapshot for a specific sim (url) with a given seed. It will send a number of events, and will record
 * visual frames the desired number of times (with SHAs) and can send post-messages to communicate the events.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

'use strict';

const options = QueryStringMachine.getAll( {
  url: {
    type: 'string',
    defaultValue: '../../molecule-shapes/molecule-shapes_en.html'
  },
  simSeed: {
    type: 'number',
    defaultValue: 4 // Ideal constant taken from https://xkcd.com/221/, DO NOT CHANGE, it's random!
  },
  simWidth: {
    type: 'number',
    defaultValue: 1024 / 4
  },
  simHeight: {
    type: 'number',
    defaultValue: 768 / 4
  },
  // Note: always assumed to be something?
  simQueryParameters: {
    type: 'string',
    defaultValue: 'brand=phet&ea'
  },
  numFrames: {
    type: 'number',
    defaultValue: 100
  }
} );

const iframe = document.createElement( 'iframe' );
iframe.setAttribute( 'frameborder', '0' );
iframe.setAttribute( 'seamless', '1' );
iframe.setAttribute( 'width', options.simWidth );
iframe.setAttribute( 'height', options.simHeight );
document.body.appendChild( iframe );

const queryParameters = `preserveDrawingBuffer&audioVolume=0&sound=disabled&randomSeed=${options.simSeed}&playbackMode=true&postMessageOnLoad&postMessageOnError&postMessageOnReady`;
iframe.src = `${options.url}?${options.simQueryParameters}&${queryParameters}`;

let isMouseDown = false;
let mouseLastMoved = false;
let mouseX = 0;
let mouseY = 0;
let random = null;

function sendStep( dt ) {
  iframe.contentWindow.phet.joist.sim.stepSimulation( dt );
}

function sendMouseToggleEvent() {
  const input = iframe.contentWindow.phet.joist.display._input;
  const domEvent = iframe.contentWindow.document.createEvent( 'MouseEvent' );

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
  const input = iframe.contentWindow.phet.joist.display._input;
  mouseX = Math.floor( random.nextDouble() * iframe.contentWindow.phet.joist.display.width );
  mouseY = Math.floor( random.nextDouble() * iframe.contentWindow.phet.joist.display.height );

  // our move event
  const domEvent = iframe.contentWindow.document.createEvent( 'MouseEvent' ); // not 'MouseEvents' according to DOM Level 3 spec

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
  let chance;

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
  iframe.contentWindow.phet.joist.display.foreignObjectRasterization( url => {
    callback( url );
  } );
}

function hash( str ) {
  return new Hashes.MD5().hex( str );
}

let count = 0;
let screenshotHashes = '';
let loaded = false;
let received = true;

function handleFrame() {
  setTimeout( handleFrame, 0 );

  if ( loaded && received && count < options.numFrames ) {
    count++;
    received = false;

    for ( let i = 0; i < 10; i++ ) {
      sendFuzz( 100 );
      sendStep( random.nextDouble() * 0.5 + 0.016 );
    }

    getScreenshot( url => {
      const hashedURL = hash( url );
      console.log( count, hashedURL );

      ( window.parent !== window ) && window.parent.postMessage( JSON.stringify( {
        type: 'screenshot',
        number: count - 1,
        url: url,
        hash: hashedURL
      } ), '*' );

      received = true;
      screenshotHashes += hashedURL;
      if ( count === options.numFrames ) {
        const fullHash = hash( screenshotHashes );

        ( window.parent !== window ) && window.parent.postMessage( JSON.stringify( {
          type: 'snapshot',
          hash: fullHash,
          url: window.location.href
        } ), '*' );

        console.log( fullHash );
      }
    } );
  }
}

handleFrame();

// Because of course direct calls to this go through this window object instead.
window.addEventListener( 'error', a => {
  let message = '';
  let stack = '';
  if ( a && a.message ) {
    message = a.message;
  }
  if ( a && a.error && a.error.stack ) {
    stack = a.error.stack;
  }
  ( window.parent !== window ) && window.parent.postMessage( JSON.stringify( {
    type: 'error',
    message: message,
    stack: stack
  } ), '*' );
} );

// handling messages from sims
window.addEventListener( 'message', evt => {
  if ( typeof evt.data !== 'string' ) {
    return;
  }

  const data = JSON.parse( evt.data );

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

    // We need to create an object with the iframe's Object.prototype as its prototype to pass our assertion checks
    const options = iframe.contentWindow.Object.create( iframe.contentWindow.Object.prototype, {
      seed: {
        value: 2.3,
        enumerable: true
      }
    } );
    console.log( options );
    random = new iframe.contentWindow.phet.dot.Random( options );

    iframe.contentWindow.phet.joist.launchSimulation();
    iframe.contentWindow.phet.joist.display.interactive = false;
  }
  else if ( data.type === 'load' ) {
    console.log( 'loaded' );
    sendStep( 0.016 );
    loaded = true;
  }
  else if ( data.type === 'error' ) {
    window.parent && window.parent.postMessage( evt.data );
  }
} );
