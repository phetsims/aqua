// Copyright 2016, University of Colorado Boulder

// See the README.md for documentation about query parameters


// Grab all query parameters to pass to the simulation, and add additional ones for receiving messages.
( function() {
  let simulationQueryString = window.location.search;

  if ( simulationQueryString.indexOf( '?' ) >= 0 ) {
    simulationQueryString += '&';
  }
  else {
    simulationQueryString += '?';
  }
  simulationQueryString += 'postMessageOnLoad&postMessageOnError';

  const options = QueryStringMachine.getAll( {

    // Whether the sim should be left open for the testDuration. If false, once a sim loads, it will change to the next sim.
    testTask: {
      type: 'boolean',
      defaultValue: true
    },

    // Whether sims should be tested in unbuilt mode
    testUnbuilt: {
      type: 'boolean',
      defaultValue: true
    },

    // Whether sims should be tested that are built. test-server.js should be launched to be able to build the sims.
    testBuilt: {
      type: 'boolean',
      defaultValue: true
    },

    // Will move to the next simulation after this number of milliseconds since launching the simulation.
    testDuration: {
      type: 'number',
      defaultValue: 30000 // ms
    },

    // A list of simulation/runnable names to be included in the test. Will default to perennial/data/active-runnables
    testSims: {
      type: 'array',
      defaultValue: [], // will get filled in automatically if left as default
      elementSchema: {
        type: 'string'
      }
    },

    // How many simulations to built at once (if testBuilt is selected). Uses test-server.js (which should be launched with Node.js)
    testConcurrentBuilds: {
      type: 'number',
      defaultValue: 1
    },
    randomize: {
      type: 'flag'
    }
  } );

  let simNames; // {Array.<string>} - will be filled in below by an AJAX request
  const testQueue = []; // {Array.<{ simName: {string}, isBuild: {boolean} }>} - Sim test target queue
  const buildQueue = []; // {Array.<string>} - sim names that need to be built

  const failedSims = []; // {Array.<string>} - sim names that failed the tests

  // The name of the sim currently being tested
  let currentSim = '';

  // Track whether 'shift' key is pressed, so that we can change how windows are opened.  If shift is pressed, the
  // page is launched in a separate tab.
  let shiftPressed = false;
  window.addEventListener( 'keydown', event => {
    shiftPressed = event.shiftKey;
  } );
  window.addEventListener( 'keyup', event => {
    shiftPressed = event.shiftKey;
  } );

  // create a button to rerun the failed tests
  const rerunFailedTestsButton = document.createElement( 'button' );
  rerunFailedTestsButton.innerHTML = 'Rerun Failed Sims';
  rerunFailedTestsButton.addEventListener( 'click', () => {
    if ( failedSims.length > 0 ) {
      const nextSims = failedSims.concat( currentSim ? [ currentSim ] : [] ).concat( testQueue.map( x => x.simName ) );
      const omitTestSimsSearch = QueryStringMachine.removeKeyValuePair( window.location.search, 'testSims' );
      let url = window.location.origin + window.location.pathname;
      url += QueryStringMachine.appendQueryString( omitTestSimsSearch, `testSims=${_.uniq( nextSims ).join( ',' )}` );
      if ( shiftPressed ) {
        window.open( url, '_blank' );
      }
      else {
        window.location.replace( url );
      }
    }
  } );
  document.body.appendChild( rerunFailedTestsButton );
  rerunFailedTestsButton.style.display = 'none';

  const addSimToRerunList = sim => {
    failedSims.push( sim ); // add to the list of failed sims
    rerunFailedTestsButton.style.display = 'block'; // show the button now that there is at least one failed sim
  };

  const eventLog = document.createElement( 'div' );
  eventLog.id = 'eventLog';
  eventLog.innerHTML = '<div id="dev-errors" style="display: none;"><h1>Sim errors (dev):</h1></div>' +
                       '<div id="build-errors" style="display: none;"><h1>Sim errors (build):</h1></div>' +
                       '<div id="grunt-errors" style="display: none;"><h1>Grunt errors:</h1></div>';
  eventLog.style.display = 'none';
  document.body.appendChild( eventLog );
  const devErrors = document.getElementById( 'dev-errors' );
  const buildErrors = document.getElementById( 'build-errors' );
  const gruntErrors = document.getElementById( 'grunt-errors' );

// a borderless iframe
  const iframe = document.createElement( 'iframe' );
  iframe.setAttribute( 'frameborder', '0' );
  iframe.setAttribute( 'seamless', '1' );
// NOTE: we don't set allow-popups, but this was causing a security error when it was open
// instead, we override window.open AFTER it sends the load message (which isn't foolproof)
// see https://html.spec.whatwg.org/multipage/embedded-content.html#attr-iframe-sandbox
// iframe.setAttribute( 'sandbox', 'allow-forms allow-pointer-lock allow-same-origin allow-scripts' );
  document.body.appendChild( iframe );

// a place for sim status divs
  const simListDiv = document.createElement( 'div' );
  simListDiv.id = 'simList';
  document.body.appendChild( simListDiv );

  let currentTest;
  const simStatusElements = {}; // map simName {string} => {HTMLElement}, which holds the status w/ classes
  let timeoutId; // we need to clear the timeout if we bail from a sim early

  function createStatusElement( simName ) {
    const simStatusElement = document.createElement( 'div' );
    simStatusElement.classList.add( 'status' );
    simListDiv.appendChild( simStatusElement );
    simStatusElements[ simName ] = simStatusElement;

    const devStatus = document.createElement( 'span' );
    devStatus.classList.add( 'dev' );
    devStatus.classList.add( 'unselectable' );
    devStatus.innerHTML = '■';
    simStatusElement.appendChild( devStatus );

    const gruntStatus = document.createElement( 'span' );
    gruntStatus.classList.add( 'grunt' );
    gruntStatus.classList.add( 'unselectable' );
    gruntStatus.innerHTML = '■';
    simStatusElement.appendChild( gruntStatus );

    const buildStatus = document.createElement( 'span' );
    buildStatus.classList.add( 'build' );
    buildStatus.classList.add( 'unselectable' );
    buildStatus.innerHTML = '■';
    simStatusElement.appendChild( buildStatus );

    const simNameStatus = document.createElement( 'span' );
    simNameStatus.classList.add( 'simName' );
    simNameStatus.innerHTML = simName;
    simStatusElement.appendChild( simNameStatus );
  }

  function nextBuild() {
    if ( buildQueue.length ) {
      const simName = buildQueue.shift();

      const req = new XMLHttpRequest();
      req.onload = function() {
        const data = JSON.parse( req.responseText );

        if ( data.sim === simName && data.success ) {
          console.log( `${simName} built successfully` );
          simStatusElements[ simName ].classList.add( 'complete-grunt' );
          testQueue.push( {
            simName: simName,
            isBuild: true
          } );
          if ( !currentTest ) {
            nextSim();
          }
        }
        else {
          console.log( `error building ${simName}` );
          simStatusElements[ simName ].classList.add( 'error-grunt' );

          eventLog.style.display = 'block';
          gruntErrors.style.display = 'block';
          gruntErrors.innerHTML += `<strong>${simName}</strong>`;
          gruntErrors.innerHTML += `<pre>${data.output}</pre>`;
        }

        nextBuild();
      };
      console.log( `building ${simName}` );
      req.open( 'GET', `http://${window.location.hostname}:45361/${simName}`, true );
      req.send();
    }
  }

// loads a sim into the iframe
  function loadSim( simName, isBuild ) {
    iframe.src = `../../${simName}/${isBuild ? 'build/phet/' : ''}${simName}_en${isBuild ? '_phet' : ''}.html${simulationQueryString}`;
    simStatusElements[ simName ].classList.add( `loading-${isBuild ? 'build' : 'dev'}` );
  }

// switches to the next sim (if there are any)
  function nextSim() {
    clearTimeout( timeoutId );
    currentSim = '';

    if ( currentTest ) {
      simStatusElements[ currentTest.simName ].classList.add( `complete-${currentTest.isBuild ? 'build' : 'dev'}` );
      if ( !currentTest.loaded ) {
        addSimToRerunList( currentTest.simName );
      }
    }

    if ( testQueue.length ) {
      const test = testQueue.shift();
      currentSim = test.simName;
      currentTest = test;
      loadSim( test.simName, test.isBuild );
      timeoutId = setTimeout( nextSim, options.testDuration );
    }
    else {
      iframe.src = 'about:blank';
      currentTest = null;
    }
  }

  function onSimLoad( simName ) {
    console.log( `loaded ${simName}` );

    const isBuild = simName === currentTest.simName && currentTest.isBuild;

    currentTest.loaded = true;

    // not loading anymore
    simStatusElements[ simName ].classList.remove( `loading-${isBuild ? 'build' : 'dev'}` );

    // window.open stub on child. otherwise we get tons of "Report Problem..." popups that stall
    iframe.contentWindow.open = function() {
      return {
        focus: function() {},
        blur: function() {}
      };
    };

    if ( !options.testTask ) {
      nextSim();
    }
  }

  async function onSimError( simName, data ) {
    console.log( `error on ${simName}` );

    const isBuild = simName === currentTest.simName && currentTest.isBuild;
    const errorLog = isBuild ? buildErrors : devErrors;

    eventLog.style.display = 'block';
    errorLog.style.display = 'block';
    errorLog.innerHTML += `<strong>${simName}</strong>`;

    if ( data.message ) {
      console.log( `message: ${data.message}` );
      errorLog.innerHTML += `<pre>${data.message}</pre>`;
    }
    if ( data.stack ) {

      const transpiledStacktrace = await window.transpileStacktrace( data.stack );
      console.log( transpiledStacktrace );
      errorLog.innerHTML += `<pre>${transpiledStacktrace}</pre>`;
    }

    simStatusElements[ simName ].classList.add( `error-${isBuild ? 'build' : 'dev'}` );

    // since we can have multiple errors for a single sim (due to being asynchronous),
    // we need to not move forward more than one sim
    if ( simName === currentTest.simName ) {
      addSimToRerunList( simName );

      // on failure, speed up by switching to the next sim
      nextSim();
    }
  }

// handling messages from sims
  window.addEventListener( 'message', evt => {
    if ( typeof evt.data !== 'string' ) {
      return;
    }

    const data = JSON.parse( evt.data );

    function simNameFromURL( url ) {
      // url like http://localhost/phet/git/molecule-shapes/molecule-shapes_en.html?ea&postMessageOnLoad&postMessageOnError
      // output molecule-shapes
      if ( url.indexOf( '_en_phet.html' ) >= 0 ) {
        return url.slice( 0, url.lastIndexOf( '_en_phet.html' ) ).slice( url.lastIndexOf( '/' ) + 1 );
      }
      else {
        return url.slice( 0, url.lastIndexOf( '_en.html' ) ).slice( url.lastIndexOf( '/' ) + 1 );
      }
    }

    // const simName;
    if ( data.type === 'load' ) {
      onSimLoad( simNameFromURL( data.url ) );
    }
    else if ( data.type === 'error' ) {
      onSimError( simNameFromURL( data.url ), data );
    }
  } );

// load the list of sims before kicking things off
  ( function() {
    const req = new XMLHttpRequest();
    req.onload = function() {
      const simListText = req.responseText;

      // split string into an array of sim names, ignoring blank lines
      simNames = simListText.trim().replace( /\r/g, '' ).split( '\n' );
      if ( options.testSims.length ) {
        simNames = options.testSims;
      }
      if ( options.randomize ) {
        simNames = _.shuffle( simNames );
      }

      simNames.forEach( simName => {
        createStatusElement( simName );

        // First, if enabled, put unbuilt testing on the queue
        if ( options.testUnbuilt ) {
          testQueue.push( {
            simName: simName,
            build: false
          } );
        }

        // On the build queue, if enabled, put all sims
        if ( options.testBuilt ) {
          buildQueue.push( simName );
        }
      } );

      // kick off the loops
      nextSim();

      console.log( `starting builds: ${options.testConcurrentBuilds}` );
      for ( let k = 0; k < options.testConcurrentBuilds; k++ ) {
        nextBuild();
      }
    };
    // location of active sims
    req.open( 'GET', '../../perennial/data/active-runnables', true );
    req.send();
  } )();

} )();