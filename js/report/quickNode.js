// Copyright 2022, University of Colorado Boulder

/**
 * Shows a quick-server status visually
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import { FireListener, HBox, Rectangle, Text } from '../../../scenery/js/imports.js';
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
      if ( quickStatus && quickStatus[ name ] ) {
        popup( node, quickStatus[ name ].message );
      }
    }
  } ) );
  quickStatusProperty.link( quickStatus => {
    if ( quickStatus && quickStatus[ name ] ) {
      node.fill = quickStatus[ name ].passed ? constants.passColor : constants.failColor;
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
    quickTimestampText.text = new Date( quickStatus.timestamp ).toLocaleString();
  }
} );

const quickNode = new HBox( {
  spacing: 3,
  children: [
    quickTimestampText,
    createQuickResult( 'lint', 'lint' ),
    createQuickResult( 'tsc', 'tsc' ),
    createQuickResult( 'transpile', 'transpile' ),
    createQuickResult( 'simFuzz', 'simFuzz' ),
    createQuickResult( 'studioFuzz', 'studioFuzz' )
  ]
} );

export default quickNode;