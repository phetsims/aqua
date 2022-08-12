// Copyright 2017-2022, University of Colorado Boulder
// eslint-disable-next-line bad-typescript-text
// @ts-nocheck
/**
 * Runs a snapshot for a specific sim (url) with a given seed. It will send a number of events, and will record
 * visual frames the desired number of times (with SHAs) and can send post-messages to communicate the events.
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import Random from '../../dot/js/Random.js';

const options = QueryStringMachine.getAll( {
  id: {
    type: 'number',
    defaultValue: 0
  },
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
let random: Random = null as unknown as Random; // ugly ugly ugly

function sendStep( dt ): void {
  iframe.contentWindow.phet.joist.sim.stepSimulation( dt );
}

function sendMouseToggleEvent(): void {
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
    console.log( 'mouseUp' );
    input.mouseUp( new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), domEvent );
    isMouseDown = false;
  }
  else {
    console.log( 'mouseDown' );
    input.mouseDown( null, new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), domEvent );
    isMouseDown = true;
  }

  mouseLastMoved = false;
}

function sendMouseMoveEvent(): void {
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
  console.log( 'mouseMove' );
  input.mouseMove( new iframe.contentWindow.phet.dot.Vector2( mouseX, mouseY ), domEvent );

  mouseLastMoved = true;
}

function getScreenshot( callback ): void {
  iframe.contentWindow.phet.joist.display.foreignObjectRasterization( url => {
    callback( url );
  } );
}

function hash( str ): string {
  return new Hashes.MD5().hex( str );
}

let count = 0;
let loaded = false;
let received = true;

function handleFrame(): void {
  if ( loaded && received ) {
    count++;
    received = false;

    if ( random.nextDouble() < ( mouseLastMoved ? 0.7 : 0.4 ) ) {
      sendMouseToggleEvent();
    }
    else {
      sendMouseMoveEvent();
    }
    sendStep( random.nextDouble() * 0.5 + 0.016 );

    getScreenshot( screenshotURL => {
      const hashedScreenshotURL = hash( screenshotURL );
      console.log( count, hashedScreenshotURL );

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

        const descriptionUtteranceQueue = iframe.contentWindow.phet.joist.display.descriptionUtteranceQueue.queue;
        const utteranceTexts = descriptionUtteranceQueue.map( utteranceWrapper => utteranceWrapper.utterance.toString() );
        descriptionAlertData.utterances = utteranceTexts;
        const utterancesHash = hash( utteranceTexts + '' );
        descriptionAlertData.hash = utterancesHash;

        if ( iframe.contentWindow.phet.scenery.voicingUtteranceQueue ) {
          const voicingUtteranceQueue = iframe.contentWindow.phet.scenery.voicingUtteranceQueue.queue;
          const voicingUtteranceTexts = voicingUtteranceQueue.map( voicingUtteranceWrapper => voicingUtteranceWrapper.utterance.toString() );
          voicingResponseData.utterances = voicingUtteranceTexts;
          const voicingUtterancesHash = hash( voicingUtteranceTexts + '' );
          voicingResponseData.hash = voicingUtterancesHash;
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
    } );
  }
}

// Because of course direct calls to this go through this window object instead.
window.addEventListener( 'error', a => {
  console.log( 'local error' );
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
    console.log( 'ready' );

    // Don't allow popups
    iframe.contentWindow.open = function() {
      return {
        focus: _.noop,
        blur: _.noop
      };
    };
    // FileSaver don't allow popup
    iframe.contentWindow.saveAs = _.noop;

    // We need to create an object with the iframe's Object.prototype as its prototype to pass our assertion checks
    const contentOptions = iframe.contentWindow.Object.create( iframe.contentWindow.Object.prototype, {
      seed: {
        value: 2.3,
        enumerable: true
      }
    } );
    console.log( contentOptions );
    random = new iframe.contentWindow.phet.dot.Random( contentOptions );

    iframe.contentWindow.phet.joist.launchSimulation();
    iframe.contentWindow.phet.joist.display.interactive = false;

    data.id = options.id;
    window.parent && window.parent !== window && window.parent.postMessage( JSON.stringify( data ), '*' );
  }
  else if ( data.type === 'load' ) {
    console.log( 'loaded' );
    sendStep( 0.016 );
    loaded = true;
    data.id = options.id;
    window.parent && window.parent !== window && window.parent.postMessage( JSON.stringify( data ), '*' );
  }
  else if ( data.type === 'error' ) {
    console.log( 'error' );
    data.id = options.id;
    window.parent && window.parent !== window && window.parent.postMessage( JSON.stringify( data ), '*' );
  }
  else if ( data.type === 'frame' ) {
    console.log( 'next frame' );
    handleFrame();
  }
} );
