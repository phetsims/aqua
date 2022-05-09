// Copyright 2022, University of Colorado Boulder

/**
 * Snapshot comparison across multiple running ports
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

// TODO: allow linting (it's not finding common definitions)
/* eslint-disable */

import BooleanProperty from '../../axon/js/BooleanProperty.js';
import NumberProperty from '../../axon/js/NumberProperty.js';
import Property from '../../axon/js/Property.js';
import { Color, Display, Image, DOM, FireListener, FlowBox, Font, GridBackgroundNode, GridBox, GridCell, Node, Rectangle, Text } from '../../scenery/js/imports.js';

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

  const unreliableSims = [
    // NOTE: add sims here that are constantly failing
  ];

  const options = QueryStringMachine.getAll( {

    ports: {
      type: 'array',
      elementSchema: {
        type: 'number',
        isValidValue: Number.isInteger
      },
      defaultValue: [ 80, 8080 ],
      public: true
    },

    runnables: {
      type: 'array',
      elementSchema: { type: 'string' },
      defaultValue: activeRunnables
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
      defaultValue: 10
    },
    showTime: {
      type: 'boolean',
      defaultValue: true
    },
    compareDescription: {
      type: 'boolean',
      defaultValue: true
    }
  } );

  const childQueryParams =
    `simSeed=${encodeURIComponent( options.simSeed )
    }&simWidth=${encodeURIComponent( options.simWidth )
    }&simHeight=${encodeURIComponent( options.simHeight )
    }&simQueryParameters=${encodeURIComponent( options.simQueryParameters )
    }&numFrames=${encodeURIComponent( options.numFrames )
    }&compareDescription=${encodeURIComponent( options.compareDescription )}`;

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
    readonly frames: Frame[] = [];
    readonly frameCountProperty: Property<number>;
    readonly hashProperty: Property<string | null>;
    readonly hasErroredProperty: Property<boolean>;
    readonly isCompleteProperty: Property<boolean>;
    readonly column: Column;

    constructor( runnable: string, column: Column ) {
      this.runnable = runnable;
      this.column = column;
      this.frameCountProperty = new NumberProperty( 0 );
      this.hashProperty = new Property( null );
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

  class Column {

    readonly port: number;
    readonly index: number;
    readonly snapshots: Snapshot[];
    readonly iframe: HTMLIFrameElement;
    currentSnapshot: Snapshot | null;
    queue: Snapshot[];

    constructor( port: number, index: number ) {
      this.port = port;
      this.index = index;
      this.snapshots = options.runnables.map( runnable => new Snapshot( runnable, this ) );
      this.queue = this.snapshots.slice();

      this.iframe = document.createElement( 'iframe' );
      this.iframe.setAttribute( 'frameborder', '0' );
      this.iframe.setAttribute( 'seamless', '1' );
      this.iframe.setAttribute( 'width', options.simWidth );
      this.iframe.setAttribute( 'height', options.simHeight );
      this.iframe.style.position = 'absolute';
    }

    load( runnable ): void {
      this.currentSnapshot = this.getSnapshot( runnable );
      this.iframe.src = `http://localhost:${this.port}/aqua/html/take-snapshot.html?id=${this.index}&${childQueryParams}&url=${encodeURIComponent( `../../${runnable}/${runnable}_en.html` )}`;
    }

    getSnapshot( runnable: string ): Snapshot {
      return _.find( this.snapshots, snapshot => snapshot.runnable === runnable )!;
    }

    addFrame( frame: Frame ): void {
      this.currentSnapshot.addFrame( frame );
    }

    addHash( hash: string ): void {
      this.currentSnapshot.addHash( hash );
      this.nextRunnable();
    }

    addError(): void {
      this.currentSnapshot.addError();
      this.nextRunnable();
    }

    nextRunnable(): void {
      if ( this.queue.length ) {
        const snapshot = this.queue.shift();
        this.currentSnapshot = snapshot;

        this.load( snapshot.runnable );
      }
    }
  }

  const columns = options.ports.map( ( port, i ) => new Column( port, i ) );

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
  scene.addChild( new GridBackgroundNode( gridBox.constraint, {
    createCellBackground: ( cell: GridCell ) => {
      return Rectangle.bounds( cell.lastAvailableBounds, {
        fill: cell.position.vertical % 2 === 0 ? 'white' : '#eee'
      } );
    }
  } ) );
  scene.addChild( gridBox );

  let y = 0;

  columns.forEach( column => {
    gridBox.addChild( new Text( `Port ${column.port}`, {
      font: new Font( { size: 12, weight: 'bold' } ),
      layoutOptions: { x: column.index + 1, y: y, xAlign: 'center' }
    } ) );
  } );
  y++;

  columns.forEach( column => {
    gridBox.addChild( new DOM( column.iframe, {
      layoutOptions: { x: column.index + 1, y: y }
    } ) );
  } );
  y++;

  const runnableYMap = {};
  options.runnables.forEach( ( runnable, i ) => {
    runnableYMap[ runnable ] = y;

    const runnableText = new Text( runnable, {
      font: new Font( { size: 12 } ),
      layoutOptions: { x: 0, y: y },
      opacity: unreliableSims.includes( runnable ) ? 0.2 : 1
    } );
    gridBox.addChild( runnableText );

    Property.multilink( _.flatten( columns.map( column => {
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
            runnableText.fill = '#6f6';
          }
          else {
            runnableText.fill = '#f66';

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

                for ( let i = 0; i < firstFrames.length; i++ ) {
                  const frame = snapshots[ 0 ].frames[ i ];
                  const diffImages = [];

                  for ( let j = 1; j < snapshots.length; j++ ) {
                    const otherFrame = snapshots[ j ].frames[ i ];

                    const data = await compareImages( frame.screenshot.url, otherFrame.screenshot.url, options.simWidth, options.simHeight );

                    if ( data ) {
                      if ( diffImages.length === 0 ) {
                        diffImages.push( createImageNode( data.a ) );
                      }
                      diffImages.push( createImageNode( data.b ) );
                      diffImages.push( createImageNode( data.diff ) );
                    }
                  }

                  gridBox.addChild( new FlowBox( {
                    orientation: 'horizontal',
                    children: diffImages,
                    spacing: 5,
                    layoutOptions: { x: snapshots.length + 1, y: runnableYMap[ runnable ] }
                  } ) );
                }
              }
            } ) );
          }
        }
      }
      else {
        runnableText.fill = 'black';
      }
    } );

    columns.forEach( column => {
      const snapshot = column.snapshots[ i ];

      const hashText = new Text( '-', {
        font: new Font( { size: 10, family: 'Menlo, Consolas, Courier, monospace' } )
      } );
      snapshot.hashProperty.link( hash => {
        hashText.text = hash || '-';
      } );

      const frameText = new Text( '0', {
        font: new Font( { size: 12 } )
      } );
      snapshot.frameCountProperty.link( frameCount => {
        frameText.text = frameCount;
      } );
      snapshot.hasErroredProperty.link( hasErrored => {
        frameText.fill = hasErrored ? '#f00' : '#bbb';
      } );

      gridBox.addChild( new FlowBox( {
        orientation: 'horizontal',
        spacing: 20,
        children: [
          frameText, hashText
        ],
        layoutOptions: { x: column.index + 1, y: y, xAlign: 'center' }
      } ) );
    } );
    y++;
  } );

  window.addEventListener( 'message', evt => {
    if ( typeof evt.data !== 'string' ) {
      return;
    }

    const data = JSON.parse( evt.data );

    if ( data.type === 'frameEmitted' ) {
      // number, screenshot: { url, hash }
      const column = columns[ data.id ];
      column.addFrame( data );
    }
    else if ( data.type === 'snapshot' ) {
      // basically hash
      const column = columns[ data.id ];
      column.addHash( data.hash );
      // const sim = currentSim;
      // const snapshot = currentSnapshot;
      //
      // snapshot[ sim ].hash = data.hash;
      // const td = document.createElement( 'td' );
      // td.textContent = data.hash.slice( 0, 6 ) + ( options.showTime ? ` ${Date.now() - globalStartTime}` : '' );
      // if ( snapshots.length > 1 && data.hash !== snapshots[ snapshots.length - 2 ][ sim ].hash ) {
      //   td.style.fontWeight = 'bold';
      //   td.style.cursor = 'pointer';
      //   td.addEventListener( 'click', () => {
      //     const newFrames = snapshot[ sim ].frames;
      //     const oldFrames = snapshots[ snapshots.indexOf( snapshot ) - 1 ][ sim ].frames;
      //
      //     let nextIndex = 0;
      //
      //     function compareNextFrame() {
      //       const index = nextIndex++;
      //       if ( index < newFrames.length && index < oldFrames.length ) {
      //         const oldFrame = oldFrames[ index ];
      //         const newFrame = newFrames[ index ];
      //
      //         const dataFrameIndex = `Data Frame ${index}`;
      //
      //         // support comparing the next data frame after this frame's screenshots have loaded (only when different)
      //         let compareNextFrameCalledFromScreenshot = false;
      //
      //         // If this screenshot hash is different, then compare and display the difference in screenshots.
      //         if ( oldFrame.screenshot.hash !== newFrame.screenshot.hash ) {
      //           compareNextFrameCalledFromScreenshot = true;
      //           window.compareImages( oldFrames[ index ].screenshot.url, newFrames[ index ].screenshot.url,
      //             dataFrameIndex, options.simWidth, options.simHeight, comparisonDataDiv => {
      //               comparisonDataDiv && comparisonDiv.appendChild( comparisonDataDiv );
      //               compareNextFrame();
      //             } );
      //         }
      //
      //         // Compare description via PDOM html
      //         if ( options.compareDescription && oldFrame.pdom.hash !== newFrame.pdom.hash ) {
      //           comparePDOM( oldFrame.pdom.html, newFrame.pdom.html, dataFrameIndex );
      //
      //         }
      //         // Compare description utterances
      //         if ( options.compareDescription && oldFrame.descriptionAlert.hash !== newFrame.descriptionAlert.hash ) {
      //           compareDescriptionAlerts( oldFrame.descriptionAlert.utterances, newFrame.descriptionAlert.utterances, `${dataFrameIndex}, Description` );
      //         }
      //
      //         // Compare voicing utterances
      //         if ( options.compareDescription && oldFrame.voicing.hash !== newFrame.voicing.hash ) {
      //           compareDescriptionAlerts( oldFrame.voicing.utterances, newFrame.voicing.utterances, `${dataFrameIndex}, Voicing` );
      //         }
      //
      //         // Kick off the next iteration if we aren't waiting for images to load
      //         !compareNextFrameCalledFromScreenshot && compareNextFrame();
      //       }
      //     }
      //
      //     compareNextFrame();
      //   } );
      // }
    }
    else if ( data.type === 'error' ) {
      console.log( 'data' );
      const column = columns[ data.id ];
      column.addError();
    }
  } );

  // Kick off initial
  columns.forEach( column => column.nextRunnable() );

  display.updateOnRequestAnimationFrame( dt => {
    display.width = Math.ceil( Math.max( window.innerWidth, scene.right ) );
    display.height = Math.ceil( Math.max( window.innerHeight, scene.bottom ) );
  } );
} )();

// function setup( simNames ) {
//   const snapshots = [];
//   window.snapshots = snapshots; // For debugging etc.
//   let queue = [];
//   let currentSnapshot;
//   let currentSim;
//
//   const addBR = string => string + '<br/>';
//
//   function comparePDOM( oldHTML, newHTML, message ) {
//     const container = document.createElement( 'div' );
//     comparisonDiv.appendChild( container );
//
//     const diff = document.createElement( 'details' );
//     const summary = document.createElement( 'summary' );
//     summary.appendChild( document.createTextNode( `${message}: PDOMs different. Compare these two from webstorm diffing.` ) );
//     diff.appendChild( summary );
//     const diffGuts = document.createElement( 'div' );
//     const oldHTMLP = document.createElement( 'p' );
//     oldHTMLP.textContent = oldHTML;
//     const newHTMLP = document.createElement( 'p' );
//     newHTMLP.textContent = newHTML;
//     diffGuts.appendChild( oldHTMLP );
//     diffGuts.appendChild( newHTMLP );
//
//     diff.appendChild( diffGuts );
//     diffGuts.style.fontSize = '4px';
//
//     container.appendChild( diff );
//
//   }
//
//   function compareDescriptionAlerts( oldUtterances, newUtterances, message ) {
//
//     const onlyInOld = []; // Will hold all nodes that will be removed.
//     const onlyInNew = []; // Will hold all nodes that will be "new" children (added)
//
//     // Compute what things were added, removed, or stay.
//     window.arrayDifference( oldUtterances, newUtterances, onlyInOld, onlyInNew, [] );
//
//     const diff = document.createElement( 'details' );
//     const summary = document.createElement( 'summary' );
//     summary.appendChild( document.createTextNode( `${message}: Utterances different. ${oldUtterances.length} vs ${newUtterances.length} utterances` ) );
//     diff.appendChild( summary );
//     const diffGuts = document.createElement( 'div' );
//     diff.appendChild( diffGuts );
//     const oldHTMLP = document.createElement( 'p' );
//     oldHTMLP.innerHTML = `Only in old:<br/> ${onlyInOld.map( addBR )}`;
//     const newHTMLP = document.createElement( 'p' );
//     newHTMLP.innerHTML = `Only in new:<br/> ${onlyInNew.map( addBR )}`;
//     diffGuts.appendChild( oldHTMLP );
//     diffGuts.appendChild( newHTMLP );
//
//     comparisonDiv.appendChild( diff );
//
//   }
//
//   const snapshotButton = document.createElement( 'button' );
//   snapshotButton.textContent = 'Start Snapshot';
//   snapshotButton.style.display = 'block';
//   document.body.appendChild( snapshotButton );
//
//   const comparisonDiv = document.createElement( 'div' );
//   document.body.appendChild( comparisonDiv );
//
//   const rowMap = {};
//   const table = document.createElement( 'table' );
//   options.runnables.forEach( sim => {
//     const row = document.createElement( 'tr' );
//     rowMap[ sim ] = row;
//     table.appendChild( row );
//     const td = document.createElement( 'td' );
//     td.textContent = sim;
//     row.appendChild( td );
//   } );
//   document.body.appendChild( table );
//
//   function nextSim() {
//     if ( queue.length ) {
//       loadSim( queue.shift() );
//     }
//   }
//
//   let globalStartTime;
//
//   function snapshot() {
//     globalStartTime = Date.now();
//     currentSnapshot = {};
//     snapshots.push( currentSnapshot );
//     queue = queue.concat( options.runnables ); // TODO: this should likely clear and reset, but since currentSnapshot is reset, everything left in the queue will be appended to the new snapshot. https://github.com/phetrunnables/aqua/issues/126
//     nextSim();
//   }
//
//   snapshotButton.addEventListener( 'click', snapshot );
//