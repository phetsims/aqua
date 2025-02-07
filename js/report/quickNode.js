// Copyright 2022-2024, University of Colorado Boulder

/**
 * Shows a quick-server status visually
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import HBox from '../../../scenery/js/layout/nodes/HBox.js';
import FireListener from '../../../scenery/js/listeners/FireListener.js';
import Rectangle from '../../../scenery/js/nodes/Rectangle.js';
import Text from '../../../scenery/js/nodes/Text.js';
import constants from './constants.js';
import popup from './popup.js';
import quickStatusProperty from './quickStatusProperty.js';

const createQuickResult = ( labelString, name ) => {
  const label = new Text( labelString, { font: constants.interfaceFont } );
  const node = new Rectangle( {
    rectBounds: label.bounds.dilatedXY( 10, 5 ),
    children: [ label ],
    cursor: 'pointer'
  } );
  node.addInputListener( new FireListener( {
    fire: () => {
      const quickStatus = quickStatusProperty.value;
      if ( quickStatus && quickStatus.tests && quickStatus.tests[ name ] ) {
        popup( node, quickStatus.tests[ name ].message );
      }
    }
  } ) );
  quickStatusProperty.link( quickStatus => {
    if ( quickStatus && quickStatus.tests && quickStatus.tests[ name ] ) {
      node.fill = quickStatus.tests[ name ].passed ? constants.passColor : constants.failColor;
    }
    else {
      node.fill = constants.untestedColor;
    }
  } );
  return node;
};

const quickTimestampText = new Text( 'loading...', { font: constants.interfaceFont, cursor: 'pointer' } );
quickTimestampText.addInputListener( new FireListener( {
  fire: () => {
    const quickStatus = quickStatusProperty.value;
    if ( quickStatus && quickStatus.shas ) {
      popup( quickTimestampText, JSON.stringify( quickStatus.shas, null, 2 ) );
    }
  }
} ) );
quickStatusProperty.lazyLink( quickStatus => {
  if ( quickStatus && quickStatus.timestamp ) {
    quickTimestampText.string = new Date( quickStatus.timestamp ).toLocaleString();
  }
} );

const quickNode = new HBox( {
  spacing: 3,
  children: [
    quickTimestampText,
    createQuickResult( 'lint', 'lint' ),
    createQuickResult( 'type-check', 'typeCheck' ),
    createQuickResult( 'simFuzz', 'simFuzz' ),
    createQuickResult( 'studioFuzz', 'studioFuzz' ),
    createQuickResult( 'phetioCompare', 'phetioCompare' )
  ]
} );

export default quickNode;