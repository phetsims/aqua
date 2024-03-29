// Copyright 2022-2024, University of Colorado Boulder

/**
 * Functions supporting taking two image data URLs and comparing them, and providing a "comparison" image that shows
 * the differences. It also provides other stats in the div returned from the callback, see compareImages();
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

( () => {

  const AVERAGE_THRESHOLD = 0.001;
  const MAX_NUMBER_OF_CHANGED_PIXELS = 10;
  const MAX_NUMBER_OF_COMPONENT_DIFFERENCES = MAX_NUMBER_OF_CHANGED_PIXELS * 4; // a bad algorithm for recognizing RGBA

  const loadImage = url => {
    return new Promise( resolve => {
      const image = document.createElement( 'img' );
      image.addEventListener( 'load', () => {
        resolve( image );
      } );
      image.src = url;
    } );
  };

  function imageToContext( image, width, height ) {
    const canvas = document.createElement( 'canvas' );
    const context = canvas.getContext( '2d' );
    canvas.width = width;
    canvas.height = height;
    context.drawImage( image, 0, 0 );
    return context;
  }

  function contextToData( context, width, height ) {
    return context.getImageData( 0, 0, width, height );
  }

  function dataToCanvas( data, width, height ) {
    const canvas = document.createElement( 'canvas' );
    const context = canvas.getContext( '2d' );
    canvas.width = width;
    canvas.height = height;
    context.putImageData( data, 0, 0 );
    return canvas;
  }

  function compareImageElements( imageA, imageB, width, height, msg = '' ) {
    const a = contextToData( imageToContext( imageA, width, height ), width, height );
    const b = contextToData( imageToContext( imageB, width, height ), width, height );

    let largestDifference = 0;
    let totalDifference = 0;
    let numberOfDifferences = 0;

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
      if ( diff ) {
        numberOfDifferences++;
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

    // Average across all pixels
    const averageDifference = totalDifference / ( 4 * a.width * a.height );

    // How different was each difference, on average (excludes equal component colors)
    const averageDifferenceMagnitude = numberOfDifferences > 0 ? totalDifference / numberOfDifferences : 0;

    if ( averageDifference > AVERAGE_THRESHOLD || numberOfDifferences > MAX_NUMBER_OF_COMPONENT_DIFFERENCES ) {
      console.log(
        '-Images differ greater than threshold: ' +
        '\n\ttotal average:\t', averageDifference,
        '\n\tnumberOfComponents:\t', numberOfDifferences,
        '\n\taverage of color difference:\t', averageDifferenceMagnitude
      );

      const container = document.createElement( 'div' );
      const comparisonData = {
        a: dataToCanvas( a, width, height ),
        b: dataToCanvas( b, width, height ),
        diff: dataToCanvas( colorDiffData, width, height ),
        container: container,
        largestDifference: largestDifference,
        averageDifference: averageDifference
      };

      container.appendChild( document.createTextNode( `${msg}, largest: ${largestDifference}, average: ${averageDifference}` ) );
      container.appendChild( document.createElement( 'br' ) );

      container.appendChild( comparisonData.a );
      container.appendChild( comparisonData.b );
      container.appendChild( comparisonData.diff );

      return comparisonData;
    }
    else if ( averageDifference > 0 || numberOfDifferences > 0 ) {
      console.log(
        '-Images differ less than threshold: ' +
        '\n\ttotal average:\t', averageDifference,
        '\n\tnumberOfComponents:\t', numberOfDifferences,
        '\n\taverage of color difference:\t', averageDifferenceMagnitude
      );
    }
    return null;
  }

  // callback returns either null or the div that contains the comparison of images showing the difference.
  async function compareImages( imageA_URL, imageB_URL, width, height, callback = _.noop, msg = '' ) {
    const newImage = await loadImage( imageB_URL );
    const oldImage = await loadImage( imageA_URL );
    const comparisonContent = compareImageElements( oldImage, newImage, width, height, msg );
    callback( comparisonContent?.container || null );
    return comparisonContent;
  }

  window.compareImages = compareImages;
} )();