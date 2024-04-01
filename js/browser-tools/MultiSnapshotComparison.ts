// Copyright 2022-2024, University of Colorado Boulder
// eslint-disable-next-line bad-typescript-text
// @ts-nocheck
/**
 * Snapshot comparison across multiple running urls
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import Property from '../../../axon/js/Property.js';
import { Color, Display, DOM, FireListener, FlowBox, Font, GridBackgroundNode, GridBox, GridCell, HBox, Image, Node, Rectangle, Text } from '../../../scenery/js/imports.js';
import Emitter from '../../../axon/js/Emitter.js';

type Frame = {
  number: number;
  screenshot: {
    hash: string;
    url: string;
  };
};

type Row = {
  repo: string;
  brand: string;
};

( async () => { // eslint-disable-line @typescript-eslint/no-floating-promises

  window.assertions.enableAssert();

  const activeRunnablesResponse = await fetch( '../../perennial/data/active-runnables' );
  const activeRunnables = ( await activeRunnablesResponse.text() ).trim().replace( /\r/g, '' ).split( '\n' );

  const activePhetIOResponse = await fetch( '../../perennial/data/phet-io' );
  const activePhetIO = ( await activePhetIOResponse.text() ).trim().replace( /\r/g, '' ).split( '\n' );

  type Sim = string;
  const unreliableSims: Sim[] = [
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
      defaultValue: [ 'http://localhost', 'http://localhost:8080' ]
    },

    // If provided, a comma-separated list of repos to test (useful if you know some that are failing), e.g.
    // `?repos=acid-base-solutions,density`
    repos: {
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

    // Passed to the simulation in addition to brand
    simQueryParameters: {
      type: 'string',
      defaultValue: 'ea'
    },

    // How many frames should be snapshot per repo
    numFrames: {
      type: 'number',
      defaultValue: 10
    },

    testPhetio: {
      type: 'boolean',
      defaultValue: true
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
    },

    // Console logs about frame snapshot info, see take-snapshot.js
    logFrameInfo: {
      type: 'boolean',
      defaultValue: true
    }
  } );

  const childQueryParams =
    `simSeed=${encodeURIComponent( options.simSeed )
    }&simWidth=${encodeURIComponent( options.simWidth )
    }&simHeight=${encodeURIComponent( options.simHeight )
    }&numFrames=${encodeURIComponent( options.numFrames )
    }&logFrameInfo=${encodeURIComponent( options.logFrameInfo )
    }`;

  const rows: Row[] = _.flatten( options.repos.map( ( repo: string ) => {
    return [
      { repo: repo, brand: 'phet' },
      ...( options.testPhetio && activePhetIO.includes( repo ) ? [ { repo: repo, brand: 'phet-io' } ] : [] )
    ];
  } ) ).filter( ( item, i ) => i % options.stride === options.offset );

  const resetEmitter = new Emitter();
  window.resetEmitter = resetEmitter;

  class Snapshot {

    public readonly repo: string;
    public readonly brand: string;
    public readonly frames: Frame[] = [];
    public readonly frameCountProperty: Property<number>;
    public readonly hashProperty: Property<string | null>;
    public readonly hasErroredProperty: Property<boolean>;
    public readonly isCompleteProperty: Property<boolean>;
    private readonly column: Column;

    public constructor( repo: string, brand: string, column: Column ) {
      this.repo = repo;
      this.brand = brand;
      this.column = column;
      this.frameCountProperty = new NumberProperty( 0 );
      this.hashProperty = new Property<string | null>( null );
      this.hasErroredProperty = new BooleanProperty( false );
      this.isCompleteProperty = new BooleanProperty( false );
    }

    public addFrame( frame: Frame ): void {
      this.frames.push( frame );
      this.frameCountProperty.value++;
    }

    public addHash( hash: string ): void {
      this.hashProperty.value = hash;
      this.isCompleteProperty.value = true;
    }

    public addError(): void {
      this.hasErroredProperty.value = true;
      this.isCompleteProperty.value = true;
    }
  }

  const snapshotterMap = new Map<number, Snapshotter>();

  class Snapshotter {
    private readonly url: URL;
    private readonly index: number;
    public readonly iframe: HTMLIFrameElement;
    private currentSnapshot: Snapshot | null;
    private readonly nextRepo: ( snapshotter: Snapshotter ) => void;

    private receivedHash: string | null = null;


    public constructor( url: string, index: number, private readonly numFrames: number, nextRepo: ( snapshotter: Snapshotter ) => void ) {
      this.url = new URL( url );
      this.index = index;
      this.currentSnapshot = null;
      this.nextRepo = nextRepo;

      this.iframe = document.createElement( 'iframe' );
      this.iframe.setAttribute( 'frameborder', '0' );
      this.iframe.setAttribute( 'seamless', '1' );
      this.iframe.setAttribute( 'width', `${options.simWidth}` );
      this.iframe.setAttribute( 'height', `${options.simHeight}` );
      this.iframe.style.position = 'absolute';

      snapshotterMap.set( index, this );
    }

    // Add a single frame of the snapshot.
    public addFrame( frame: Frame ): void {
      this.currentSnapshot!.addFrame( frame );
      this.finishIfReady();
    }

    // Final hash of the whole snapshot.
    public addHash( hash: string ): void {
      this.receivedHash = hash;
      this.finishIfReady();
    }

    // We can't control the order of postMessage messages, so support either order for finishing.
    private finishIfReady(): void {
      if ( this.currentSnapshot?.frameCountProperty.value === this.numFrames && this.receivedHash ) {
        this.currentSnapshot.addHash( this.receivedHash );
        this.nextRepo( this );
      }
    }

    public addError(): void {
      this.currentSnapshot!.addError();
      this.nextRepo( this );
    }

    public load( snapshot: Snapshot ): void {
      console.log( 'loading:', snapshot.repo, snapshot.brand, this.url.origin );
      this.currentSnapshot = snapshot;
      this.receivedHash = null;

      const simQueryParameters = encodeURIComponent( ( snapshot.brand === 'phet-io' ? 'brand=phet-io&phetioStandalone' : 'brand=phet' ) + '&' + options.simQueryParameters );
      const url = encodeURIComponent( `../../${snapshot.repo}/${snapshot.repo}_en.html` );
      this.iframe.src = `${this.url.href}aqua/html/take-snapshot.html?id=${this.index}&${childQueryParams}&url=${url}&simQueryParameters=${simQueryParameters}`;
    }
  }

  class Column {
    public readonly url: string;
    public readonly index: number;
    public readonly snapshots: Snapshot[];
    private queue: Snapshot[];
    public readonly snapshotters: Snapshotter[];

    public constructor( url: string, index: number ) {
      this.url = url;
      this.index = index;
      this.snapshots = rows.map( row => new Snapshot( row.repo, row.brand, this ) );
      this.queue = this.snapshots.slice();
      this.snapshotters = _.range( 0, options.copies ).map( i => new Snapshotter( url, index + i * 100, options.numFrames, this.nextRepo.bind( this ) ) );
    }

    public getSnapshot( repo: string, brand: string ): Snapshot {
      return _.find( this.snapshots, snapshot => snapshot.repo === repo && snapshot.brand === brand )!;
    }

    public nextRepo( snapshotter: Snapshotter ): void {
      if ( this.queue.length ) {
        const snapshot = this.queue.shift()!;

        snapshotter.load( snapshot );
      }
    }

    public start(): void {
      this.snapshotters.forEach( snapshotter => this.nextRepo( snapshotter ) );
    }
  }

  const createCopiableImageNode = ( canvas: HTMLCanvasElement ): Node => {
    const image = new Image( canvas );
    image.cursor = 'pointer';
    image.addInputListener( new FireListener( {
      fire: () => window.navigator.clipboard?.writeText( canvas.toDataURL() )
    } ) );
    return image;
  };

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

  // Just to optimize startup conditions (just set children once)
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

  const repoYMap: Record<string, number> = {};
  rows.forEach( ( row, i ) => {
    const repo = row.repo;
    const brand = row.brand;
    const yMapKey = `${repo}${brand}`;
    repoYMap[ yMapKey ] = y;

    const repoText = new Text( repo + ( brand !== 'phet' ? ` (${brand})` : '' ), {
      font: new Font( { size: 12 } ),
      layoutOptions: { column: 0, row: y },
      opacity: unreliableSims.includes( repo ) ? 0.2 : 1
    } );
    gridChildren.push( repoText );

    Multilink.multilinkAny( _.flatten( columns.map( column => {
      const snapshot = column.getSnapshot( repo, brand );
      return [ snapshot.hasErroredProperty, snapshot.hashProperty, snapshot.isCompleteProperty ];
    } ) ), async () => {
      const snapshots = columns.map( column => column.getSnapshot( repo, brand ) );
      if ( _.every( snapshots, snapshot => snapshot.isCompleteProperty.value ) ) {
        if ( _.some( snapshots, snapshot => snapshot.hasErroredProperty.value ) ) {
          repoText.fill = 'magenta'; // an error occurred running the snapshots
        }
        else {
          // Not errored

          const hash = snapshots[ 0 ].hashProperty.value;
          repoText.fill = '#0b0'; // Good until proven otherwise

          // If hashes aren't equal
          if ( !_.every( snapshots, snapshot => snapshot.hashProperty.value === hash ) ) {

            // Even though the hashes aren't equal, the images may be identical (or close enough, see image-compare.js).
            const firstFrames = snapshots[ 0 ].frames;

            // Populated only with images that are actually different
            const allDiffImages = [];

            for ( let i = 0; i < firstFrames.length; i++ ) {
              const frame = snapshots[ 0 ].frames[ i ];

              for ( let j = 1; j < snapshots.length; j++ ) {
                const otherFrame = snapshots[ j ].frames[ i ];

                const data = await window.compareImages( frame.screenshot.url, otherFrame.screenshot.url, options.simWidth, options.simHeight );
                if ( data ) {
                  if ( allDiffImages.length === 0 ) {
                    allDiffImages.push( createCopiableImageNode( data.a ) );
                  }
                  allDiffImages.push( createCopiableImageNode( data.b ) );
                  allDiffImages.push( createCopiableImageNode( data.diff ) );
                }
              }
            }

            if ( allDiffImages.length > 0 ) {
              repoText.cursor = 'pointer';
              repoText.fill = '#b00';

              const resultsNode = new HBox( {
                spacing: 5,
                children: allDiffImages,
                visible: false,
                layoutOptions: { column: snapshots.length + 1, row: repoYMap[ yMapKey ], xAlign: 'left' }
              } );
              gridChildren.push( resultsNode );
              gridBox.children = gridChildren;

              let expanded = false;
              repoText.addInputListener( new FireListener( {
                fire: async () => {
                  expanded = !expanded;
                  resultsNode.visible = expanded;
                }
              } ) );
            }
          }
        }
      }
      else {
        repoText.fill = 'black';
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