// Copyright 2022-2023, University of Colorado Boulder
// eslint-disable-next-line bad-typescript-text
// @ts-nocheck
/**
 * Snapshot comparison across multiple running urls
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

// TODO: allow linting (it's not finding common definitions)
/* eslint-disable */

import BooleanProperty from '../../axon/js/BooleanProperty.js';
import Multilink from '../../axon/js/Multilink.js';
import NumberProperty from '../../axon/js/NumberProperty.js';
import Property from '../../axon/js/Property.js';
import { Color, Display, DOM, FireListener, FlowBox, Font, GridBackgroundNode, GridBox, GridCell, Image, Node, Rectangle, Text } from '../../scenery/js/imports.js';

type Frame = {
  number: number;
  screenshot: {
    hash: string;
    url: string;
  };
};

( async () => {
  const activeRunnablesResponse = await fetch( '../../perennial/data/active-runnables' );
  const activeRunnables = ( await activeRunnablesResponse.text() ).trim().replace( /\r/g, '' ).split( '\n' );

  const activePhetIOResponse = await fetch( '../../perennial/data/phet-io' );
  const activePhetIO = ( await activePhetIOResponse.text() ).trim().replace( /\r/g, '' ).split( '\n' );

  const unreliableSims = [
    // NOTE: add sims here that are constantly failing
  ];

  const options = QueryStringMachine.getAll( {

    // The URLs that point to the base git roots that can be browsed. A slash will be added after. Each one will be
    // represented by a column in the interface
    urls: {
      type: 'array',
      elementSchema: {
        type: 'string'
      },
      defaultValue: [ 'http://localhost', 'http://localhost:8080' ],
      public: true
    },

    // If provided, a comma-separated list of runnables to test (useful if you know some that are failing), e.g.
    // `?runnables=acid-base-solutions,density`
    runnables: {
      type: 'array',
      elementSchema: { type: 'string' },
      defaultValue: activeRunnables
    },

    // Controls the random seed for comparison
    simSeed: {
      type: 'number',
      defaultValue: 4 // Ideal constant taken from https://xkcd.com/221/, DO NOT CHANGE, it's random!
    },

    // Controls the size of the sims (can be used for higher resolution)
    simWidth: {
      type: 'number',
      defaultValue: 1024 / 4
    },
    simHeight: {
      type: 'number',
      defaultValue: 768 / 4
    },

    // Passed to the simulation in addition to brand/ea
    additionalSimQueryParameters: {
      type: 'string',
      defaultValue: ''
    },

    // How many frames should be snapshot per runnable
    numFrames: {
      type: 'number',
      defaultValue: 10
    },

    // How many iframes to devote per each column
    copies: {
      type: 'number',
      defaultValue: 1
    },

    // This running instance will only test every `stride` number of rows. Useful to test across multiple browser
    // windows for performance (e.g. 1: ?stride=3&offset=0 2: ?stride=3&offset=1 2: ?stride=3&offset=2).
    stride: {
      type: 'number',
      defaultValue: 1
    },
    // The offset to apply when stride is active, see above.
    offset: {
      type: 'number',
      defaultValue: 0
    }
  } );

  const childQueryParams =
    `simSeed=${encodeURIComponent( options.simSeed )
    }&simWidth=${encodeURIComponent( options.simWidth )
    }&simHeight=${encodeURIComponent( options.simHeight )
    }&numFrames=${encodeURIComponent( options.numFrames )
    }`;

  const rows: { runnable: string, brand: string }[] = _.flatten( options.runnables.map( ( runnable: string ) => {
    return [
      { runnable: runnable, brand: 'phet' },
      ...( activePhetIO.includes( runnable ) ? [ { runnable: runnable, brand: 'phet-io' } ] : [] )
    ];
  } ) ).filter( ( item, i ) => i % options.stride === options.offset );

  const loadImage = ( url: string ): Promise<HTMLImageElement> => {
    return new Promise<HTMLImageElement>( ( resolve, reject ) => {
      const image = document.createElement( 'img' );
      image.addEventListener( 'load', () => {
        resolve( image );
      } );
      image.src = url;
    } );
  };

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

  class Snapshot {

    readonly runnable: string;
    readonly brand: string;
    readonly frames: Frame[] = [];
    readonly frameCountProperty: Property<number>;
    readonly hashProperty: Property<string | null>;
    readonly hasErroredProperty: Property<boolean>;
    readonly isCompleteProperty: Property<boolean>;
    readonly column: Column;

    constructor( runnable: string, brand: string, column: Column ) {
      this.runnable = runnable;
      this.brand = brand;
      this.column = column;
      this.frameCountProperty = new NumberProperty( 0 );
      this.hashProperty = new Property<string | null >( null );
      this.hasErroredProperty = new BooleanProperty( false );
      this.isCompleteProperty = new BooleanProperty( false );
    }

    addFrame( frame: Frame ): void {
      this.frames.push( frame );
      this.frameCountProperty.value++;
    }

    addHash( hash: string ): void {
      this.hashProperty.value = hash;
      this.isCompleteProperty.value = true;
    }

    addError(): void {
      this.hasErroredProperty.value = true;
      this.isCompleteProperty.value = true;
    }
  }

  const snapshotterMap = new Map<number, Snapshotter>();

  class Snapshotter {
    readonly url: string;
    readonly index: number;
    readonly iframe: HTMLIFrameElement;
    currentSnapshot: Snapshot | null;
    readonly nextRunnable: ( snapshotter: Snapshotter ) => void;

    constructor( url: string, index: number, nextRunnable: ( snapshotter: Snapshotter ) => void ) {
      this.url = url;
      this.index = index;
      this.currentSnapshot = null;
      this.nextRunnable = nextRunnable;

      this.iframe = document.createElement( 'iframe' );
      this.iframe.setAttribute( 'frameborder', '0' );
      this.iframe.setAttribute( 'seamless', '1' );
      this.iframe.setAttribute( 'width', options.simWidth );
      this.iframe.setAttribute( 'height', options.simHeight );
      this.iframe.style.position = 'absolute';

      snapshotterMap.set( index, this );
    }

    addFrame( frame: Frame ): void {
      this.currentSnapshot!.addFrame( frame );
    }

    addHash( hash: string ): void {
      this.currentSnapshot!.addHash( hash );
      this.nextRunnable( this );
    }

    addError(): void {
      this.currentSnapshot!.addError();
      this.nextRunnable( this );
    }

    load( snapshot: Snapshot ): void {
      this.currentSnapshot = snapshot;

      const simQueryParameters = encodeURIComponent( ( snapshot.brand === 'phet-io' ? 'brand=phet-io&ea&phetioStandalone' : 'brand=phet&ea' ) + options.additionalSimQueryParameters );
      const url = encodeURIComponent( `../../${snapshot.runnable}/${snapshot.runnable}_en.html` );
      this.iframe.src = `${this.url}/aqua/html/take-snapshot.html?id=${this.index}&${childQueryParams}&url=${url}&simQueryParameters=${simQueryParameters}`;
    }
  }

  class Column {
    readonly url: string;
    readonly index: number;
    readonly snapshots: Snapshot[];
    queue: Snapshot[];
    readonly snapshotters: Snapshotter[];

    constructor( url: string, index: number ) {
      this.url = url;
      this.index = index;
      this.snapshots = rows.map( row => new Snapshot( row.runnable, row.brand, this ) );
      this.queue = this.snapshots.slice();
      this.snapshotters = _.range( 0, options.copies ).map( i => new Snapshotter( url, index + i * 100, this.nextRunnable.bind( this ) ) );
    }

    getSnapshot( runnable: string ): Snapshot {
      return _.find( this.snapshots, snapshot => snapshot.runnable === runnable )!;
    }

    nextRunnable( snapshotter: Snapshotter ): void {
      if ( this.queue.length ) {
        const snapshot = this.queue.shift()!;

        snapshotter.load( snapshot );
      }
    }

    start(): void {
      this.snapshotters.forEach( snapshotter => this.nextRunnable( snapshotter ) );
    }
  }

  const columns: Column[] = options.urls.map( ( url, i ) => new Column( url, i ) );

  const scene = new Node();
  const display = new Display( scene, {
    width: 512,
    height: 512,
    backgroundColor: Color.TRANSPARENT,
    passiveEvents: true
  } );
  document.body.appendChild( display.domElement );
  display.initializeEvents();

  const gridBox = new GridBox( {
    xAlign: 'left',
    margin: 2
  } );
  const gridChildren: Node[] = [];
  scene.addChild( new GridBackgroundNode( gridBox.constraint, {
    createCellBackground: ( cell: GridCell ) => {
      return Rectangle.bounds( cell.lastAvailableBounds, {
        fill: cell.position.vertical % 2 === 0 ? 'white' : '#eee'
      } );
    }
  } ) );
  scene.addChild( gridBox );

  let y = 0;

  columns.forEach( ( column, i ) => {
    gridChildren.push( new Text( `${column.url}`, {
      font: new Font( { size: 12, weight: 'bold' } ),
      layoutOptions: { column: i + 1, row: y, xAlign: 'center' }
    } ) );
  } );
  y++;

  columns.forEach( ( column, i ) => {
    column.snapshotters.forEach( ( snapshotter, j ) => {
      gridChildren.push( new DOM( snapshotter.iframe, {
        layoutOptions: { column: i + 1, row: y + j }
      } ) );
    } );
  } );
  y += options.copies;

  const runnableYMap = {};
  rows.forEach( ( row, i ) => {
    const runnable = row.runnable;
    const brand = row.brand;
    runnableYMap[ runnable ] = y;

    const runnableText = new Text( runnable + ( brand !== 'phet' ? ` (${brand})` : '' ), {
      font: new Font( { size: 12 } ),
      layoutOptions: { column: 0, row: y },
      opacity: unreliableSims.includes( runnable ) ? 0.2 : 1
    } );
    gridChildren.push( runnableText );

    Multilink.multilink( _.flatten( columns.map( column => {
      const snapshot = column.getSnapshot( runnable );
      return [ snapshot.hasErroredProperty, snapshot.hashProperty, snapshot.isCompleteProperty ];
    } ) ), () => {
      const snapshots = columns.map( column => column.getSnapshot( runnable ) );
      if ( _.every( snapshots, snapshot => snapshot.isCompleteProperty.value ) ) {
        if ( _.some( snapshots, snapshot => snapshot.hasErroredProperty.value ) ) {
          runnableText.fill = 'magenta';
        }
        else {
          const hash = snapshots[ 0 ].hashProperty.value;
          if ( _.every( snapshots, snapshot => snapshot.hashProperty.value === hash ) ) {
            runnableText.fill = '#0b0';
          }
          else {
            runnableText.fill = '#b00';

            runnableText.cursor = 'pointer';
            runnableText.addInputListener( new FireListener( {
              fire: async () => {
                const firstFrames = snapshots[ 0 ].frames;

                const createImageNode = ( canvas: HTMLCanvasElement ): Node => {
                  const image = new Image( canvas );
                  image.cursor = 'pointer';
                  image.addInputListener( new FireListener( {
                    fire: () => navigator.clipboard?.writeText( canvas.toDataURL() )
                  } ) );
                  return image;
                };

                let index = 0;
                for ( let i = 0; i < firstFrames.length; i++ ) {
                  const frame = snapshots[ 0 ].frames[ i ];
                  const diffImages = [];

                  for ( let j = 1; j < snapshots.length; j++ ) {
                    const otherFrame = snapshots[ j ].frames[ i ];

                    const data = await compareImages( frame.screenshot.url, otherFrame.screenshot.url, options.simWidth, options.simHeight );

                    console.log( data );
                    if ( data ) {
                      if ( diffImages.length === 0 ) {
                        diffImages.push( createImageNode( data.a ) );
                      }
                      diffImages.push( createImageNode( data.b ) );
                      diffImages.push( createImageNode( data.diff ) );
                    }
                  }

                  gridChildren.push( new FlowBox( {
                    orientation: 'horizontal',
                    children: diffImages,
                    spacing: 5,
                    layoutOptions: { column: snapshots.length + 1 + index++, row: runnableYMap[ runnable ], xAlign: 'left' }
                  } ) );
                }
                gridBox.children = gridChildren;
              }
            } ) );
          }
        }
      }
      else {
        runnableText.fill = 'black';
      }
    } );

    columns.forEach( ( column, j ) => {
      const snapshot = column.snapshots[ i ];

      const hashText = new Text( '-', {
        font: new Font( { size: 10, family: 'Menlo, Consolas, Courier, monospace' } )
      } );
      snapshot.hashProperty.link( hash => {
        hashText.string = hash || '-';
      } );

      const frameText = new Text( '0', {
        font: new Font( { size: 12 } )
      } );
      snapshot.frameCountProperty.link( frameCount => {
        frameText.string = frameCount;
      } );
      snapshot.hasErroredProperty.link( hasErrored => {
        frameText.fill = hasErrored ? '#f00' : '#bbb';
      } );

      gridChildren.push( new FlowBox( {
        orientation: 'horizontal',
        spacing: 20,
        children: [
          frameText, hashText
        ],
        layoutOptions: { column: j + 1, row: y, xAlign: 'center' }
      } ) );
    } );
    y++;
  } );

  gridBox.children = gridChildren;

  window.addEventListener( 'message', evt => {
    if ( typeof evt.data !== 'string' ) {
      return;
    }

    const data = JSON.parse( evt.data );

    if ( data.type === 'frameEmitted' ) {
      // number, screenshot: { url, hash }
      snapshotterMap.get( data.id )!.addFrame( data );
    }
    else if ( data.type === 'snapshot' ) {
      // basically hash
      snapshotterMap.get( data.id )!.addHash( data.hash );
    }
    else if ( data.type === 'error' ) {
      console.log( 'data' );
      snapshotterMap.get( data.id )!.addError();
    }
  } );

  // Kick off initial
  columns.forEach( column => column.start() );

  display.updateOnRequestAnimationFrame( dt => {
    display.width = Math.ceil( Math.max( window.innerWidth, scene.right ) );
    display.height = Math.ceil( Math.max( window.innerHeight, scene.bottom ) );
  } );
} )();
