/**
 * Public OpenStreetMap tile layer.
 *
 * Keep the basemap provider in one place so radar, company, and location
 * picker maps cannot drift into a provider that unexpectedly requires a key.
 */
export const MAP_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';