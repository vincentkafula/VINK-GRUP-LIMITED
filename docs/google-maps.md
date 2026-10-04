# Google Maps (owner and association maps)

The Owner "Routes & map" and the Association "Map" and "Routes" screens use the real Google map: satellite with labels by default (switch
to the road map with the buttons on the map), each route as a coloured line, each vehicle's last position as a marker (refreshed every
30 seconds), and — on the association's route form — click on the map to add the route's points in order.

Without a key, or if Google refuses it, the dashboards show the built-in drawn map and a one-line note saying why. Nothing breaks.

## Turn it on (about 10 minutes)

1. Google Cloud console -> create or choose a project -> **Billing**: attach a billing account (Maps needs one; Google gives a monthly free credit).
2. **APIs & Services -> Library**: enable **Maps JavaScript API**.
3. **APIs & Services -> Credentials -> Create credentials -> API key**, then **Restrict key**:
   - *Application restrictions*: **Websites (HTTP referrers)**: `https://www.vink.co.za/*` (add `http://localhost:5173/*` for local work).
   - *API restrictions*: **Restrict key**: tick **Maps JavaScript API** only.
4. Railway -> project **alluring-truth** -> the **frontend** service (`enthusiastic-heart`) -> Variables -> add `VITE_GOOGLE_MAPS_KEY` = the key.
   It is a build-time variable, so the frontend must be rebuilt (push to `main`, or "Redeploy" after the variable is set).
5. Open the Owner or Association map. If the drawn map still shows, the note under it says why (key missing, rejected, or blocked).

The key is visible to anyone who opens the page; that is how browser keys work. The restrictions in step 3 are what protect it.
Never use an unrestricted key here, and never put a server key in a `VITE_` variable.

## Notes
- Vehicle positions come from the fare terminals' GPS reports (`vehicle_positions`); routes from `vehicle_routes` / `route_waypoints`.
- The map uses `mapId: "DEMO_MAP_ID"` (needed for the new marker type). For a styled map, create a Map ID in Google Cloud and replace it in `MapView.tsx`.
