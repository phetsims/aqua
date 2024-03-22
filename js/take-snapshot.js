// Copyright 2017-2024, University of Colorado Boulder

/**
 * Runs a snapshot for a specific sim (url) with a given seed. It will send a number of events, and will record
 * visual frames the desired number of times (with SHAs) and can send post-messages to communicate the events.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */


const options = QueryStringMachine.getAll( {

  // unique identifier for this frame
  id: {
    type: 'number',
    defaultValue: 0
  },

  // url to test for the snapshot
  url: {
    type: 'string',
    defaultValue: '../../molecule-shapes/molecule-shapes_en.html'
  },

  // sim seed
  simSeed: {
    type: 'number',
    defaultValue: 4 // Ideal constant taken from https://xkcd.com/221/, DO NOT CHANGE, it's random!
  },

  // The dimension of the iframe the sim is loade din
  simWidth: {
    type: 'number',
    defaultValue: 1024 / 4
  },
  simHeight: {
    type: 'number',
    defaultValue: 768 / 4
  },

  // Added to each sim iframe source
  // Note: always assumed to be something?
  simQueryParameters: {
    type: 'string',
    defaultValue: 'brand=phet&ea'
  },

  // How many snapshot "frames" should be captured for comparison. Fuzz occurs multiple times between frame capture.
  numFrames: {
    type: 'number',
    defaultValue: 100
  },

  // Compare description-related features too (like the PDOM and aria-live output)
  compareDescription: {
    type: 'boolean',
    defaultValue: false
  },

  logFrameInfo: {
    type: 'boolean',
    defaultValue: true
  }
} );

const iframe = document.createElement( 'iframe' );
iframe.setAttribute( 'frameborder', '0' );
iframe.setAttribute( 'seamless', '1' );
iframe.setAttribute( 'width', options.simWidth );
iframe.setAttribute( 'height', options.simHeight );
document.body.appendChild( iframe );

const queryParameters = `preserveDrawingBuffer&audio=disabled&preventFullScreen&randomSeed=${options.simSeed}&playbackMode=true&postMessageOnLoad&postMessageOnError&postMessageOnReady`;
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
  // TODO: Firefox warning: initMouseEvent() is deprecated. Use the MouseEvent() constructor instead. https://github.com/phetsims/aqua/issues/205
  domEvent.initMouseEvent( isMouseDown ? 'mouseup' : 'mousedown', true, true, iframe.contentWindow, 1, // click count
    mouseX, mouseY, mouseX, mouseY,
    false, false, false, false,
    0, // button
    null );

  const context = new iframe.contentWindow.phet.scenery.EventContext( domEvent );

  input.validatePointers();

  if ( isMouseDown ) {
    input.mouseUp( new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), context );
    isMouseDown = false;
  }
  else {
    input.mouseDown( null, new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), context );
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
  input.mouseMove(
    new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ),
    new iframe.contentWindow.phet.scenery.EventContext( domEvent )
  );

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

function getScreenshot() {
  return new Promise( resolve => {
    iframe.contentWindow.phet.joist.display.foreignObjectRasterization( url => {
      resolve( url );
    } );
  } );
}

function hash( str ) {
  return new Hashes.MD5().hex( str );
}

let count = 0;
let frameHashes = '';
let loaded = false;
let received = true;

const waitForAnimationFrame = () => {
  return new Promise( resolve => {
    iframe.contentWindow.phet.axon.animationFrameTimer.runOnNextTick( () => {
      resolve();
    } );
  } );
};

// Fuzz, step, allow for redraw, and then capture a snapshot of the simulation. Then send that data to the parent frame.
async function handleFrame() {
  if ( loaded && received ) {
    while ( count < options.numFrames ) {
      count++;
      received = false;

      for ( let i = 0; i < 10; i++ ) {
        sendFuzz( 100 );
        sendStep( random.nextDouble() * 0.5 + 0.016 );
      }

      await waitForAnimationFrame();
      await waitForAnimationFrame();

      const screenshotURL = await getScreenshot();
      const hashedScreenshotURL = hash( screenshotURL );
      options.logFrameInfo && console.log( count, hashedScreenshotURL );

      let concatHash = hashedScreenshotURL;

      const pdomData = {
        html: null,
        hash: null
      };
      const descriptionAlertData = {
        utterances: null,
        hash: null
      };
      const voicingResponseData = {
        utterances: null,
        hash: null
      };
      if ( options.compareDescription && iframe.contentWindow.phet.joist.display.isAccessible() ) {

        const pdomRoot = iframe.contentWindow.phet.joist.display.pdomRootElement;
        const pdomHTML = pdomRoot.outerHTML;
        pdomData.html = pdomHTML;
        const hashedPDOMHTML = hash( pdomHTML );
        pdomData.hash = hashedPDOMHTML;
        concatHash += hashedPDOMHTML;

        const descriptionUtteranceQueue = iframe.contentWindow.phet.joist.display.descriptionUtteranceQueue.queue;
        const utteranceTexts = descriptionUtteranceQueue.map( utteranceWrapper => utteranceWrapper.utterance.toString() );
        descriptionAlertData.utterances = utteranceTexts;
        const utterancesHash = hash( utteranceTexts + '' );
        descriptionAlertData.hash = utterancesHash;
        concatHash += utterancesHash;

        if ( iframe.contentWindow.phet.scenery.voicingUtteranceQueue ) {
          const voicingUtteranceQueue = iframe.contentWindow.phet.scenery.voicingUtteranceQueue.queue;
          const voicingUtteranceTexts = voicingUtteranceQueue.map( voicingUtteranceWrapper => voicingUtteranceWrapper.utterance.toString() );
          voicingResponseData.utterances = voicingUtteranceTexts;
          const voicingUtterancesHash = hash( voicingUtteranceTexts + '' );
          voicingResponseData.hash = voicingUtterancesHash;
          concatHash += voicingUtterancesHash;
        }
      }


      ( window.parent !== window ) && window.parent.postMessage( JSON.stringify( {
        id: options.id,
        type: 'frameEmitted',
        number: count - 1,
        screenshot: {
          url: screenshotURL,
          hash: hashedScreenshotURL
        },
        pdom: pdomData,
        descriptionAlert: descriptionAlertData,
        voicing: voicingResponseData
      } ), '*' );

      received = true;
      frameHashes += concatHash;
      if ( count === options.numFrames ) {
        const fullHash = hash( frameHashes );

        ( window.parent !== window ) && window.parent.postMessage( JSON.stringify( {
          id: options.id,
          type: 'snapshot',
          hash: fullHash,
          url: window.location.href
        } ), '*' );
      }
    }
  }
  else {
    setTimeout( handleFrame, 0 );
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
    id: options.id,
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
    options.logFrameInfo && console.log( 'ready' );

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
    const randomOptions = iframe.contentWindow.Object.create( iframe.contentWindow.Object.prototype, {
      seed: {
        value: 2.3,
        enumerable: true
      }
    } );
    options.logFrameInfo && console.log( randomOptions );
    random = new iframe.contentWindow.phet.dot.Random( randomOptions );

    iframe.contentWindow.phet.joist.launchSimulation();
    iframe.contentWindow.phet.joist.display.interactive = false;
  }
  else if ( data.type === 'load' ) {
    options.logFrameInfo && console.log( 'loaded' );
    sendStep( 0.016 );
    loaded = true;
  }
  else if ( data.type === 'error' ) {
    evt.data.id = options.id;
    window.parent && window.parent.postMessage( evt.data );
  }
} );