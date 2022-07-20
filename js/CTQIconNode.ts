// Copyright 2022, University of Colorado Boulder

/**
 * The icon for the CT Quick (CTQ) Slackbot profile.
 *
 * @author Chris Klusendorf (PhET Interactive Simulations)
 */

import { Circle, Color, Font, Node, NodeOptions, Rectangle, Text } from '../../scenery/js/imports.js';
import ScreenView from '../../joist/js/ScreenView.js';
import { EmptySelfOptions } from '../../phet-core/js/optionize.js';

// colors
const phetBlue = '#6acdf5';
const phetYellow = '#fee108';
const phetPink = '#e01e5a';

// constants
const HEIGHT = ScreenView.DEFAULT_LAYOUT_BOUNDS.height;

type SelfOptions = EmptySelfOptions;
type CtqLogoScreenViewOptions = SelfOptions & NodeOptions;

class CTQIconNode extends Node {

  public constructor( options?: CtqLogoScreenViewOptions ) {
    super( options );

    const backgroundSquare = new Rectangle( 0, 0, HEIGHT, HEIGHT, {
      fill: Color.BLACK
    } );
    this.addChild( backgroundSquare );

    // create and add the circle of the "Q"
    const qLineWidth = 36;
    const qCircle = new Circle( {
      radius: HEIGHT / 2 - 58,
      stroke: phetPink,
      lineWidth: 40
    } );
    qCircle.center = backgroundSquare.center;
    this.addChild( qCircle );

    // create and add the line of the "Q"
    const lineInset = 34.5;
    const qLine = new Rectangle( 0, 0, qLineWidth * 3.7, qLineWidth, qLineWidth / 2, qLineWidth / 2, {
      fill: phetPink,
      rotation: Math.PI / 4
    } );
    qLine.right = qCircle.right - lineInset;
    qLine.bottom = qCircle.bottom - lineInset;
    this.addChild( qLine );

    const ctFontSize = 270;

    // create and add the "C" inside the "Q"
    const cText = new Text( 'C', {
      font: new Font( {
        family: 'Arial Rounded MT Bold',
        size: ctFontSize,
        weight: 'bold'
      } ),
      fill: phetBlue
    } );
    cText.centerX = backgroundSquare.centerX - 89;
    cText.centerY = backgroundSquare.centerY;
    this.addChild( cText );

    // create and add the "T" inside the "Q"
    const tText = new Text( 'T', {
      font: new Font( {
        family: 'Arial Rounded MT Bold',
        size: ctFontSize,
        weight: 'bold'
      } ),
      fill: phetYellow
    } );
    tText.centerX = backgroundSquare.centerX + 95;
    tText.centerY = backgroundSquare.centerY;
    this.addChild( tText );
  }
}

export default CTQIconNode;