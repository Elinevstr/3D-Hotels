class HotelMapApp {
    constructor() {
        this.map3D = null;
        this.activeMarker = null;
        this.nearbyMarkers = [];
        this.nearbyPlaces = [];
        this.activePolylines = new Map();
        this.activeCenterMarkers = new Map();
        this.selectedPlace = null;
        this.apiKey = "AIzaSyCVNX6mCprAYiGp8RUaf9yc6H-00fLR1Ns"; // Replace with your key
        this.elevationKey = "AIzaSyCCThoiMgZnmvLy0Nc2AeITEkNjE6dSlps"

        this.library = {}; // will store all imported modules

        this.elements = {
            placeList: document.querySelector("gmp-place-search"),
            placeDetails: document.querySelector("gmp-place-details"),
            placeDetailsRequest: document.querySelector("gmp-place-details-place-request"),
            hotelList: document.getElementById("hotel-list"),
            loadingOverlay: document.getElementById("loading-overlay"),
            sponsoredPopup: document.getElementById("sponsored-popup"),
            sponsoredContainer: document.getElementById("sponsored-activities-container"),
            sponsoredTitle: document.getElementById("sponsored-hotel-name"),
            weatherBox: document.getElementById("weather-info"),
            backButton: document.getElementById("back-to-hotels-btn"),
            sidebar: document.getElementById("sidebar"),
            gobutton: document.getElementById("gobutton"),
            map: document.getElementById("map"),
            categoryDropdown1: document.getElementById("category-dropdown-1"),
            categoryDropdown2: document.getElementById("category-dropdown-2"),
        };

        this.init();
    }
    createBoundsFromCenterAndRadius(center, radiusMeters) {
        const diagonal = radiusMeters * Math.sqrt(2);
        const ne = google.maps.geometry.spherical.computeOffset(center, diagonal, 45);
        const sw = google.maps.geometry.spherical.computeOffset(center, diagonal, 225);
        return new google.maps.LatLngBounds(sw, ne);
    };
    async init() {
        try {
            // Preload libraries
            //@ts-ignore
            const [
                { Map, LatLngBounds },
                { Marker3DInteractiveElement, Map3DElement, MapMode, AltitudeMode, Polyline3DElement },
                { PinElement },
                { encoding },
                { PlaceAutocompleteElement }
            ] = await Promise.all([
                google.maps.importLibrary("maps"),
                google.maps.importLibrary("maps3d"),
                google.maps.importLibrary("marker"),
                google.maps.importLibrary("geometry"),
                google.maps.importLibrary("places")
            ]);

            this.library = {
                Map,
                LatLngBounds,
                Marker3DInteractiveElement,
                Map3DElement,
                MapMode,
                AltitudeMode,
                Polyline3DElement,
                PinElement,
                encoding,
                PlaceAutocompleteElement
            };

            await this.setupPlaceAutocomplete();
            await this.initializeMap();
            await this.loadCategoryMapping();
            this.setupCategoryDropdowns();
            this.elements.placeList.addEventListener('gmp-select', ({ place }) => {
                this.moveToLocation(place.toJSON());
            });
            this.elements.backButton.addEventListener('click', () => {
                this.clearAllRoutes();
                this.showHotelList();
                if (this.activeMarker) this.activeMarker.remove();

            });
            this.map3D.addEventListener('click', () => {
                this.clearAllRoutes();
                // this.setCamera(this.selectedPlace.location.lat, this.selectedPlace.location.lng, 10, 35, 1000);

            });


        } catch (error) {
            console.error("Failed to initialize app:", error);
        }
    }
    async loadCategoryMapping() {
        try {
            const response = await fetch('placeCategories.json');
            if (!response.ok) throw new Error("Failed to load category mappings");

            this.categoryMappings = await response.json();
        } catch (error) {
            console.error("Error loading category mappings:", error);
            this.categoryMappings = {};
        }
    }

    async initializeMap() {
        const { Map3DElement } = this.library;
        this.map3D = new Map3DElement({
            center: { lat: 34.8405, lng: -111.7909, altitude: 1322.70 }, range: 50000000, tilt: 0,
            mode: 'SATELLITE'
        });
        this.elements.map.appendChild(this.map3D);
        this.map3D.style.borderRadius = "10px";
        this.map3D.style.width = "100%";
        this.map3D.style.height = "100%";


        console.log("3D Map initialized");
    }


    setupCategoryDropdowns() {
        const dropdown1 = this.elements.categoryDropdown1;
        const dropdown2 = this.elements.categoryDropdown2;

        // Get list of display names
        const categoryLabels = Object.values(this.categoryMappings).map(cat => cat.DisplayName);

        const populateDropdown = (dropdown, exclude = "", defaultLabel = "") => {
            dropdown.innerHTML = "";

            categoryLabels.forEach(label => {
                if (label !== exclude) {
                    const option = document.createElement("option");
                    option.value = label;
                    option.textContent = label;
                    if (label === defaultLabel) {
                        option.selected = true;
                    }
                    dropdown.appendChild(option);
                }
            });
        };

        const syncDropdowns = () => {
            const selected1 = dropdown1.value;
            const selected2 = dropdown2.value;
            populateDropdown(dropdown1, selected2, selected1);
            populateDropdown(dropdown2, selected1, selected2);
        };

        dropdown1.addEventListener("change", syncDropdowns);
        dropdown2.addEventListener("change", syncDropdowns);

        populateDropdown(dropdown1, "🍴 Food & Drink", "🏛️ Culture & History");
        populateDropdown(dropdown2, "🏛️ Culture & History", "🍴 Food & Drink");
    }

    async setupPlaceAutocomplete() {
        const { PlaceAutocompleteElement } = this.library;

        const autocompleteContainer = document.getElementById('place-autocomplete-card');
        if (!autocompleteContainer) return;

        if (document.getElementById('place-autocomplete-input')) return;

        const placeAutocomplete = new PlaceAutocompleteElement();
        placeAutocomplete.id = 'place-autocomplete-input';
        autocompleteContainer.appendChild(placeAutocomplete);


        this.selectedPlace = null;

        placeAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
            try {
                const place = await placePrediction.toPlace();
                await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
                this.selectedPlace = place.toJSON(); // store it
                console.log("Place selected, waiting for Go button...");
            } catch (error) {
                console.error("Error selecting place:", error);
            }
        });

        this.elements.gobutton.addEventListener('click', async () => {
            console.log("clicked")
            const header = document.getElementById('main-header');
            const dropdown = document.getElementById('dropdown-container');
            document.getElementById('card-container').style.display = 'none';
            document.getElementById('dropdown-logo').style.display = 'block';
            document.getElementById('logo').style.display = 'none';


            header.classList.remove('expanded');      // Shrink header
            dropdown.classList.add('active');
            if (!this.selectedPlace) {
                alert("Please select a destination first.");
                return;
            }
            this.gotoplace();

        });
    }
    async gotoplace() {
        const cat1 = this.elements.categoryDropdown1.value;
        const cat2 = this.elements.categoryDropdown2.value;
        const selectedLabels = [cat1, cat2].filter(Boolean);

        const types1 = this.categoryMappings[cat1]?.types ?? [];
        const types2 = this.categoryMappings[cat2]?.types ?? [];
        const combinedTypes = [...new Set([...types1, ...types2])];

        const labels = selectedLabels.map(l => this.categoryMappings[l]?.short);
        try {
            this.elements.sponsoredPopup.style.display = 'none';
            await this.getNearbyHotels(this.selectedPlace.location, labels, combinedTypes);
        } catch (error) {
            console.error("Error in Go handler:", error);
        }
    }
    async gotopresetplace(name, cat1, cat2, location) {
        const header = document.getElementById('main-header');
        const dropdown = document.getElementById('dropdown-container');
        document.getElementById('dropdown-logo').style.display = 'block';
        document.getElementById('logo').style.display = 'none';
        document.getElementById('card-container').style.display = 'none';

        header.classList.remove('expanded');
        dropdown.classList.add('active');

        this.selectedPlace = { location };

        const selectedLabels = [cat1, cat2].filter(Boolean);
        const types1 = this.categoryMappings[cat1]?.types ?? [];
        const types2 = this.categoryMappings[cat2]?.types ?? [];
        const combinedTypes = [...new Set([...types1, ...types2])];
        const labels = selectedLabels.map(l => this.categoryMappings[l]?.short);

        this.resetBeforeNewPlace(); // cleanup

        try {
            await this.getNearbyHotels(location, labels, combinedTypes);
            window.scrollTo(0, document.body.scrollHeight);
        } catch (error) {
            console.error("Error in Go handler:", error);
        }
    }
    async addMarkers(types) {
        const { Marker3DInteractiveElement, PinElement } = this.library;

        this.elements.sponsoredPopup.style.display = 'none';
        if (this.elements.placeList.places?.length > 0) {
            this.elements.placeList.places.forEach(async (feature, index) => {
                const location = feature.location.toJSON();
                const lat = location.lat;
                const lng = location.lng;

                const groundElevation = await this.getElevation(lat, lng);
                const altitude = groundElevation + (Math.floor(Math.random() * 5) * 20) + 10;

                const marker = new Marker3DInteractiveElement({
                    position: { lat, lng },
                    altitudeMode: "RELATIVE_TO_MESH",
                    extruded: true,
                    collisionBehavior: google.maps.CollisionBehavior.REQUIRED
                });

                const pin = new PinElement({ scale: 1 });
                marker.addEventListener('gmp-click', () => {
                    this.moveToLocation(feature.toJSON(), types);
                });

                marker.append(pin);
                this.map3D.append(marker);
                this.nearbyMarkers.push(marker);
            });
        }
    }

    clearAllRoutes() {
        this.activePolylines.forEach(polyline => this.map3D.removeChild(polyline));
        this.activePolylines.clear();
    }

    removeSpecificRoute(markerId) {
        const polyline = this.activePolylines.get(markerId);
        const centerMarker = this.activeCenterMarkers.get(markerId);
        if (polyline) this.map3D.removeChild(polyline);
        if (centerMarker) this.map3D.removeChild(centerMarker);
        this.activePolylines.delete(markerId);
        this.activeCenterMarkers.delete(markerId);
    }
    async calculateRoute(origin, destination) {
        console.log(destination)

        const requestBody = {
            origin: {
                location: {
                    latLng: {
                        latitude: origin.lat,
                        longitude: origin.lng
                    }
                }
            },
            destination: {
                location: {
                    latLng: {
                        latitude: destination.latitude,
                        longitude: destination.longitude
                    }
                }
            },
            travelMode: "WALK",
        };

        try {
            const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
                method: "POST",
                body: JSON.stringify(requestBody),
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-FieldMask": "routes.polyline,routes.localizedValues",
                    "X-Goog-Api-Key": this.apiKey
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            console.error("Error calculating route:", error);
            return null;
        }
    }
    async moveToLocation(hotel, types) {
        this.elements.sponsoredPopup.style.display = 'none';
        this.selectedPlace = hotel;
        if (this.activeMarker) this.activeMarker.remove();
        this.activeMarker = await this.addFloatingHotelMarker(hotel);
        const groundElevation = await this.getElevation(hotel.location.lat, hotel.location.lng);

        this.activeMarker.addEventListener('gmp-click', async () => {
            await this.setCamera(hotel.location.lat, hotel.location.lng, 10, 35, groundElevation + 300);
        });
        console.log(groundElevation)
        try {
            await this.setCamera(hotel.location.lat, hotel.location.lng, 10, 45, groundElevation + 3000);
            this.searchNearbyFeatures(hotel.location, types);
            this.displayHotelDetails(hotel.id);
        } catch (error) {
            console.error("Error during map move:", error);
        }
    }

    async addFloatingHotelMarker(hotel) {
        const { Marker3DInteractiveElement, PinElement } = this.library;

        const groundElevation = await this.getElevation(hotel.location.lat, hotel.location.lng);
        const pin = new PinElement({ scale: 1.4 });
        const marker = new Marker3DInteractiveElement({
            position: {
                lat: hotel.location.lat,
                lng: hotel.location.lng,
            },
            altitudeMode: "RELATIVE_TO_MESH",
            collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
            extruded: false
        });

        marker.append(pin);
        this.map3D.append(marker);
        return marker;
    }

    async setCamera(lat, lng, alt, tilt, range) {
        const flyOptions = {
            endCamera: {
                center: { lat, lng, altitude: alt },
                range,
                tilt,
                heading: 0
            },
            durationMillis: 3000
        };

        const onAnimationEnd = () => {
            this.map3D.flyCameraAround({
                camera: { center: { lat, lng, altitude: alt }, tilt, range, heading: 0 },
                durationMillis: 50000,
                rounds: 1
            });
        };

        // Prevent duplicate animation listeners
        this.map3D.removeEventListener('gmp-animationend', onAnimationEnd);
        this.map3D.addEventListener('gmp-animationend', onAnimationEnd, { once: true });

        this.map3D.flyCameraTo(flyOptions);
    }
    searchNearbyFeatures(location, types) {
        this.nearbyPlaces = [];
        this.nearbyMarkers.forEach(marker => marker.remove());
        this.nearbyMarkers = [];
        const requestBody = {
            includedTypes: types,
            excludedTypes: ["hotel", "grocery_store", "supermarket", "bus_station", "train_station", "transit_station"],
            maxResultCount: 20,
            rankPreference: "POPULARITY",
            languageCode: "en",
            locationRestriction: {
                circle: {
                    center: { latitude: location.lat, longitude: location.lng },
                    radius: 3000
                }
            }
        };

        fetch("https://places.googleapis.com/v1/places:searchNearby", {
            method: "POST",
            body: JSON.stringify(requestBody),
            headers: {
                "Content-type": "application/json",
                "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.iconMaskBaseUri,places.primaryTypeDisplayName",
                "X-Goog-Api-Key": this.apiKey
            }
        })
            .then(response => response.json())
            .then(data => this.addNearbyFeatureMarkers(data, location))
            .catch(error => console.error("Error searching nearby features:", error));
    }
    async addNearbyFeatureMarkers({ places }, location) {

        if (!this.map3D) {
            console.error("Map3D not initialized");
            return;
        }

        // Clear existing markers
        this.nearbyMarkers.forEach(marker => marker.remove());
        this.nearbyMarkers = [];

        if (places?.length) {
            //await this.displaySponsoredActivities(places, location);
            this.createFeatureMarkers(places, location);
        } else {
            this.elements.sponsoredPopup.style.display = 'none';

        }
    }
    async createFeatureMarkers(places, location) {
        // Import all libraries once at the beginning
        const [
            { Marker3DInteractiveElement, Polyline3DElement },
            { PinElement }
        ] = await Promise.all([
            google.maps.importLibrary("maps3d"),
            google.maps.importLibrary("marker")
        ]);

        // Helper function to create place details element
        const createPlaceDetailsElement = (placeId) => {
            const placeDetailsEl = document.createElement("gmp-place-details-compact");
            placeDetailsEl.setAttribute("orientation", "horizontal");
            placeDetailsEl.setAttribute("truncation-preferred", "");

            // Place request
            const placeRequestEl = document.createElement("gmp-place-details-place-request");
            placeRequestEl.setAttribute("place", placeId);
            placeDetailsEl.appendChild(placeRequestEl);

            // Place content config
            const contentConfig = document.createElement("gmp-place-content-config");

            const configElements = [
                ["gmp-place-media", { "lightbox-preferred": "" }],
                ["gmp-place-rating"],
                ["gmp-place-type"],
                ["gmp-place-price"],
                ["gmp-place-accessible-entrance-icon"],
                ["gmp-place-open-now-status"],
                ["gmp-place-attribution"]
            ];

            configElements.forEach(([tag, attrs = {}]) => {
                const el = document.createElement(tag);
                Object.entries(attrs).forEach(([key, value]) => {
                    el.setAttribute(key, value);
                });
                contentConfig.appendChild(el);
            });

            placeDetailsEl.appendChild(contentConfig);
            placeDetailsEl.style.width = "350px";
            placeDetailsEl.style.height = "120px";
            placeDetailsEl.style.colorScheme = "light";

            // Load event
            placeDetailsEl.addEventListener("gmp-load", () => {
                placeDetailsEl.style.visibility = "visible";
                console.log(`Place details widget loaded for ${placeId}`);
            });

            return placeDetailsEl;
        };

        // Helper function to create route polyline
        const createRoutePolyline = () => {
            return new Polyline3DElement({
                strokeColor: "#ea35c6",
                strokeWidth: 10,
                altitudeMode: "RELATIVE_TO_MESH",
                extruded: true,
                drawsOccludedSegments: true,
            });
        };

        // Process all places
        const markerPromises = places.map(async (feature, index) => {
            this.nearbyPlaces.push({ name: feature.displayName?.text, type: feature.primaryTypeDisplayName?.text, location: feature.location });

            const placeId = feature.id;
            const markerId = `marker_${index}`;

            try {
                // Get elevation for this marker
                const groundElevation = await this.getElevation(
                    feature.location.latitude,
                    feature.location.longitude
                );
                const altitude = groundElevation + (Math.floor(Math.random() * 5) * 20) + 10;

                // Create the marker
                const marker = new Marker3DInteractiveElement({
                    position: {
                        lat: feature.location.latitude,
                        lng: feature.location.longitude,
                    },
                    label: `${feature.displayName.text}`,
                    altitudeMode: "RELATIVE_TO_MESH",
                    extruded: true,
                    collisionBehavior: google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
                });
                marker.originalLabel = feature.displayName.text;
                marker.label = feature.displayName.text;
                // Create and style pin
                const pin = new PinElement({
                    scale: 0,
                    glyph: new URL(`${feature.iconMaskBaseUri}.svg`),
                    glyphColor: "white"
                });
                marker.append(pin);

                // Handle marker clicks
                marker.addEventListener("gmp-click", async () => {
                    // Deselect previously active marker
                    if (this.activeMarker && this.activeMarker !== marker) {
                        this.activeMarker.label = this.activeMarker.originalLabel;
                        this.removeSpecificRoute(this.activeMarker.id);
                    }
                    // this.setCamera(location.latitude, location.longitude, 10, 50, 4000);
                    const isSameMarker = this.activeMarker === marker;

                    if (isSameMarker) {
                        // Deselect current marker
                        marker.label = this.activeMarker.originalLabel;
                        this.removeSpecificRoute(marker.id);
                        this.activeMarker = null;
                        this.setCamera(feature.location.latitude, feature.location.longitude, 10, 35, altitude + 400);
                    } else {
                        // Set this marker as active
                        marker.label = `⭐${feature.displayName.text}`;
                        this.elements.sponsoredContainer.innerHTML = "";

                        this.clearAllRoutes(); // Optional

                        try {
                            const route = await this.calculateRoute(location, feature.location);
                            if (route?.routes?.[0]) {
                                const polyline = createRoutePolyline();
                                const path = google.maps.geometry.encoding.decodePath(route.routes[0].polyline.encodedPolyline);
                                polyline.coordinates = path;

                                const placeDetailsEl = createPlaceDetailsElement(placeId);
                                this.elements.sponsoredContainer.append(placeDetailsEl);
                                this.elements.sponsoredContainer.append(
                                    `🚶‍♂️${route.routes[0].localizedValues.duration.text} - ${route.routes[0].localizedValues.distance.text}`
                                );
                                this.elements.sponsoredPopup.style.display = 'block';

                                this.activePolylines.set(marker.id, polyline);
                                this.map3D.append(polyline);
                            }
                        } catch (error) {
                            console.error("Error calculating route:", error);
                        }

                        this.activeMarker = marker;
                    }
                });


                this.map3D.append(marker);
                this.nearbyMarkers.push(marker);

                return marker;
            } catch (error) {
                console.error(`Error creating marker for ${feature.displayName.text}:`, error);
                return null;
            }
        });

        // Wait for all markers to be created
        const markers = await Promise.all(markerPromises);
        console.log(`Created ${markers.filter(m => m !== null).length} markers successfully`);
    }
    async getElevation(lat, lng) {
        const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${lat}%2C${lng}&key=${this.elevationKey}`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.status === "OK" && data.results.length > 0) {
                return data.results[0].elevation;
            } else {
                console.error("Elevation API error:", data.status);
                return 0;
            }
        } catch (error) {
            console.error("Failed to fetch elevation:", error);
            return 0;
        }
    }

    async getNearbyHotels(location, labels, types) {

        const bounds = this.createBoundsFromCenterAndRadius({ lat: location.lat, lng: location.lng }, 5000);

        try {
            this.nearbyMarkers.forEach(marker => marker.remove());
            this.nearbyMarkers = [];
            this.elements.backButton.style.display = 'none';
            this.elements.placeDetails.style.display = 'none';

            const placeList = this.elements.placeList;
            const placeSearchQuery = document.querySelector("gmp-place-text-search-request");

            placeSearchQuery.textQuery = `Hotel near ${labels[0]} and ${labels[1]}`;
            placeSearchQuery.locationBias = bounds;

            // Wait for results to load before continuing
            const onLoad = () => {
                this.addMarkers(types);
                placeList.removeEventListener('gmp-load', onLoad); // Remove after fire
            };
            placeList.addEventListener('gmp-load', onLoad);


            await this.showWeatherInfo(location);
            await this.setCamera(location.lat, location.lng, 10, 35, 80000);
        } catch (error) {
            console.error("Error getting nearby hotels:", error);
        }
    }

    async showWeatherInfo(location) {
        const weather = await this.getWeatherInfo(location);
        const box = this.elements.weatherBox;
        box.innerHTML = '';
        box.style.display = 'none';

        if (weather?.temperature?.degrees !== undefined && weather.weatherCondition) {
            const temp = weather.temperature.degrees;
            const bgColor = this.getTemperatureColor(temp);

            box.innerHTML = `
                <img src="${weather.weatherCondition.iconBaseUri}.svg" alt="${weather.weatherCondition.condition}">
                <span> ${temp}°C</span>
            `;
            box.style.color = bgColor;
            box.style.display = 'inline-flex';
        } else {
            box.innerHTML = `<span>Weather data unavailable</span>`;
            box.style.display = "none";
        }
    }

    getTemperatureColor(temp) {
        const colors = [
            { max: 5, color: "#4aacfcff" },
            { max: 15, color: "#f8eb30ff" },
            { max: 24, color: "#FFAE00" },
            { max: 30, color: "#FF5B00" },
            { max: Infinity, color: "#FF2500" }
        ];
        return colors.find(c => temp <= c.max).color;
    }

    displayHotelDetails(placeId) {
        this.elements.placeList.style.display = 'none';
        this.elements.placeDetails.style.display = 'block';
        this.elements.placeDetailsRequest.place = placeId;
        this.elements.backButton.style.display = 'block';
    }



    showHotelList() {

        this.nearbyMarkers.forEach(marker => marker.remove());
        this.nearbyMarkers = [];

        this.elements.placeDetails.style.display = 'none';
        this.elements.placeList.style.display = 'block';
        this.elements.backButton.style.display = 'none';

        if (this.activeMarker) {
            this.activeMarker.remove();
            this.activeMarker = null;
        }

        this.addMarkers();
        this.setCamera(this.selectedPlace.location.lat, this.selectedPlace.location.lng, 10, 45, 8000);
    }

    async getWeatherInfo(location) {
        const url = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${this.apiKey}&location.latitude=${location.lat}&location.longitude=${location.lng}`;
        try {
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error("Error fetching weather:", error);
            return null;
        }
    }

    async AIWalkingRoute() {
        const requestBody = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": `Based on the following list of places and their types, could you generate a JSON object for each stop and describe the stop? You don't need to use all stops, just the ones that are the most interesting based on the ${this.elements.categoryDropdown1.value} and ${this.elements.categoryDropdown2.value} as interests. also return in JSON a short summary title and description of the whole route. The list of location is the following: ${JSON.stringify(this.nearbyPlaces)}. The resulting JSON object should look like: {route_description: string, route_title:string, stops[{name:string,type:string, location: {lat:number,lng:number}, description:string}]}]}`
                        }
                    ]
                }
            ]
        }

        const loadingEl = document.getElementById("ai-route-loading");
        const loadingContainer = document.getElementById("loading-steps-container");
        const routeContainer = document.getElementById("ai-route-container");

        // Reset
        loadingContainer.innerHTML = "";
        loadingEl.style.display = 'block';
        routeContainer.style.display = 'none';
        this.elements.placeList.style.display = 'none';
        this.elements.placeDetails.style.display = 'none';
        this.elements.backButton.style.display = 'none';

        const loadingSteps = [
            "🔍 Looking for the best places...",
            "🧠 Asking our travel expert...",
            "🗺️ Drawing your custom route...",
            "✨ Almost there..."
        ];

        let stepIndex = 0;
        const stepInterval = setInterval(() => {
            if (stepIndex < loadingSteps.length) {
                const stepEl = document.createElement("p");
                stepEl.className = "loading-step";
                stepEl.textContent = loadingSteps[stepIndex];
                loadingContainer.appendChild(stepEl);
                stepIndex++;
            } else {
                clearInterval(stepInterval);
            }
        }, 3000);
        const summaryEl = document.getElementById("ai-route-summary");
        const stopsEl = document.getElementById("ai-route-stops");

        // Hide hotel UI
        this.elements.placeList.style.display = 'none';
        this.elements.placeDetails.style.display = 'none';
        this.elements.backButton.style.display = 'none';
        routeContainer.style.display = 'none';
        loadingEl.style.display = 'block';

        try {
            const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
                method: "POST",
                body: JSON.stringify(requestBody),
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": this.apiKey
                }
            });

            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

            const data = await response.json();
            const cleanedData = data.candidates[0].content.parts[0].text
                .replace(/^```json\s*/, '')
                .replace(/```$/, '')
                .trim();

            const jsonData = JSON.parse(cleanedData);

            // Call route drawing
            await this.calculateAIRoute(jsonData);

            // Fill UI
            loadingEl.style.display = 'none';
            routeContainer.style.display = 'block';

            summaryEl.innerHTML = `
            <h3>${jsonData.route_title}</h3>
            <p>${jsonData.route_description}</p>
        `;

            stopsEl.innerHTML = '';
            jsonData.stops.forEach(stop => {
                const div = document.createElement('div');
                div.classList.add('ai-stop-card');
                div.innerHTML = `
                <h4>${stop.name}</h4>
                <p><em>${stop.type}</em></p>
                <p>${stop.description}</p>
                <hr />
            `;
                stopsEl.appendChild(div);
            });

        } catch (error) {
            console.error("Error fetching AI descriptions:", error);
            loadingEl.innerHTML = "<p>Failed to generate route. Please try again.</p>";
        }
    }
    async calculateAIRoute(data) {
        this.clearAllRoutes();
        const [
            { Polyline3DElement }
        ] = await Promise.all([
            google.maps.importLibrary("maps3d")
        ]);

        console.log(data)
        const stops = [];
        data.stops.forEach(place => {
            stops.push(
                {
                    location: {
                        latLng: {
                            latitude: place.location.lat,
                            longitude: place.location.lng
                        }
                    }
                }
            )
        })
        const requestBody = {
            origin: {
                location: {
                    latLng: {
                        latitude: this.selectedPlace.location.lat,
                        longitude: this.selectedPlace.location.lng
                    }
                }
            },
            destination: {
                location: {
                    latLng: {
                        latitude: this.selectedPlace.location.lat,
                        longitude: this.selectedPlace.location.lng
                    }
                }
            },
            intermediates: stops,
            optimizeWaypointOrder: true,
            travelMode: "WALK",
        };

        try {
            const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
                method: "POST",
                body: JSON.stringify(requestBody),
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-FieldMask": "routes.polyline,routes.localizedValues,routes.optimized_intermediate_waypoint_index",
                    "X-Goog-Api-Key": this.apiKey
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            console.log(data)
            const createRoutePolyline = () => {
                return new Polyline3DElement({
                    strokeColor: "#ea35c6",
                    strokeWidth: 10,
                    altitudeMode: "RELATIVE_TO_MESH",
                    extruded: true,
                    drawsOccludedSegments: true,
                });
            };
            try {
                const route = data
                if (route?.routes?.[0]) {
                    const polyline = createRoutePolyline();
                    const path = google.maps.geometry.encoding.decodePath(route.routes[0].polyline.encodedPolyline);
                    polyline.coordinates = path;
                    this.map3D.append(polyline);
                }
            } catch (error) {
                console.error("Error calculating route:", error);
            }

        } catch (error) {
            console.error("Error calculating route:", error);
            return null;
        }
    }
    resetBeforeNewPlace() {
        this.clearAllRoutes();

        // Remove all nearby markers from the map
        this.nearbyMarkers.forEach(marker => {
            if (marker.parentElement) {
                marker.remove();
            }
        });
        this.nearbyMarkers = [];

        // Remove the active floating hotel marker
        if (this.activeMarker && this.activeMarker.parentElement) {
            this.activeMarker.remove();
            this.activeMarker = null;
        }

        // Also clear any center markers if needed
        this.activeCenterMarkers.forEach(marker => {
            if (marker.parentElement) {
                marker.remove();
            }
        });
        this.activeCenterMarkers.clear();

        this.elements.placeDetails.style.display = 'none';
        this.elements.backButton.style.display = 'none';

        this.elements.weatherBox.style.display = 'none';
        this.elements.weatherBox.innerHTML = '';

        this.elements.sponsoredContainer.innerHTML = '';
        this.elements.sponsoredPopup.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const app = new HotelMapApp();
        window.hotelMapApp = app; // expose the instance globally
    }, 100);
});
window.addEventListener('load', () => {
    document.getElementById('dropdown-container').classList.remove('no-transition');
});