// Copyright 2020-2025, University of Colorado Boulder

/**
 * Displays a self-updating report of continuous test results.
 *
 * @author Jonathan Olson (PhET Interactive Simulations)
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import EnumerationDeprecatedProperty from '../../../axon/js/EnumerationDeprecatedProperty.js';
import Multilink from '../../../axon/js/Multilink.js';
import Property from '../../../axon/js/Property.js';
import Utils from '../../../dot/js/Utils.js';
import EnumerationDeprecated from '../../../phet-core/js/EnumerationDeprecated.js';
import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import Display from '../../../scenery/js/display/Display.js';
import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import VBox from '../../../scenery/js/layout/nodes/VBox.js';
import FireListener from '../../../scenery/js/listeners/FireListener.js';
import DOM from '../../../scenery/js/nodes/DOM.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import TextPushButton from '../../../sun/js/buttons/TextPushButton.js';
import Checkbox from '../../../sun/js/Checkbox.js';
import VerticalAquaRadioButtonGroup from '../../../sun/js/VerticalAquaRadioButtonGroup.js';
import constants from './constants.js';
import { default as popup, popupIframeProperty } from './popup.js';
import quickNode from './quickNode.js';
import request from './request.js';
import sleep from './sleep.js';
import { default as statusProperty, lastErrorProperty, startupTimestampProperty } from './statusProperty.js';

// window.assertions.enableAssert();

const options = QueryStringMachine.getAll( {

  // How many columns of report data to load (newest first)
  maxColumns: {
    type: 'number',
    defaultValue: -1 // when -1, will show all columns
  },

  // Initial population of the filter text input.
  filterString: {
    type: 'string',
    defaultValue: ''
  },

  // If false, only load CTQ data.
  full: {
    type: 'boolean',
    defaultValue: true
  }
} );

// If the filter word starts with this character, then it is treated as a "should not contain this word" filter
const NOT_PREFIX = '!';

const rootNode = new Node();
const display = new Display( rootNode, {
  passiveEvents: true
} );

document.body.appendChild( display.domElement );

const backgroundNode = new Rectangle( {
  fill: 'white'
} );
rootNode.addChild( backgroundNode );

let contentNode;

if ( options.full ) {

  statusProperty.lazyLink( status => console.log( `Status: ${status}` ) );

  // {Property.<Object|null>}
  const reportProperty = new Property( {
    snapshots: [], // latest snapshots first
    testNames: [],
    testAverageTimes: [],
    testWeights: []
  } );

  window.reportProperty = reportProperty;

  // Report loop
  ( async () => {

    while ( true ) {
      const result = await request( '/aquaserver/report' );
      if ( result ) {
        reportProperty.value = result;
      }
      await sleep( 20000 );
    }
  } )();

  // {Property.<Array.<string>>} - Which repos to expand!
  const expandedReposProperty = new Property( [] );

  // {Property.<string>}
  const filterStringProperty = new Property( options.filterString );

  const Sort = EnumerationDeprecated.byKeys( [ 'ALPHABETICAL', 'IMPORTANCE', 'AVERAGE_TIME', 'WEIGHT' ] );

  // {Property.<Sort>}
  const sortProperty = new EnumerationDeprecatedProperty( Sort, Sort.ALPHABETICAL );

  // Property.<boolean>}
  const showAverageTimeProperty = new BooleanProperty( false );
  const showWeightsProperty = new BooleanProperty( false );

  const statusNode = new Text( '', {
    font: constants.interfaceFont,
    cursor: 'pointer'
  } );
  Multilink.multilink( [ statusProperty, startupTimestampProperty, lastErrorProperty ], ( status, startupTimestamp, lastError ) => {
    if ( startupTimestamp ) {
      statusNode.string = `${lastError.length ? '[ERR] ' : ''}Running since [${new Date( startupTimestamp ).toLocaleString()}], status: ${status}`;
    }
    else {
      statusNode.string = `${lastError.length ? '[ERR] ' : ''}status: ${status}`;
    }
  } );
  statusNode.addInputListener( new FireListener( {
    fire: () => {
      if ( lastErrorProperty.value.length ) {
        popup( statusNode, lastErrorProperty.value );
      }
    }
  } ) );

  const reportNode = new Node();

  const filterElement = document.createElement( 'input' );
  filterElement.type = 'text';
  filterElement.value = filterStringProperty.value; // initial value from options

  filterElement.addEventListener( 'change', () => {
    filterStringProperty.value = filterElement.value;
  } );

  const filterNode = new HBox( {
    spacing: 5,
    children: [
      new Text( 'Filter:', { font: constants.interfaceFont } ),
      new DOM( filterElement, { allowInput: true } )
    ]
  } );

  const sortNode = new VBox( {
    spacing: 5,
    children: [
      new Text( 'Sort', { font: constants.categoryFont } ),
      new VerticalAquaRadioButtonGroup( sortProperty, [
        {
          value: Sort.ALPHABETICAL,
          createNode: () => new Text( 'Alphabetical', { font: constants.interfaceFont } )
        },
        {
          value: Sort.IMPORTANCE,
          createNode: () => new Text( 'Importance', { font: constants.interfaceFont } )
        },
        {
          value: Sort.AVERAGE_TIME,
          createNode: () => new Text( 'Average Time', { font: constants.interfaceFont } )
        },
        {
          value: Sort.WEIGHT,
          createNode: () => new Text( 'Weight', { font: constants.interfaceFont } )
        }
      ], {
        spacing: 5
      } )
    ]
  } );

  const expansionNode = new VBox( {
    spacing: 5,
    children: [
      new Text( 'Expansion', { font: constants.categoryFont } ),
      new TextPushButton( 'Expand all', {
        listener: () => {
          expandedReposProperty.value = _.uniq( reportProperty.value.testNames.map( names => names[ 0 ] ) );
        },
        baseColor: constants.buttonBaseColor
      } ),
      new TextPushButton( 'Collapse all', {
        listener: () => {
          expandedReposProperty.value = [];
        },
        baseColor: constants.buttonBaseColor
      } )
    ]
  } );

  const optionsNode = new VBox( {
    spacing: 5,
    children: [
      new Text( 'Options', { font: constants.categoryFont } ),
      new VBox( {
        align: 'left',
        spacing: 5,
        children: [
          new Checkbox( showAverageTimeProperty, new Text( 'Show average time', { font: constants.interfaceFont } ), {
            boxWidth: 14
          } ),
          new Checkbox( showWeightsProperty, new Text( 'Show weight', { font: constants.interfaceFont } ), {
            boxWidth: 14
          } )
        ]
      } )
    ]
  } );

  const filteringNode = new VBox( {
    spacing: 5,
    children: [
      new Text( 'Filtering', { font: constants.categoryFont } ),
      filterNode,
      new Text( '(tab out to finalize)', { font: constants.interfaceFont } )
    ]
  } );

  Multilink.multilink( [ reportProperty, expandedReposProperty, sortProperty, filterStringProperty, showAverageTimeProperty, showWeightsProperty ],
    ( report, expandedRepos, sort, filterString, showAverageTime, showWeights ) => {
      let tests = [];

      let snapshots = report.snapshots || [];
      if ( options.maxColumns !== -1 ) {
        snapshots = snapshots.filter( ( snapshot, index ) => index < options.maxColumns );
      }

      const everythingName = '(everything)';

      tests.push( {
        names: [ everythingName ],
        indices: _.range( 0, report.testNames.length ),
        averageTimes: report.testAverageTimes,
        weights: report.testWeights
      } );

      // scan to determine what tests we are showing
      report.testNames.forEach( ( names, index ) => {
        if ( !expandedRepos.includes( names[ 0 ] ) ) {
          const lastTest = tests[ tests.length - 1 ];
          if ( lastTest && lastTest.names[ 0 ] === names[ 0 ] ) {
            lastTest.indices.push( index );
            lastTest.averageTimes.push( report.testAverageTimes[ index ] );
            lastTest.weights.push( report.testWeights[ index ] );
          }
          else {
            tests.push( {
              names: [ names[ 0 ] ],
              indices: [ index ],
              averageTimes: [ report.testAverageTimes[ index ] ],
              weights: [ report.testWeights[ index ] ]
            } );
          }
        }
        else {
          tests.push( {
            names: names,
            indices: [ index ],
            averageTimes: [ report.testAverageTimes[ index ] ],
            weights: [ report.testWeights[ index ] ]
          } );
        }
      } );

      // compute summations
      tests.forEach( test => {
        test.averageTime = _.mean( test.averageTimes.filter( _.identity ) ) || 0;
        test.minWeight = _.min( test.weights ) || 0;
        test.maxWeight = _.max( test.weights ) || 0;
      } );

      if ( filterString.length ) {
        // Spaces separate multiple search terms

        // Support filter terms that allow filtering out and  filtering in.
        const shouldBeIncluded = ( filterPart, toFilter ) => {
          if ( filterPart.startsWith( NOT_PREFIX ) ) {
            return !toFilter.includes( filterPart.slice( NOT_PREFIX.length ) );
          }
          return toFilter.includes( filterPart );
        };

        filterString.split( ' ' ).forEach( filterPart => {
          tests = tests.filter( test => {
            const matchesTest = _.some( test.names, name => shouldBeIncluded( filterPart, name ) );

            const matchesErrorMessage = _.some( snapshots, snapshot => _.some( test.indices, index => {
              return snapshot.tests[ index ].m && _.some( snapshot.tests[ index ].m, message => shouldBeIncluded( filterPart, message ) );
            } ) );
            return matchesTest || matchesErrorMessage;
          } );
        } );
      }

      if ( sort === Sort.IMPORTANCE ) {
        tests = _.sortBy( tests, test => {
          const failIndex = _.findIndex( snapshots, snapshot => _.some( test.indices, index => snapshot.tests[ index ].n ) );
          const passIndex = _.findIndex( snapshots, snapshot => _.some( test.indices, index => snapshot.tests[ index ].y ) );
          if ( failIndex >= 0 ) {
            return failIndex;
          }
          else if ( passIndex >= 0 ) {
            return passIndex + 1000;
          }
          else {
            return 10000;
          }
        } );
      }
      else if ( sort === Sort.AVERAGE_TIME ) {
        tests = _.sortBy( tests, test => -test.averageTime );
      }
      else if ( sort === Sort.WEIGHT ) {
        tests = _.sortBy( tests, test => -test.maxWeight );
      }

      const testLabels = tests.map( test => {
        const label = new Text( test.names.join( ' : ' ), {
          font: constants.interfaceFont,
          left: 0,
          top: 0
        } );
        const background = new Rectangle( 0, 0, 0, 0, {
          fill: '#fafafa',
          children: [ label ],
          cursor: 'pointer'
        } );
        if ( test.names[ 0 ] === everythingName ) {
          label.fill = '#999';
        }
        background.addInputListener( new FireListener( {
          fire: () => {
            const topLevelName = test.names[ 0 ];
            if ( test.names.length > 1 ) {
              expandedReposProperty.value = expandedReposProperty.value.filter( name => name !== topLevelName );
            }
            else {
              expandedReposProperty.value = _.uniq( [ ...expandedReposProperty.value, topLevelName ] );
            }
          }
        } ) );
        return background;
      } );

      const averageTimeLabels = showAverageTime ? tests.map( test => {

        const background = new Rectangle( 0, 0, 0, 0, {
          fill: '#fafafa'
        } );

        if ( test.averageTime ) {
          const tenthsOfSeconds = Math.ceil( test.averageTime / 100 );
          const label = new Text( `${Math.floor( tenthsOfSeconds / 10 )}.${tenthsOfSeconds % 10}s`, {
            font: new PhetFont( { size: 10 } ),
            left: 0,
            top: 0,
            fill: '#888'
          } );
          background.addChild( label );
        }

        return background;
      } ) : null;

      const weightLabels = showWeights ? tests.map( test => {

        const background = new Rectangle( 0, 0, 0, 0, {
          fill: '#fafafa'
        } );

        if ( test.minWeight || test.maxWeight ) {
          const label = new Text( test.minWeight === test.maxWeight ? test.minWeight : `${test.minWeight}-${test.maxWeight}`, {
            font: new PhetFont( { size: 10 } ),
            left: 0,
            top: 0,
            fill: '#888'
          } );
          background.addChild( label );
        }

        return background;
      } ) : null;

      const padding = 3;

      const snapshotLabels = snapshots.map( ( snapshot, index ) => {
        const totalTestCount = snapshot.tests.length;
        const completedTestCount = snapshot.tests.filter( x => x.y || x.n ).length;
        const failedTestCount = snapshot.tests.filter( x => x.n > 0 ).length;

        const textOptions = { font: new PhetFont( { size: 10 } ) };

        const label = new VBox( {
          spacing: 2,
          children: [
            ...new Date( snapshot.timestamp ).toLocaleString().replace( ',', '' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' ).split( ' ' ).map( str => new Text( str, textOptions ) ),
            new Text( `${Utils.roundSymmetric( completedTestCount / totalTestCount * 100 )}%`, textOptions )
          ],
          cursor: 'pointer'
        } );
        label.addInputListener( new FireListener( {
          fire: () => {
            let diffString = '';

            const previousSnapshot = snapshots[ index + 1 ];
            if ( previousSnapshot ) {
              diffString = _.uniq( Object.keys( snapshot.shas ).concat( Object.keys( previousSnapshot.shas ) ) ).sort().filter( repo => {
                return snapshot.shas[ repo ] !== previousSnapshot.shas[ repo ];
              } ).map( repo => `${repo}: ${previousSnapshot.shas[ repo ]} => ${snapshot.shas[ repo ]}` ).join( '\n' );
            }

            const completedTests = `${completedTestCount} / ${totalTestCount} Tests Completed`;
            const failedTests = `${failedTestCount} Tests Failed`;
            const shas = JSON.stringify( snapshot.shas, null, 2 );
            popup( label, `${snapshot.timestamp}\n\n${completedTests}\n${failedTests}\n\n${diffString}\n\n${shas}` );
            popup( label, `${snapshot.timestamp}\n\n${completedTests}\n${failedTests}\n\n${diffString}\n\n${shas}` );
          }
        } ) );
        return label;
      } );

      const maxTestLabelWidth = _.max( testLabels.map( node => node.width ) );
      const maxTestLabelHeight = _.max( testLabels.map( node => node.height ) );
      const maxSnapshotLabelWidth = _.max( snapshotLabels.map( node => node.width ) );
      const maxSnapshotLabelHeight = _.max( snapshotLabels.map( node => node.height ) );
      const maxAverageTimeLabelWidth = averageTimeLabels ? _.max( averageTimeLabels.map( node => node.width ) ) : 0;
      const maxWeightLabelWidth = weightLabels ? _.max( weightLabels.map( node => node.width ) ) : 0;

      testLabels.forEach( label => {
        label.rectWidth = maxTestLabelWidth;
        label.rectHeight = maxTestLabelHeight;
      } );
      averageTimeLabels && averageTimeLabels.forEach( label => {
        if ( label.children[ 0 ] ) {
          label.children[ 0 ].right = maxAverageTimeLabelWidth;
          label.children[ 0 ].centerY = maxTestLabelHeight / 2;
        }
        label.rectWidth = maxAverageTimeLabelWidth;
        label.rectHeight = maxTestLabelHeight;
      } );
      weightLabels && weightLabels.forEach( label => {
        if ( label.children[ 0 ] ) {
          label.children[ 0 ].right = maxWeightLabelWidth;
          label.children[ 0 ].centerY = maxTestLabelHeight / 2;
        }
        label.rectWidth = maxWeightLabelWidth;
        label.rectHeight = maxTestLabelHeight;
      } );

      const getX = index => maxTestLabelWidth + padding + index * ( maxSnapshotLabelWidth + padding ) + ( showAverageTime ? 1 : 0 ) * ( maxAverageTimeLabelWidth + padding ) + ( showWeights ? 1 : 0 ) * ( maxWeightLabelWidth + padding );
      const getY = index => maxSnapshotLabelHeight + padding + index * ( maxTestLabelHeight + padding );

      const snapshotsTestNodes = _.flatten( snapshots.map( ( snapshot, i ) => {
        return tests.map( ( test, j ) => {
          const x = getX( i );
          const y = getY( j );
          const cellBackground = new Rectangle( 0, 0, maxSnapshotLabelWidth, maxTestLabelHeight, {
            x: x,
            y: y
          } );

          let totalCount = 0;
          let untestedCount = 0;
          let unavailableCount = 0;
          let passCount = 0;
          let failCount = 0;
          let messages = [];

          test.indices.forEach( index => {
            totalCount++;

            const snapshotTest = snapshot.tests[ index ];

            if ( typeof snapshotTest.y === 'number' ) {
              passCount += snapshotTest.y;
              failCount += snapshotTest.n;
              if ( snapshotTest.y + snapshotTest.n === 0 ) {
                untestedCount++;
              }
              if ( snapshotTest.m ) {
                messages = messages.concat( snapshotTest.m.map( message => {
                  let resultMessage = `${report.testNames[ index ].join( ' : ' )}\n${message}\nSnapshot from ${new Date( snapshot.timestamp ).toLocaleString()}`;
                  while ( resultMessage.includes( '\n\n\n' ) ) {
                    resultMessage = resultMessage.replace( '\n\n\n', '\n\n' );
                  }
                  return resultMessage;
                } ) );
              }
            }
            else {
              untestedCount++;
              unavailableCount++;
            }
          } );

          const completeRatio = totalCount ? ( ( totalCount - untestedCount ) / totalCount ) : 1;

          if ( failCount > 0 ) {
            if ( untestedCount === 0 ) {
              cellBackground.fill = constants.failColor;
            }
            else {
              cellBackground.fill = constants.failColorPartial;
              cellBackground.addChild( new Rectangle( 0, 0, completeRatio * maxSnapshotLabelWidth, maxTestLabelHeight, {
                fill: constants.failColor
              } ) );
            }
          }
          else if ( passCount > 0 ) {
            if ( untestedCount === 0 ) {
              cellBackground.fill = constants.passColor;
            }
            else {
              cellBackground.fill = constants.passColorPartial;
              cellBackground.addChild( new Rectangle( 0, 0, completeRatio * maxSnapshotLabelWidth, maxTestLabelHeight, {
                fill: constants.passColor
              } ) );
            }
          }
          else if ( unavailableCount > 0 ) {
            cellBackground.fill = constants.unavailableColor;
          }
          else {
            cellBackground.fill = constants.untestedColor;
          }

          if ( messages.length ) {
            cellBackground.addInputListener( new FireListener( {
              fire: () => {
                popup( cellBackground, messages.join( '\n\n----------------------------------\n\n' ) );
              }
            } ) );
            cellBackground.cursor = 'pointer';
          }

          return cellBackground;
        } );
      } ) );

      testLabels.forEach( ( label, i ) => {
        label.left = 0;
        label.top = getY( i );
      } );
      snapshotLabels.forEach( ( label, i ) => {
        label.top = 0;
        label.left = getX( i );
      } );
      averageTimeLabels && averageTimeLabels.forEach( ( label, i ) => {
        label.left = maxTestLabelWidth + padding;
        label.top = getY( i );
      } );
      weightLabels && weightLabels.forEach( ( label, i ) => {
        label.left = maxTestLabelWidth + padding + ( showAverageTime ? 1 : 0 ) * ( maxAverageTimeLabelWidth + padding );
        label.top = getY( i );
      } );

      reportNode.children = [
        ...testLabels,
        ...snapshotLabels,
        ...snapshotsTestNodes,
        ...( showAverageTime ? averageTimeLabels : [] ),
        ...( showWeights ? weightLabels : [] )
      ];
    } );

  contentNode = new VBox( {
    x: 10,
    y: 10,
    spacing: 15,
    align: 'left',
    children: [
      new Text( 'Continuous Testing', { font: new PhetFont( { size: 24 } ) } ),
      statusNode,
      quickNode,
      new HBox( {
        align: 'top',
        spacing: 25,
        children: [
          sortNode,
          expansionNode,
          optionsNode,
          filteringNode
        ]
      } ),
      reportNode
    ]
  } );

  // Update the Display synchronously because we just generated a ton of garbage (Scenery Nodes/Instances) when setting
  // the reportNode.children, and the animation frame won't fire if the webpage isn't active, see https://github.com/phetsims/aqua/issues/95
  reportProperty.lazyLink( () => display.updateDisplay() );
}
else {
  contentNode = quickNode;
}
rootNode.addChild( contentNode );

display.addInputListener( {
  down: () => {
    if ( popupIframeProperty.value ) {
      document.body.removeChild( popupIframeProperty.value );
      popupIframeProperty.value = null;
    }
  }
} );

display.initializeEvents();
display.updateOnRequestAnimationFrame( dt => {
  backgroundNode.rectWidth = contentNode.width;
  backgroundNode.rectHeight = contentNode.height;
  display.width = Math.max( window.innerWidth, Math.ceil( rootNode.width ) );
  display.height = Math.max( 400, Math.ceil( rootNode.height ) ) + 100;
} );