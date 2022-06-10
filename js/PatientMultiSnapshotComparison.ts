// Copyright 2022, University of Colorado Boulder
// eslint-disable-next-line bad-typescript-text
// @ts-nocheck
/**
 * Snapshot comparison across multiple running urls
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

// TODO: allow linting (it's not finding common definitions)
/* eslint-disable */

import Multilink from '../../axon/js/Multilink.js';
import Property from '../../axon/js/Property.js';
import { combineOptions } from '../../phet-core/js/optionize.js';
import PhetFont from '../../scenery-phet/js/PhetFont.js';
import { Color, Display, DOM, FireListener, FlowBox, FlowBoxOptions, GridBox, Image, Node, NodeOptions, Text } from '../../scenery/js/imports.js';

type Frame = {
  number: number;
  screenshot: {
    hash: string;
    url: string;
  };
};

( async () => {
  const options = QueryStringMachine.getAll( {

    runnable: {
      type: 'string',
      defaultValue: 'collision-lab'
    },

    // The URLs that point to the base git roots that can be browsed. A slash will be added after. Each one will be
    // represented by a column in the interface
    urls: {
      type: 'array',
      elementSchema: {
        type: 'string'
      },
      // Explicitly giving a port so that both are "cross-origin" (full-screen-enabled might be true on same-origin)
      defaultValue: [ 'http://localhost:80', 'http://localhost:8080' ],
      public: true
    },

    // Controls the random seed for comparison
    simSeed: {
      type: 'number',
      defaultValue: 4 // Ideal constant taken from https://xkcd.com/221/, DO NOT CHANGE, it's random!
    },

    // Passed to the simulation in addition to brand/ea
    simQueryParameters: {
      type: 'string',
      defaultValue: 'brand=phet&ea'
    },

    // Controls the size of the sims (can be used for higher resolution)
    simWidth: {
      type: 'number',
      defaultValue: 1024 / 4
    },
    simHeight: {
      type: 'number',
      defaultValue: 768 / 4
    }
  } );

  const childQueryParams =
    `simSeed=${encodeURIComponent( options.simSeed )
    }&simWidth=${encodeURIComponent( options.simWidth )
    }&simHeight=${encodeURIComponent( options.simHeight )
    }`;

  const loadImage = ( url: string ): Promise<HTMLImageElement> => {
    return new Promise<HTMLImageElement>( ( resolve, reject ) => {
      const image = document.createElement( 'img' );
      image.addEventListener( 'load', () => {
        resolve( image );
      } );
      image.src = url;
    } );
  };

  const createText = str => new Text( str, { font: new PhetFont( 12 ) } );

  // TODO: factor out somewhere
  function imageToContext( image, width, height ) {
    const canvas = document.createElement( 'canvas' );
    const context = canvas.getContext( '2d' );
    canvas.width = width;
    canvas.height = height;
    context.drawImage( image, 0, 0 );
    return context;
  }

  // TODO: factor out somewhere
  function contextToData( context, width, height ) {
    return context.getImageData( 0, 0, width, height );
  }

  // TODO: factor out somewhere
  function dataToCanvas( data, width, height ) {
    const canvas = document.createElement( 'canvas' );
    const context = canvas.getContext( '2d' );
    canvas.width = width;
    canvas.height = height;
    context.putImageData( data, 0, 0 );
    return canvas;
  }

  const compareImages = async ( urlA, urlB, width, height ): Promise<{ a: HTMLCanvasElement; b: HTMLCanvasElement; diff: HTMLCanvasElement; largestDifference: number; averageDifference: number } | null> => {
    const imageA = await loadImage( urlA );
    const imageB = await loadImage( urlB );

    const threshold = 0;
    const a = contextToData( imageToContext( imageA, width, height ), width, height );
    const b = contextToData( imageToContext( imageB, width, height ), width, height );

    let largestDifference = 0;
    let totalDifference = 0;
    const colorDiffData = document.createElement( 'canvas' ).getContext( '2d' ).createImageData( a.width, a.height );
    const alphaDiffData = document.createElement( 'canvas' ).getContext( '2d' ).createImageData( a.width, a.height );
    for ( let i = 0; i < a.data.length; i++ ) {
      const diff = Math.abs( a.data[ i ] - b.data[ i ] );
      if ( i % 4 === 3 ) {
        colorDiffData.data[ i ] = 255;
        alphaDiffData.data[ i ] = 255;
        alphaDiffData.data[ i - 3 ] = diff; // red
        alphaDiffData.data[ i - 2 ] = diff; // green
        alphaDiffData.data[ i - 1 ] = diff; // blue
      }
      else {
        colorDiffData.data[ i ] = diff;
      }
      const alphaIndex = ( i - ( i % 4 ) + 3 );
      // grab the associated alpha channel and multiply it times the diff
      const alphaMultipliedDiff = ( i % 4 === 3 ) ? diff : diff * ( a.data[ alphaIndex ] / 255 ) * ( b.data[ alphaIndex ] / 255 );

      totalDifference += alphaMultipliedDiff;
      // if ( alphaMultipliedDiff > threshold ) {
      // console.log( message + ': ' + Math.abs( a.data[i] - b.data[i] ) );
      largestDifference = Math.max( largestDifference, alphaMultipliedDiff );
      // isEqual = false;
      // break;
      // }
    }

    const averageDifference = totalDifference / ( 4 * a.width * a.height );

    if ( averageDifference > threshold ) {
      return {
        a: dataToCanvas( a, width, height ),
        b: dataToCanvas( b, width, height ),
        diff: dataToCanvas( colorDiffData, width, height ),
        largestDifference: largestDifference,
        averageDifference: averageDifference
      };
    }
    return null;
  };

  const createIframe = () => {
    const iframe = document.createElement( 'iframe' );
    iframe.setAttribute( 'frameborder', '0' );
    iframe.setAttribute( 'seamless', '1' );
    iframe.setAttribute( 'width', options.simWidth );
    iframe.setAttribute( 'height', options.simHeight );
    iframe.style.position = 'absolute';
    return iframe;
  };

  const scene = new Node();
  const display = new Display( scene, {
    width: 512,
    height: 512,
    backgroundColor: Color.TRANSPARENT,
    passiveEvents: true
  } );
  document.body.appendChild( display.domElement );
  display.initializeEvents();

  const iframe0 = createIframe();
  const iframe1 = createIframe();

  const gridBox = new GridBox( {
    spacing: 10,
    x: 10,
    y: 10,
    rows: [
      [
        createText( options.urls[ 0 ] ),
        createText( options.urls[ 1 ] )
      ],
      [
        new DOM( iframe0 ),
        new DOM( iframe1 )
      ]
    ]
  } );
  scene.addChild( gridBox );

  const simQueryParameters = encodeURIComponent( options.simQueryParameters );
  const url0 = encodeURIComponent( `${options.urls[ 0 ]}/${options.runnable}/${options.runnable}_en.html` );
  const url1 = encodeURIComponent( `${options.urls[ 1 ]}/${options.runnable}/${options.runnable}_en.html` );
  iframe0.src = `http://localhost/aqua/html/patient-snapshotter.html?id=${0}&${childQueryParams}&url=${url0}&simQueryParameters=${simQueryParameters}`;
  iframe1.src = `http://localhost:8080/aqua/html/patient-snapshotter.html?id=${1}&${childQueryParams}&url=${url1}&simQueryParameters=${simQueryParameters}`;

  const frame0LastProperty = new Property<Frame | null>( null );
  const frame1LastProperty = new Property<Frame | null>( null );

  const frame0Property = new Property<Frame | null>( null );
  const frame1Property = new Property<Frame | null>( null );

  const sendNextFrame0 = () => iframe0.contentWindow!.postMessage( JSON.stringify( { type: 'frame' } ), '*' );
  const sendNextFrame1 = () => iframe1.contentWindow!.postMessage( JSON.stringify( { type: 'frame' } ), '*' );

  Multilink.multilink( [ frame0Property, frame1Property ], async ( frame0, frame1 ) => {
    if ( frame0 !== null && frame1 !== null ) {
      if ( frame0.screenshot.hash === frame1.screenshot.hash ) {
        frame0LastProperty.value = frame0Property.value;
        frame1LastProperty.value = frame1Property.value;
        frame0Property.value = null;
        frame1Property.value = null;

        sendNextFrame0();
        sendNextFrame1();
      }
      else {
        const data = await compareImages( frame0.screenshot.url, frame1.screenshot.url, options.simWidth, options.simHeight );

        const createImageNode = ( label: string, targetImage: HTMLCanvasElement | HTMLImageElement, options?: NodeOptions ): Node => {
          const image = new Image( targetImage );
          image.cursor = 'pointer';
          image.addInputListener( new FireListener( {
            fire: () => navigator.clipboard?.writeText( targetImage instanceof HTMLCanvasElement ? targetImage.toDataURL() : targetImage.src )
          } ) );
          return new FlowBox( combineOptions<FlowBoxOptions>( {
            orientation: 'vertical',
            children: [
              createText( label ),
              image
            ]
          }, options  ) );
        };

        console.log( data );

        gridBox.addRow( [
          createImageNode( 'before', await loadImage( frame0LastProperty.value?.screenshot.url! ) ),
          createImageNode( 'before', await loadImage( frame1LastProperty.value?.screenshot.url! ) )
        ] );

        if ( data ) {
          gridBox.addRow( [
            createImageNode( 'after', data.a ),
            createImageNode( 'after', data.b ),
            createImageNode( 'difference', data.diff )
          ] );
        }
      }
    }
  } );

  window.addEventListener( 'message', evt => {
    if ( typeof evt.data !== 'string' ) {
      return;
    }

    const data = JSON.parse( evt.data );

    if ( data.type === 'frameEmitted' ) {
      // number, screenshot: { url, hash }
      console.log( data );
      if ( data.id === 0 ) {
        frame0Property.value = data;
      }
      else if ( data.id === 1 ) {
        frame1Property.value = data;
      }
    }
    else if ( data.type === 'error' ) {
      console.log( 'data' );
      console.log( data );
      // snapshotterMap.get( data.id )!.addError();

      gridBox.addChild( new Text( 'ERRORED', {
        layoutOptions: { column: data.id, row: 100 }
      } ) );
    }
    else if ( data.type === 'load' && typeof data.id === 'number' ) {
      if ( data.id === 0 ) {
        console.log( 'multi loaded 0' );
        sendNextFrame0();
      }
      else if ( data.id === 1 ) {
        console.log( 'multi loaded 1' );
        sendNextFrame1();
      }
    }
  } );

  display.updateOnRequestAnimationFrame( dt => {
    display.width = Math.ceil( Math.max( window.innerWidth, scene.right ) );
    display.height = Math.ceil( Math.max( window.innerHeight, scene.bottom ) );
  } );
} )();
