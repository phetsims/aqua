// Copyright 2022, University of Colorado Boulder

/**
 * Functions supporting taking two image data URLs and comparing them, and providing a "comparison" image that shows
 * the differences. It also provides other stats in the div returned from the callback, see compareImages();
 * @author Jonathan Olson <jonathan.olson@colorado.edu>
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

( () => {

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

  function compareImageElements( imageA, imageB, msg, width, height ) {
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
      const container = document.createElement( 'div' );

      container.appendChild( document.createTextNode( `${msg}, largest: ${largestDifference}, average: ${averageDifference}` ) );
      container.appendChild( document.createElement( 'br' ) );

      container.appendChild( dataToCanvas( a, width, height ) );
      container.appendChild( dataToCanvas( b, width, height ) );
      container.appendChild( dataToCanvas( colorDiffData, width, height ) );
      // container.appendChild( dataToCanvas( alphaDiffData ) );
      return container;
    }
    return null;
  }

  // callback returns either null or the div that contains the comparison of images showing the difference.
  function compareImages( imageA_URL, imageB_URL, msg, width, height, callback ) {
    const newImage = document.createElement( 'img' );
    newImage.addEventListener( 'load', () => {
      const oldImage = document.createElement( 'img' );
      oldImage.addEventListener( 'load', () => {
        const comparisonContent = compareImageElements( oldImage, newImage, msg, width, height );
        callback( comparisonContent );
      } );
      oldImage.src = imageA_URL;
    } );
    newImage.src = imageB_URL;
  }

  window.compareImages = compareImages;
} )();

