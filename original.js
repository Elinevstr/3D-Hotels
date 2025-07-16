class HotelMapApp {
    constructor() {
        this.map3D = null;
        this.activeMarker = null;
        this.nearbyMarkers = [];
        this.activePolylines = new Map();
        this.activeCenterMarkers = new Map();
        this.apiKey = "AIzaSyCVNX6mCprAYiGp8RUaf9yc6H-00fLR1Ns"; // Replace with your key
        this.elevationKey= "AIzaSyCCThoiMgZnmvLy0Nc2AeITEkNjE6dSlps"

        this.library = {}; // will store all imported modules

        this.elements = {
            placeList: document.querySelector("gmp-place-list"),
            placeDetails: document.querySelector("gmp-place-details"),
            placeDetailsRequest: document.querySelector("gmp-place-details-place-request"),
            hotelList: document.getElementById("hotel-list"),
            loadingOverlay: document.getElementById("loading-overlay"),
            sponsoredPopup: document.getElementById("sponsored-popup"),
            sponsoredContainer: document.getElementById("sponsored-activities-container"),
            sponsoredTitle: document.getElementById("sponsored-hotel-name"),
            weatherBox: document.getElementById("weather-info"),
            backButton: null,
            map: document.getElementById("map")
        };

        this.init();
    }

    async init() {
        try {
            // Preload libraries
            //@ts-ignore
            const [
                { Map, LatLngBounds },
                { Marker3DInteractiveElement, Map3DElement, MapMode, PopoverElement, AltitudeMode, Polyline3DElement },
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
                PopoverElement,
                AltitudeMode,
                Polyline3DElement,
                PinElement,
                encoding,
                PlaceAutocompleteElement
            };

            await this.setupPlaceAutocomplete();
            await this.initializeMap();
            this.createBackButton();

            this.elements.placeList.addEventListener('gmp-placeselect', ({ place }) => {
                this.moveToLocation(place.toJSON());
            });

        } catch (error) {
            console.error("Failed to initialize app:", error);
        }
    }

    async initializeMap() {
        const {Map3DElement} = this.library;
     this.map3D = new Map3DElement({
        center: { lat: 34.8405, lng: -111.7909, altitude: 1322.70 }, range: 5000000, tilt: 67.44, 
        mode: 'SATELLITE'
    });
    this.elements.map.appendChild(this.map3D);

        
    console.log("3D Map initialized");
    }
     clearAllRoutes() {
        this.activePolylines.forEach((polyline) => {
            this.map3D.removeChild(polyline);
        });
        this.activeCenterMarkers.forEach((centerMarker) => {
            this.map3D.removeChild(centerMarker);
        });
        this.activePolylines.clear();
        this.activeCenterMarkers.clear();
    }

    

    async setupPlaceAutocomplete() {
        const { PlaceAutocompleteElement } = this.library;

        const autocompleteContainer = document.getElementById('place-autocomplete-card');
        if (!autocompleteContainer) return;

        if (document.getElementById('place-autocomplete-input')) return;

        const placeAutocomplete = new PlaceAutocompleteElement();
        placeAutocomplete.id = 'place-autocomplete-input';
        autocompleteContainer.appendChild(placeAutocomplete);

        placeAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
            try {
                this.clearAllRoutes();
                const place = await placePrediction.toPlace();
                await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
                await this.getNearbyHotels(place.toJSON().location);
            } catch (error) {
                console.error("Error selecting place:", error);
            }
        });
    }

    async addMarkers() {
        const { Marker3DInteractiveElement, PinElement } = this.library;

        this.elements.sponsoredPopup.classList.remove('visible');
        if (this.elements.placeList.places?.length > 0) {
            this.elements.placeList.places.forEach(async (feature, index) => {
                const location = feature.location.toJSON();
                const lat = location.lat;
                const lng = location.lng;

                const groundElevation = await this.getElevation(lat, lng);
                const altitude = groundElevation + (Math.floor(Math.random() * 5) * 20) + 10;

                const marker = new Marker3DInteractiveElement({
                    position: { lat, lng, altitude },
                    altitudeMode: "ABSOLUTE",
                    extruded: true,
                    collisionBehavior: google.maps.CollisionBehavior.REQUIRED
                });

                const pin = new PinElement({ scale: 1 });
                marker.addEventListener('gmp-click', () => {
                    this.moveToLocation(feature.toJSON());
                });

                marker.append(pin);
                this.map3D.append(marker);
                this.nearbyMarkers.push(marker);
            });
        }
    }

    clearAllRoutes() {
        this.activePolylines.forEach(polyline => this.map3D.removeChild(polyline));
        this.activeCenterMarkers.forEach(marker => this.map3D.removeChild(marker));
        this.activePolylines.clear();
        this.activeCenterMarkers.clear();
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
            console.log(data)
            return data;

        } catch (error) {
            console.error("Error calculating route:", error);
            return null;
        }
    }
    async moveToLocation(hotel) {
        const { Marker3DInteractiveElement, PinElement } = this.library;

        if (this.activeMarker) this.activeMarker.remove();
        this.activeMarker = await this.addFloatingHotelMarker(hotel);

        this.activeMarker.addEventListener('gmp-click', async () => {
            await this.setCamera(hotel.location.lat, hotel.location.lng, 10, 75, 100);
        });

        try {
            const { lat, lng } = hotel.location;
            await this.setCamera(lat, lng, 10, 75, 1000);
            this.searchNearbyFeatures(hotel.location);
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
                altitude: groundElevation + 20
            },
            altitudeMode: "RELATIVE_TO_GROUND",
            collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
            extruded: false
        });

        marker.append(pin);
        this.map3D.append(marker);
        return marker;
    }

    async setCamera(lat, lng, alt, tilt, range) {
        this.map3D.flyCameraTo({
            endCamera: {
                center: {
                    lat: lat,
                    lng: lng,
                    altitude: alt
                },
                range: range,
                tilt: tilt,
                heading: 0
            },
            durationMillis: 5000
        });

        this.map3D.addEventListener('gmp-animationend', () => {
            this.map3D.flyCameraAround({
                camera: { center: { lat, lng, altitude: alt }, tilt, range, heading: 0 },
                durationMillis: 100000,
                rounds: 1
            });
        }, { once: true });
    }
searchNearbyFeatures(location) {
        this.nearbyMarkers.forEach(marker => marker.remove());
        this.nearbyMarkers = [];
        const requestBody = {
            includedTypes: ["monument", "museum", "tourist_attraction", "beach", "shopping_mall"],
            excludedTypes: ["hotel"],
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
      //  await this.displaySponsoredActivities(places, location);
        this.createFeatureMarkers(places, location);
    } else {
        this.elements.sponsoredPopup.classList.remove('visible');
    }
}
async createFeatureMarkers(places, location) {
    // Import all libraries once at the beginning
    const [
        { Marker3DInteractiveElement, PopoverElement, AltitudeMode, Polyline3DElement },
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
            altitudeMode: "ABSOLUTE",
            extruded: true,
            drawsOccludedSegments: true,
        });
    };

    // Process all places
    const markerPromises = places.map(async (feature, index) => {
        const placeId = feature.id;
        const markerId = `marker_${index}`;

        try {
            // Get elevation for this marker
            const groundElevation = await this.getElevation(
                feature.location.latitude, 
                feature.location.longitude
            );
            const altitude = groundElevation + (Math.floor(Math.random() * 5) * 25) + 10;

            // Create the marker
            const marker = new Marker3DInteractiveElement({
                position: {
                    lat: feature.location.latitude,
                    lng: feature.location.longitude,
                    altitude: altitude
                },
                label: `${index < 3 ? '⭐' : ''}${feature.displayName.text}`,
                altitudeMode: "RELATIVE_TO_GROUND",
                extruded: true,
                collisionBehavior: google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
            });

            // Create and style pin
            const pin = new PinElement({
                scale: 0,
                glyph: new URL(`${feature.iconMaskBaseUri}.svg`),
                glyphColor: "white"
            });
            marker.append(pin);

            // Create the popover
            const popover = new PopoverElement({
                open: false,
                altitudeMode: AltitudeMode.RELATIVE_TO_GROUND,
                positionAnchor: marker,
            });
            popover.classList.add("light-popover");

            // Add place details to popover
            const placeDetailsEl = createPlaceDetailsElement(placeId);
            popover.append(placeDetailsEl);

            // Handle marker clicks
            marker.addEventListener("gmp-click", async () => {
                popover.open = !popover.open;
               
                if (popover.open) {
                    // Clean up ALL existing route elements using class method
                    this.clearAllRoutes();

                    try {
                        // Calculate route from current location to feature
                        const route = await this.calculateRoute(location, feature.location);
                        
                        if (route && route.routes && route.routes[0]) {
                            // Create and display polyline
                            const polyline = createRoutePolyline();
                            const path = google.maps.geometry.encoding.decodePath(route.routes[0].polyline.encodedPolyline);
                            polyline.coordinates = path;

                            // Fix: Use Math.floor for center calculation
                            const middleIndex = Math.floor(path.length / 2);
                            const centerValue = path[middleIndex];
                            
                            // Create center marker with route info
                            const centerMarker = new Marker3DInteractiveElement({
                                position: {
                                    lat: centerValue.lat(),
                                    lng: centerValue.lng(),
                                    altitude: altitude
                                },
                                label: `🚶‍♂️${route.routes[0].localizedValues.duration.text} - ${route.routes[0].localizedValues.distance.text}`,
                                altitudeMode: "RELATIVE_TO_GROUND",
                                extruded: true,
                                collisionBehavior: google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
                            });
                            

                            // Create pin for center marker (reuse feature icon)
                            const centerPin = new PinElement({
                                scale: 0,
                                glyph: new URL(`${feature.iconMaskBaseUri}.svg`),
                                glyphColor: "white"
                            });
                            centerMarker.append(centerPin);

                            // Store references in class properties
                            this.activePolylines.set(markerId, polyline);
                            this.activeCenterMarkers.set(markerId, centerMarker);

                            // Add to map
                            this.map3D.append(polyline);
                            this.map3D.append(centerMarker);

                            console.log("Route displayed for:", feature.displayName.text);
                        } else {
                            console.warn("No route found for:", feature.displayName.text);
                        }
                    } catch (error) {
                        console.error("Error calculating route:", error);
                    }
                } else {
                    // Clean up when popover closes
                    this.removeSpecificRoute(markerId);
                }
            });

            // Append to map
            this.map3D.append(popover);
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
        const url = `https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lng}&key=${this.elevationKey}`;
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

    async getNearbyHotels(location) {
        this.elements.placeList = document.querySelector('gmp-place-list');
        try {
            this.nearbyMarkers.forEach(marker => marker.remove());
            this.nearbyMarkers = [];
            this.elements.backButton.style.display = 'none';
            this.elements.placeDetails.style.display = 'none';
            this.elements.placeList.style.display = 'block';

            await this.elements.placeList.configureFromSearchNearbyRequest({
                locationRestriction: { center: location, radius: 3000 },
                includedPrimaryTypes: ['hotel'],
                rankPreference: "POPULARITY",
                maxResultCount: 15
            });

            this.addMarkers();
            await this.showWeatherInfo(location);
            await this.setCamera(location.lat, location.lng, 10, 50, 4500);
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
            { max: 5, color: "#FFFED7" },
            { max: 15, color: "#FFFC64" },
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

    createBackButton() {
        const btn = document.createElement('button');
        btn.id = 'back-to-hotels-btn';
        btn.innerHTML = '← Back to Hotels';
        btn.className = 'back-button';
        btn.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 1000;
            background: #2196F3;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            display: none;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#1976D2';
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = '#2196F3';
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        });

        btn.addEventListener('click', () => {
            this.clearAllRoutes();
            this.showHotelList();
        });

        this.elements.backButton = btn;
        document.body.appendChild(btn);
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
        this.resetCameraToShowAllHotels();
    }

    resetCameraToShowAllHotels() {
        const { LatLngBounds } = this.library;

        if (this.elements.placeList.places?.length > 0) {
            const bounds = new LatLngBounds();
            this.elements.placeList.places.forEach(place => {
                bounds.extend(place.location);
            });

            const center = bounds.getCenter();
            this.setCamera(center.lat(), center.lng(), 10, 45, 8000);
        }
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
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
     setTimeout(() => {
        new HotelMapApp();
    }, 100);
});

// Legacy support - expose some functions globally if needed
window.HotelMapApp = HotelMapApp;