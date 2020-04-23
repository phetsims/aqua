// Copyright 2020, University of Colorado Boulder

/**
 * Displays a self-updating report of continuous test results
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import BooleanProperty from '../../../axon/js/BooleanProperty.js';
import EnumerationProperty from '../../../axon/js/EnumerationProperty.js';
import NumberProperty from '../../../axon/js/NumberProperty.js';
import Property from '../../../axon/js/Property.js';
import Enumeration from '../../../phet-core/js/Enumeration.js';
import escapeHTML from '../../../phet-core/js/escapeHTML.js';
import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import Display from '../../../scenery/js/display/Display.js';
import FireListener from '../../../scenery/js/listeners/FireListener.js';
import DOM from '../../../scenery/js/nodes/DOM.js';
import HBox from '../../../scenery/js/nodes/HBox.js';
import Node from '../../../scenery/js/nodes/Node.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import RichText from '../../../scenery/js/nodes/RichText.js';
import Text from '../../../scenery/js/nodes/Text.js';
import VBox from '../../../scenery/js/nodes/VBox.js';
import Color from '../../../scenery/js/util/Color.js';
import Checkbox from '../../../sun/js/Checkbox.js';
import Panel from '../../../sun/js/Panel.js';
import VerticalAquaRadioButtonGroup from '../../../sun/js/VerticalAquaRadioButtonGroup.js';
import TextPushButton from '../../../sun/js/buttons/TextPushButton.js';

// window.assertions.enableAssert();

const options = QueryStringMachine.getAll( {
  server: {
    type: 'string',

    // Origin for our server (ignoring current port), so that we don't require localhost
    defaultValue: window.location.protocol + '//' + window.location.hostname
  }
} );

const passColor = new Color( 60, 255, 60 );
const passColorPartial = new Color( 170, 255, 170 );
const failColor = new Color( 255, 90, 90 );
const failColorPartial = new Color( 255, 190, 190 );
const untestedColor = new Color( 240, 240, 240 );
const buttonBaseColor = new Color( 240, 240, 240 );

const interfaceFont = new PhetFont( { size: 12 } );
const categoryFont = new PhetFont( { size: 12, weight: 'bold' } );

// {Property.<string>}
const statusProperty = new Property( 'loading...' );
const lastErrorProperty = new Property( '' );

// {Property.<number>}
const startupTimestampProperty = new NumberProperty( 0 );

statusProperty.lazyLink( status => console.log( `Status: ${status}` ) );

(function snapshotStatusLoop() {
  const req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( snapshotStatusLoop, 1000 );
    const result = JSON.parse( req.responseText );
    statusProperty.value = result.status;
    lastErrorProperty.value = result.lastErrorString;
    startupTimestampProperty.value = result.startupTimestamp;
  };
  req.onerror = function() {
    setTimeout( snapshotStatusLoop, 1000 );
    statusProperty.value = 'Could not contact server';
  };
  req.open( 'get', options.server + '/aquaserver/status', true );
  req.send();
})();

// {Property.<Object|null>}
const reportProperty = new Property( {
  snapshots: [],
  testNames: [],
  testAverageTimes: [],
  testWeights: []
} );

window.reportProperty = reportProperty;

(function reportLoop() {
  const req = new XMLHttpRequest();
  req.onload = function() {
    setTimeout( reportLoop, 20000 );
    reportProperty.value = JSON.parse( req.responseText );
  };
  req.onerror = function() {
    setTimeout( reportLoop, 20000 );

    // Show the most recent results anyway?
    // reportProperty.reset();
  };
  req.open( 'get', options.server + '/aquaserver/report', true );
  req.send();
})();

// {Property.<Array.<string>>} - Which repos to expand!
const expandedReposProperty = new Property( [] );

// {Property.<string>}
const filterStringProperty = new Property( '' );

const Sort = Enumeration.byKeys( [ 'ALPHABETICAL', 'IMPORTANCE', 'AVERAGE_TIME' ] );

// {Property.<Sort>}
const sortProperty = new EnumerationProperty( Sort, Sort.ALPHABETICAL );

// Property.<boolean>}
const showAverageTimeProperty = new BooleanProperty( false );

const rootNode = new Node();
const display = new Display( rootNode, {
  passiveEvents: true
} );

document.body.appendChild( display.domElement );

const statusNode = new Text( '', {
  font: interfaceFont,
  cursor: 'pointer'
} );
Property.multilink( [ statusProperty, startupTimestampProperty, lastErrorProperty ], ( status, startupTimestamp, lastError ) => {
  statusNode.text = `${lastError.length ? '[ERR] ' : ''}Running since [${new Date( startupTimestamp ).toLocaleString()}], status: ${status}`;
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

filterElement.addEventListener( 'change', () => {
  filterStringProperty.value = filterElement.value;
} );

const filterNode = new HBox( {
  spacing: 5,
  children: [
    new Text( 'Filter:', { font: interfaceFont } ),
    new DOM( filterElement )
  ]
} );

const sortNode = new VBox( {
  spacing: 5,
  children: [
    new Text( 'Sort', { font: categoryFont } ),
    new VerticalAquaRadioButtonGroup( sortProperty, [
      {
        value: Sort.ALPHABETICAL,
        node: new Text( 'Alphabetical', { font: interfaceFont } )
      },
      {
        value: Sort.IMPORTANCE,
        node: new Text( 'Importance', { font: interfaceFont } )
      },
      {
        value: Sort.AVERAGE_TIME,
        node: new Text( 'Average Time', { font: interfaceFont } )
      }
    ], {
      spacing: 5
    } )
  ]
} );

const expansionNode = new VBox( {
  spacing: 5,
  children: [
    new Text( 'Expansion', { font: categoryFont } ),
    new TextPushButton( 'Expand all', {
      listener: () => {
        expandedReposProperty.value = _.uniq( reportProperty.value.testNames.map( names => names[ 0 ] ) );
      },
      baseColor: buttonBaseColor
    } ),
    new TextPushButton( 'Collapse all', {
      listener: () => {
        expandedReposProperty.value = [];
      },
      baseColor: buttonBaseColor
    } )
  ]
} );

const optionsNode = new VBox( {
  spacing: 5,
  children: [
    new Text( 'Options', { font: categoryFont } ),
    new Checkbox( new Text( 'Show average time', { font: interfaceFont } ), showAverageTimeProperty, {
      boxWidth: 14
    } )
  ]
} );

const filteringNode = new VBox( {
  spacing: 5,
  children: [
    new Text( 'Filtering', { font: categoryFont } ),
    filterNode
  ]
} );

rootNode.addChild( new VBox( {
  x: 10,
  y: 10,
  spacing: 15,
  align: 'left',
  children: [
    new Text( 'Continuous Testing', { font: new PhetFont( { size: 24 } ) } ),
    statusNode,
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
} ) );

let clipboard = '';
document.addEventListener( 'copy', e => {
  console.log( 'clipboard' );
  e.preventDefault();
  if ( e.clipboardData) {
    e.clipboardData.setData( 'text/plain', clipboard );
  }
  else if ( window.clipboardData ) {
    window.clipboardData.setData( 'Text', clipboard );
  }
} );

const popup = ( triggerNode, message ) => {
  const messageHTML = message.split( '\n' ).map( escapeHTML ).join( '<br>' ) + '<br><br>Press command/ctrl-C to copy this to the clipboard';
  const messagesNode = new RichText( messageHTML, {
    font: interfaceFont,
    align: 'left'
  } );
  const panel = new Panel( messagesNode, {
    backgroundPickable: true,
    cursor: 'pointer'
  } );
  rootNode.addChild( panel );
  // TODO: align if it's at the bottom
  panel.left = triggerNode.right;
  panel.top = triggerNode.top;
  clipboard = message;
  panel.addInputListener( new FireListener( {
    fire: () => panel.detach()
  } ) );
};

Property.multilink( [ reportProperty, expandedReposProperty, sortProperty, filterStringProperty, showAverageTimeProperty ], ( report, expandedRepos, sort, filterString, showAverageTime ) => {
  let tests = [];

  const everythingName = '(everything)';

  tests.push( {
    names: [ everythingName ],
    indices: _.range( 0, report.testNames.length ),
    averageTimes: report.testAverageTimes
  } );

  // scan to determine what tests we are showing
  report.testNames.forEach( ( names, index ) => {
    if ( !expandedRepos.includes( names[ 0 ] ) ) {
      const lastTest = tests[ tests.length - 1 ];
      if ( lastTest && lastTest.names[ 0 ] === names[ 0 ] ) {
        lastTest.indices.push( index );
        lastTest.averageTimes.push( report.testAverageTimes[ index ] );
      }
      else {
        tests.push( {
          names: [ names[ 0 ] ],
          indices: [ index ],
          averageTimes: [ report.testAverageTimes[ index ] ]
        } );
      }
    }
    else {
      tests.push( {
        names: names,
        indices: [ index ],
        averageTimes: [ report.testAverageTimes[ index ] ]
      } );
    }
  } );

  // compute average times
  tests.forEach( test => {
    test.averageTime = _.mean( test.averageTimes.filter( _.identity ) ) || 0;
  } );

  if ( filterString.length ) {
    // Spaces separate multiple search terms
    filterString.split( ' ' ).forEach( filterPart => {
      tests = tests.filter( test => _.some( test.names, name => name.includes( filterPart ) ) );
    } );
  }

  if ( sort === Sort.IMPORTANCE ) {
    tests = _.sortBy( tests, test => {
      const failIndex = _.findIndex( report.snapshots, snapshot => _.some( test.indices, index => snapshot.tests[ index ].n ) );
      const passIndex = _.findIndex( report.snapshots, snapshot => _.some( test.indices, index => snapshot.tests[ index ].y ) );
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

  const testLabels = tests.map( test => {
    const label = new Text( test.names.join( ' : ' ), {
      font: interfaceFont,
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

  const padding = 3;

  const snapshotLabels = report.snapshots.map( snapshot => {
    const label = new VBox( {
      spacing: 2,
      children: [
        ...new Date( snapshot.timestamp ).toLocaleString().replace( ',', '' ).replace( ' AM', 'am' ).replace( ' PM', 'pm' ).split( ' ' ).map( str => new Text( str, { font: new PhetFont( { size: 10 } ) } ) )
      ],
      cursor: 'pointer'
    } );
    label.addInputListener( new FireListener( {
      fire: () => {
        popup( label, `${snapshot.timestamp}\n${JSON.stringify( snapshot.shas, null, 2 )}` );
      }
    } ) );
    return label;
  } );

  const maxTestLabelWidth = _.max( testLabels.map( node => node.width ) );
  const maxTestLabelHeight = _.max( testLabels.map( node => node.height ) );
  const maxSnapshotLabelWidth = _.max( snapshotLabels.map( node => node.width ) );
  const maxSnapshotLabelHeight = _.max( snapshotLabels.map( node => node.height ) );
  const maxAverageTimeLabelWidth = averageTimeLabels ? _.max( averageTimeLabels.map( node => node.width ) ) : 0;

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

  const getX = index => maxTestLabelWidth + padding + index * ( maxSnapshotLabelWidth + padding ) + ( showAverageTime ? 1 : 0 ) * ( maxAverageTimeLabelWidth + padding );
  const getY = index => maxSnapshotLabelHeight + padding + index * ( maxTestLabelHeight + padding );

  const snapshotsTestNodes = _.flatten( report.snapshots.map( ( snapshot, i ) => {
    return tests.map( ( test, j ) => {
      const x = getX( i );
      const y = getY( j );
      const background = new Rectangle( 0, 0, maxSnapshotLabelWidth, maxTestLabelHeight, {
        x: x,
        y: y
      } );

      let totalCount = 0;
      let untestedCount = 0;
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
              return `${report.testNames[ index ].join( ' : ' )}\n${message}`;
            } ) );
          }
        }
        else {
          untestedCount++;
        }
      } );

      const completeRatio = totalCount ? ( ( totalCount - untestedCount ) / totalCount ) : 1;

      if ( failCount > 0 ) {
        if ( untestedCount === 0 ) {
          background.fill = failColor;
        }
        else {
          background.fill = failColorPartial;
          background.addChild( new Rectangle( 0, 0, completeRatio * maxSnapshotLabelWidth, maxTestLabelHeight, {
            fill: failColor
          } ) );
        }
      }
      else if ( passCount > 0 ) {
        if ( untestedCount === 0 ) {
          background.fill = passColor;
        }
        else {
          background.fill = passColorPartial;
          background.addChild( new Rectangle( 0, 0, completeRatio * maxSnapshotLabelWidth, maxTestLabelHeight, {
            fill: passColor
          } ) );
        }
      }
      else {
        background.fill = untestedColor;
      }

      if ( messages.length ) {
        background.addInputListener( new FireListener( {
          fire: () => {
            popup( background, messages.join( '\n\n' ) );
          }
        } ) );
        background.cursor = 'pointer';
      }

      return background;
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

  reportNode.children = [
    ...testLabels,
    ...snapshotLabels,
    ...snapshotsTestNodes,
    ...( showAverageTime ? averageTimeLabels : [] )
  ];
} );

display.initializeEvents();
display.updateOnRequestAnimationFrame( dt => {
  display.width = Math.max( window.innerWidth, Math.ceil( rootNode.width ) );
  display.height = Math.max( 400, Math.ceil( rootNode.height ) ) + 100;
} );
