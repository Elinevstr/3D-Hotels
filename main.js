let map3D = null;
let activeMarker = null; // Stores the current hotel marker
let nearbyMarkers = []; // Stores the current nearby feature markers
let sponorMarkers = [];
const placeList = document.querySelector("gmp-place-list");
const placeDetails = document.querySelector("gmp-place-details");
const placeDetailsRequest = document.querySelector('gmp-place-details-place-request');
  async function initApp() {    // --- Original initialization logic ---
    await initializeMap(); // Initialize map first
    await google.maps.importLibrary("places");
    const placeAutocomplete = new google.maps.places.PlaceAutocompleteElement();
    //@ts-ignore
    placeAutocomplete.id = 'place-autocomplete-input';
    //placeAutocomplete.locationBias = center;
    const card = document.getElementById('place-autocomplete-card');
    card.appendChild(placeAutocomplete);
    placeAutocomplete.addEventListener('gmp-select', async ({ placePrediction }) => {
        const place = placePrediction.toPlace();
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
           
            const placejson = place.toJSON()
            getNearbyHotels(placejson.location);
    });
    //@ts-ignore
    if (map3D) {
        //fetchHotels(); // Then load hotels
    } else {
         console.error("Skipping hotel fetch: Map not initialized.");
         // Consider hiding loading overlay here if init fails
         // hideLoading();
    }
     
}

async function getNearbyHotels(location) {
        placeList.style.display = 'block';

        placeList.configureFromSearchNearbyRequest({
                    locationRestriction: { center: location, radius: 10000 },
                    includedPrimaryTypes: ['hotel'],
        })
                
        // Handle user selection in Place Details.
        placeList.addEventListener('gmp-placeselect', ({ place }) => {
            const jsonplace = place.toJSON()
            moveToLocation(jsonplace);
            console.log(place.toJSON());
        });
    }

async function initializeMap() {

    // Select the existing <gmp-map-3d> element from HTML
    map3D = document.getElementById("map");
   
    if (!map3D) {
        console.error("Map element not found!");
        return;
    }
  
    
    console.log("Map initialized:", map3D);
}

async function fetchHotels() {
    const hotelList = document.getElementById("hotel-list");
    //hotelList.innerHTML = '<p style="padding: 20px; text-align: center; color: var(--text-light);">Loading hotels...</p>';

    try {
       
        const hotelElementPromises = hotels.map(async (hotel) => {
            const hotelDiv = document.createElement("div");
            hotelDiv.classList.add("hotel");
            hotelDiv.setAttribute("data-lat", hotel.coordinates.lat);
            hotelDiv.setAttribute("data-lng", hotel.coordinates.lng);
            const restaurantInsights = await getPlaceInsights(hotel, "restaurant")
            const storeInsights = await getPlaceInsights(hotel, "store")
            const museumInsights = await getPlaceInsights(hotel, "museum")
            let weather, details;
            let fetchError = null;
            try {
                 [weather, details] = await Promise.all([
                    getWeatherinfo(hotel),
                    getHotelinfo(hotel)
                ]);
            } catch (err) {
                console.error(`Error fetching data for ${hotel.name}:`, err);
                fetchError = err;
            }

            let innerHTMLContent = '';
            if (fetchError) {
                // Error message HTML
                innerHTMLContent = `
                    <img src="placeholder_error.jpg" alt="Error loading ${hotel.name || 'hotel'}">
                    <div class="hotel-info">
                        <h3>${hotel.name || 'Hotel'}</h3>
                        <p class="error-message">Could not load details.</p>
                    </div>`;
            } else {
                // --- Build Weather Info ---
                let weatherHTML = '';
                 if (weather && weather.temperature && weather.weatherCondition) {
                    weatherHTML = `
                        <span class="weather-info" title="${weather.weatherCondition.condition || 'Current Weather'}">
                            <img src="${weather.weatherCondition.iconBaseUri}.svg" alt="Weather">
                            <span>${weather.temperature.degrees}°C</span>
                        </span>`;
                }

                // --- Build Accessibility Info ---
                let accessibilitySpans = [];
                if (details && details.accessibilityOptions) {
                    if (details.accessibilityOptions.wheelchairAccessibleEntrance === true) {
                        accessibilitySpans.push(`<span class="accessibility-feature" title="Wheelchair Accessible Entrance" aria-label="Wheelchair Accessible Entrance">♿ Entrance</span>`);
                    }
                    if (details.accessibilityOptions.wheelchairAccessibleParking === true) {
                         accessibilitySpans.push(`<span class="accessibility-feature" title="Wheelchair Accessible Parking" aria-label="Wheelchair Accessible Parking">♿ Parking</span>`);
                    }
                    // Add other accessibility options checks here if needed
                }
                // Join the accessibility spans to be placed inside the bottom container
                let accessibilityFeaturesHTML = accessibilitySpans.join(' ');

                // --- Construct Final HTML ---
                 innerHTMLContent = `
                    <img src="${hotel.image || 'placeholder_image.jpg'}" alt="${hotel.name || 'Hotel image'}">
                    <div class="hotel-info">
                        <h3>${hotel.name || 'Hotel Name Unavailable'}</h3>
                        <p class="location">📍 ${hotel.country || 'Unknown Location'}   ${details && details.rating ? `<span class="rating" title="Rating">⭐ ${details.rating}/5</span>` : ''}</p>

                        <div class="hotel-details"> 
                          
                            ${hotel.price ? `<span class="price" title="Price per night">€${hotel.price}/night</span>` : '<span class="price-unavailable">Price unavailable</span>'}
                            ${weatherHTML} 
                             ${accessibilityFeaturesHTML ? `
                            <div class="accessibility-info-bottom">
                                ${accessibilityFeaturesHTML}
                            </div>
                            ` : ''}
                            <div class="nearby-places-info">
                                <h4 >Amount of 4+⭐ rated places nearby</h4>
                                <span class="place-type" title="Restaurants"><span class="icon">🍴</span>  ${restaurantInsights.count}</span>
                                <span class="place-type" title="Shopping"><span class="icon">🛍️</span> ${storeInsights.count} </span>
                                <span class="place-type" title="Attractions"><span class="icon">🏛️</span> ${museumInsights.count}</span>
                            </div>
                        </div>

                        
                       
                    </div>
                `;
            }

            hotelDiv.innerHTML = innerHTMLContent;

            hotelDiv.addEventListener("click", function () {
                moveToLocation(hotel);
            });

            return hotelDiv;
        }); // End of hotels.map()

        const hotelElements = await Promise.all(hotelElementPromises);

        hotelList.innerHTML = '';
        hotelElements.forEach(hotelDiv => {
            hotelList.appendChild(hotelDiv);
        });

    } catch (error) {
        console.error("Failed to fetch or display hotels:", error);
        hotelList.innerHTML = '<p class="error-message" style="padding: 20px; text-align: center;">Sorry, could not load the hotel list.</p>';
    }
}


async function getWeatherinfo(hotel){
    return fetch(`https://weather.googleapis.com/v1/currentConditions:lookup?key=AIzaSyCVNX6mCprAYiGp8RUaf9yc6H-00fLR1Ns&location.latitude=${hotel.coordinates.lat}&location.longitude=${hotel.coordinates.lng}`).then((response) => response.json());
}
async function getHotelinfo(hotel){
    return fetch(`https://places.googleapis.com/v1/places/${hotel.placeid}?fields=id,displayName,areaSummary,accessibilityOptions,googleMapsLinks,rating&key=AIzaSyCVNX6mCprAYiGp8RUaf9yc6H-00fLR1Ns`).then((response) => response.json());
}
function getPlaceInsights(hotel, type){
    return fetch("https://areainsights.googleapis.com/v1:computeInsights", {
        method: "POST",
        body: JSON.stringify({
            insights:[
               "INSIGHT_COUNT"
            ],
            filter:{
               locationFilter:{
                circle: {
                    latLng: { latitude: hotel.coordinates.lat, longitude: hotel.coordinates.lng},
                    radius: 1000
            }
               },
               typeFilter:{
                  includedTypes:[
                     type
                  ]
               },
               ratingFilter:{
                  minRating:4.0,
                  maxRating:5.0
               }
            }
         }
        ),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
          "X-Goog-Api-Key": "AIzaSyCVNX6mCprAYiGp8RUaf9yc6H-00fLR1Ns"
        }
      })
        .then((response) => response.json())
        .then((json) => {
            console.log(json) 
            return json});
}

// --- Modified moveToLocation Function ---
async function moveToLocation(hotel) {
    if (!map3D) {
        console.error("Map3D is not initialized!");
        return;
    }

    console.log(hotel.location)
    showLoading();
    await new Promise(requestAnimationFrame);

    try {
        console.log(`Moving map to: ${hotel.location}`);
        map3D.setAttribute("center", `${hotel.location.lat}, ${hotel.location.lng}`);
        await Promise.all([
            setCamera(hotel.location.lat, hotel.location.lng, 10, 75, 300),
           // addHotelMarker(hotel.location),
            //searchNearbyFeatures(hotel)
            
        ]);
     

        await delay(5000);
        // Show sponsored popup if available
        const popup = document.getElementById('sponsored-popup');
        const container = document.getElementById('sponsored-activities-container');
        const title = document.getElementById('sponsored-hotel-name');

       /* if (hotel.sponsoredActivities && hotel.sponsoredActivities.length > 0) {
            title.textContent = '⭐ Suggested activities near ' + hotel.name;
            container.innerHTML = ''; // Clear previous

            hotel.sponsoredActivities.forEach(activity => {
                const div = document.createElement('div');
                div.className = 'sponsored-activity';
                div.innerHTML = `
                    <img src="${activity.activityImg}" alt="${activity.activityName}" loading="lazy">
                    <div class="activity-text">
                        <h4>${activity.activityName}</h4>
                        <p>${activity.activityDescription} </br> <u>Book now</u></p>
                    </div>
                `;

                container.appendChild(div);
            });

            popup.classList.add('visible');
        } else {
            popup.classList.remove('visible');
        }*/
    } catch (err) {
        console.error("Error during map move:", err);
    } finally {
        hideLoading();
    }
}

function searchNearbyFeatures(hotel) {
    fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        body: JSON.stringify({
            includedTypes: ["monument","cultural_landmark","museum","tourist_attraction","arena","tourist_information_center","wildlife_park","wildlife_refuge","hiking_area","historical_landmark","amusement_park","aquarium","beach","shopping_mall"],
            maxResultCount: 20,
            rankPreference: "POPULARITY",
            locationRestriction: {
              circle: {
                center: {
                  latitude: hotel.coordinates.lat,
                  longitude: hotel.coordinates.lng
                },
                radius: 3000.0
              }
            }
           
          }
        ),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
          "X-Goog-FieldMask": "places.displayName,places.location,places.iconMaskBaseUri,places.iconBackgroundColor,places.primaryTypeDisplayName",
          "X-Goog-Api-Key": "AIzaSyCVNX6mCprAYiGp8RUaf9yc6H-00fLR1Ns"
        }
      })
        .then((response) => response.json())
        .then((json) => addNearbyFeatureMarkers(json, hotel));
    ;
}

async function setCamera(lat, lng, alt, tilt, range) {
    if (!map3D) {
        console.error("Map3D is not initialized!");
        return;
    }

    map3D.flyCameraAround({
        camera: {
            center: { lat: lat, lng: lng, altitude: alt },
            tilt: tilt,
            range: range,
            heading: 0,
        },
        durationMillis: 100000,
        rounds: 2
    });

    console.log(`Camera moving to: ${lat}, ${lng}`);
}

async function addHotelMarker(hotel) {
    const { Marker3DInteractiveElement } = await google.maps.importLibrary("maps3d");
    const { PinElement } = await google.maps.importLibrary("marker");

    if (!map3D) {
        console.error("Map3D is not initialized!");
        return;
    }

    // Remove previous hotel marker
    if (activeMarker) {
        activeMarker.remove();
    }
    sponorMarkers.forEach(marker => marker.remove());
    sponorMarkers = [];
    hotel.sponsoredActivities.forEach(activity => {
                   // Create a pin for the feature (if icon is available, use it)
            const markerPin = new PinElement({
                scale: 0,
            });
            const sponsorMarker = new Marker3DInteractiveElement({
                position: { lat: activity.coords.lat, lng:activity.coords.lng, altitude: activity.coords.alt},
                label: "⭐" + activity.activityName, 
                altitudeMode: "RELATIVE_TO_GROUND",
                extruded: true,
                collisionBehavior: google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
            });
            sponsorMarker.append(markerPin);
            map3D.append(sponsorMarker);

            sponorMarkers.push(sponsorMarker); // Store for later removal

        })
   
        // Create a new 3D marker for the hotel
        activeMarker = new Marker3DInteractiveElement({
            position: { lat: hotel.coordinates.lat, lng: hotel.coordinates.lng, altitude:  hotel.coordinates.alt },
            label: hotel.name,
            altitudeMode: "RELATIVE_TO_GROUND",
            extruded: true,
        });

 
        map3D.append(activeMarker);

}

async function addNearbyFeatureMarkers(nearbyFeatures, hotel) {
    const { Marker3DInteractiveElement } = await google.maps.importLibrary("maps3d");
    const { PinElement } = await google.maps.importLibrary("marker");
    if (!map3D) {
        console.error("Map3D is not initialized!");
        return;
    }

    // Remove previous nearby markers
    nearbyMarkers.forEach(marker => marker.remove());
    nearbyMarkers = [];

    nearbyFeatures.places.forEach(feature => {
        console.log(feature);

        const activity = document.createElement("div");

        activity.className = "activity";
        activity.textContent = feature.displayName.text;
        
        
 
        // Create a pin for the feature (if icon is available, use it)
        const markerPin = new PinElement({
            scale: 0,
            glyph: new URL(feature.iconMaskBaseUri + '.svg'),
            glyphColor: "white"
        });
        const featureMarker = new Marker3DInteractiveElement({
            position: { lat: feature.location.latitude, lng: feature.location.longitude, altitude: hotel.coordinates.alt},
            label: feature.displayName.text,
            altitudeMode: "RELATIVE_TO_GROUND",
            extruded: true,
            collisionBehavior: google.maps.CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
        });
        featureMarker.append(markerPin);
        map3D.append(featureMarker);

        nearbyMarkers.push(featureMarker); // Store for later removal

        console.log(`Nearby feature marker added: ${feature.displayName.text} at ${feature.location.latitude}, ${feature.location.longitude}`);
    });
}
function showLoading() {
    console.log("load");
    document.getElementById("loading-overlay").style.display = "flex";
}

function hideLoading() {
    console.log('hide')
    document.getElementById("loading-overlay").style.display = "none";
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}