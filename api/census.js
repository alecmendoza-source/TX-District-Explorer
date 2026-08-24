// Vercel serverless function — relays Census API requests server-to-server.
// This exists because the Census API does not allow direct browser requests
// (no CORS headers), so the browser has to ask *this* endpoint instead,
// and this endpoint (running on Vercel's servers, not in a browser) asks Census.

const CENSUS_YEAR = 2023;
const VARS = [
  "NAME",
  "DP05_0001E",
  "DP05_0018E",
  "DP03_0062E",
  "DP03_0119PE",
  "DP03_0009PE",
  "DP02_0067PE",
  "DP05_0037PE",
  "DP05_0071PE",
  "DP05_0038PE",
  "DP03_0025E",
  "DP03_0026PE",
  "DP03_0033PE",
  "DP03_0038PE",
  "DP03_0095PE",
  "DP04_0089E",
].join(",");

module.exports = async (req, res) => {
  const { chamber, district, key } = req.query;

  if (!chamber || !district || !key) {
    res.status(400).json({ error: "Missing chamber, district, or key parameter" });
    return;
  }

  const chamberGeo =
    chamber === "house"
      ? "state legislative district (lower chamber)"
      : "state legislative district (upper chamber)";
  const distCode = String(district).padStart(3, "0");

  const url =
    `https://api.census.gov/data/${CENSUS_YEAR}/acs/acs5/profile` +
    `?get=${VARS}` +
    `&for=${encodeURIComponent(chamberGeo)}:${distCode}` +
    `&in=state:48` +
    `&key=${encodeURIComponent(key)}`;

  try {
    const censusRes = await fetch(url);
    const contentType = censusRes.headers.get("content-type") || "";

    if (!contentType.includes("json")) {
      // Census sends an HTML page (not JSON) when the key is missing,
      // malformed, or invalid — catch that here with a clear message
      // instead of letting JSON parsing crash below.
      const text = await censusRes.text();
      let reason = "Census did not return data (likely an invalid or missing API key).";
      if (text.includes("missing_key")) reason = "No API key was received by Census — check the key parameter.";
      if (text.includes("invalid_key")) reason = "Census rejected the API key as invalid — double check it was copied correctly with no extra spaces.";
      res.status(502).json({ error: reason });
      return;
    }

    if (!censusRes.ok) {
      const text = await censusRes.text();
      res.status(censusRes.status).json({ error: `Census API error: ${text.slice(0, 300)}` });
      return;
    }
    const data = await censusRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
};
