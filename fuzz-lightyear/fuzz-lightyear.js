// Copyright 2016-2023, University of Colorado Boulder

/**
 * See the README.md for documentation about query parameters
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

( function() {

  // Grab all query parameters to pass to the simulation, and add additional ones for receiving messages.
  let simulationQueryString = window.location.search;

  if ( simulationQueryString.indexOf( '?' ) >= 0 ) {
    simulationQueryString += '&';
  }
  else {
    simulationQueryString += '?';
  }
  simulationQueryString += 'postMessageOnLoad&postMessageOnError';

  const options = QueryStringMachine.getAll( {

    // Whether the sim should be left open for the testDuration after loading. If false, once a sim loads, it will
    // change to the next sim.
    testTask: {
      type: 'boolean',
      defaultValue: true
    },

    // The time the sim has to load before moving to the next test.
    loadTimeout: {
      type: 'number',
      defaultValue: 30000 // ms
    },

    // Will move to the next simulation after this number of milliseconds since the simulation/wrapper loaded.
    testDuration: {
      type: 'number',
      defaultValue: 30000 // ms
    },

    // A list of simulation/runnable names to be included in the test. Will default to perennial/data/active-runnables
    repos: {
      type: 'array',
      defaultValue: [], // will get filled in automatically if left as default
      elementSchema: {
        type: 'string'
      }
    },

    // To load a PhET-iO wrapper for testing instead of a sim. Currently on 'studio', 'state', and 'migration' are supported
    wrapperName: {
      type: 'string',
      defaultValue: ''
    },

    // Shuffle the order of the testsSims for a random order. Helpful if you want the test the same list, but don't
    // want to wait for the end for better coverage.
    randomize: {
      type: 'flag'
    },

    // Reverse the list of sims to the opposite order (no-op if provided with ?randomize).
    reverse: {
      type: 'flag'
    }
  } );

  let repoNames; // {Array.<string>} - will be filled in below by an AJAX request
  const testQueue = []; // {Array.<{ repo: {string}, wrapperName: {string} }>} - Sim test target queue

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
      const nextSims = failedSims.concat( currentSim ? [ currentSim ] : [] ).concat( testQueue.map( x => x.repo ) );
      const omitReposSearch = QueryStringMachine.removeKeyValuePair( window.location.search, 'repos' );
      let url = window.location.origin + window.location.pathname;
      url += QueryStringMachine.appendQueryString( omitReposSearch, `repos=${_.uniq( nextSims ).join( ',' )}` );
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
  eventLog.innerHTML = '<div id="dev-errors" style="display: none;"><h1>Sim errors (dev):</h1></div>';
  eventLog.style.display = 'none';
  document.body.appendChild( eventLog );
  const devErrors = document.getElementById( 'dev-errors' );

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
  const simStatusElements = {}; // map repo {string} => {HTMLElement}, which holds the status w/ classes

  // we need to clear timeouts if we bail from a sim early. Note this reference is used both for the load and test timeouts.
  let timeoutID;

  function createStatusElement( repo ) {
    const simStatusElement = document.createElement( 'div' );
    simStatusElement.classList.add( 'status' );
    simListDiv.appendChild( simStatusElement );
    simStatusElements[ repo ] = simStatusElement;

    const devStatus = document.createElement( 'span' );
    devStatus.classList.add( 'dev' );
    devStatus.classList.add( 'unselectable' );
    devStatus.innerHTML = '■';
    simStatusElement.appendChild( devStatus );

    const repoStatus = document.createElement( 'span' );
    repoStatus.classList.add( 'repo' );
    repoStatus.innerHTML = repo;
    simStatusElement.appendChild( repoStatus );
  }

// loads a sim into the iframe
  function loadSim( repo ) {
    iframe.src = `../../${repo}/${repo}_en.html${simulationQueryString}`;
    simStatusElements[ repo ].classList.add( 'loading-dev' );
  }

  // loads a wrapper into the iframe
  function loadWrapper( repo, wrapperName ) {
    wrapperName = wrapperName === 'studio' ? wrapperName : `phet-io-wrappers/${wrapperName}`;
    iframe.src = QueryStringMachine.appendQueryString(
      QueryStringMachine.appendQueryString( `../../${wrapperName}/`, `?sim=${repo}` ),
      simulationQueryString );
    simStatusElements[ repo ].classList.add( 'loading-dev' );
  }

// switches to the next sim (if there are any)
  function nextSim() {
    clearTimeout( timeoutID );
    currentSim = '';

    if ( currentTest ) {
      simStatusElements[ currentTest.repo ].classList.add( 'complete-dev' );
      if ( !currentTest.loaded ) {
        addSimToRerunList( currentTest.repo );
      }
    }

    if ( testQueue.length ) {
      const test = testQueue.shift();
      currentSim = test.repo;
      currentTest = test;
      if ( test.wrapperName !== '' ) {
        loadWrapper( test.repo, test.wrapperName );
      }
      else {
        loadSim( test.repo );
      }
      timeoutID = setTimeout( nextSim, options.loadTimeout );
    }
    else {
      iframe.src = 'about:blank';
      currentTest = null;
    }
  }

  function onSimLoad( repo ) {
    clearTimeout( timeoutID ); // Loaded, so clear the timeout
    console.log( `loaded ${repo}` );

    currentTest.loaded = true;

    // not loading anymore
    simStatusElements[ repo ].classList.remove( 'loading-dev' );

    // window.open stub on child. otherwise we get tons of "Report Problem..." popups that stall
    iframe.contentWindow.open = function() {
      return {
        focus: function() {},
        blur: function() {}
      };
    };

    timeoutID = setTimeout( nextSim, options.testDuration );

    if ( !options.testTask ) {
      nextSim();
    }
  }

  async function onSimError( repo, data ) {
    console.log( `error on ${repo}` );

    const errorLog = devErrors;

    eventLog.style.display = 'block';
    errorLog.style.display = 'block';
    errorLog.innerHTML += `<strong>${repo}</strong>`;

    if ( data.message ) {
      console.log( `message: ${data.message}` );
      errorLog.innerHTML += `<pre>${data.message}</pre>`;
    }
    if ( data.stack ) {

      const transpiledStacktrace = await window.transpileStacktrace( data.stack );
      console.log( transpiledStacktrace );
      errorLog.innerHTML += `<pre>${transpiledStacktrace}</pre>`;
    }

    simStatusElements[ repo ].classList.add( 'error-dev' );

    // since we can have multiple errors for a single sim (due to being asynchronous),
    // we need to not move forward more than one sim
    if ( repo === currentTest.repo ) {
      addSimToRerunList( repo );

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

    function repoFromURL( url ) {
      // url like http://localhost/phet/git/molecule-shapes/molecule-shapes_en.html?ea&postMessageOnLoad&postMessageOnError
      // output molecule-shapes
      if ( url.indexOf( '_en_phet.html' ) >= 0 ) {
        return url.slice( 0, url.lastIndexOf( '_en_phet.html' ) ).slice( url.lastIndexOf( '/' ) + 1 );
      }
      else if ( /[?&]sim=/.test( url ) ) {
        return url.match( /sim=([\w-]+)/ )[ 1 ];
      }
      else if ( url.includes( 'phet-io.colorado.edu/sims' ) ) {
        return url.match( /phet-io.colorado.edu\/sims\/([\w-]+)\// )[ 1 ];
      }
      else {
        return url.slice( 0, url.lastIndexOf( '_en.html' ) ).slice( url.lastIndexOf( '/' ) + 1 );
      }
    }

    if ( data.type === 'load' || data.type === 'continuous-test-wrapper-load' ) {

      // Some wrappers like PhET-iO State have 2 sims in the same wrapper, so we may get multiple loaded events
      currentTest && !currentTest.loaded && onSimLoad( repoFromURL( data.url ) );
    }
    else if ( data.type === 'error' || data.type === 'continuous-test-wrapper-error' ) {
      currentTest && onSimError( repoFromURL( data.url ), data );
    }
  } );

// load the list of sims before kicking things off
  ( function() {
    const req = new XMLHttpRequest();
    req.onload = function() {
      const simListText = req.responseText;

      // split string into an array of sim names, ignoring blank lines
      repoNames = simListText.trim().replace( /\r/g, '' ).split( '\n' );
      if ( options.repos.length ) {
        repoNames = options.repos;
      }
      if ( options.randomize ) {
        repoNames = _.shuffle( repoNames );
      }
      if ( options.reverse ) {
        repoNames = repoNames.reverse();
      }

      repoNames.forEach( repo => {
        createStatusElement( repo );

        // First, if enabled, put unbuilt testing on the queue
        testQueue.push( {
          repo: repo,
          wrapperName: options.wrapperName
        } );
      } );

      // This can help you reproduce states instead of needing to get this yourself from active-repos
      console.log( 'testing:', repoNames.join( ',' ) );

      // kick off the loops
      nextSim();
    };
    // location of active sims
    req.open( 'GET', '../../perennial/data/active-runnables', true );
    req.send();
  } )();

} )();