let app = {

  elements : {

    canvas        : document.querySelector( '.canvas'  ),
    connectButton : document.querySelector( '.connect' ),
    findButton    : document.querySelector( '.find'    ),

  },

  validates : {

    json : function ( string ) {

      try {
        JSON.parse( string );
      } catch ( e ) {
        return false;
      }

      // TODO: Check if it contains all desired properties before returning true

      return true;

    }

  },

  data : {

    earth : {

      tilt : 23.4365, // In decimal degrees

      radius : { // In km
        crust : 6371,
        core : {
          inner : 1216,
          outer : 3486,
        }
      }

    },

    incoming : {
      stream : '',
      json : undefined,
    },

    user : { // In decimal degrees
      latitude : -23.5505, // south is negative
      longitude : -46.63330, // west is negative
    },

    seconds : 0

  },

  three : {

    renderer  : undefined,
    camera    : undefined,
    light     : undefined,
    scene     : undefined,
    controls  : undefined,
    raycaster : undefined,
    mouse     : undefined,

    earth     : undefined, // group
    land      : undefined, // group

    crust     : undefined,
    tunnel    : undefined,
    chord     : undefined,
    core      : {
      inner   : undefined,
      outer   : undefined
    },

    resize : function() {

      let c = app.elements.canvas;

      // If canvas dimensions are different from window dimensios
      if ( c.width !== c.clientWidth || c.height !== c.clientHeight ) {

        // Resize
        app.three.renderer.setSize(
          c.clientWidth,
          c.clientHeight,
          false
        );

        // Updates camera accordingly
        app.three.camera.aspect = c.clientWidth / c.clientHeight;
        app.three.camera.updateProjectionMatrix();

      }

    },

    render : function( time ) {

      // Makes canvas responsive
      app.three.resize();

      // Just a counter since the animation started
      app.data.seconds = time * .001;

      // Values to be updated based on the inclination sensor
      // let northsouth = 0; // +90 to -90
      // let eastwest   = 0; // +90 to -90
      // temp
      let northsouth = app.three.mouse.y * 90; // +90 to -90
      let eastwest   = app.three.mouse.x * 90; // +90 to -90


      if ( app.data.incoming.json ) {
        northsouth = app.data.incoming.json.x;
        eastwest   = - app.data.incoming.json.z;
      }

      // Move tunnel according to shovel inclination
      app.three.tunnel.rotation.x = THREE.Math.degToRad( 90 + northsouth );
      app.three.chord.rotation.x = THREE.Math.degToRad( 90 + northsouth );

      app.three.tunnel.rotation.z = THREE.Math.degToRad( eastwest );
      app.three.chord.rotation.z = THREE.Math.degToRad( eastwest );


      // Rotates crust so default location is at latitude and longitude 0
      app.three.crust.rotation.y = THREE.Math.degToRad( -90 )

      // Rotates countries so default location is at latitude and longitude 0
      if ( app.three.land ) {
        app.three.land.rotation.y = THREE.Math.degToRad( -180)
      }

      // Rotates crust & countries so it looks like the pivot point is the user location
      if ( app.data.user.latitude && app.data.user.longitude ) {

        // Crust
        app.three.crust.rotation.x = THREE.Math.degToRad( app.data.user.latitude )
        app.three.crust.rotation.y = THREE.Math.degToRad( -90 - app.data.user.longitude )

        // Countries
        if ( app.three.land ) {
          app.three.land.rotation.y = THREE.Math.degToRad( -180 - app.data.user.longitude )
        }

      }

      // Rotates Earth (group) to counter-act previous rotation so OrbitControls work better
      app.three.earth.rotation.x = THREE.Math.degToRad( - app.data.user.latitude )



      // Gets position & direction of chord (center of tunnel)

      let chordPosition = app.three.chord.geometry.getAttribute( 'position' );

      let vertexOrigin = new THREE.Vector3();
      vertexOrigin.fromBufferAttribute( chordPosition, 0 );

      let vertexDestination = new THREE.Vector3();
      vertexDestination.fromBufferAttribute( chordPosition, 1 );

      let worldOrigin = app.three.chord.localToWorld( vertexOrigin );
      let worldDestination = app.three.chord.localToWorld( vertexDestination );
      let chordDirection = worldDestination.sub(worldOrigin).normalize();

      // Makes raycaster match the position and angle of the tunnel
      app.three.raycaster.set( worldOrigin, chordDirection );

      // Checks collision of chord (tunnel center) with every country
      if ( app.three.land ) {

        // calculate objects intersecting the picking ray
        for ( let country of app.three.land.children ) {

          let intersections = app.three.raycaster.intersectObject( country,  );

          // Get farthest intersections (ignore intersection at user location)
          if ( intersections.length > 0 ) {

            let intersection = intersections[ intersections.length - 1 ];

            let country = intersection.object.name;
            let distance = intersection.distance;
            let exit = intersection.point;

            if ( distance > 1000 ) { // Tunnels need to be at least 1000 km long

              console.log( 'A tunnel in this direction would be ' + parseInt( distance ) + 'km long and lead you to ' + country );

            }

          }

        }

      }










      // Makes camera orbit
      app.three.controls.update();

      app.three.renderer.render(
        app.three.scene,
        app.three.camera
      );

      // Recursion: this function calls itself to draw frames of 3D animation
      requestAnimationFrame( app.three.render );

    },

    update : function() {

      // Placeholder for handling data coming from inclination sensor
      console.log( app.data.incoming.json )

    },

    normalizeMouse : function( event ) {

      app.three.mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	    app.three.mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

    },

    create : {

      map3DGeometry : function( data ) {

        THREE.Geometry.call (this);

        // data.vertices = [lat, lon, ...]
        // data.polygons = [[poly indices, hole i-s, ...], ...]
        // data.triangles = [tri i-s, ...]
        let i, uvs = [];
        for (i = 0; i < data.vertices.length; i += 2) {
          let lon = data.vertices[i];
          let lat = data.vertices[i + 1];

          // colatitude
          let phi = +(90 - lat) * 0.01745329252;

          // azimuthal angle
          let the = +(180 - lon) * 0.01745329252;

          // translate into XYZ coordinates
          let wx = Math.sin (the) * Math.sin (phi) * -1;
          let wz = Math.cos (the) * Math.sin (phi);
          let wy = Math.cos (phi);

          // equirectangular projection
          let wu = 0.25 + lon / 360.0;
          let wv = 0.5 + lat / 180.0;

          this.vertices.push (new THREE.Vector3 (wx, wy, wz));

          uvs.push (new THREE.Vector2 (wu, wv));
        }

        let n = this.vertices.length;

        for (i = 0; i < n; i++) {
          let v = this.vertices[i];
          this.vertices.push (v.clone ().multiplyScalar (0));
        }

        for (i = 0; i < data.triangles.length; i += 3) {
          let a = data.triangles[i];
          let b = data.triangles[i + 1];
          let c = data.triangles[i + 2];

          this.faces.push( new THREE.Face3( a, b, c, [ this.vertices[a], this.vertices[b], this.vertices[c] ] ) );
          this.faceVertexUvs[ 0 ].push( [ uvs[ a ], uvs[ b ], uvs[ c ] ]);
        }

        this.computeFaceNormals ();

        this.boundingSphere = new THREE.Sphere( new THREE.Vector3 (), 1 );

      },

      countries : function( json ) {

        app.data.countries = json

        app.three.create.map3DGeometry.prototype = Object.create( THREE.Geometry.prototype );

        let material = new THREE.MeshNormalMaterial()
        material.side = THREE.DoubleSide;

        app.three.land = new THREE.Group();
        app.three.land.scale.set(
          app.data.earth.radius.crust,
          app.data.earth.radius.crust,
          app.data.earth.radius.crust
        );

        let countries = app.data.countries

        for ( let name in countries ) {
          geometry = new app.three.create.map3DGeometry( countries[ name ] );
          app.three.land.add( countries[ name ].mesh = new THREE.Mesh( geometry, material ) );
          countries[name].mesh.name = name;
        }

        app.three.scene.add( app.three.land );

      }

    },

    initialize : function() {


      app.three.raycaster = new THREE.Raycaster();
      app.three.mouse     = new THREE.Vector2();


      { // Countries

        // Gets countries geometries
        fetch( '../assets/countries.json' )
         .then( response => response.json() )
         .then( json => app.three.create.countries( json ) )

      }

      { // Crust

        let material = new THREE.MeshBasicMaterial({
          color: 0xFFFFFF,
          wireframe: true,
          opacity: 0.2,
          transparent: true
        });

        // Show satellite texture for debugging
        // material.map = THREE.ImageUtils.loadTexture('../assets/texture.jpg')

        let geometry = new THREE.SphereGeometry(
          app.data.earth.radius.crust * 0.99,
          16,
          16
        );

        app.three.crust = new THREE.Mesh( geometry, material );

      }

      { // Tunnel

        let material = new THREE.MeshBasicMaterial({
          color: 0xFF0000,
          wireframe: true,
          opacity: .8,
          transparent: true
        });
        let geometry = new THREE.CylinderGeometry(
          app.data.earth.radius.crust / 20,
          app.data.earth.radius.crust / 200,
          app.data.earth.radius.crust * 2,
          6,
          32,
          true
        );

        // Rotates around end, not center
        geometry.translate( 0, -app.data.earth.radius.crust, 0);

        app.three.tunnel = new THREE.Mesh( geometry, material );
        app.three.tunnel.position.z = app.data.earth.radius.crust;

      }

      { // Chord

        //create a blue LineBasicMaterial
        let material = new THREE.LineBasicMaterial( { color: 0x0000ff } );

        let points = [
          new THREE.Vector3( 0,  app.data.earth.radius.crust, 0 ),
          new THREE.Vector3( 0, -app.data.earth.radius.crust, 0 )
        ];

        let geometry = new THREE.BufferGeometry().setFromPoints( points );
        geometry.translate( 0, -app.data.earth.radius.crust, 0);

        app.three.chord = new THREE.Line( geometry, material );
        app.three.chord.position.z = app.data.earth.radius.crust;

      }

      { // Earth (group)

        app.three.earth = new THREE.Group();
        app.three.earth.add(
          app.three.crust,
          app.three.tunnel,
          app.three.chord
        );

      }

      // Begins renderer with transparent background
      app.three.renderer = new THREE.WebGLRenderer({
        canvas : app.elements.canvas,
        alpha : true,
        logarithmicDepthBuffer: true // prevents z fighting
      });

      // Let there be light
      app.three.light = new THREE.DirectionalLight( 0xFFFFFF, 1 );
      app.three.light.position.set( -1, 2, 4 );

      // Creates camera
      app.three.camera = new THREE.PerspectiveCamera( 50, 1, .1, app.data.earth.radius.crust * 30 );
      app.three.camera.position.z = app.data.earth.radius.crust * 3;

      // Makes camera move with mouse
      app.three.controls = new THREE.OrbitControls(
        app.three.camera,
        app.elements.canvas
      );

      // Makes camera move automatically and with inertia
      app.three.controls.autoRotate = true;
      app.three.controls.autoRotateSpeed =   2; // 1 orbit in 30 seconds
      app.three.controls.autoRotateSpeed = .25; // 1 orbit in 240 seconds
      app.three.controls.enableDamping = true;
      app.three.controls.enableZoom = false;



      // Includes label
      // let countryDiv = document.createElement( 'div' );
			// countryDiv.className = 'label';
			// countryDiv.textContent = 'Earth';
			// countryDiv.style.marginTop = '-1em';
      //
			// let countryLabel = new THREE.CSS2DObject( countryDiv );
			// countryLabel.position.set( 0, EARTH_RADIUS, 0 );
			// app.three.crust.add( countryLabel );











      // Creates scene
      app.three.scene = new THREE.Scene();
      app.three.scene.add( app.three.light );
      // app.three.scene.add( app.three.crust );
      // app.three.scene.add( app.three.tunnel );
      app.three.scene.add( app.three.earth );
      // app.three.scene.add( app.three.chord );

      // Plot axis for debugging
      // X = red
      // Y = green
      // Z = blue
      app.three.scene.add( new THREE.AxesHelper( 1000 ) );

      // Animate 3D elements
      requestAnimationFrame( app.three.render );

    }

  },

  geolocation : {

    found : function( position ) {

      app.data.user.latitude = position.coords.latitude;
      app.data.user.longitude = position.coords.longitude;

      alert( 'Found you :)' );

      console.log( position.coords.latitude, position.coords.longitude );

    },

    error : function() {

      let prompt = window.prompt(

        'Sorry, there was an error. ' +
        'Please type in your latitude and longitude as decimal degrees ' +
        '(West and South are negative):',

        '-23.5505,-46.6333');

      let coordinates = prompt.split(',')

      app.data.user.latitude  = parseFloat( coordinates[ 0 ] );
      app.data.user.longitude = parseFloat( coordinates[ 1 ] );

    },

    find : function() {

      if ( navigator.geolocation ) {

        navigator.geolocation.getCurrentPosition(
          app.geolocation.found,
          app.geolocation.error
        );

      } else {

        app.geolocation.error();

      }

    }

  },

  serial : {

    split : function() {

      // Split concatenated string by newline character
      let parts = app.data.incoming.stream.split( "\n" );

      // If there is at least one newline character
      if ( parts.length > 1 ) {

        // Stores JSON string in variable
        let string = parts[ 0 ];

        // Checks if it is a valid JSON
        if ( app.validates.json( string ) ) {

          // Parses and store most recent JSON received
          app.data.incoming.json = JSON.parse( string );

          // Call function to handle the newly received data
          app.three.update();

        }

        // Resets incoming stream (concatenated strings) for next JSON package
        app.data.incoming.stream = parts[ 1 ];

        // Recursion to account for multiple newline characters in string
        app.serial.split();

      }

    },

    connect : function() {

      if ( 'serial' in navigator ) {

        // Begins asynchronous call
        (async() => {

          // Request serial ports using Web Serial API
          const port = await navigator.serial.requestPort();

          // Sets rate to 9600 bits per second (must match Arduino’s)
          await port.open({
            baudRate: 9600
          });

          // Converts messages to strings
          const textDecoder = new TextDecoderStream();
          const readableStreamClosed = port.readable.pipeTo( textDecoder.writable );
          const reader = textDecoder.readable.getReader();

          // Listen to data coming from the serial device
          while ( true ) {

            const { value, done } = await reader.read();

            if ( done ) {

              // Allow the serial port to be closed later
              reader.releaseLock();
              break;

            }

            // Put incoming strings together until it finds a new line
            app.data.incoming.stream += value;
            app.serial.split();

          }


        })();

      }

    }

  },

  events : {

    initialize : function() {

      // Connect to serial port when button is clicked
      app.elements.connectButton.addEventListener( 'click', app.serial.connect );

      // Find user’s location when button is clicked
      app.elements.findButton.addEventListener( 'click', app.geolocation.find );

      // Calculate mouse position in normalized device coordinates (-1 to +1)
      window.addEventListener( 'mousemove', app.three.normalizeMouse, false );

      // Calculate clicked country
      window.addEventListener( 'click', function(e) {

        /*
        // update the picking ray with the camera and mouse position
        app.three.raycaster.setFromCamera( app.three.mouse, app.three.camera );

        if ( app.three.land ) {

          // calculate objects intersecting the picking ray
          for ( let country of app.three.land.children ) {

            let intersects = app.three.raycaster.intersectObject( country );

            for ( let i = 0; i < intersects.length; i ++ ) {
              // [ i ].object.material.color.set( 0xff0000 );
              console.log( intersects[ i ].object.name );
            //
            }

          }

        }
        */

      } );

    }

  },

  initialize : function() {

    app.three.initialize()
    app.events.initialize()


  }

}

// Start everything
app.initialize()