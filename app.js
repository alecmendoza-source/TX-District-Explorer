// =================================================================
// Texas District Explorer — core app logic
// =================================================================

// Texas GIS server (Texas Legislative Council boundary data, kept current
// by the state). Layer 0 = Senate, Layer 1 = House. Free, public, CORS-open.
const TX_GIS_BASE =
  "https://feature.geographic.texas.gov/arcgis/rest/services/Legislative_Bnd/Legislative_Bnd/MapServer";
const LAYER_ID = { house: 1, senate: 0 };

// Census ACS 5-year Data Profile variables we pull per district.
// (DP05 = demographics, DP03 = economic, DP02 = social)
const CENSUS_VARS = {
  DP05_0001E: "Total population",
  DP05_0018E: "Median age",
  DP03_0062E: "Median household income ($)",
  DP03_0119PE: "Percent of families below poverty line",
  DP03_0009PE: "Unemployment rate (%)",
  DP02_0067PE: "Percent with bachelor's degree or higher",
  DP05_0037PE: "Percent White (not Hispanic)",
  DP05_0071PE: "Percent Hispanic or Latino",
  DP05_0038PE: "Percent Black or African American",
  // Economic indicators (Phase 2 addition)
  DP03_0025E: "Mean commute time (minutes)",
  DP03_0024PE: "Percent working from home",
  DP03_0042PE: "Percent employed in education/health services",
  DP03_0035PE: "Percent employed in manufacturing",
  DP03_0099PE: "Percent without health insurance",
  DP04_0089E: "Median home value ($)",
};
const CENSUS_YEAR = 2023; // ACS 5-year release; bump this yearly

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
let map;
let currentChamber = "house";
let layerCache = { house: null, senate: null }; // holds Leaflet GeoJSON layers
let featureIndex = { house: [], senate: [] }; // flat list for search
let activeLayerRef = null;
let schoolDistrictData = null; // loaded once from data/school_districts.json
let hospitalData = null; // loaded once from data/hospitals.json

async function loadSchoolDistrictData() {
  if (schoolDistrictData) return schoolDistrictData;
  try {
    const res = await fetch("data/school_districts.json");
    schoolDistrictData = await res.json();
  } catch (err) {
    console.error("Couldn't load school district data:", err);
    schoolDistrictData = { house: {}, senate: {} };
  }
  return schoolDistrictData;
}

async function loadHospitalData() {
  if (hospitalData) return hospitalData;
  try {
    const res = await fetch("data/hospitals.json");
    hospitalData = await res.json();
  } catch (err) {
    console.error("Couldn't load hospital data:", err);
    hospitalData = { house: {}, senate: {} };
  }
  return hospitalData;
}

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
function initMap() {
  map = L.map("map", { zoomControl: true }).setView([31.0, -99.0], 6);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap, © CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);
}

async function loadChamber(chamber) {
  if (layerCache[chamber]) {
    showLayer(chamber);
    return;
  }
  toggleLoading(true);
  try {
    const url = `${TX_GIS_BASE}/${LAYER_ID[chamber]}/query?where=1=1&outFields=*&f=geojson`;
    const res = await fetch(url);
    const geojson = await res.json();

    const layer = L.geoJSON(geojson, {
      style: baseStyle,
      onEachFeature: (feature, lyr) => {
        lyr.on("click", () => openDistrict(chamber, feature, lyr));
        lyr.on("mouseover", () => lyr.setStyle(hoverStyle));
        lyr.on("mouseout", () => layerCache[chamber].resetStyle(lyr));
        featureIndex[chamber].push({
          district: feature.properties.district,
          first: feature.properties.first_name || "",
          last: feature.properties.last_name || "",
          layer: lyr,
          feature,
        });
      },
    });

    layerCache[chamber] = layer;
    showLayer(chamber);
  } catch (err) {
    console.error(err);
    alert(
      "Couldn't load district boundaries. Check your internet connection and try again."
    );
  } finally {
    toggleLoading(false);
  }
}

function showLayer(chamber) {
  if (activeLayerRef) map.removeLayer(activeLayerRef);
  activeLayerRef = layerCache[chamber];
  activeLayerRef.addTo(map);
}

function baseStyle() {
  return { color: "#1b3a6b", weight: 1, fillColor: "#3d6fb4", fillOpacity: 0.15 };
}
function hoverStyle() {
  return { color: "#1b3a6b", weight: 2, fillColor: "#3d6fb4", fillOpacity: 0.35 };
}
function selectedStyle() {
  return { color: "#c1440e", weight: 3, fillColor: "#e07a3e", fillOpacity: 0.4 };
}

function toggleLoading(show) {
  document.getElementById("loading-banner").classList.toggle("hidden", !show);
}

// ---------------------------------------------------------------
// District click / open report
// ---------------------------------------------------------------
async function openDistrict(chamber, feature, lyr) {
  if (activeLayerRef) activeLayerRef.resetStyle();
  lyr.setStyle(selectedStyle());
  map.fitBounds(lyr.getBounds(), { maxZoom: 9 });

  const props = feature.properties;
  const chamberLabel = chamber === "house" ? "Texas House" : "Texas Senate";
  const repName = [props.first_name, props.last_name].filter(Boolean).join(" ") || "Unavailable";

  showSidebarSkeleton(chamberLabel, props.district, repName);

  const [census, schoolData, hospData] = await Promise.all([
    fetchCensusData(chamber, props.district),
    loadSchoolDistrictData(),
    loadHospitalData(),
  ]);
  const isdList = (schoolData[chamber] && schoolData[chamber][String(props.district)]) || [];
  const hospitalList = (hospData[chamber] && hospData[chamber][String(props.district)]) || [];
  renderReport(chamberLabel, props.district, repName, census, isdList, hospitalList);
}

function showSidebarSkeleton(chamberLabel, district, repName) {
  document.getElementById("sidebar-empty").classList.add("hidden");
  document.getElementById("sidebar-content").classList.remove("hidden");
  document.getElementById("report-body").innerHTML = `
    <h2>${chamberLabel} District ${district}</h2>
    <p class="rep-name">${repName}</p>
    <p class="muted">Loading demographic data…</p>
  `;
}

function renderReport(chamberLabel, district, repName, census, isdList, hospitalList) {
  const rows = census
    ? Object.entries(CENSUS_VARS)
        .map(([code, label]) => {
          const raw = census[code];
          if (raw === undefined || raw === null || raw === "" || Number(raw) < 0) return "";
          const isPct = label.toLowerCase().includes("percent") || label.toLowerCase().includes("rate");
          const num = Number(raw);
          const val = isPct
            ? `${num.toFixed(1)}%`
            : Number.isInteger(num)
              ? num.toLocaleString()
              : num.toFixed(1).toLocaleString();
          return `<tr><td>${label}</td><td>${val}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="2">Census data unavailable — check that your API key is set in config.js</td></tr>`;

  document.getElementById("report-body").innerHTML = `
    <h2>${chamberLabel} District ${district}</h2>
    <p class="rep-name">${repName}</p>

    <div class="report-section">
      <h3>Demographics (ACS ${CENSUS_YEAR} 5-yr est.)</h3>
      <table class="stat-table">${rows}</table>
    </div>

    <div class="report-section">
      <h3>School districts (${isdList.length})</h3>
      ${
        isdList.length
          ? `<p class="isd-list">${isdList.join(", ")}</p>`
          : `<p class="muted">No school district overlap data found for this district.</p>`
      }
    </div>

    <div class="report-section">
      <h3>Hospitals (${hospitalList.length})</h3>
      ${
        hospitalList.length
          ? `<ul class="hospital-list">${hospitalList
              .map(
                (h) =>
                  `<li><strong>${h.name}</strong> — ${h.city}${h.emergency === "Yes" ? " · ER" : ""}${h.rating ? ` · ${h.rating}★ CMS rating` : ""}</li>`
              )
              .join("")}</ul>`
          : `<p class="muted">No CMS-registered hospital found in this district (coverage is ~82% of Texas hospitals — some addresses couldn't be auto-geocoded).</p>`
      }
    </div>

    <div class="report-section">
      <h3>Additional layers</h3>
      <p class="muted">
        Higher-ed institutions for this district will appear here once that
        layer is added.
      </p>
    </div>

    <div class="report-section">
      <h3>Policy impact</h3>
      <p class="muted">
        Once a policy/bill is loaded, its manually-assigned impact rating and
        notes for this district will appear here (Phase 3 of the build).
      </p>
    </div>

    <button id="export-btn" class="export-btn">Export one-pager (coming soon)</button>
  `;
}

async function fetchCensusData(chamber, district) {
  if (!CONFIG.CENSUS_API_KEY || CONFIG.CENSUS_API_KEY.startsWith("PUT_YOUR")) {
    return null;
  }
  // NOTE: this calls our own /api/census proxy (see api/census.js), not
  // Census directly — the Census API blocks direct browser requests.
  // This only works once the site is deployed to Vercel (or run via
  // `vercel dev` locally) since /api routes need a server to run.
  const url = `/api/census?chamber=${chamber}&district=${district}&key=${encodeURIComponent(CONFIG.CENSUS_API_KEY)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
    const data = await res.json();
    const header = data[0];
    const values = data[1];
    const record = {};
    header.forEach((h, i) => (record[h] = values[i]));
    return record;
  } catch (err) {
    console.error("Census fetch failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------
// Search
// ---------------------------------------------------------------
function setupSearch() {
  const input = document.getElementById("search-input");
  const results = document.getElementById("search-results");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    results.innerHTML = "";
    if (!q) {
      results.classList.remove("visible");
      return;
    }
    const pool = featureIndex[currentChamber];
    const matches = pool
      .filter(
        (d) =>
          String(d.district).includes(q) ||
          d.first.toLowerCase().includes(q) ||
          d.last.toLowerCase().includes(q)
      )
      .slice(0, 8);

    if (matches.length === 0) {
      results.innerHTML = `<div class="search-row muted">No matches</div>`;
    } else {
      matches.forEach((m) => {
        const label = `District ${m.district} — ${[m.first, m.last].filter(Boolean).join(" ") || "Vacant"}`;
        const row = document.createElement("div");
        row.className = "search-row";
        row.textContent = label;
        row.addEventListener("click", () => {
          openDistrict(currentChamber, m.feature, m.layer);
          results.classList.remove("visible");
          input.value = "";
        });
        results.appendChild(row);
      });
    }
    results.classList.add("visible");
  });

  document.addEventListener("click", (e) => {
    if (!document.getElementById("search-wrap").contains(e.target)) {
      results.classList.remove("visible");
    }
  });
}

// ---------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------
function setupChamberToggle() {
  document.getElementById("btn-house").addEventListener("click", () => switchChamber("house"));
  document.getElementById("btn-senate").addEventListener("click", () => switchChamber("senate"));
}

function switchChamber(chamber) {
  if (chamber === currentChamber) return;
  currentChamber = chamber;
  document.getElementById("btn-house").classList.toggle("active", chamber === "house");
  document.getElementById("btn-senate").classList.toggle("active", chamber === "senate");
  closeSidebar();
  loadChamber(chamber);
}

function closeSidebar() {
  document.getElementById("sidebar-content").classList.add("hidden");
  document.getElementById("sidebar-empty").classList.remove("hidden");
  if (activeLayerRef) activeLayerRef.resetStyle();
}

function setupSidebarClose() {
  document.getElementById("close-sidebar").addEventListener("click", closeSidebar);
}

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupChamberToggle();
  setupSidebarClose();
  setupSearch();
  loadChamber("house");
});
