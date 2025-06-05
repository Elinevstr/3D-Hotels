const hotels = [
    {
        name: "El Palace Hotel Barcelona",
        rating: 4.8,
        price: 471,
        country: 'Spain',
        tilt: 75,
        range: 300,
        placeid:"ChIJxXEkMe6ipBIRJXdyhVotT8g",
        image: "./imgs/elpalace.jpg",
        sponsoredActivities: [
            {
                activityName: "Hispano Suiza",
                activityDescription: "Explore a luxury car factory and enjoy a 3 hour drive through Barcelona.",
                activityImg: "imgs/suiza.jpg",
                coords: ({ lat: 41.39827438508014, lng: 2.1167814193821672, alt: 40 })
            },
            {
                activityName: "El Palace by the sea",
                activityDescription: "An exclusive Royal Blue Bird experience in Barcelona and Costa Brava. Explore the coastal charm of Barcelona aboard our Sea Ray SDX 270.",
                activityImg: "imgs/boat.jpg",
                coords: ({ lat: 41.37878401203503,  lng: 2.1855440484375395, alt: 40 })
            }
        ],
        coordinates: { lat: 41.39158972300159, lng: 2.1715864928583803, alt: 40 },
    },
    {
        name: "Palazzo Manfredi",
        rating: 4.5,
        price: 575,
        country: 'Italy',
        tilt: 75,
        range: 1000,
        placeid:"ChIJTVNJb7dhLxMRdE-kPPU1f_o",
        image: "./imgs/palazzomanfredi.jpg",
        sponsoredActivities: [
            {
                activityName: "Bike tour",
                activityDescription: "Enjoy a guided bicycle tour through the city.",
                activityImg: "imgs/bikerome.jpg",
                coords: ({ lat: 41.889835885209706, lng: 12.494715889815891, alt: 50 })

            },
            {
                activityName: "Explore the colosseum",
                activityDescription: "Enjoy a discount with your colosseum tickets if you book now.",
                activityImg: "imgs/colo.jpg",
                coords: ({ lat: 41.89073013242403, lng: 12.492122106494055, alt: 50 })
            },
            {
                activityName: "Lamborghini Experience",
                activityDescription: "Complimentary welcome aperitif at our Lounge Bar The CourtVIP set up at the arrival and Lamborghini Huracàn EVO rental.",
                activityImg: "imgs/lambo.jpg",
                coords: ({ lat: 41.919176070552844, lng: 12.445373864586392, alt: 50 })
            }
        ],
        coordinates: { lat: 41.89018981948106, lng: 12.495599154077095, alt: 40 }
    },
    {
        name: "Stayokay Hostel Amsterdam Stadsdoelen",
        rating: 4.3,
        price: 110,
        country: 'The Netherlands',
        tilt: 75,
        range: 300,
        placeid:"ChIJRTBOpr8JxkcRI-geNtezUqw",
        image: "./imgs/stayokayams.jpg",  
        sponsoredActivities: [
            {
                activityName: "Roof swing & skybar",
                activityDescription: "For the best view of all over Amsterdam, there is only one place to be these days: A'DAM LOOKOUT, a 360° observation deck on top of the A’DAM tower on the bank of the IJ.",
                activityImg: "imgs/adamlook.jpg",
                coords: ({ lat: 52.38300578556038,  lng: 4.902682832773106, alt: 35 })

            },
            {
                activityName: "Rent a boat to explore the canals",
                activityDescription: "The Amsterdam canals are the number one attraction of our beautiful city. And of course the best way to explore them is by boat.",
                activityImg: "imgs/boatadam.jpg",
                coords: ({ lat: 52.36946668644294,  lng: 4.889203551498918, alt: 35 })
            },
            {
                activityName: "Singing Karaoke at Duke of Tokyo",
                activityDescription: "Looking for a fun activity out of your comfort zone? Then go sing karaoke at Duke of Tokyo!",
                activityImg: "imgs/karaoke.jpg",
                coords: ({ lat: 52.36646758772169,  lng: 4.890669684486252, alt: 35 })
            }
        ],
        coordinates: { lat: 52.369086085651126, lng:4.8973595231384355, alt: 30 }
    },
    {
        name: "Lopesan Baobab Resort",
        rating: 4.5,
        price: 160,
        country: "Spain",
        tilt: 75,
        range: 300,
        placeid:"ChIJDZsEdC59PwwR8r59VMTqHwM",
        image: "./imgs/lopesanbaobab.jpg",
        sponsoredActivities: [
            {
                activityName: "Golf",
                activityDescription: "Enjoy a game of Golf at Meloneras Golf.",
                activityImg: "imgs/golf.jpg",
                coords: ({ lat: 27.751947564905294,   lng: -15.59336565825725, alt: 45 })

            }
        ],
        coordinates: { lat: 27.74095231744191, lng: -15.599906324939424 ,alt: 40},
    },
    {
        name: "Blue Marine Resort & Spa",
        rating: 4.8,
        price: 188,
        country: 'Greece',
        tilt: 75,
        range: 300,
        placeid:"ChIJSUu3SGwIvhQR-sB542E8dj0",
        image: "./imgs/bluemarineresort.jpg",
        sponsoredActivities: [
            {
                activityName: "Free Private Arrival Transfer",
                activityDescription: "Benefit from an one way free transfer upon arrival from the airport/port of Heraklion to the hotel with any booking with a stay of at least 5 nights.",
                activityImg: "imgs/taxi.jpg",
                coords: ({ lat: 35.15977989801784, lng: 25.716024633698265, alt: 45 })
            }
        ],
        coordinates: { lat: 35.158915568206275, lng: 25.716330084122717, alt: 40 },
    },
    {
        name: "Mitsis Rinela Beach Resort & Spa",
        rating: 3.9,
        price: 90,
        country: 'Greece',
        tilt: 75,
        range: 300,
        placeid:"ChIJ3eqVMZRdmhQRbY_SJx3d8nw",
        image: "./imgs/mitsisrinela.jpg",
        sponsoredActivities: [
            {
                activityName: "Mini club",
                activityDescription: "Our Mini Club operates daily from 10:00 to 18:00. The extensive recreation programme and the Children’s Disco keeps the little ones entertained every evening.",
                activityImg: "imgs/kidsclub.jpg",
                coords: ({ lat: 35.33170974492731,  lng: 25.264453876324147, alt: 45 })

            },
            {
                activityName: "CRETAquarium",
                activityDescription: "Get cheaper tickets for the nearby aquarium if you book now.",
                activityImg: "imgs/aquarium.jpg",
                coords: ({ lat: 35.33235894264339, lng: 25.282583643042834, alt: 45 })
            }
        ],
        coordinates: { lat: 35.33057911386082, lng: 25.263585202089622, alt: 40 }
    }
];
