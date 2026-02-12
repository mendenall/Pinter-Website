mapboxgl.accessToken =
  'pk.eyJ1IjoibWVuZGVuYWxsIiwiYSI6ImNtbDg4cGp3MjA1MzYzZ3ByZGgxNTk3Z3YifQ.r2ZIjgQJls0nnPLHQRrPGw';

const BAND_NAME = 'Pinter Whitnick';
const BIT_API_KEY = 'ae65a42a088a5ab5aafbf086356b4115';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  center: [-85, 44],
  zoom: 5
});

let allFeatures = [];
let filteredFeatures = [];

const monthColors = [
  '#FF073A', '#FF8C00', '#FFD700', '#39FF14',
  '#00FFFF', '#1E90FF', '#DA70D6', '#FF00FF',
  '#FF1493', '#00FF7F', '#FF4500', '#7FFF00'
];

function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function isDateInPast(d) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

function formatDatePretty(d) {
  const day = d.getDate();
  const suffix =
    day >= 11 && day <= 13 ? 'th' :
    day % 10 === 1 ? 'st' :
    day % 10 === 2 ? 'nd' :
    day % 10 === 3 ? 'rd' : 'th';

  return `${d.toLocaleString('default', { month: 'long' })} ${day}${suffix}, ${d.getFullYear()}`;
}

/* ---------------- LOAD DATA ---------------- */

map.on('load', async () => {
  const past = await loadPastShows();
  const future = await loadFutureShows();

  allFeatures = [...past, ...future];

  map.addSource('shows', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] }
  });

  map.addLayer({
    id: 'shows',
    type: 'circle',
    source: 'shows',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 7, 5, 14],
      'circle-color': [
        'case',
        ['==', ['get', 'isPast'], true],
        '#777',
        ['get', 'color']
      ],
      'circle-opacity': 1,
      'circle-stroke-width': 1,
      'circle-stroke-color': '#000'
    }
  });

  map.addLayer({
    id: 'show-counts',
    type: 'symbol',
    source: 'shows',
    layout: {
      'text-field': ['case', ['>', ['get', 'count'], 1], ['to-string', ['get', 'count']], ''],
      'text-size': 12
    },
    paint: { 'text-color': '#fff' }
  });

  setupPopups();
  updateMap();
  setTimeout(zoomToShows, 0);
});

/* ---------------- FETCHERS ---------------- */

async function loadPastShows() {
  const res = await fetch('shows.geojson');
  const geo = await res.json();

  return geo.features.map(f => {
    const d = parseLocalDate(f.properties.date);
    return {
      ...f,
      properties: {
        ...f.properties,
        dateObj: d,
        month: d.getMonth(),
        isPast: true
      }
    };
  });
}

async function loadFutureShows() {
  const url = `https://rest.bandsintown.com/artists/${encodeURIComponent(
    BAND_NAME
  )}/events?app_id=${BIT_API_KEY}`;

  const res = await fetch(url);
  const events = await res.json();

  return events.map(e => {
    const d = parseLocalDate(e.datetime.split('T')[0]);
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          Number(e.venue.longitude),
          Number(e.venue.latitude)
        ]
      },
      properties: {
        venue: e.venue.name,
        city: `${e.venue.city}, ${e.venue.region}`,
        dateObj: d,
        month: d.getMonth(),
        isPast: false
      }
    };
  });
}

/* ---------------- MAP UPDATE ---------------- */

function updateMap() {
  const activeMonths = new Set(
    [...document.querySelectorAll('[data-month]:checked')].map(cb => Number(cb.dataset.month))
  );

  const showPast = document.getElementById('togglePast').checked;

  const visible = allFeatures.filter(f => {
    if (f.properties.isPast) return showPast;
    return activeMonths.has(f.properties.month);
  });

  const grouped = {};
  visible.forEach(f => {
    const key = f.geometry.coordinates.join(',');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  });

  filteredFeatures = Object.entries(grouped).map(([k, feats]) => {
    const [lng, lat] = k.split(',').map(Number);
    const allPast = feats.every(f => f.properties.isPast);

    // Clean venue name
    const rawVenue = feats[0].properties.venue;
    const cleanVenue = rawVenue.split(' - ')[0];

    // Build dates array
    const dates = feats.map(f => f.properties.dateObj.toISOString());

    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        venue: cleanVenue,  // cleaned
        city: feats[0].properties.city,
        dates,
        count: dates.length,
        isPast: allPast,
        color: allPast ? '#777777' : monthColors[feats[0].properties.month]
      }
    };
  });

  map.getSource('shows').setData({
    type: 'FeatureCollection',
    features: filteredFeatures
  });
}


/* ---------------- POPUPS ---------------- */

let currentPopup = null;
let lastBounds = null;

function setupPopups() {
  ['shows', 'show-counts'].forEach(layer => {
    map.on('click', layer, e => {
      if (!e.features || !e.features.length) return;
      const f = e.features[0];

      // Remove existing popup
      if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
      }

      // Store bounds before zoom
      lastBounds = map.getBounds();

      // Ensure dates is an array
      let datesArray = [];
      if (f.properties.dates) {
        try {
          datesArray = JSON.parse(f.properties.dates);
        } catch {
          // sometimes Mapbox returns it as comma string or already array
          if (Array.isArray(f.properties.dates)) datesArray = f.properties.dates;
          else datesArray = String(f.properties.dates).split(',');
        }
      }

      const datesPretty = datesArray
        .map(d => formatDatePretty(new Date(d)))
        .join('<br>');

      currentPopup = new mapboxgl.Popup({ closeButton: true, maxWidth: '300px' })
        .setLngLat(f.geometry.coordinates)
        .setHTML(`
          <strong>${f.properties.venue}</strong><br>
          ${f.properties.city}<br><br>
          ${datesPretty}
        `)
        .addTo(map);

      // Fly to the clicked feature
      map.flyTo({ center: f.geometry.coordinates, zoom: 10 });

      // Restore bounds on popup close
      currentPopup.on('close', () => {
        currentPopup = null;
        if (lastBounds) map.fitBounds(lastBounds, { padding: 80 });
      });
    });

    map.on('mouseenter', layer, () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', layer, () => map.getCanvas().style.cursor = '');
  });

  const style = document.createElement('style');
  style.innerHTML = `
    .mapboxgl-popup-close-button {
      font-size: 22px !important;
      width: 32px !important;
      height: 32px !important;
      line-height: 30px !important;
    }
  `;
  document.head.appendChild(style);
}


/* ---------------- ZOOM ---------------- */

function zoomToShows() {
  if (!filteredFeatures.length) return;
  const b = new mapboxgl.LngLatBounds();
  filteredFeatures.forEach(f => b.extend(f.geometry.coordinates));
  map.fitBounds(b, { padding: 80 });
}

/* ---------------- UI EVENTS ---------------- */

document.addEventListener('change', e => {
  if (e.target.matches('[data-month], #togglePast')) updateMap();
});

let cleared = false;
document.getElementById('toggleFilters').onclick = () => {
  cleared = !cleared;
  document.querySelectorAll('[data-month]').forEach(cb => cb.checked = !cleared);
  toggleFilters.innerText = cleared ? 'Show All' : 'Clear All';
  updateMap();
};
