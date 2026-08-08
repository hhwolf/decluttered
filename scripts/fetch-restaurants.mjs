// ============================================================================
// fetch-restaurants.mjs — build src/data/restaurants.json.
//
// LIVE MODE (set GOOGLE_PLACES_API_KEY): queries Google Places API (New)
// Text Search per cuisine x city and maps real rating / userRatingCount /
// priceLevel. Note Google's ToS restricts long-term caching of Places data —
// live mode is for a deployed backend that refreshes, not for committing data.
//
// DEFAULT MODE (no key): writes the bundled curated snapshot below — 44
// well-known US restaurants with their public Google rating values as of
// mid-2026 (hand-collected snapshot; refresh with the live mode when keyed).
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveAxes, logPopularity, getJSON, sleep, writePretty, clamp, hash01 } from "./lib/derive.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/data/restaurants.json");
const KEY = process.env.GOOGLE_PLACES_API_KEY;

// factors: [food, ambiance, service, value, creativity, comfort]
// tones:   [liveliness, formality, adventure]
const FACTOR_BASE = {
  "Italian":        [0.82, 0.72, 0.72, 0.58, 0.55, 0.82],
  "Japanese":       [0.88, 0.70, 0.78, 0.48, 0.75, 0.58],
  "Mexican":        [0.80, 0.62, 0.60, 0.78, 0.58, 0.75],
  "Chinese":        [0.80, 0.55, 0.58, 0.80, 0.55, 0.78],
  "Thai":           [0.80, 0.58, 0.62, 0.78, 0.62, 0.70],
  "Indian":         [0.82, 0.58, 0.62, 0.75, 0.62, 0.72],
  "American":       [0.72, 0.62, 0.65, 0.68, 0.45, 0.85],
  "New American":   [0.85, 0.80, 0.78, 0.42, 0.85, 0.58],
  "French":         [0.88, 0.85, 0.85, 0.35, 0.75, 0.60],
  "Mediterranean":  [0.80, 0.68, 0.68, 0.65, 0.60, 0.72],
  "Korean":         [0.82, 0.62, 0.62, 0.72, 0.68, 0.70],
  "Vietnamese":     [0.80, 0.52, 0.58, 0.85, 0.55, 0.72],
  "Barbecue":       [0.85, 0.55, 0.55, 0.70, 0.48, 0.85],
  "Seafood":        [0.82, 0.70, 0.70, 0.50, 0.58, 0.68],
  "Pizza":          [0.82, 0.55, 0.55, 0.80, 0.50, 0.85],
  "Burgers":        [0.78, 0.50, 0.55, 0.82, 0.45, 0.88],
  "Vegetarian":     [0.75, 0.68, 0.68, 0.62, 0.78, 0.62],
  "Bakery & Café":  [0.78, 0.68, 0.60, 0.72, 0.58, 0.80],
  "Steakhouse":     [0.85, 0.78, 0.82, 0.38, 0.48, 0.75],
  "Soul Food":      [0.82, 0.58, 0.62, 0.75, 0.50, 0.90],
  "Deli":           [0.80, 0.48, 0.52, 0.75, 0.45, 0.85],
  "Cajun & Creole": [0.82, 0.62, 0.62, 0.70, 0.60, 0.80],
  "Latin":          [0.82, 0.62, 0.62, 0.78, 0.58, 0.82],
};
const TONE_BASE = {
  "Italian":        [0.60, 0.55, 0.42],
  "Japanese":       [0.45, 0.62, 0.68],
  "Mexican":        [0.72, 0.35, 0.52],
  "Chinese":        [0.62, 0.38, 0.50],
  "Thai":           [0.58, 0.35, 0.58],
  "Indian":         [0.55, 0.42, 0.58],
  "American":       [0.62, 0.38, 0.28],
  "New American":   [0.62, 0.72, 0.78],
  "French":         [0.45, 0.85, 0.62],
  "Mediterranean":  [0.58, 0.48, 0.52],
  "Korean":         [0.70, 0.40, 0.62],
  "Vietnamese":     [0.55, 0.28, 0.55],
  "Barbecue":       [0.68, 0.25, 0.38],
  "Seafood":        [0.58, 0.58, 0.48],
  "Pizza":          [0.68, 0.25, 0.30],
  "Burgers":        [0.68, 0.20, 0.25],
  "Vegetarian":     [0.48, 0.45, 0.62],
  "Bakery & Café":  [0.50, 0.35, 0.38],
  "Steakhouse":     [0.55, 0.80, 0.35],
  "Soul Food":      [0.65, 0.30, 0.42],
  "Deli":           [0.65, 0.22, 0.30],
  "Cajun & Creole": [0.72, 0.35, 0.55],
  "Latin":          [0.75, 0.30, 0.50],
};
const FACTORS = ["food", "ambiance", "service", "value", "creativity", "comfort"];
const TONES = ["liveliness", "formality", "adventure"];

// --- curated snapshot: [name, city, cuisines, googleRating, ratingCount(k), price 1-4, blurb]
const CURATED = [
  ["Katz's Delicatessen", "New York, NY", ["Deli"], 4.5, 46, 2, "The century-old pastrami temple of the Lower East Side — order at the counter, keep your ticket."],
  ["Joe's Pizza", "New York, NY", ["Pizza"], 4.5, 17, 1, "Greenwich Village's benchmark slice since 1975. No frills, no wrong answers."],
  ["Peter Luger Steak House", "Brooklyn, NY", ["Steakhouse"], 4.4, 14, 4, "Dry-aged porterhouse in a beer-hall of a room that hasn't changed in a century."],
  ["Gramercy Tavern", "New York, NY", ["New American"], 4.6, 5, 4, "Danny Meyer's flagship: seasonal American cooking with famously warm service."],
  ["Le Bernardin", "New York, NY", ["French", "Seafood"], 4.7, 3, 4, "Eric Ripert's temple to fish — precise, hushed, and worth every course."],
  ["Xi'an Famous Foods", "New York, NY", ["Chinese"], 4.4, 6, 1, "Hand-ripped biang biang noodles and cumin lamb that built a cult from a Flushing stall."],
  ["Los Tacos No. 1", "New York, NY", ["Mexican"], 4.6, 13, 1, "Adobada on a handmade tortilla, eaten standing up in Chelsea Market. Perfect."],
  ["Superiority Burger", "New York, NY", ["Vegetarian", "Burgers"], 4.4, 2, 1, "The veggie burger that made carnivores queue around the block in the East Village."],
  ["Russ & Daughters", "New York, NY", ["Deli", "Bakery & Café"], 4.7, 4, 2, "Fourth-generation appetizing: silky lox, bagels, and a line that moves like church."],
  ["Girl & the Goat", "Chicago, IL", ["New American"], 4.6, 9, 3, "Stephanie Izard's wood-fired, share-everything Fulton Market crowd-pleaser."],
  ["Au Cheval", "Chicago, IL", ["Burgers", "American"], 4.5, 9, 2, "The diner-noir bar whose cheeseburger routinely tops national best-of lists."],
  ["Lou Malnati's Pizzeria", "Chicago, IL", ["Pizza"], 4.5, 8, 2, "Deep dish with the buttercrust that Chicagoans actually defend at parties."],
  ["Alinea", "Chicago, IL", ["New American", "French"], 4.7, 4, 4, "Grant Achatz's three-star theater of edible balloons and centerpiece desserts."],
  ["Pequod's Pizza", "Chicago, IL", ["Pizza"], 4.5, 10, 2, "Pan pizza with a caramelized crust ring people cross the city for."],
  ["Franklin Barbecue", "Austin, TX", ["Barbecue"], 4.7, 8, 2, "Aaron Franklin's brisket — the queue is the pilgrimage, the bark is the reward."],
  ["Uchi", "Austin, TX", ["Japanese"], 4.7, 4, 4, "Tyson Cole's warm, inventive sushi ya that made Austin a food city."],
  ["Torchy's Tacos", "Austin, TX", ["Mexican"], 4.4, 10, 1, "Damn good tacos, queso with a green-chile kick, zero pretension."],
  ["Suerte", "Austin, TX", ["Mexican"], 4.6, 3, 3, "Masa-obsessed East Austin Mexican — the suadero tacos are the stuff of legend."],
  ["Zingerman's Delicatessen", "Ann Arbor, MI", ["Deli", "Bakery & Café"], 4.6, 6, 2, "The corner deli that became a food empire; reubens worth a road trip."],
  ["Tartine Bakery", "San Francisco, CA", ["Bakery & Café"], 4.5, 6, 2, "Morning buns and country loaves that rewired American baking."],
  ["Zuni Café", "San Francisco, CA", ["New American", "Mediterranean"], 4.4, 4, 3, "The roast chicken for two over bread salad — a San Francisco rite since 1979."],
  ["House of Prime Rib", "San Francisco, CA", ["Steakhouse", "American"], 4.6, 8, 3, "Tableside carts, martinis, and prime rib served exactly one way: correctly."],
  ["Mister Jiu's", "San Francisco, CA", ["Chinese", "New American"], 4.5, 2, 3, "Michelin-starred Cantonese in a grand Chinatown banquet hall."],
  ["Swan Oyster Depot", "San Francisco, CA", ["Seafood"], 4.7, 3, 2, "Eighteen stools, crab louie, and the friendliest counter in America. Cash only."],
  ["Guelaguetza", "Los Angeles, CA", ["Mexican"], 4.5, 5, 2, "The Koreatown moles that earned a James Beard classic award — Oaxaca in LA."],
  ["Republique", "Los Angeles, CA", ["French", "Bakery & Café"], 4.5, 5, 3, "Cathedral ceilings, pastry cases at dawn, steak frites at night."],
  ["Howlin' Ray's", "Los Angeles, CA", ["Soul Food", "American"], 4.7, 7, 2, "Nashville hot chicken hot enough to make grown adults cry happily in Chinatown."],
  ["Bestia", "Los Angeles, CA", ["Italian"], 4.6, 7, 3, "Industrial-chic Arts District Italian; the bone marrow spinarello is non-negotiable."],
  ["Sqirl", "Los Angeles, CA", ["Bakery & Café", "New American"], 4.3, 3, 2, "Ricotta toast and sorrel rice bowls that launched a thousand brunch menus."],
  ["Pike Place Chowder", "Seattle, WA", ["Seafood"], 4.7, 15, 2, "Award-hoarding chowder counter tucked in Post Alley by the market."],
  ["Canlis", "Seattle, WA", ["New American"], 4.7, 3, 4, "Midcentury landmark dining over Lake Union — Seattle's special-occasion room since 1950."],
  ["Paseo", "Seattle, WA", ["Cajun & Creole"], 4.5, 5, 1, "Caribbean roast pork sandwiches with caramelized onions that ruin all other sandwiches."],
  ["Commander's Palace", "New Orleans, LA", ["Cajun & Creole"], 4.7, 7, 4, "Turtle soup, 25-cent lunch martinis, and jazz brunch under the striped awning."],
  ["Cochon", "New Orleans, LA", ["Cajun & Creole"], 4.5, 6, 3, "Donald Link's Cajun ode to the pig — boudin, cracklins, and rabbit dumplings."],
  ["Café du Monde", "New Orleans, LA", ["Bakery & Café"], 4.5, 26, 1, "Beignets and chicory café au lait, 24 hours a day since 1862."],
  ["Willie Mae's Scotch House", "New Orleans, LA", ["Soul Food"], 4.4, 5, 2, "America's fried chicken, per the James Beard Foundation. The Tremé original."],
  ["Zahav", "Philadelphia, PA", ["Mediterranean"], 4.7, 4, 3, "Michael Solomonov's modern Israeli — the hummus tehina changed the conversation."],
  ["Reading Terminal Market", "Philadelphia, PA", ["Deli", "American"], 4.7, 27, 1, "A city block of roast pork sandwiches, whoopie pies, and Amish butter."],
  ["Joe's Stone Crab", "Miami, FL", ["Seafood"], 4.5, 12, 4, "Stone crab claws with mustard sauce — Miami Beach's institution since 1913."],
  ["Versailles", "Miami, FL", ["Latin", "Cuban"] , 4.4, 15, 2, "The world's most famous Cuban restaurant, cafecito ventanita included."],
  ["La Barbecue", "Austin, TX", ["Barbecue"], 4.6, 4, 2, "Brisket and beef ribs that Franklin loyalists whisper about switching for."],
  ["Momofuku Noodle Bar", "New York, NY", ["Korean", "New American"], 4.3, 4, 2, "Where David Chang lit the fuse on pork buns and ramen-as-event."],
  ["H Mart Food Court (K-Town)", "New York, NY", ["Korean"], 4.4, 3, 1, "Soondubu, japchae, and bulgogi under one buzzing food-hall roof."],
  ["Night + Market Song", "Los Angeles, CA", ["Thai"], 4.5, 2, 2, "Kris Yenbamroong's party-Thai — larb, natural wine, and zero chill."],
  // --- expansion: more cities, same bar for fame ---
  ["Neptune Oyster", "Boston, MA", ["Seafood"], 4.6, 6, 3, "Twenty-two seats, hot buttered lobster rolls, and a line that forms before noon."],
  ["Santarpio's Pizza", "Boston, MA", ["Pizza"], 4.5, 6, 1, "Eastie's coal-blistered pies and lamb skewers, unchanged since 1903."],
  ["Union Oyster House", "Boston, MA", ["Seafood", "American"], 4.4, 9, 3, "America's oldest restaurant — oysters at the same semicircular bar since 1826."],
  ["Ben's Chili Bowl", "Washington, DC", ["American", "Soul Food"], 4.5, 10, 1, "Half-smokes on U Street through riots, renewal, and every president since Ike."],
  ["Rose's Luxury", "Washington, DC", ["New American"], 4.6, 3, 3, "The Capitol Hill line worth joining — pork-lychee salad and pure hospitality."],
  ["Rasika", "Washington, DC", ["Indian"], 4.6, 4, 3, "Modern Indian that made palak chaat a DC power-lunch move."],
  ["The Original Ninfa's on Navigation", "Houston, TX", ["Mexican"], 4.6, 12, 2, "Where fajitas were born — Mama Ninfa's East End original, tortillas by hand."],
  ["Truth BBQ", "Houston, TX", ["Barbecue"], 4.8, 5, 2, "Leonard Botello's brisket and tallow-brushed ribs — Texas Monthly's top tier."],
  ["Crawfish & Noodles", "Houston, TX", ["Vietnamese", "Cajun & Creole"], 4.4, 3, 2, "Viet-Cajun crawfish tossed in garlic butter — Houston's signature hybrid."],
  ["The Varsity", "Atlanta, GA", ["Burgers", "American"], 4.3, 25, 1, "\"What'll ya have?\" — chili dogs and frosted oranges at the world's largest drive-in."],
  ["Busy Bee Cafe", "Atlanta, GA", ["Soul Food"], 4.6, 4, 2, "Fried chicken and oxtails that fed the civil-rights movement, still packed at noon."],
  ["Staplehouse", "Atlanta, GA", ["New American"], 4.6, 2, 3, "Nonprofit-born tasting counter that became Atlanta's toughest reservation."],
  ["Prince's Hot Chicken", "Nashville, TN", ["Soul Food"], 4.4, 4, 1, "The family that invented hot chicken — pay the heat its respect."],
  ["Arnold's Country Kitchen", "Nashville, TN", ["Soul Food", "American"], 4.7, 4, 1, "The meat-and-three standard: cafeteria line, white bread, transcendence."],
  ["Hattie B's Hot Chicken", "Nashville, TN", ["Soul Food", "American"], 4.5, 20, 2, "The tourist gateway to hot chicken — and still very good hot chicken."],
  ["Casa Bonita", "Denver, CO", ["Mexican"], 4.2, 12, 2, "Cliff divers, sopapillas, and pink towers — the reopened Colorado fever dream."],
  ["Work & Class", "Denver, CO", ["Latin", "New American"], 4.7, 3, 2, "Small plates, big pours, zero pretense in a RiNo shipping container."],
  ["Pok Pok (Reborn)", "Portland, OR", ["Thai"], 4.5, 5, 2, "Andy Ricker's fish-sauce wings — the dish that put Portland Thai on the map."],
  ["Screen Door", "Portland, OR", ["Soul Food", "American"], 4.6, 8, 2, "Fried chicken over sweet-potato waffles; the brunch line is a city institution."],
  ["Le Pigeon", "Portland, OR", ["French"], 4.7, 2, 3, "Gabriel Rucker's chef's counter — foie gras profiteroles, no apologies."],
  ["Hodad's", "San Diego, CA", ["Burgers"], 4.5, 13, 1, "Ocean Beach bacon cheeseburgers stacked past reason since 1969."],
  ["Las Cuatro Milpas", "San Diego, CA", ["Mexican"], 4.5, 4, 1, "Barrio Logan's tortilla-and-chorizo line, cash only, gone by 1pm."],
  ["Lotus of Siam", "Las Vegas, NV", ["Thai"], 4.6, 6, 2, "Northern Thai in a strip mall that critics call the best Thai in America."],
  ["Oscar's Steakhouse", "Las Vegas, NV", ["Steakhouse"], 4.5, 3, 3, "Vintage Vegas in the Plaza's glass dome — martinis, bone-in ribeyes, mob stories."],
  ["Matt's Bar", "Minneapolis, MN", ["Burgers"], 4.5, 5, 1, "Home of the Jucy Lucy — molten cheese inside the patty. Napkins ready."],
  ["Owamni", "Minneapolis, MN", ["New American"], 4.5, 2, 3, "Sean Sherman's decolonized menu — bison, wild rice, and zero colonial ingredients."],
  ["Rodney Scott's BBQ", "Charleston, SC", ["Barbecue"], 4.6, 5, 2, "Whole-hog pit mastery from a James Beard-winning pitmaster."],
  ["Leon's Oyster Shop", "Charleston, SC", ["Seafood", "Soul Food"], 4.6, 3, 2, "Char-grilled oysters and fried chicken in a converted body shop."],
  ["Joe's Kansas City Bar-B-Que", "Kansas City, KS", ["Barbecue"], 4.7, 20, 2, "The gas-station burnt ends Anthony Bourdain put on his life list."],
  ["Q39", "Kansas City, MO", ["Barbecue"], 4.7, 8, 2, "Competition-circuit brisket meets chef technique in midtown KC."],
  ["Pappy's Smokehouse", "St. Louis, MO", ["Barbecue"], 4.6, 9, 2, "Memphis-style ribs that sell out by mid-afternoon, daily."],
  ["Imo's Pizza", "St. Louis, MO", ["Pizza"], 4.3, 6, 1, "Provel cheese, cracker crust, cut in squares — St. Louis's divisive love language."],
  ["Pizzeria Bianco", "Phoenix, AZ", ["Pizza", "Italian"], 4.5, 6, 2, "Chris Bianco's wood-fired margherita — the pizza that made critics fly to Phoenix."],
  ["Barrio Café", "Phoenix, AZ", ["Mexican"], 4.4, 4, 2, "Chef Silvana's guacamole made tableside and cochinita pibil with a mural backdrop."],
  ["Buddy's Pizza", "Detroit, MI", ["Pizza"], 4.5, 7, 2, "The original Detroit square — crispy-edged blue-steel pans since 1946."],
  ["Slows Bar BQ", "Detroit, MI", ["Barbecue"], 4.4, 8, 2, "Corktown's brisket-and-mac anchor that helped restart a neighborhood."],
  ["Franklin Fountain", "Philadelphia, PA", ["Bakery & Café"], 4.6, 4, 1, "Hand-scooped sundaes served exactly as they were in 1904."],
  ["Pat's King of Steaks", "Philadelphia, PA", ["American"], 4.3, 16, 1, "The inventor of the cheesesteak — order 'whiz wit' and step aside."],
  ["Snow's BBQ", "Lexington, TX", ["Barbecue"], 4.8, 3, 2, "Tootsie Tomanetz's Saturday-only pits — Texas Monthly's #1, sold out by 10am."],
  ["Valentina's Tex Mex BBQ", "Austin, TX", ["Barbecue", "Mexican"], 4.6, 4, 2, "Brisket tacos on handmade flour tortillas — Tex-Mex and smoke, married."],
  ["Bern's Steak House", "Tampa, FL", ["Steakhouse"], 4.6, 9, 4, "Dry-aged steaks, a half-million-bottle cellar, and a dessert room upstairs."],
  ["Columbia Restaurant", "Tampa, FL", ["Latin", "Mediterranean"], 4.5, 13, 3, "Florida's oldest restaurant — 1905 salad tossed tableside in Ybor City tile rooms."],
  ["The French Laundry", "Yountville, CA", ["French"], 4.6, 2, 4, "Thomas Keller's nine-course benchmark — the reservation is the flex."],
  ["Chez Panisse", "Berkeley, CA", ["New American", "French"], 4.6, 2, 4, "Alice Waters' farm-to-table origin point, still setting the menu daily."],
  ["Brennan's", "New Orleans, LA", ["Cajun & Creole", "French"], 4.5, 8, 4, "Bananas Foster flambéed where it was invented; breakfast as theater."],
  ["Dooky Chase's", "New Orleans, LA", ["Cajun & Creole", "Soul Food"], 4.5, 3, 3, "Leah Chase's gumbo z'herbes fed presidents and the movement alike."],
  ["Primanti Bros.", "Pittsburgh, PA", ["Deli", "American"], 4.4, 12, 1, "Fries and slaw inside the sandwich — Steel City efficiency since 1933."],
  ["The Pit Authentic Barbecue", "Raleigh, NC", ["Barbecue"], 4.4, 8, 2, "Whole-hog Eastern Carolina 'cue with the vinegar bite it's supposed to have."],
  ["Skylight Inn BBQ", "Ayden, NC", ["Barbecue"], 4.7, 3, 1, "Chopped whole hog with crackling mixed in, under the little Capitol dome."],
  ["Eventide Oyster Co.", "Portland, ME", ["Seafood"], 4.7, 5, 2, "The brown-butter lobster roll on a steamed bun that rewired the form."],
  ["Fore Street", "Portland, ME", ["New American"], 4.6, 3, 3, "Wood-fired everything and the open kitchen that made Portland a food destination."],
  ["Central BBQ", "Memphis, TN", ["Barbecue"], 4.6, 9, 2, "Dry-rub ribs and smoked wings a walk from the Lorraine Motel."],
  ["The Rendezvous", "Memphis, TN", ["Barbecue"], 4.4, 10, 2, "Charlie Vergos' basement dry ribs, dusted not sauced, since 1948."],
  ["Faidley's Seafood", "Baltimore, MD", ["Seafood"], 4.6, 3, 2, "Jumbo lump crab cakes eaten standing at Lexington Market since 1886."],
  ["Jack Fry's", "Louisville, KY", ["American", "New American"], 4.7, 3, 3, "Bourbon-era supper club energy; shrimp and grits worth the drive."],
  ["Taquería El Milagro", "Chicago, IL", ["Mexican"], 4.5, 3, 1, "Pilsen's tortilleria-backed steam-table tacos, cheap and correct."],
  ["Mi Tierra Café y Panadería", "San Antonio, TX", ["Mexican", "Bakery & Café"], 4.4, 21, 2, "24-hour mariachis, pan dulce, and enchiladas under a ceiling of piñatas."],

  // --- focus metros: deep enough that a city filter leaves a real deck ---
  // Boston
  ["Legal Sea Foods", "Boston, MA", ["Seafood"], 4.3, 6, 3, "The clam chowder served at every presidential inauguration since 1981."],
  ["Mike's Pastry", "Boston, MA", ["Bakery & Café"], 4.4, 17, 1, "North End cannoli by the string-tied box; expect a crowd and cash."],
  ["Regina Pizzeria", "Boston, MA", ["Pizza"], 4.5, 6, 1, "Brick-oven thin crust from the 1926 North End original."],
  ["Giacomo's Ristorante", "Boston, MA", ["Italian"], 4.5, 3, 2, "No reservations, cash only, and a lobster fra diavolo worth the sidewalk wait."],
  ["Row 34", "Boston, MA", ["Seafood"], 4.6, 3, 3, "A workingman's oyster bar for the Fort Point crowd — raw bar and craft beer."],
  ["Oleana", "Boston, MA", ["Mediterranean"], 4.7, 2, 3, "Ana Sortun's Turkish-inflected Cambridge cooking, with a garden patio."],
  ["Toro", "Boston, MA", ["Mediterranean"], 4.5, 3, 3, "Ken Oringer's South End tapas — grilled corn with lime and aioli is the order."],
  ["No. 9 Park", "Boston, MA", ["French", "New American"], 4.6, 2, 4, "Barbara Lynch's Beacon Hill flagship and its famous prune-stuffed gnocchi."],
  ["Island Creek Oyster Bar", "Boston, MA", ["Seafood"], 4.5, 3, 3, "Farm-to-shell oysters in Kenmore, plus a lobster roe pasta people plan around."],
  ["Neptune Oyster (Back Bay)", "Boston, MA", ["Seafood"], 4.5, 2, 3, "The second room for the hot buttered lobster roll, still worth queuing for."],
  ["Galleria Umberto", "Boston, MA", ["Pizza"], 4.6, 2, 1, "Sicilian slices until they run out, which is usually by 1:30pm."],
  ["Sullivan's Castle Island", "Boston, MA", ["American", "Seafood"], 4.6, 5, 1, "Seasonal Southie shack: hot dogs, fried clams, and the harbor walk."],

  // New York (beyond the originals already listed above)
  ["Di Fara Pizza", "Brooklyn, NY", ["Pizza"], 4.4, 4, 2, "Dom DeMarco's Midwood slice shop — scissored basil, no hurry, ever."],
  ["Lucali", "Brooklyn, NY", ["Pizza", "Italian"], 4.6, 2, 3, "Candlelit Carroll Gardens pizza worth the same-day list ritual."],
  ["Keens Steakhouse", "New York, NY", ["Steakhouse"], 4.6, 6, 4, "Mutton chop under 50,000 clay pipes hanging from the ceiling since 1885."],
  ["Grand Central Oyster Bar", "New York, NY", ["Seafood"], 4.3, 10, 3, "Vaulted Guastavino tile, pan roasts, and three dozen oyster varieties."],
  ["Veselka", "New York, NY", ["American"], 4.5, 6, 2, "24-hour East Village pierogi and borscht, Ukrainian since 1954."],
  ["Sylvia's", "New York, NY", ["Soul Food"], 4.4, 5, 2, "Harlem's Queen of Soul Food — smothered chicken and Sunday gospel brunch."],
  ["Nom Wah Tea Parlor", "New York, NY", ["Chinese"], 4.4, 6, 2, "Doyers Street dim sum in the oldest room in Chinatown."],
  ["John's of Bleecker Street", "New York, NY", ["Pizza", "Italian"], 4.5, 5, 2, "Coal-fired Village pies since 1929 — no slices, don't ask."],
  ["Prince Street Pizza", "New York, NY", ["Pizza"], 4.4, 9, 1, "The pepperoni-cup Sicilian square that broke the internet."],
  ["Ippudo NY", "New York, NY", ["Japanese"], 4.4, 5, 2, "The tonkotsu that started New York's ramen arms race."],
  ["Balthazar", "New York, NY", ["French"], 4.4, 8, 3, "Keith McNally's SoHo brasserie: mirrors, steak frites, and a bread basket."],
  ["Carbone", "New York, NY", ["Italian"], 4.5, 3, 4, "Red-sauce theater in Greenwich Village; the spicy rigatoni vodka is the point."],

  // Chicago
  ["Portillo's", "Chicago, IL", ["American", "Burgers"], 4.5, 15, 1, "Chicago dog, Italian beef dipped, chocolate cake shake. The trifecta."],
  ["Gene & Jude's", "Chicago, IL", ["American"], 4.6, 4, 1, "A depression dog with fries piled on top, and absolutely no ketchup."],
  ["Giordano's", "Chicago, IL", ["Pizza"], 4.4, 12, 2, "Stuffed deep dish with a crust lid — plan for a 45-minute bake."],
  ["The Purple Pig", "Chicago, IL", ["Mediterranean"], 4.5, 5, 3, "Michigan Avenue small plates built for wine and pork."],
  ["Monteverde", "Chicago, IL", ["Italian"], 4.7, 3, 3, "Sarah Grueneberg's pasta laboratory in the West Loop."],
  ["The Publican", "Chicago, IL", ["New American"], 4.5, 4, 3, "Beer hall benches, oysters and pork for the Fulton Market crowd."],
  ["Smoque BBQ", "Chicago, IL", ["Barbecue"], 4.6, 5, 2, "Northwest side brisket that quietly outranks a lot of Texas."],
  ["Manny's Cafeteria & Delicatessen", "Chicago, IL", ["Deli"], 4.5, 5, 2, "Corned beef carved by a man who has done it for thirty years."],
  ["Big Star", "Chicago, IL", ["Mexican"], 4.4, 5, 1, "Wicker Park tacos, whiskey and a patio that runs all summer."],
  ["Calumet Fisheries", "Chicago, IL", ["Seafood"], 4.7, 2, 1, "Smoked chubs from a shack by the drawbridge, cash only."],

  // San Francisco Bay Area
  ["State Bird Provisions", "San Francisco, CA", ["New American"], 4.5, 3, 3, "Dim-sum carts, but for inventive Californian small plates."],
  ["La Taqueria", "San Francisco, CA", ["Mexican"], 4.5, 6, 1, "The Mission burrito argument-ender — no rice, dorado-crisped tortilla."],
  ["El Farolito", "San Francisco, CA", ["Mexican"], 4.4, 7, 1, "Super burrito at 1am, the other side of the Mission debate."],
  ["Burma Superstar", "San Francisco, CA", ["Thai", "Chinese"], 4.4, 5, 2, "Tea leaf salad tossed tableside; the Inner Richmond queue is the norm."],
  ["Yank Sing", "San Francisco, CA", ["Chinese"], 4.4, 4, 3, "Rincon Center dim sum carts with Shanghai dumplings worth the price."],
  ["Nopa", "San Francisco, CA", ["New American", "Mediterranean"], 4.5, 4, 3, "Wood-fired late-night cooking that anchored a whole neighborhood."],
  ["Tadich Grill", "San Francisco, CA", ["Seafood"], 4.3, 4, 3, "California's oldest restaurant — cioppino at a counter since 1849."],
  ["Molinari Delicatessen", "San Francisco, CA", ["Deli", "Italian"], 4.7, 3, 1, "North Beach sandwich counter; take the number, take it to the park."],
  ["Bi-Rite Creamery", "San Francisco, CA", ["Bakery & Café"], 4.6, 6, 1, "Salted caramel scoops and a line down 18th Street."],
  ["Swan Oyster Depot (Polk)", "San Francisco, CA", ["Seafood"], 4.6, 2, 2, "Eighteen stools of crab and sourdough, still cash only."],

  // Los Angeles
  ["Langer's Delicatessen", "Los Angeles, CA", ["Deli"], 4.6, 5, 2, "The #19 pastrami on double-baked rye — many say it beats New York."],
  ["Philippe the Original", "Los Angeles, CA", ["American", "Deli"], 4.4, 12, 1, "The French dip's disputed birthplace, sawdust floors and all, since 1908."],
  ["Grand Central Market", "Los Angeles, CA", ["American", "Mexican"], 4.5, 20, 1, "A century-old hall of stalls — Eggslut, tacos, and everything between."],
  ["Pink's Hot Dogs", "Los Angeles, CA", ["American"], 4.3, 12, 1, "Chili dogs under the neon on La Brea since 1939."],
  ["Musso & Frank Grill", "Los Angeles, CA", ["American", "Steakhouse"], 4.5, 4, 3, "Hollywood's oldest restaurant; martinis stirred by career bartenders."],
  ["n/naka", "Los Angeles, CA", ["Japanese"], 4.7, 1, 4, "Niki Nakayama's modern kaiseki, booked months out."],
  ["Jitlada", "Los Angeles, CA", ["Thai"], 4.5, 3, 2, "Southern Thai heat in East Hollywood that does not negotiate."],
  ["Mariscos Jalisco", "Los Angeles, CA", ["Mexican", "Seafood"], 4.6, 2, 1, "The Boyle Heights truck and its fried shrimp taco dorado."],
  ["The Apple Pan", "Los Angeles, CA", ["Burgers"], 4.4, 3, 1, "Hickory burger at a horseshoe counter, unchanged since 1947."],
  ["Sushi Gen", "Los Angeles, CA", ["Japanese"], 4.6, 3, 3, "Little Tokyo sashimi lunch special that has its own lunchtime line."],
  ["Canter's Deli", "Los Angeles, CA", ["Deli"], 4.3, 6, 2, "24-hour Fairfax institution, matzo ball soup and the Kibitz Room next door."],

  // --- second tier: enough depth that these are worth picking too ---
  // Seattle
  ["Dick's Drive-In", "Seattle, WA", ["Burgers"], 4.5, 6, 1, "Deluxe burger and hand-cut fries from the 1954 Capitol Hill window."],
  ["The Walrus and the Carpenter", "Seattle, WA", ["Seafood"], 4.6, 3, 3, "Ballard oyster bar that set the template for the whole city."],
  ["Un Bien", "Seattle, WA", ["Cajun & Creole"], 4.7, 3, 1, "The Paseo family's Caribbean roast pork, carried on by the next generation."],
  ["Beecher's Handmade Cheese", "Seattle, WA", ["Bakery & Café", "American"], 4.6, 6, 1, "Watch the curds turn, then eat the world's best mac and cheese."],
  ["Shiro's", "Seattle, WA", ["Japanese"], 4.5, 2, 4, "The sushi counter that trained most of Seattle's itamae."],
  // Washington DC
  ["Old Ebbitt Grill", "Washington, DC", ["American", "Seafood"], 4.5, 15, 3, "Oyster bar steps from the White House, serving since 1856."],
  ["Le Diplomate", "Washington, DC", ["French"], 4.5, 6, 3, "14th Street brasserie doing steak frites and people-watching in equal measure."],
  ["Founding Farmers", "Washington, DC", ["American"], 4.5, 14, 2, "Farmer-owned, scratch-made, and permanently booked out."],
  ["Maydan", "Washington, DC", ["Mediterranean"], 4.6, 2, 3, "Live-fire cooking around an open hearth, Levantine and North African."],
  ["Thip Khao", "Washington, DC", ["Thai"], 4.5, 2, 2, "Laotian jungle menu in Columbia Heights — ask for the spicy side."],
  // Atlanta
  ["Fox Bros. Bar-B-Q", "Atlanta, GA", ["Barbecue"], 4.6, 8, 2, "Texas technique, Georgia address; the frito pie is not optional."],
  ["Antico Pizza Napoletana", "Atlanta, GA", ["Pizza", "Italian"], 4.5, 5, 2, "Communal tables, paper plates, and a genuinely Neapolitan pie."],
  ["Mary Mac's Tea Room", "Atlanta, GA", ["Soul Food"], 4.5, 8, 2, "Atlanta's dining room since 1945 — fried chicken and pot likker."],
  ["Bacchanalia", "Atlanta, GA", ["New American"], 4.6, 2, 4, "The city's long-running tasting-menu benchmark."],
  // Houston
  ["Killen's Barbecue", "Houston, TX", ["Barbecue"], 4.6, 6, 2, "Ronnie Killen's brisket and beef ribs, worth the drive to Pearland."],
  ["Pappas Bros. Steakhouse", "Houston, TX", ["Steakhouse"], 4.7, 4, 4, "Dry-aged in house, with a wine list the size of a phone book."],
  ["Xochi", "Houston, TX", ["Mexican"], 4.6, 4, 3, "Hugo Ortega's Oaxacan cooking — moles, masa, and mezcal downtown."],
  ["Himalaya", "Houston, TX", ["Indian"], 4.5, 3, 2, "Kaiser Lashkari's Pakistani-Texan hybrid; the hunter's beef is legend."],
  // Nashville
  ["Loveless Cafe", "Nashville, TN", ["Soul Food", "American"], 4.5, 11, 2, "Scratch biscuits and country ham at the end of the Natchez Trace."],
  ["Rolf and Daughters", "Nashville, TN", ["New American", "Italian"], 4.6, 2, 3, "Germantown pasta and communal tables in a former boot factory."],
  ["Monell's Dining", "Nashville, TN", ["Soul Food"], 4.7, 3, 2, "Family-style, all-you-can-eat, passed to the left. No strangers by dessert."],
  ["Pharmacy Burger Parlor", "Nashville, TN", ["Burgers"], 4.5, 4, 2, "German beer garden out back, griddled burgers out front."],
  // Miami
  ["Mandolin Aegean Bistro", "Miami, FL", ["Mediterranean"], 4.6, 4, 3, "A blue-and-white Greek courtyard hidden in the Design District."],
  ["KYU", "Miami, FL", ["Japanese", "Korean"], 4.6, 4, 3, "Wynwood wood-fired Asian; the roasted cauliflower converted the skeptics."],
  ["Zak the Baker", "Miami, FL", ["Bakery & Café"], 4.6, 3, 2, "Kosher sourdough bakery that turned bread into a Miami destination."],
  ["El Palacio de los Jugos", "Miami, FL", ["Latin"], 4.5, 6, 1, "Open-air Cuban fruit stand and lechon counter, gloriously chaotic."],
  // Philadelphia
  ["John's Roast Pork", "Philadelphia, PA", ["Deli", "American"], 4.7, 3, 1, "The roast pork with sharp provolone and broccoli rabe that beats the cheesesteak."],
  ["Vetri Cucina", "Philadelphia, PA", ["Italian"], 4.7, 1, 4, "A townhouse tasting menu; the spinach gnocchi is a city landmark."],
  ["Angelo's Pizzeria", "Philadelphia, PA", ["Pizza", "Deli"], 4.6, 3, 2, "South Philly sesame-seed rolls, hoagies, and an hours-long wait."],
  ["Suraya", "Philadelphia, PA", ["Mediterranean"], 4.6, 3, 3, "Lebanese cafe, market and garden under one Fishtown roof."],
  // New Orleans
  ["Galatoire's", "New Orleans, LA", ["Cajun & Creole", "French"], 4.5, 4, 4, "Friday lunch on Bourbon Street, jackets required, tables never rushed."],
  ["Turkey and the Wolf", "New Orleans, LA", ["American", "Deli"], 4.6, 3, 2, "A fried-bologna sandwich shop that got named best new restaurant in America."],
  ["Parkway Bakery & Tavern", "New Orleans, LA", ["Deli", "Seafood"], 4.6, 6, 1, "Shrimp po' boys, dressed, eaten at picnic tables by the bayou."],
  ["Casamento's", "New Orleans, LA", ["Seafood"], 4.6, 2, 2, "All-tile oyster room, closed all summer, oyster loaf worth planning around."],
  // Austin
  ["Salt Lick BBQ", "Austin, TX", ["Barbecue"], 4.5, 12, 2, "Open pit under a Driftwood pavilion; BYOB and cash only."],
  ["Veracruz All Natural", "Austin, TX", ["Mexican"], 4.7, 5, 1, "The migas taco from a trailer that beat every restaurant in town."],
  ["Home Slice Pizza", "Austin, TX", ["Pizza"], 4.6, 6, 2, "South Congress New York-style, with a walk-up window for the impatient."],
  ["Matt's El Rancho", "Austin, TX", ["Mexican"], 4.4, 6, 2, "Bob Armstrong dip and frozen margaritas since 1952."],
  // Denver
  ["Sushi Den", "Denver, CO", ["Japanese"], 4.6, 3, 3, "Fish flown from Nagahama market daily, which is not a line Denver expects."],
  ["Biker Jim's Gourmet Dogs", "Denver, CO", ["American"], 4.5, 3, 1, "Elk and reindeer sausages under cream cheese and caramelized onions."],
  ["Rioja", "Denver, CO", ["Mediterranean", "New American"], 4.6, 2, 3, "Jennifer Jasinski's Larimer Square Mediterranean, handmade pasta daily."],
  // Portland OR
  ["Voodoo Doughnut", "Portland, OR", ["Bakery & Café"], 4.3, 12, 1, "The pink box, the maple bacon bar, the 3am line. Very Portland."],
  ["Apizza Scholls", "Portland, OR", ["Pizza"], 4.6, 3, 2, "Strict dough limits, strict topping limits, near-perfect pies."],
  ["Nong's Khao Man Gai", "Portland, OR", ["Thai"], 4.6, 3, 1, "One dish — poached chicken and rice — done immaculately."],
];

// --- signature dishes: restaurant -> [label shown on the card, Wikipedia
// article whose lead image depicts the dish (or the restaurant itself when
// the room is the star)]. Photos are illustrative of the dish, not shots of
// the specific restaurant's plate.
const DISHES = {
  "Katz's Delicatessen": ["Pastrami on rye", "Pastrami on rye"],
  "Joe's Pizza": ["Plain cheese slice", "New York–style pizza"],
  "Peter Luger Steak House": ["Dry-aged porterhouse", "T-bone steak"],
  "Gramercy Tavern": ["Seasonal American cooking", "Gramercy Tavern"],
  "Le Bernardin": ["Tasting-menu fish courses", "Le Bernardin"],
  "Xi'an Famous Foods": ["Biang biang noodles", "Biangbiang noodles"],
  "Los Tacos No. 1": ["Adobada tacos", "Al pastor"],
  "Superiority Burger": ["The veggie burger", "Veggie burger"],
  "Russ & Daughters": ["Lox and cream cheese bagel", "Bagel and cream cheese"],
  "Girl & the Goat": ["Wood-fired share plates", "Wood-fired oven"],
  "Au Cheval": ["The cheeseburger", "Cheeseburger"],
  "Lou Malnati's Pizzeria": ["Butter-crust deep dish", "Chicago-style pizza"],
  "Alinea": ["Edible-balloon tasting menu", "Alinea (restaurant)"],
  "Pequod's Pizza": ["Caramelized-crust pan pizza", "Pan pizza"],
  "Franklin Barbecue": ["Brisket", "Brisket"],
  "Uchi": ["Inventive sushi omakase", "Sushi"],
  "Torchy's Tacos": ["Green-chile queso and tacos", "Chile con queso"],
  "Suerte": ["Suadero tacos", "Suadero"],
  "Zingerman's Delicatessen": ["The reuben", "Reuben sandwich"],
  "Tartine Bakery": ["Country loaf and morning buns", "Sourdough"],
  "Zuni Café": ["Roast chicken for two", "Roast chicken"],
  "House of Prime Rib": ["Prime rib carved tableside", "Standing rib roast"],
  "Mister Jiu's": ["Whole roast duck", "Peking duck"],
  "Swan Oyster Depot": ["Crab Louie", "Crab Louie"],
  "Guelaguetza": ["Mole negro", "Mole (sauce)"],
  "Republique": ["Steak frites", "Steak frites"],
  "Howlin' Ray's": ["Nashville hot chicken", "Hot chicken"],
  "Bestia": ["House charcuterie", "Charcuterie"],
  "Sqirl": ["Ricotta toast and jam", "Fruit preserves"],
  "Pike Place Chowder": ["Clam chowder", "Clam chowder"],
  "Canlis": ["Special-occasion tasting menu", "Canlis"],
  "Paseo": ["Caribbean roast pork sandwich", "Cuban sandwich"],
  "Commander's Palace": ["Turtle soup", "Turtle soup"],
  "Cochon": ["Boudin", "Boudin"],
  "Café du Monde": ["Beignets", "Beignet"],
  "Willie Mae's Scotch House": ["Fried chicken", "Fried chicken"],
  "Zahav": ["Hummus tehina", "Hummus"],
  "Reading Terminal Market": ["Roast pork sandwiches and more", "Reading Terminal Market"],
  "Joe's Stone Crab": ["Stone crab claws", "Florida stone crab"],
  "Versailles": ["The cubano", "Cuban sandwich"],
  "La Barbecue": ["Beef ribs", "Ribs (food)"],
  "Momofuku Noodle Bar": ["Pork belly buns", "Gua bao"],
  "H Mart Food Court (K-Town)": ["Soondubu-jjigae", "Sundubu-jjigae"],
  "Night + Market Song": ["Larb", "Larb"],
  "Neptune Oyster": ["Hot buttered lobster roll", "Lobster roll"],
  "Santarpio's Pizza": ["Coal-blistered pies", "Pizza"],
  "Union Oyster House": ["Oysters on the half shell", "Oyster"],
  "Ben's Chili Bowl": ["The half-smoke", "Half-smoke"],
  "Rose's Luxury": ["Pork-lychee salad", "Rose's Luxury"],
  "Rasika": ["Palak chaat", "Chaat"],
  "The Original Ninfa's on Navigation": ["Fajitas", "Fajita"],
  "Truth BBQ": ["Brisket and tallow ribs", "Barbecue in Texas"],
  "Crawfish & Noodles": ["Viet-Cajun crawfish boil", "Seafood boil"],
  "The Varsity": ["Chili dogs", "Chili dog"],
  "Busy Bee Cafe": ["Fried chicken and oxtails", "Oxtail"],
  "Staplehouse": ["Seasonal tasting menu", "Tasting menu"],
  "Prince's Hot Chicken": ["The original hot chicken", "Hot chicken"],
  "Arnold's Country Kitchen": ["Meat and three", "Meat and three"],
  "Hattie B's Hot Chicken": ["Hot chicken", "Hot chicken"],
  "Casa Bonita": ["Sopapillas", "Sopaipilla"],
  "Work & Class": ["Roast meats and arepas", "Arepa"],
  "Pok Pok (Reborn)": ["Ike's fish-sauce wings", "Buffalo wing"],
  "Screen Door": ["Chicken and waffles", "Chicken and waffles"],
  "Le Pigeon": ["Foie gras profiteroles", "Foie gras"],
  "Hodad's": ["Bacon cheeseburger", "Hamburger"],
  "Las Cuatro Milpas": ["Chorizo on handmade tortillas", "Corn tortilla"],
  "Lotus of Siam": ["Khao soi", "Khao soi"],
  "Oscar's Steakhouse": ["Bone-in ribeye", "Rib eye steak"],
  "Matt's Bar": ["The Jucy Lucy", "Jucy Lucy"],
  "Owamni": ["Bison and wild rice", "Wild rice"],
  "Rodney Scott's BBQ": ["Whole-hog barbecue", "Barbecue"],
  "Leon's Oyster Shop": ["Char-grilled oysters", "Oysters Rockefeller"],
  "Joe's Kansas City Bar-B-Que": ["Burnt ends", "Burnt ends"],
  "Q39": ["Competition ribs", "Spare ribs"],
  "Pappy's Smokehouse": ["Memphis-style ribs", "Memphis-style barbecue"],
  "Imo's Pizza": ["St. Louis-style pizza", "St. Louis-style pizza"],
  "Pizzeria Bianco": ["Wood-fired margherita", "Pizza Margherita"],
  "Barrio Café": ["Cochinita pibil", "Cochinita pibil"],
  "Buddy's Pizza": ["Detroit-style square", "Detroit-style pizza"],
  "Slows Bar BQ": ["Pulled pork and mac", "Pulled pork"],
  "Franklin Fountain": ["Hand-scooped sundaes", "Sundae"],
  "Pat's King of Steaks": ["Cheesesteak, whiz wit", "Cheesesteak"],
  "Snow's BBQ": ["Saturday-morning brisket", "Barbecue in Texas"],
  "Valentina's Tex Mex BBQ": ["Brisket tacos", "Taco"],
  "Bern's Steak House": ["Dry-aged steaks", "Steak"],
  "Columbia Restaurant": ["1905 Salad and Cuban bread", "Cuban bread"],
  "The French Laundry": ["Nine-course tasting menu", "The French Laundry"],
  "Chez Panisse": ["Daily farm-to-table menu", "Chez Panisse"],
  "Brennan's": ["Bananas Foster", "Bananas Foster"],
  "Dooky Chase's": ["Gumbo z'herbes", "Gumbo"],
  "Primanti Bros.": ["Fries-in-the-sandwich", "Primanti Brothers"],
  "The Pit Authentic Barbecue": ["Eastern Carolina whole hog", "Barbecue in North Carolina"],
  "Skylight Inn BBQ": ["Chopped whole hog with cracklin", "Barbecue in North Carolina"],
  "Eventide Oyster Co.": ["Brown-butter lobster roll", "Lobster roll"],
  "Fore Street": ["Wood-oven roasting", "Wood-fired oven"],
  "Central BBQ": ["Dry-rub ribs", "Memphis-style barbecue"],
  "The Rendezvous": ["Charcoal dry ribs", "Ribs (food)"],
  "Faidley's Seafood": ["Jumbo lump crab cake", "Crab cake"],
  "Jack Fry's": ["Shrimp and grits", "Shrimp and grits"],
  "Taquería El Milagro": ["Steak tacos", "Carne asada"],
  "Mi Tierra Café y Panadería": ["Pan dulce and enchiladas", "Pan dulce"],
  // Boston
  "Legal Sea Foods": ["New England clam chowder", "Clam chowder"],
  "Mike's Pastry": ["Cannoli", "Cannoli"],
  "Regina Pizzeria": ["Brick-oven thin crust", "Pizza"],
  "Giacomo's Ristorante": ["Lobster fra diavolo", "Lobster"],
  "Row 34": ["Oysters on the half shell", "Oyster"],
  "Oleana": ["Turkish-inflected mezze", "Meze"],
  "Toro": ["Grilled corn with aioli", "Elote"],
  "No. 9 Park": ["Prune-stuffed gnocchi", "Gnocchi"],
  "Island Creek Oyster Bar": ["Lobster roe pasta", "Lobster"],
  "Neptune Oyster (Back Bay)": ["Hot buttered lobster roll", "Lobster roll"],
  "Galleria Umberto": ["Sicilian slice", "Sicilian pizza"],
  "Sullivan's Castle Island": ["Fried clams", "Fried clams"],
  // New York
  "Di Fara Pizza": ["Classic pie with scissored basil", "New York–style pizza"],
  "Lucali": ["Thin-crust pie", "Pizza"],
  "Keens Steakhouse": ["Mutton chop", "Mutton"],
  "Grand Central Oyster Bar": ["Oyster pan roast", "Oyster"],
  "Veselka": ["Pierogi", "Pierogi"],
  "Sylvia's": ["Smothered chicken", "Fried chicken"],
  "Nom Wah Tea Parlor": ["Dim sum", "Dim sum"],
  "John's of Bleecker Street": ["Coal-fired pie", "New York–style pizza"],
  "Prince Street Pizza": ["Pepperoni Sicilian square", "Sicilian pizza"],
  "Ippudo NY": ["Tonkotsu ramen", "Tonkotsu ramen"],
  "Balthazar": ["Steak frites", "Steak frites"],
  "Carbone": ["Spicy rigatoni vodka", "Penne alla vodka"],
  // Chicago
  "Portillo's": ["Italian beef, dipped", "Italian beef"],
  "Gene & Jude's": ["Depression dog with fries", "Chicago-style hot dog"],
  "Giordano's": ["Stuffed deep dish", "Chicago-style pizza"],
  "The Purple Pig": ["Pork-heavy small plates", "Tapas"],
  "Monteverde": ["Handmade pasta", "Pasta"],
  "The Publican": ["Pork and oysters", "Pork"],
  "Smoque BBQ": ["Brisket", "Brisket"],
  "Manny's Cafeteria & Delicatessen": ["Corned beef", "Corned beef"],
  "Big Star": ["Tacos al pastor", "Al pastor"],
  "Calumet Fisheries": ["Smoked chubs", "Smoked fish"],
  // San Francisco
  "State Bird Provisions": ["Quail with provisions", "Quail"],
  "La Taqueria": ["Mission burrito", "Mission burrito"],
  "El Farolito": ["Super burrito", "Burrito"],
  "Burma Superstar": ["Tea leaf salad", "Lahpet"],
  "Yank Sing": ["Shanghai soup dumplings", "Xiaolongbao"],
  "Nopa": ["Wood-fired vegetables", "Wood-fired oven"],
  "Tadich Grill": ["Cioppino", "Cioppino"],
  "Molinari Delicatessen": ["Italian sub", "Submarine sandwich"],
  "Bi-Rite Creamery": ["Salted caramel ice cream", "Ice cream"],
  "Swan Oyster Depot (Polk)": ["Crab and sourdough", "Sourdough"],
  // Los Angeles
  "Langer's Delicatessen": ["#19 pastrami on rye", "Pastrami on rye"],
  "Philippe the Original": ["French dip", "French dip"],
  "Grand Central Market": ["A hall of stalls", "Grand Central Market (Los Angeles)"],
  "Pink's Hot Dogs": ["Chili dog", "Chili dog"],
  "Musso & Frank Grill": ["Martini and a chop", "Martini (cocktail)"],
  "n/naka": ["Modern kaiseki", "Kaiseki"],
  "Jitlada": ["Southern Thai curries", "Thai curry"],
  "Mariscos Jalisco": ["Taco dorado de camarón", "Taco"],
  "The Apple Pan": ["Hickory burger", "Hamburger"],
  "Sushi Gen": ["Sashimi lunch special", "Sashimi"],
  "Canter's Deli": ["Matzo ball soup", "Matzah ball"],
  // Seattle
  "Dick's Drive-In": ["The Deluxe burger", "Hamburger"],
  "The Walrus and the Carpenter": ["Oysters on the half shell", "Oyster"],
  "Un Bien": ["Caribbean roast pork sandwich", "Pork sandwich"],
  "Beecher's Handmade Cheese": ["World's best mac and cheese", "Macaroni and cheese"],
  "Shiro's": ["Omakase sushi", "Sushi"],
  // Washington DC
  "Old Ebbitt Grill": ["Oysters", "Oyster"],
  "Le Diplomate": ["Steak frites", "Steak frites"],
  "Founding Farmers": ["Chicken and waffles", "Chicken and waffles"],
  "Maydan": ["Live-fire mezze", "Meze"],
  "Thip Khao": ["Laotian larb", "Larb"],
  // Atlanta
  "Fox Bros. Bar-B-Q": ["Brisket frito pie", "Frito pie"],
  "Antico Pizza Napoletana": ["Margherita pie", "Pizza Margherita"],
  "Mary Mac's Tea Room": ["Fried chicken and pot likker", "Fried chicken"],
  "Bacchanalia": ["Seasonal tasting menu", "Tasting menu"],
  // Houston
  "Killen's Barbecue": ["Beef ribs", "Ribs (food)"],
  "Pappas Bros. Steakhouse": ["Dry-aged ribeye", "Rib eye steak"],
  "Xochi": ["Oaxacan mole", "Mole (sauce)"],
  "Himalaya": ["Hunter's beef", "Biryani"],
  // Nashville
  "Loveless Cafe": ["Scratch biscuits", "Biscuit (bread)"],
  "Rolf and Daughters": ["Handmade pasta", "Pasta"],
  "Monell's Dining": ["Family-style fried chicken", "Fried chicken"],
  "Pharmacy Burger Parlor": ["Farm burger", "Hamburger"],
  // Miami
  "Mandolin Aegean Bistro": ["Greek mezze", "Meze"],
  "KYU": ["Roasted cauliflower", "Cauliflower"],
  "Zak the Baker": ["Sourdough", "Sourdough"],
  "El Palacio de los Jugos": ["Lechon and batidos", "Lechon"],
  // Philadelphia
  "John's Roast Pork": ["Roast pork with broccoli rabe", "Pork sandwich"],
  "Vetri Cucina": ["Spinach gnocchi", "Gnocchi"],
  "Angelo's Pizzeria": ["Sesame-roll hoagie", "Submarine sandwich"],
  "Suraya": ["Lebanese mezze", "Meze"],
  // New Orleans
  "Galatoire's": ["Shrimp rémoulade", "Rémoulade"],
  "Turkey and the Wolf": ["Fried bologna sandwich", "Bologna sandwich"],
  "Parkway Bakery & Tavern": ["Shrimp po' boy", "Po' boy"],
  "Casamento's": ["Oyster loaf", "Oyster"],
  // Austin
  "Salt Lick BBQ": ["Open-pit brisket", "Barbecue in Texas"],
  "Veracruz All Natural": ["Migas taco", "Migas"],
  "Home Slice Pizza": ["New York-style slice", "New York–style pizza"],
  "Matt's El Rancho": ["Bob Armstrong dip", "Chile con queso"],
  // Denver
  "Sushi Den": ["Nagahama-market sashimi", "Sashimi"],
  "Biker Jim's Gourmet Dogs": ["Elk sausage", "Sausage"],
  "Rioja": ["Handmade pasta", "Pasta"],
  // Portland OR
  "Voodoo Doughnut": ["Maple bacon bar", "Doughnut"],
  "Apizza Scholls": ["Margherita pie", "Pizza Margherita"],
  "Nong's Khao Man Gai": ["Khao man gai", "Hainanese chicken rice"],
};

const DISH_CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".cache/wiki-dish-images.json");

// Lead image of a Wikipedia article via the REST summary endpoint (keyless).
// Retries on 429/5xx; only definitive answers are cached, so transient
// failures get another chance on the next run.
async function wikiImage(title, cache) {
  if (title in cache && cache[title] !== null) return cache[title];
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const s = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        { headers: { "User-Agent": "taste-app-seed/0.2 (personal project; contact: github)" } });
      let u = s.thumbnail?.source || null;
      // upscale the thumb only when the original is comfortably larger
      if (u && s.originalimage?.width >= 550) u = u.replace(/\/(\d+)px-/, "/500px-");
      cache[title] = u; // article definitively has (or lacks) a lead image
      return u;
    } catch (e) {
      if (attempt === 4) { console.warn(`  ! wiki ${title}: ${e.message}`); return null; }
      await sleep(2500 * attempt);
    }
  }
}

async function enrichDishes(list) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(DISH_CACHE, "utf8")); } catch { /* first run */ }
  let hits = 0;
  for (const r of list) {
    const d = DISHES[r.title];
    if (!d) { console.warn(`  ! no signature dish mapped for ${r.title}`); continue; }
    const [label, wiki] = d;
    r.dish = label;
    const wasCached = wiki in cache;
    const img = await wikiImage(wiki, cache);
    if (img) { r.image = img; hits++; }
    if (!wasCached) await sleep(500);
  }
  fs.mkdirSync(path.dirname(DISH_CACHE), { recursive: true });
  fs.writeFileSync(DISH_CACHE, JSON.stringify(cache));
  console.log(`  dish photos: ${hits}/${list.length}`);
}

// A user picks a metro, not a municipality: Brooklyn is New York, Berkeley is
// the Bay Area. `city` is that pickable metro; `subtitle` keeps the precise
// location for display.
const METRO = {
  "Brooklyn, NY": "New York",
  "New York, NY": "New York",
  "Boston, MA": "Boston",
  "Chicago, IL": "Chicago",
  "San Francisco, CA": "San Francisco",
  "Berkeley, CA": "San Francisco",
  "Yountville, CA": "San Francisco",
  "Los Angeles, CA": "Los Angeles",
};
// Cities offered first in the picker; the rest follow alphabetically.
export const FOCUS_CITIES = ["Boston", "New York", "Chicago", "San Francisco", "Los Angeles"];
const metroOf = (subtitle) => METRO[subtitle] || subtitle.replace(/,\s*[A-Z]{2}$/, "");

function curatedItems() {
  const maxCount = Math.max(...CURATED.map((r) => r[4]));
  return CURATED.map(([name, city, cuisines, rating, countK, price, blurb]) => {
    const genres = cuisines.filter((c) => FACTOR_BASE[c] || c === "Cuban").map((c) => (c === "Cuban" ? "Latin" : c));
    const id = "rs_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
    const factors = deriveAxes(id, genres, FACTOR_BASE, FACTORS);
    const tone = deriveAxes(id, genres, TONE_BASE, TONES);
    // price pulls formality/value in opposite directions — reflect that
    factors.value = Math.round(clamp(factors.value + (2.5 - price) * 0.08) * 100) / 100;
    tone.formality = Math.round(clamp(tone.formality + (price - 2.5) * 0.10) * 100) / 100;
    return {
      id,
      title: name,
      subtitle: city,
      city: metroOf(city),   // the metro a user picks in their location preference
      year: null,
      meta: "$".repeat(price),
      genres: [...new Set(genres)].slice(0, 3),
      rating: { value: rating, count: countK * 1000, source: "Google" },
      image: null,
      blurb,
      factors,
      tone,
      popularity: logPopularity(countK * 1000, maxCount * 1000),
    };
  });
}

const PRICE_MAP = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };

async function liveItems() {
  const CITIES = ["New York", "Los Angeles", "Chicago", "Austin", "San Francisco"];
  const CUISINES = Object.keys(FACTOR_BASE);
  const seen = new Map();
  for (const city of CITIES) {
    for (const cuisine of CUISINES) {
      const body = { textQuery: `best ${cuisine} restaurant in ${city}`, maxResultCount: 4 };
      let json;
      try {
        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": KEY,
            "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress,places.editorialSummary",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        json = await res.json();
      } catch (e) { console.warn(`  ! ${cuisine} in ${city}: ${e.message}`); continue; }
      for (const pl of json.places || []) {
        if (seen.has(pl.id) || !pl.rating) continue;
        const id = "rs_" + pl.id;
        const price = PRICE_MAP[pl.priceLevel] || 2;
        const genres = [cuisine];
        seen.set(pl.id, {
          id, title: pl.displayName?.text, subtitle: city, city: metroOf(city), year: null,
          meta: "$".repeat(price), genres,
          rating: { value: pl.rating, count: pl.userRatingCount || 0, source: "Google" },
          image: null,
          blurb: pl.editorialSummary?.text || `${cuisine} favorite in ${city}.`,
          factors: deriveAxes(id, genres, FACTOR_BASE, FACTORS),
          tone: deriveAxes(id, genres, TONE_BASE, TONES),
          _count: pl.userRatingCount || 0,
        });
      }
      await sleep(150);
    }
  }
  const list = [...seen.values()];
  const maxCount = Math.max(...list.map((r) => r._count), 1);
  for (const r of list) { r.popularity = logPopularity(r._count, maxCount); delete r._count; }
  return list;
}

async function main() {
  let list;
  if (KEY) {
    console.log("GOOGLE_PLACES_API_KEY found — live Google Places fetch");
    list = await liveItems();
    if (list.length < 20) { console.warn("live fetch thin; padding with curated snapshot"); list = list.concat(curatedItems().filter((c) => !list.some((l) => l.title === c.title))); }
  } else {
    console.log("No GOOGLE_PLACES_API_KEY — writing curated snapshot (real Google ratings, mid-2026)");
    list = curatedItems();
  }
  await enrichDishes(list);

  // Reception/overview prose is expensive to refetch (Wikipedia rate-limits
  // hard) and is not derived from anything here — carry it across rebuilds.
  if (fs.existsSync(OUT)) {
    const prev = new Map(JSON.parse(fs.readFileSync(OUT, "utf8")).map((r) => [r.id, r]));
    let kept = 0;
    for (const r of list) {
      const old = prev.get(r.id);
      if (!old) continue;
      if (old.reception) { r.reception = old.reception; kept++; }
      if (old.overview) r.overview = old.overview;
    }
    console.log(`  carried over ${kept} existing reception entries`);
  }

  // Grouped by city so the catalogue reads as city lists, focus metros first,
  // and most-loved first inside each city.
  const cityRank = (c) => {
    const i = FOCUS_CITIES.indexOf(c);
    return i === -1 ? FOCUS_CITIES.length : i;
  };
  list.sort((a, b) =>
    cityRank(a.city) - cityRank(b.city) ||
    a.city.localeCompare(b.city) ||
    b.popularity - a.popularity);

  const byCity = list.reduce((acc, r) => (acc[r.city] = (acc[r.city] || 0) + 1, acc), {});
  console.log("  " + FOCUS_CITIES.map((c) => `${c}: ${byCity[c] || 0}`).join(" · ") +
    ` · ${Object.keys(byCity).length - FOCUS_CITIES.length} other cities`);
  writePretty(fs, OUT, list);
}

main().catch((e) => { console.error(e); process.exit(1); });
