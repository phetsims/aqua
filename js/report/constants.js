// Copyright 2022, University of Colorado Boulder

/**
 * CT constants
 *
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 */

import PhetFont from '../../../scenery-phet/js/PhetFont.js';
import { Color } from '../../../scenery/js/imports.js';

export default {
  passColor: new Color( 60, 255, 60 ),
  passColorPartial: new Color( 170, 255, 170 ),
  failColor: new Color( 255, 90, 90 ),
  failColorPartial: new Color( 255, 190, 190 ),
  untestedColor: new Color( 240, 240, 240 ),
  unavailableColor: new Color( 200, 200, 200 ),
  buttonBaseColor: new Color( 240, 240, 240 ),

  interfaceFont: new PhetFont( { size: 12 } ),
  categoryFont: new PhetFont( { size: 12, weight: 'bold' } )
};