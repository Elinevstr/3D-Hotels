const CONFIG = {
    SEARCH_RADIUS: 3000,
    PT_RADIUS: 200, //public transport 
    MAX_RESULTS: 20,
    ANIMATION_DURATION: 3000,
    CAMERA_RANGES: {
        OVERVIEW: 10000,
        DETAIL: 4000,
        CLOSE_UP: 250,
        SUPER_OVERVIEW: 50000000
    },
    DEBOUNCE_DELAY: 300,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};

class Utils {
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static validateLocation(location) {
        if (
            !location ||
            !((typeof location.lat === 'number' && typeof location.lng === 'number') || (typeof location.latitude === 'number' && typeof location.longitude === 'number'))
        ) {
            throw new Error('Invalid location data');
        }
        if (Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) {
            throw new Error('Location coordinates out of range');
        }
    }

    static createBoundsFromCenterAndRadius(center, radiusMeters) {
        const diagonal = radiusMeters * Math.sqrt(2);
        const ne = google.maps.geometry.spherical.computeOffset(center, diagonal, 45);
        const sw = google.maps.geometry.spherical.computeOffset(center, diagonal, 225);
        return new google.maps.LatLngBounds(sw, ne);
    }
}

class Logger {
    static debug(message, data = '') {
        console.log(`[DEBUG] ${message}`, data);
    }

    static error(message, error = '') {
        console.error(`[ERROR] ${message}`, error);
    }

    static info(message, data = '') {
        console.log(`[INFO] ${message}`, data);
    }
}

class ApiCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 1000;
        this.ttl = 5 * 60 * 1000; // 5 minutes
    }

    generateKey(url, body) {
        return body ? `${url}:${JSON.stringify(body)}` : url;
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.expires) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    set(key, data) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, {
            data,
            expires: Date.now() + this.ttl
        });
    }

    clear() {
        this.cache.clear();
    }
}

class ApiService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.cache = new ApiCache();
    }

    async fetchWithRetry(url, options, maxRetries = CONFIG.MAX_RETRIES, useCache = true) {
        console.log(useCache)
        const cacheKey = this.cache.generateKey(url, options?.body);

        if (useCache) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                Logger.debug('Cache hit for', url);
                return cached;
            }
        }

        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.ok) {
                    const data = await response.json();

                    if (useCache) {
                        const cacheKey = this.cache.generateKey(url, options?.body);
                        this.cache.set(cacheKey, data);
                    }

                    return data;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            } catch (error) {
                Logger.error(`API call failed (attempt ${i + 1}/${maxRetries})`, error);
                if (i === maxRetries - 1) throw error;
                await Utils.delay(CONFIG.RETRY_DELAY * Math.pow(2, i));
            }
        }
    }

    async calculateRoute(origin, destination, intermediates = []) {
        Utils.validateLocation(origin);
        Utils.validateLocation(destination);

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
                        latitude: destination.lat || destination.latitude,
                        longitude: destination.lng || destination.longitude
                    }
                }
            },
            travelMode: "WALK",
            languageCode: "en",
            units: "METRIC"
        };

        if (intermediates.length > 0) {
            requestBody.intermediates = intermediates;
            requestBody.optimizeWaypointOrder = true;
        }

        try {
            const fieldMask = intermediates.length > 0
                ? "routes.polyline,routes.localizedValues,routes.optimized_intermediate_waypoint_index,routes.viewport"
                : "routes.polyline,routes.localizedValues";

            return await this.fetchWithRetry("https://routes.googleapis.com/directions/v2:computeRoutes", {
                method: "POST",
                body: JSON.stringify(requestBody),
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-FieldMask": fieldMask,
                    "X-Goog-Api-Key": this.apiKey
                }
            });
        } catch (error) {
            Logger.error("Route calculation failed", error);
            throw new Error("Unable to calculate route. Please try again.");
        }
    }

    async searchNearbyPlaces(location, types) {
        Utils.validateLocation(location);

        const requestBody = {
            includedTypes: types,
            excludedTypes: ["hotel", "grocery_store", "supermarket", "bus_station", "train_station", "transit_station"],
            maxResultCount: CONFIG.MAX_RESULTS,
            rankPreference: "POPULARITY",
            languageCode: "en",
            locationRestriction: {
                circle: {
                    center: { latitude: location.lat, longitude: location.lng },
                    radius: CONFIG.SEARCH_RADIUS
                }
            }
        };

        try {
            return await this.fetchWithRetry("https://places.googleapis.com/v1/places:searchNearby", {
                method: "POST",
                body: JSON.stringify(requestBody),
                headers: {
                    "Content-type": "application/json",
                    "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.iconMaskBaseUri,places.primaryTypeDisplayName",
                    "X-Goog-Api-Key": this.apiKey
                }
            });
        } catch (error) {
            Logger.error("Nearby places search failed", error);
            throw new Error("Unable to find nearby places. Please try again.");
        }
    }

    async getElevation(lat, lng) {
        Utils.validateLocation({ lat, lng });

        try {
            const elevator = new google.maps.ElevationService();
            const results = await new Promise((resolve, reject) => {
                elevator.getElevationForLocations(
                    { locations: [{ lat, lng }] },
                    (results, status) => {
                        if (status === "OK") {
                            resolve(results);
                        } else {
                            reject(`ElevationService failed: ${status}`);
                        }
                    }
                );
            });

            return results?.[0]?.elevation || 0;
        } catch (error) {
            Logger.error("Elevation fetch failed", error);
            return 0;
        }
    }

    async getWeatherInfo(location) {
        Utils.validateLocation(location);

        const url = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${this.apiKey}&location.latitude=${location.lat}&location.longitude=${location.lng}`;

        try {
            return await this.fetchWithRetry(url);
        } catch (error) {
            Logger.error("Weather fetch failed", error);
            return null;
        }
    }

    async getPublicTransport(location) {
        Utils.validateLocation(location);
        const requestBody = {
            insights: [
                "INSIGHT_COUNT"
            ],
            filter: {
                locationFilter: {
                    circle: {
                        latLng: { latitude: location.lat, longitude: location.lng },
                        radius: CONFIG.PT_RADIUS
                    }
                },
                typeFilter: {
                    includedTypes: [
                        "subway_station", "bus_station", "train_station", "transit_station", "light_rail_station"
                    ]
                },
            }
        }
        try {
            return await this.fetchWithRetry("https://areainsights.googleapis.com/v1:computeInsights", {
                method: "POST",
                body: JSON.stringify(requestBody),
                headers: {
                    "Content-type": "application/json",
                    "X-Goog-Api-Key": this.apiKey
                }
            });
        } catch (error) {
            Logger.error("Nearby places search failed", error);
            throw new Error("Unable to find nearby places. Please try again.");
        }
    }

    async generateAIRoute(nearbyPlaces, categories) {
        const requestBody = {
            "contents": [{
                "parts": [{
                    "text": `Based on the following list of places and their types, could you generate a JSON object for each stop and describe the stop? You don't need to use all stops, just the ones that are the most interesting based on the ${categories.category1.short} and ${categories.category2.short} as interests. also return in JSON a short summary title and description of the whole route. The list of location is the following: ${JSON.stringify(nearbyPlaces)}. The resulting JSON object should look like: {route_description: string, route_title:string, stops[{name:string,type:string,placeId: string, location: {lat:number,lng:number}, description:string}]}]}`
                }]
            }]
        };

        try {
            const data = await this.fetchWithRetry("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
                method: "POST",
                body: JSON.stringify(requestBody),
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": this.apiKey
                }
            }
            );

            const cleanedData = data.candidates[0].content.parts[0].text
                .replace(/^```json\s*/, '')
                .replace(/```$/, '')
                .trim();

            return JSON.parse(cleanedData);
        } catch (error) {
            Logger.error("AI route generation failed", error);
            throw new Error("Failed to generate AI route. Please try again.");
        }
    }
}

class DomBatcher {
    constructor() {
        this.pendingUpdates = new Map();
        this.isScheduled = false;
    }

    batchUpdate(element, properties) {
        if (!this.pendingUpdates.has(element)) {
            this.pendingUpdates.set(element, {});
        }

        Object.assign(this.pendingUpdates.get(element), properties);

        if (!this.isScheduled) {
            this.isScheduled = true;
            requestAnimationFrame(() => this.flushUpdates());
        }
    }

    flushUpdates() {
        for (const [element, properties] of this.pendingUpdates) {
            for (const [prop, value] of Object.entries(properties)) {
                if (prop.startsWith('style.')) {
                    const styleProp = prop.substring(6);
                    element.style[styleProp] = value;
                } else if (prop === 'innerHTML') {
                    element.innerHTML = value;
                } else if (prop === 'textContent') {
                    element.textContent = value;
                } else {
                    element[prop] = value;
                }
            }
        }

        this.pendingUpdates.clear();
        this.isScheduled = false;
    }

    immediateUpdate(element, properties) {
        for (const [prop, value] of Object.entries(properties)) {
            if (prop.startsWith('style.')) {
                const styleProp = prop.substring(6);
                element.style[styleProp] = value;
            } else if (prop === 'innerHTML') {
                element.innerHTML = value;
            } else if (prop === 'textContent') {
                element.textContent = value;
            } else {
                element[prop] = value;
            }
        }
    }
}

class UIManager {
    constructor(elements) {
        this.elements = elements;
        this.domBatcher = new DomBatcher();
    }

    showLoadingState(message) {
        Logger.info("Loading state:", message);
    }

    hideLoadingState() {
        Logger.info("Loading state hidden");
    }

    showErrorState(message) {
        Logger.error("Error state:", message);
    }

    showUserError(message) {
        alert(message);
    }

    animateHeader() {
        this.domBatcher.batchUpdate(this.elements.map, { 'style.display': 'block' });
        this.domBatcher.batchUpdate(this.elements.placeList, { 'style.display': 'block' });

        const header = document.getElementById('main-header');
        const dropdown = document.getElementById('dropdown-container');

        dropdown.classList.remove('no-transition');
        header.classList.remove('expanded');
        dropdown.classList.add('slide-up');

        setTimeout(() => {
            this.domBatcher.batchUpdate(document.getElementById('card-container'), { 'style.display': 'none' });
            this.domBatcher.batchUpdate(document.getElementById('logo'), { 'style.display': 'none' });
            this.domBatcher.batchUpdate(document.getElementById('dropdown-logo'), { 'style.display': 'block' });

            header.classList.add('slide-back');
            dropdown.classList.remove('slide-up');
            dropdown.classList.add('slide-back');
        }, 2000);
    }

    displayHotelDetails(placeId) {
        this.elements.genRouteButton.style.display = 'block';
        this.elements.placeList.style.display = 'none';
        this.elements.placeDetails.style.display = 'block';
        this.elements.placeDetailsRequest.place = placeId;
        this.elements.backToAllHotelsButton.style.display = 'block';
    }

    showWeatherInfo(weather) {
        const box = this.elements.weatherInfo;
        box.innerHTML = '';
        box.style.display = 'none';

        if (weather?.temperature?.degrees !== undefined && weather.weatherCondition) {
            const temp = weather.temperature.degrees;
            box.innerHTML = `
                <img src="${weather.weatherCondition.iconBaseUri}.svg" alt="${weather.weatherCondition.condition}">
                <span> ${temp}°C</span>
            `;
            box.style.display = 'inline-flex';
        }
    }

    displayLoadingSteps() {
        const loadingSteps = [
            { emoji: "🔍", text: "Looking for the best places..." },
            { emoji: "🧠", text: "Asking our travel expert..." },
            { emoji: "🗺️", text: "Drawing your custom route..." },
            { emoji: "✨", text: "Almost there..." }
        ];

        const container = this.elements.loadingStepsContainer;
        container.innerHTML = "";

        let stepIndex = 0;
        const stepEls = [];

        const createStepElement = (step, isActive) => {
            const el = document.createElement("p");
            el.className = "loading-step";
            if (isActive) {
                el.innerHTML = `<span class="spinner"></span> ${step.text}`;
            } else {
                el.innerHTML = `${step.emoji} ${step.text}`;
            }
            return el;
        };

        const firstStepEl = createStepElement(loadingSteps[0], true);
        container.appendChild(firstStepEl);
        stepEls.push(firstStepEl);

        const interval = setInterval(() => {
            stepIndex++;

            const prev = stepEls[stepIndex - 1];
            if (prev) {
                const step = loadingSteps[stepIndex - 1];
                prev.innerHTML = `${step.emoji} ${step.text}`;
            }

            if (stepIndex < loadingSteps.length) {
                const newStepEl = createStepElement(loadingSteps[stepIndex], true);
                container.appendChild(newStepEl);
                stepEls.push(newStepEl);
            }

            if (stepIndex >= loadingSteps.length - 1) {
                clearInterval(interval);
            }
        }, 4500);

        return () => {
            const lastIndex = loadingSteps.length - 1;
            const lastEl = stepEls[lastIndex];
            if (lastEl) {
                lastEl.innerHTML = `${loadingSteps[lastIndex].emoji} ${loadingSteps[lastIndex].text}`;
            }
        };
    }
    showPublicTransportInfo(count) {
        const { publicTransportInfo, publicTransportCount } = this.elements;
        if (count > 0) {
            publicTransportCount.textContent = `${count}`;
            publicTransportInfo.style.display = 'inline-flex';
        } else {
            publicTransportInfo.style.display = 'none';
        }
    }
}

class MapManager {
    constructor(apiService, uiManager) {
        this.apiService = apiService;
        this.uiManager = uiManager;
        this.map3D = null;
        this.library = {};
        this.groundElevation = 0;
    }

    async initialize() {
        try {
            const [
                { Map, LatLngBounds },
                { Marker3DInteractiveElement, Map3DElement, MapMode, AltitudeMode, Polyline3DElement },
                { PinElement },
                { encoding },
                { PlaceAutocompleteElement },
                { ElevationService }
            ] = await Promise.all([
                google.maps.importLibrary("maps"),
                google.maps.importLibrary("maps3d"),
                google.maps.importLibrary("marker"),
                google.maps.importLibrary("geometry"),
                google.maps.importLibrary("places"),
                google.maps.importLibrary("elevation")

            ]);

            this.library = {
                Map, LatLngBounds, Marker3DInteractiveElement, Map3DElement,
                MapMode, AltitudeMode, Polyline3DElement, PinElement, encoding,
                PlaceAutocompleteElement, ElevationService
            };

            await this.initializeMap();
            Logger.info("Map initialized successfully");
        } catch (error) {
            Logger.error("Failed to initialize map", error);
            throw error;
        }
    }

    async initializeMap() {
        const { Map3DElement } = this.library;
        this.map3D = new Map3DElement({
            center: { lat: 34.8405, lng: -111.7909, altitude: 1322.70 },
            range: CONFIG.CAMERA_RANGES.SUPER_OVERVIEW,
            tilt: 0,
            mode: 'SATELLITE'
        });

        const mapElement = document.getElementById('map');
        mapElement.appendChild(this.map3D);

        Object.assign(this.map3D.style, {
            borderRadius: "10px",
            width: "100%",
            height: "100%"
        });
    }

    async setCamera(lat, lng, alt, tilt, range, rotateCamera = false) {
        Utils.validateLocation({ lat, lng });

        const flyOptions = {
            endCamera: {
                center: { lat, lng, altitude: alt },
                range,
                tilt,
                heading: 0
            },
            durationMillis: CONFIG.ANIMATION_DURATION
        };

        const onAnimationEnd = () => {
            if (rotateCamera) {
                this.map3D.flyCameraAround({
                    camera: { center: { lat, lng, altitude: alt }, tilt, range, heading: 0 },
                    durationMillis: 50000,
                    rounds: 1
                });
            }
        };

        this.map3D.removeEventListener('gmp-animationend', onAnimationEnd);
        this.map3D.addEventListener('gmp-animationend', onAnimationEnd, { once: true });
        this.map3D.flyCameraTo(flyOptions);
    }
}


class MarkerPool {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.hotelPool = [];
        this.featurePool = [];
        this.routePool = [];
        this.maxPoolSize = 50;
    }

    getHotelMarker(hotel) {
        let marker = this.hotelPool.pop();
        if (!marker) {
            marker = this.createNewHotelMarker();
        }
        this.configureHotelMarker(marker, hotel);
        return marker;
    }

    returnHotelMarker(marker) {
        if (this.hotelPool.length < this.maxPoolSize) {
            this.resetMarker(marker);
            this.hotelPool.push(marker);
        } else {
            marker.remove();
        }
    }

    getFeatureMarker(feature) {
        let marker = this.featurePool.pop();
        if (!marker) {
            marker = this.createNewFeatureMarker();
        }
        this.configureFeatureMarker(marker, feature);
        return marker;
    }

    returnFeatureMarker(marker) {
        if (this.featurePool.length < this.maxPoolSize) {
            this.resetMarker(marker);
            this.featurePool.push(marker);
        } else {
            marker.remove();
        }
    }

    createNewHotelMarker() {
        const { Marker3DInteractiveElement, PinElement } = this.mapManager.library;
        const pin = new PinElement({
            scale: 1.4,
            background: '#8292E7',
            glyphColor: "#2E49D6",
            borderColor: "#2E49D6"
        });

        const marker = new Marker3DInteractiveElement({
            altitudeMode: "RELATIVE_TO_MESH",
            collisionBehavior: google.maps.CollisionBehavior.REQUIRED,
            extruded: false
        });

        marker.append(pin);
        return marker;
    }

    createNewFeatureMarker() {
        const { Marker3DInteractiveElement, PinElement } = this.mapManager.library;
        const pin = new PinElement({ scale: 0 });

        const marker = new Marker3DInteractiveElement({
            altitudeMode: "RELATIVE_TO_MESH",
            extruded: true,
            collisionBehavior: google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
        });

        marker.append(pin);
        return marker;
    }

    configureHotelMarker(marker, hotel) {
        marker.position = {
            lat: hotel.location.lat,
            lng: hotel.location.lng,
        };
    }

    configureFeatureMarker(marker, feature) {
        marker.position = {
            lat: feature.location.latitude,
            lng: feature.location.longitude,
        };
        marker.label = feature.displayName.text;
        marker.originalLabel = feature.displayName.text;
    }

    resetMarker(marker) {
        marker.label = '';
        marker.originalLabel = '';
        const newMarker = marker.cloneNode(true);
        if (marker.parentNode) {
            marker.parentNode.replaceChild(newMarker, marker);
        }
        return newMarker;
    }

    clear() {
        [...this.hotelPool, ...this.featurePool, ...this.routePool].forEach(marker => {
            try {
                marker.remove();
            } catch (error) {
                Logger.error("Error removing pooled marker", error);
            }
        });
        this.hotelPool.length = 0;
        this.featurePool.length = 0;
        this.routePool.length = 0;
    }
}


class MarkerManager {
    constructor(mapManager, apiService) {
        this.mapManager = mapManager;
        this.apiService = apiService;
        this.markerPool = new MarkerPool(mapManager);
        this.activeMarker = null;
        this.activeFeatureMarker = null;
        this.nearbyMarkers = [];
        this.hotelMarkers = [];
        this.routeMarkers = [];
        this.activePolylines = new Map();
        this.routePolylines = [];
        this.activeCenterMarkers = new Map();
    }

    async createHotelMarker(hotel) {
        const marker = this.markerPool.getHotelMarker(hotel);
        this.mapManager.map3D.append(marker);
        return marker;
    }

    removeSpecificRoute(markerId) {
        const polyline = this.activePolylines.get(markerId);
        const centerMarker = this.activeCenterMarkers.get(markerId);
        if (polyline) this.mapManager.map3D.removeChild(polyline);
        if (centerMarker) this.mapManager.map3D.removeChild(centerMarker);
        this.activePolylines.delete(markerId);
        this.activeCenterMarkers.delete(markerId);
    }

    clearAllMarkers() {
        this.nearbyMarkers.forEach(marker => {
            try {
                this.mapManager.map3D.removeChild(marker);
                this.markerPool.returnFeatureMarker(marker);
            } catch (error) {
                Logger.error("Error removing nearby marker", error);
            }
        });

        this.hotelMarkers.forEach(marker => {
            try {
                this.mapManager.map3D.removeChild(marker);
                this.markerPool.returnHotelMarker(marker);
            } catch (error) {
                Logger.error("Error removing hotel marker", error);
            }
        });

        this.routeMarkers.forEach(marker => {
            try {
                marker.remove();
            } catch (error) {
                Logger.error("Error removing route marker", error);
            }
        });

        this.nearbyMarkers.length = 0;
        this.hotelMarkers.length = 0;
        this.routeMarkers.length = 0;

        if (this.activeMarker) {
            try {
                this.mapManager.map3D.removeChild(this.activeMarker);
                this.markerPool.returnHotelMarker(this.activeMarker);
            } catch (error) {
                Logger.error("Error removing active marker", error);
            }
            this.activeMarker = null;
        }
    }

    clearAllRoutes() {
        this.activePolylines.forEach(polyline => {
            try {
                this.mapManager.map3D.removeChild(polyline);
            } catch (error) {
                Logger.error("Error removing polyline", error);
            }
        });
        this.activePolylines.clear();

        this.routePolylines.forEach(polyline => {
            try {
                polyline.remove();
            } catch (error) {
                Logger.error("Error removing route polyline", error);
            }
        });
        this.routePolylines.length = 0;
    }

    resetNearbyMarkerLabels() {
        this.nearbyMarkers.forEach(marker => {
            if (marker.originalLabel) {
                marker.label = marker.originalLabel;
            }
        });

        this.activeFeatureMarker = null;
    }
}

// main class
class HotelMapApp {
    constructor() {

        this.apiKey = "AIzaSyCVNX6mCprAYiGp8RUaf9yc6H-00fLR1Ns";

        this.apiService = new ApiService(this.apiKey);

        this.elements = this.initializeElements();
        this.uiManager = new UIManager(this.elements);
        this.mapManager = new MapManager(this.apiService, this.uiManager);
        this.markerManager = new MarkerManager(this.mapManager, this.apiService);

        this.selectedPlace = null;
        this.selecteDestination = null;
        this.selectedCategories = {};
        this.nearbyPlaces = [];
        this.categoryMappings = {};
        this.routeStops = [];

        this.randomDestinations = [
            {
                location: { formattedAddress: 'Paris, France', location: { lat: 48.85734310966265, lng: 2.342754204908419 } },
                category1: "Food & Drink",
                category2: "Culture & History"
            },
            {
                location: { formattedAddress: 'Barcelona, Spain', location: { lat: 41.40035375749143, lng: 2.170107786934043 } },
                category1: "Culture & History",
                category2: "Entertainment & Nightlife"
            },
            {
                location: { formattedAddress: 'London, UK', location: { lat: 51.510272032816374, lng: - 0.11514937340195888 } },
                category1: "Culture & History",
                category2: "Shopping"
            },
            {
                location: { formattedAddress: "Sydney, Australia", location: { lat: -33.88020201354722, lng: 151.20889667466582 } },
                category1: "Nature & Outdoors",
                category2: "Entertainment & Nightlife"
            },
            {
                location: { formattedAddress: "Amsterdam, Netherlands", location: { lat: 52.36946530187627, lng: 4.895521167441979 } },
                category1: "Culture & History",
                category2: "Entertainment & Nightlife"
            },
            {
                location: { formattedAddress: "Lisbon, Portugal", location: { lat: 38.72218051946241, lng: - 9.140177235039712 } },
                category1: "Relaxation & Wellness",
                category2: "Food & Drink"
            },
            {
                location: { formattedAddress: "Vienna, Austria", location: { lat: 48.20803585558855, lng: 16.372114046058552 } },
                category1: "Culture & History",
                category2: "Relaxation & Wellness"
            },
            {
                location: { formattedAddress: " Cape Town, South Africa", location: { lat: -33.9199108405239, lng: 18.413928450994916 } },
                category1: "Nature & Outdoors",
                category2: "Food & Drink"
            },
            {
                location: { formattedAddress: "Buenos Aires, Argentina", location: { lat: -34.60301220054633, lng: - 58.38642833903091 } },
                category1: "Entertainment & Nightlife",
                category2: "Culture & History"
            },
            {
                location: { formattedAddress: "San Francisco, USA", location: { lat: 37.77307043309438, lng: - 122.42130214095383 } },
                category1: "Nature & Outdoors",
                category2: "Culture & History"
            },
            {
                location: { formattedAddress: "Prague, Czech Republic", location: { lat: 50.075382092737485, lng: 14.437380424838672 } },
                category1: "Culture & History",
                category2: "Relaxation & Wellness"
            },
            {
                location: { formattedAddress: "Vancouver, Canada", location: { lat: 49.28059400984349, lng: -123.11639054155492 } },
                category1: "Nature & Outdoors",
                category2: "Food & Drink"
            },
        ];

        this.init();
    }

    initializeElements() {
        const elementIds = [
            'ai-route-loading', 'loading-steps-container', 'ai-route-container',
            'ai-route-summary', 'ai-route-stops', 'hotel-list', 'loading-overlay',
            'detail-popup', 'detail-popup-container',
            'weather-info', 'back-to-all-hotels-button', 'back-to-hotel-button',
            'gen-route-button', 'sidebar', 'gobutton', 'reset-camera-button',
            'map', 'category-dropdown1', 'category-dropdown2',
            'location-title', 'location-subtitle', 'public-transport-info', 'public-transport-count'
        ];

        const elements = {};
        elementIds.forEach(id => {
            const camelCase = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            elements[camelCase] = document.getElementById(id);
        });
        elements.placeList = document.querySelector("gmp-place-search");
        elements.placeDetails = document.querySelector("gmp-place-details");
        elements.placeDetailsRequest = document.querySelector("gmp-place-details-place-request");

        return elements;
    }

    async init() {
        try {
            await this.mapManager.initialize();
            await this.setupPlaceAutocomplete();
            await this.loadCategoryMapping();
            this.setupCategoryDropdowns();
            this.setupEventListeners();

            Logger.info("Hotel Map App initialized successfully");
        } catch (error) {
            Logger.error("Failed to initialize app", error);
            this.uiManager.showErrorState("Failed to initialize the application");
        }
    }

    async loadCategoryMapping() {
        try {
            const response = await fetch('placecategories.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            this.categoryMappings = await response.json();
            Logger.info("Category mappings loaded successfully");
        } catch (error) {
            Logger.error("Error loading category mappings", error);
            this.categoryMappings = {};
        }
    }

    setupEventListeners() {
        this.elements.gobutton.addEventListener('click', () => this.handleGoButton());

        this.elements.backToAllHotelsButton.addEventListener('click', () => this.backToAllHotelsButton());
        this.elements.backToHotelButton.addEventListener('click', () => this.backToHotelButton());
        this.elements.genRouteButton.addEventListener('click', () => this.generateAIWalkingRoute());
        this.elements.resetCameraButton.addEventListener('click', () => this.resetCamera());

        document.addEventListener('click', (event) => {
            if (event.target.closest('.destination-card')) {
                const card = event.target.closest('.destination-card');
                const destination = card.getAttribute('data-destination');
                this.handleDestinationCard(destination);
            }
        });

        const closeBtn = document.querySelector('#detail-popup .close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.elements.detailPopup.style.display = 'none';
            });
        }

        this.debouncedSearch = Utils.debounce(
            this.searchNearbyFeatures.bind(this),
            CONFIG.DEBOUNCE_DELAY
        );
    }

    handleDestinationCard(destination) {
        const destinationMap = {
            'rome': {
                location: { formattedAddress: 'Rome, Italy', location: { lat: 41.9028, lng: 12.4964 } },
                category1: "Food & Drink",
                category2: "Culture & History"
            },
            'newyork': {
                location: { formattedAddress: 'New York City, USA', location: { lat: 40.7128, lng: -74.0060 } },
                category1: "Entertainment & Nightlife",
                category2: "Food & Drink"
            },
            'zermatt': {
                location: { formattedAddress: 'Zermatt, Switzerland', location: { lat: 46.0207, lng: 7.7491 } },
                category1: "Nature & Outdoors",
                category2: "Relaxation & Wellness"
            },
            'tokyo': {
                location: { formattedAddress: 'Tokyo, Japan', location: { lat: 35.67416337506583, lng: 139.75532420749389 } },
                category1: "Shopping",
                category2: "Entertainment & Nightlife"
            },
            'random': null
        };

        if (destination === 'random') {
            this.gotoRandomPlace();
        } else if (destinationMap[destination]) {
            const dest = destinationMap[destination];
            this.gotoPresetPlace(dest.category1, dest.category2, dest.location);
        }
    }

    async handleGoButton() {
        if (this.activeMarker) {
            this.activeMarker.remove();
            this.activeMarker = null;
        }
        if (!this.selecteDestination) {
            this.uiManager.showUserError("Please select a destination first.");
            return;
        }

        try {
            await this.gotoPlace();
        } catch (error) {
            Logger.error("Error in go button handler", error);
            this.uiManager.showErrorState("Failed to process your request"); ut
        }
    }

    async gotoPlace() {
        if (this.activeMarker) {
            this.activeMarker.remove();
            this.activeMarker = null;
        }
        this.uiManager.showLoadingState("Processing your request...");

        try {
            this.uiManager.animateHeader();
            await this.resetBeforeNewPlace();

            const cat1 = this.elements.categoryDropdown1.value;
            const cat2 = this.elements.categoryDropdown2.value;

            this.selectedCategories = {
                category1: this.getCategoryByDisplayName(cat1),
                category2: this.getCategoryByDisplayName(cat2)
            };

            const combinedTypes = [
                ...(this.selectedCategories.category1?.types || []),
                ...(this.selectedCategories.category2?.types || [])
            ];

            const labels = [
                this.selectedCategories.category1?.short,
                this.selectedCategories.category2?.short
            ].filter(Boolean);

            this.elements.detailPopup.style.display = 'none';
            await this.getNearbyHotels(this.selecteDestination, labels, combinedTypes);
        } catch (error) {
            Logger.error("Error in gotoPlace", error);
            throw error;
        } finally {
            this.uiManager.hideLoadingState();
        }
    }

    getCategoryByDisplayName(displayName) {
        if (!displayName) return null;

        const categoryKey = Object.keys(this.categoryMappings).find(key =>
            this.categoryMappings[key].DisplayName === displayName
        );
        return categoryKey ? this.categoryMappings[categoryKey] : null;
    }

    async resetBeforeNewPlace() {
        if (this.activeMarker) {
            this.activeMarker.remove();
            this.activeMarker = null;
        }
        this.markerManager.clearAllRoutes();
        this.markerManager.clearAllMarkers();

        const elementsToHide = [
            'detailPopup', 'aiRouteContainer', 'airouteContainer', 'placeDetails',
            'backToAllHotelsButton', 'backToHotelButton', 'genRouteButton'
        ];

        elementsToHide.forEach(elementKey => {
            if (this.elements[elementKey]) {
                this.uiManager.domBatcher.batchUpdate(this.elements[elementKey], { 'style.display': 'none' });
            }
        });

        if (this.elements.detailPopupContainer) {
            this.uiManager.domBatcher.batchUpdate(this.elements.detailPopupContainer, { innerHTML: '' });
        }
        this.nearbyPlaces = [];
    }

    async setupPlaceAutocomplete() {
        const { PlaceAutocompleteElement } = this.mapManager.library;
        const container = document.getElementById('place-autocomplete-card');

        if (!container || document.getElementById('place-autocomplete-input')) return;

        const placeAutocomplete = new PlaceAutocompleteElement();
        placeAutocomplete.id = 'place-autocomplete-input';
        container.appendChild(placeAutocomplete);

        placeAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
            try {
                const place = await placePrediction.toPlace();
                await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
                this.selecteDestination = place.toJSON();
                Logger.info("Place selected successfully");
            } catch (error) {
                Logger.error("Error selecting place", error);
                this.uiManager.showUserError("Failed to select place. Please try again.");
            }
        });
    }

    setupCategoryDropdowns() {
        const dropdown1 = this.elements.categoryDropdown1;
        const dropdown2 = this.elements.categoryDropdown2;

        const categoryLabels = Object.values(this.categoryMappings).map(cat => cat.DisplayName);

        const populateDropdown = (dropdown, exclude = "", defaultLabel = "") => {
            dropdown.innerHTML = "";
            categoryLabels.forEach(label => {
                if (label !== exclude) {
                    const option = document.createElement("option");
                    option.className = "category-option";
                    option.value = label;
                    option.textContent = label;
                    if (label === defaultLabel) option.selected = true;
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

    async getNearbyHotels(location, labels, types) {
        try {
            this.uiManager.domBatcher.immediateUpdate(this.elements.locationTitle, {
                'style.display': 'block',
                innerHTML: `Hotels in ${location.formattedAddress}`
            });
            this.uiManager.domBatcher.immediateUpdate(this.elements.locationSubtitle, {
                'style.display': 'block',
                innerHTML: `${this.selectedCategories.category1.DisplayName} &nbsp;&nbsp;&nbsp;&nbsp; ${this.selectedCategories.category2.DisplayName}`
            });

            this.markerManager.clearAllMarkers();
            this.elements.backToAllHotelsButton.style.display = 'none';
            this.elements.placeDetails.style.display = 'none';

            const placeList = this.elements.placeList;
            const placeSearchQuery = document.querySelector("gmp-place-text-search-request");
            placeSearchQuery.textQuery = `hotel near ${labels[0]} and ${labels[1]} in ${location.formattedAddress}`;

            const onLoad = () => {
                this.addHotelMarkers(types);
                this.setupHotelSelection(types);
                placeList.removeEventListener('gmp-load', onLoad);
            };
            placeList.addEventListener('gmp-load', onLoad);

            const weather = await this.apiService.getWeatherInfo(location.location);
            if (weather) {
                this.uiManager.showWeatherInfo(weather);
            }
            await this.mapManager.setCamera(
                location.location.lat,
                location.location.lng,
                10,
                35,
                CONFIG.CAMERA_RANGES.OVERVIEW
            );
        } catch (error) {
            Logger.error("Error getting nearby hotels", error);
            this.uiManager.showErrorState("Failed to find hotels in this area");
        }
    }

    addHotelMarkers(types) {
        const { Marker3DInteractiveElement, PinElement } = this.mapManager.library;
        if (this.activeMarker) {
            this.activeMarker.remove();
            this.activeMarker = null;
        }
        if (this.elements.placeList.places?.length > 0) {
            this.elements.placeList.places.forEach(async (feature) => {
                const location = feature.location.toJSON();

                const marker = new Marker3DInteractiveElement({
                    position: { lat: location.lat, lng: location.lng },
                    altitudeMode: "RELATIVE_TO_MESH",
                    extruded: true,
                    collisionBehavior: google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
                });

                const pin = new PinElement({
                    scale: 1,
                    background: '#8292E7',
                    glyphColor: "#2E49D6",
                    borderColor: "#2E49D6"
                });

                marker.addEventListener('gmp-click', () => {
                    this.moveToLocation(feature.toJSON(), types);
                });

                marker.append(pin);
                this.mapManager.map3D.append(marker);
                this.markerManager.hotelMarkers.push(marker);
            });
        }
    }

    setupHotelSelection(types) {
        this.elements.placeList.addEventListener('gmp-select', ({ place }) => {
            this.elements.locationTitle.style.display = 'none';
            this.elements.locationSubtitle.style.display = 'none';
            this.moveToLocation(place.toJSON(), types);
        });
    }

    async moveToLocation(hotel, types) {
        if (this.markerManager.activeMarker) {
            this.markerManager.activeMarker.remove();
            this.markerManager.activeMarker = null;
        }

        try {
            this.elements.locationTitle.style.display = 'none';
            this.elements.locationSubtitle.style.display = 'none';

            this.markerManager.hotelMarkers.forEach(marker => marker.remove());
            this.elements.detailPopup.style.display = 'none';
            this.selectedPlace = hotel;

            await this.mapManager.setCamera(
                hotel.location.lat,
                hotel.location.lng,
                this.mapManager.groundElevation,
                35,
                CONFIG.CAMERA_RANGES.DETAIL,
                false
            );
            this.elements.resetCameraButton.style.display = 'block';

            const [marker, elevation, transportData] = await Promise.all([
                this.markerManager.createHotelMarker(hotel),
                this.apiService.getElevation(hotel.location.lat, hotel.location.lng),
                this.apiService.getPublicTransport(hotel.location)
            ]);

            this.markerManager.activeMarker = marker;
            this.mapManager.groundElevation = elevation;
            const count = transportData?.count || 0;
            this.uiManager.showPublicTransportInfo(count);

            this.markerManager.activeMarker.addEventListener('gmp-click', async () => {
                await this.mapManager.setCamera(
                    hotel.location.lat,
                    hotel.location.lng,
                    this.mapManager.groundElevation,
                    35,
                    CONFIG.CAMERA_RANGES.CLOSE_UP,
                    true
                );
                this.elements.resetCameraButton.style.display = 'block';
            });

            this.debouncedSearch(hotel.location, types);
            this.uiManager.displayHotelDetails(hotel.id);
        } catch (error) {
            Logger.error("Error moving to location", error);
            this.uiManager.showErrorState("Failed to load hotel details");
        }
    }

    async searchNearbyFeatures(location, types) {
        try {
            this.nearbyPlaces = [];
            this.markerManager.nearbyMarkers.forEach(marker => marker.remove());
            this.markerManager.nearbyMarkers = [];

            const data = await this.apiService.searchNearbyPlaces(location, types);
            await this.addNearbyFeatureMarkers(data, location);
        } catch (error) {
            Logger.error("Error searching nearby features", error);
            this.uiManager.showErrorState("Failed to find nearby attractions");
        }
    }

    async addNearbyFeatureMarkers({ places }, location) {
        if (!this.mapManager.map3D || !places?.length) {
            this.elements.detailPopup.style.display = 'none';
            return;
        }

        this.markerManager.nearbyMarkers.forEach(marker => marker.remove());
        this.markerManager.nearbyMarkers = [];

        await this.createFeatureMarkers(places, location);
    }

    async createFeatureMarkers(places, location) {
        const { Marker3DInteractiveElement, Polyline3DElement } = this.mapManager.library;
        const { PinElement } = this.mapManager.library;

        const markerPromises = places.map(async (feature) => {
            this.nearbyPlaces.push({
                name: feature.displayName?.text,
                type: feature.primaryTypeDisplayName?.text,
                location: feature.location,
                placeId: feature.id
            });

            try {
                const marker = new Marker3DInteractiveElement({
                    position: {
                        lat: feature.location.latitude,
                        lng: feature.location.longitude,
                    },
                    label: feature.displayName.text,
                    altitudeMode: "RELATIVE_TO_MESH",
                    extruded: true,
                    collisionBehavior: google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
                });

                marker.originalLabel = feature.displayName.text;
                marker.label = feature.displayName.text;

                const pin = new PinElement({ scale: 0 });
                marker.append(pin);

                marker.addEventListener("gmp-click", async () => {
                    await this.handleFeatureMarkerClick(marker, feature, location);
                });

                this.mapManager.map3D.append(marker);
                this.markerManager.nearbyMarkers.push(marker);
                return marker;
            } catch (error) {
                Logger.error(`Error creating marker for ${feature.displayName.text}`, error);
                return null;
            }
        });

        const markers = await Promise.all(markerPromises);
        Logger.info(`Created ${markers.filter(m => m !== null).length} feature markers`);
    }

    async handleFeatureMarkerClick(marker, feature, location) {
        if (this.markerManager.activeFeatureMarker && this.markerManager.activeFeatureMarker !== marker) {
            this.markerManager.activeFeatureMarker.label = this.markerManager.activeFeatureMarker.originalLabel;
        }

        const isSameMarker = this.markerManager.activeFeatureMarker === marker;
        if (isSameMarker) {
            marker.label = marker.originalLabel;
            this.markerManager.removeSpecificRoute(marker.id);
            this.elements.resetCameraButton.style.display = 'block';
            const featureelevation = await this.apiService.getElevation(feature.location.latitude, feature.location.longitude);
            await this.mapManager.setCamera(
                feature.location.latitude,
                feature.location.longitude,
                featureelevation,
                35,
                CONFIG.CAMERA_RANGES.CLOSE_UP,
                true
            );
        } else {
            marker.label = `⭐${feature.displayName.text}`;
            this.elements.detailPopupContainer.innerHTML = "";
            this.markerManager.clearAllRoutes();

            try {
                const route = await this.apiService.calculateRoute(location, feature.location);
                if (route?.routes?.[0]) {
                    const polyline = this.createRoutePolyline();
                    const path = google.maps.geometry.encoding.decodePath(route.routes[0].polyline.encodedPolyline);
                    polyline.coordinates = path;

                    this.filldetailPopupContainer(feature.id, route);
                    this.markerManager.activePolylines.set(marker.id, polyline);
                    this.mapManager.map3D.append(polyline);
                }
            } catch (error) {
                Logger.error("Error calculating route for feature", error);
            }

            this.markerManager.activeFeatureMarker = marker;
        }
    }

    createRoutePolyline() {
        const { Polyline3DElement } = this.mapManager.library;
        return new Polyline3DElement({
            strokeColor: "#f7e76fff",
            strokeWidth: 5,
            altitudeMode: "RELATIVE_TO_GROUND",
            extruded: false,
            drawsOccludedSegments: true,
        });
    }

    filldetailPopupContainer(placeId, route) {
        const placeDetailsEl = document.createElement("gmp-place-details-compact");
        placeDetailsEl.setAttribute("orientation", "horizontal");
        placeDetailsEl.setAttribute("truncation-preferred", "");

        const placeRequestEl = document.createElement("gmp-place-details-place-request");
        placeRequestEl.setAttribute("place", placeId);
        placeDetailsEl.appendChild(placeRequestEl);

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
            Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
            contentConfig.appendChild(el);
        });

        placeDetailsEl.appendChild(contentConfig);
        Object.assign(placeDetailsEl.style, {
            width: "350px",
            height: "120px",
            colorScheme: "light"
        });

        placeDetailsEl.addEventListener("gmp-load", () => {
            placeDetailsEl.style.visibility = "visible";
            Logger.info(`Place details loaded for ${placeId}`);
        });

        this.elements.detailPopupContainer.innerHTML = "";
        this.elements.detailPopupContainer.append(placeDetailsEl);

        if (route) {
            const details = document.createElement("p");
            details.id = "walking-details";
            details.innerHTML = `🚶‍♂️${route.routes[0].localizedValues.duration.text} - ${route.routes[0].localizedValues.distance.text}`;
            this.elements.detailPopupContainer.appendChild(details);
        }

        this.elements.detailPopup.style.display = 'block';
    }

    async generateAIWalkingRoute() {

        try {
            this.elements.backToHotelButton.style.display = 'none';
            this.elements.locationTitle.style.display = 'none';
            this.elements.locationSubtitle.style.display = 'none';
            this.elements.publicTransportInfo.style.display = 'none';

            this.elements.gobutton.disabled = true;



            this.elements.aiRouteLoading.style.display = 'block';
            this.uiManager.displayLoadingSteps();
            this.elements.aiRouteContainer.style.display = 'none';
            this.elements.placeList.style.display = 'none';
            this.elements.placeDetails.style.display = 'none';
            this.elements.backToAllHotelsButton.style.display = 'none';
            this.elements.detailPopup.style.display = 'none';



            const elementsToHide = [
                'placeList', 'placeDetails', 'backToAllHotelsButton',
                'airouteContainer', 'aiRouteLoading', 'genRouteButton'
            ];
            elementsToHide.forEach(key => {
                if (this.elements[key]) this.elements[key].style.display = 'none';
            });

            this.elements.aiRouteLoading.style.display = 'block';

            const aiData = await this.apiService.generateAIRoute(this.nearbyPlaces, this.selectedCategories);
            await this.calculateAIRoute(aiData);
        } catch (error) {
            Logger.error("Error generating AI route", error);
            this.elements.aiRouteLoading.innerHTML = "<p>Failed to generate route. Please try again.</p>";
            this.elements.backToHotelButton.style.display = "block";
        } finally {
            this.elements.gobutton.disabled = false;
        }
    }

    async calculateAIRoute(aiData) {
        try {
            const stops = aiData.stops.map(place => ({
                location: {
                    latLng: {
                        latitude: place.location.lat,
                        longitude: place.location.lng
                    }
                }
            }));

            const route = await this.apiService.calculateRoute(
                this.selectedPlace.location,
                this.selectedPlace.location,
                stops
            );

            if (route?.routes?.[0]) {
                this.markerManager.clearAllRoutes();
                this.markerManager.nearbyMarkers.forEach(marker => marker.remove());

                const optimizedIndexes = route.routes[0].optimizedIntermediateWaypointIndex || [];
                const reorderedStops = optimizedIndexes.map(i => aiData.stops[i]);

                this.createRouteMarkers(reorderedStops);

                // Set camera view
                if (route.routes[0].viewport) {
                    this.markerManager.resetNearbyMarkerLabels();
                    this.markerManager.clearAllRoutes();
                    this.elements.resetCameraButton.style.display = 'none';
                    const { high, low } = route.routes[0].viewport;
                    const centerLat = (high.latitude + low.latitude) / 2;
                    const centerLng = (high.longitude + low.longitude) / 2;
                    await this.mapManager.setCamera(centerLat, centerLng, 10, 0, 6000);
                } else {
                    await this.mapManager.setCamera(
                        this.selectedPlace.location.lat,
                        this.selectedPlace.location.lng,
                        10, 0, 6000
                    );
                }

                const polyline = this.createRoutePolyline();

                const path = google.maps.geometry.encoding.decodePath(route.routes[0].polyline.encodedPolyline);
                polyline.coordinates = path;
                this.mapManager.map3D.append(polyline);
                this.markerManager.routePolylines.push(polyline);

                this.elements.aiRouteLoading.style.display = 'none';
                this.elements.aiRouteContainer.style.display = 'block';

                this.displayRouteResults(aiData, route, reorderedStops);
            }
        } catch (error) {
            Logger.error("Error creating AI route", error);
            throw error;
        }
    }

    displayRouteResults(aiData, route, reorderedStops) {
        this.elements.aiRouteSummary.innerHTML = `
            <h3>${aiData.route_title}</h3>
            <p id="route-summary-distance"><em>${route.routes[0].localizedValues.distance?.text} - ${route.routes[0].localizedValues.duration?.text}</em></p>
            <p>${aiData.route_description}</p>
        `;

        this.elements.aiRouteStops.innerHTML = '';
        reorderedStops.forEach((stop, i) => {
            const div = document.createElement('div');
            div.classList.add('ai-stop-card');
            div.id = `ai-stop-card-${i}`;
            div.innerHTML = `
                <h4>${i + 1}. ${stop.name}</h4>
                <p><em>${stop.type}</em></p>
                <p>${stop.description}</p>
                <hr />
            `;
            this.elements.aiRouteStops.appendChild(div);
        });

        this.elements.backToHotelButton.style.display = "block";
    }

    createRouteMarkers(data) {
        const { Marker3DInteractiveElement, PinElement } = this.mapManager.library;
        this.routeStops = data;

        data.forEach((stop, i) => {
            const { lat, lng } = stop.location;

            const marker = new Marker3DInteractiveElement({
                position: { lat, lng },
                altitudeMode: "RELATIVE_TO_MESH",
                extruded: true,
                label: `${i + 1}. ${stop.name}`,
                collisionBehavior: google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
            });

            const pin = new PinElement({ scale: 0 });
            marker.append(pin);

            marker.addEventListener("gmp-click", async () => {
                this.highlightStop(i, stop);
                this.filldetailPopupContainer(stop.placeId, null);
            });

            setTimeout(() => {
                const card = document.getElementById(`ai-stop-card-${i}`);
                if (card) {
                    card.addEventListener('click', () => this.highlightStop(i, stop));
                }
            }, 0);

            this.mapManager.map3D.append(marker);
            this.markerManager.routeMarkers.push(marker);
        });
    }

    highlightStop(index, stop) {
        document.querySelectorAll(".ai-stop-card").forEach(cardEl => {
            cardEl.style.background = "transparent";
        });

        this.markerManager.routeMarkers.forEach((marker, i) => {
            marker.label = `${i + 1}. ${this.routeStops[i].name}`;
        });

        const card = document.getElementById(`ai-stop-card-${index}`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            card.style.background = "#fcf2f2ff";
            this.filldetailPopupContainer(stop.placeId, null);
        }

        this.markerManager.routeMarkers[index].label = `⭐ ${index + 1}. ${stop.name}`;
    }

    async backToHotelButton() {

        this.elements.aiRouteLoading.style.display = 'none';
        this.elements.publicTransportInfo.style.display = 'block';
        this.markerManager.activeFeatureMarker = null;

        this.elements.detailPopup.style.display = 'none';
        this.markerManager.nearbyMarkers.forEach(marker => this.mapManager.map3D.append(marker));

        if (this.markerManager.routeMarkers.length > 0) {
            this.markerManager.routeMarkers.forEach(marker => marker.remove());
            this.markerManager.routeMarkers = [];
        }

        this.elements.placeDetails.style.display = 'block';

        if (this.markerManager.routePolylines.length > 0) {
            this.markerManager.routePolylines.forEach(polyline => polyline.remove());
            this.markerManager.routePolylines = [];
        }

        this.elements.aiRouteContainer.style.display = 'none';
        this.elements.backToAllHotelsButton.style.display = 'block';
        this.elements.backToHotelButton.style.display = 'none';
        this.elements.genRouteButton.style.display = 'block';
        await this.mapManager.setCamera(
            this.selectedPlace.location.lat,
            this.selectedPlace.location.lng,
            10, 45, CONFIG.CAMERA_RANGES.DETAIL, false
        );
    }

    async backToAllHotelsButton() {
        if (this.markerManager.activeMarker) {
            this.markerManager.activeMarker.remove();
            this.markerManager.activeMarker = null;
        }
        this.markerManager.activeFeatureMarker = null;

        this.elements.publicTransportInfo.style.display = 'none';
        this.elements.detailPopup.style.display = 'none';

        this.markerManager.nearbyMarkers.forEach(marker => marker.remove());
        this.elements.placeDetails.style.display = 'none';
        this.elements.aiRouteContainer.style.display = "none";
        this.elements.genRouteButton.style.display = 'none';
        this.elements.placeList.style.display = 'block';

        this.markerManager.hotelMarkers.forEach(marker => this.mapManager.map3D.append(marker));
        this.elements.locationTitle.style.display = "block";
        this.elements.locationSubtitle.style.display = "block";

        this.markerManager.clearAllRoutes();
        await this.showHotelList();
    }

    async showHotelList() {
        if (this.markerManager.activeMarker) {
            this.markerManager.activeMarker.remove();
            this.markerManager.activeMarker = null;
        }

        this.markerManager.nearbyMarkers.forEach(marker => marker.remove());
        this.markerManager.nearbyMarkers = [];
        this.elements.publicTransportInfo.style.display = 'none';

        this.elements.placeDetails.style.display = 'none';
        this.elements.placeList.style.display = 'block';
        this.elements.backToAllHotelsButton.style.display = 'none';


        this.addHotelMarkers();
        await this.mapManager.setCamera(
            this.selecteDestination.location.lat,
            this.selecteDestination.location.lng,
            10, 45, CONFIG.CAMERA_RANGES.OVERVIEW
        );
    }

    async resetCamera() {
        this.elements.resetCameraButton.style.display = 'none';
        await this.mapManager.setCamera(
            this.selecteDestination.location.lat,
            this.selecteDestination.location.lng,
            10, 35, CONFIG.CAMERA_RANGES.OVERVIEW
        );
    }

    async gotoPresetPlace(cat1, cat2, location) {
        try {
            this.elements.map.style.display = 'block';
            this.uiManager.animateHeader();

            this.selectedCategories = {
                category1: this.categoryMappings[cat1],
                category2: this.categoryMappings[cat2]
            };

            const combinedTypes = [
                ...(this.selectedCategories.category1?.types || []),
                ...(this.selectedCategories.category2?.types || [])
            ];

            const labels = [
                this.selectedCategories.category1?.short,
                this.selectedCategories.category2?.short
            ].filter(Boolean);

            this.selecteDestination = location;
            this.elements.detailPopup.style.display = 'none';
            await this.getNearbyHotels(this.selecteDestination, labels, combinedTypes);
        } catch (error) {
            Logger.error("Error in preset place navigation", error);
            this.uiManager.showErrorState("Failed to load preset destination");
        }
    }

    gotoRandomPlace() {
        const randomIndex = Math.floor(Math.random() * this.randomDestinations.length);
        const destination = this.randomDestinations[randomIndex];
        this.gotoPresetPlace(
            destination.category1,
            destination.category2,
            destination.location
        );
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            const app = new HotelMapApp();
            window.hotelMapApp = app; // Expose globally for HTML onclick handlers
            Logger.info("Application started successfully");
        } catch (error) {
            Logger.error("Failed to start application", error);
        }
    }, 100);
});

window.addEventListener('load', () => {
    const dropdownContainer = document.getElementById('dropdown-container');
    if (dropdownContainer) {
        dropdownContainer.classList.remove('no-transition');
    }
});