# Texas District Explorer — v0.1 (Phase 1 MVP)

## What this is right now
- An interactive map of Texas with a **House / Senate toggle**
- District boundaries and current legislator names, pulled live from the
  state's own GIS server (always current, no maintenance needed on our end)
- Click a district (or search by district number / legislator last name) to
  open a sidebar report
- The sidebar pulls **live Census demographic data** for that exact district
  (population, median income, poverty rate, education, race/ethnicity, etc.)
- Placeholders are in place for Phase 2 (school/hospital/econ data) and
  Phase 3 (manually-assigned policy impact) — nothing there yet, that's next.

## Step 1: Try it on your own computer (no install needed)
1. Download the whole `tx-district-explorer` folder.
2. Open `config.js` in any text editor.
3. Get a free Census API key: go to
   https://api.census.gov/data/key_signup.html, enter your email, and
   they'll email you a key in a couple minutes. No approval process.
4. Paste that key into `config.js` in place of `PUT_YOUR_CENSUS_API_KEY_HERE`.
   Save the file.
5. Double-click `index.html` to open it in your browser.

**Important:** the map and district boundaries will work fine this way, but
the "Demographics" section in the sidebar will say data is unavailable —
that's expected, not a mistake. The Census Bureau's API blocks direct
requests from a browser, so this app relays that request through a small
server-side helper (`api/census.js`). That helper only runs once the site
is actually deployed (Step 2), because a file sitting on your computer
isn't a server. So: boundaries/search/legislator names testable now,
demographics testable after deployment.

## Step 2: Put it on the actual internet (so your team can use it)
You don't need to write any code for this. Here's the plain-English path:

1. **Create a free GitHub account** at github.com (if you don't have one).
2. **Create a free Vercel account** at vercel.com, and sign in using your
   GitHub account (there's a button for this — no separate password needed).
3. In GitHub, create a new repository (name it something like
   `tx-district-explorer`) and upload all the files in this folder to it
   (GitHub's website has an "upload files" button — drag and drop works).
4. In Vercel, click "Add New Project," select the repository you just
   created, and click Deploy. Since this is a plain HTML site (no build
   step), Vercel will just serve it as-is — you don't need to configure
   anything.
5. Vercel gives you a live URL (like `tx-district-explorer.vercel.app`)
   that you can share with your team.

Any time you want to update the site, just update the files in the GitHub
repository (or ask me to update them for you) and Vercel automatically
redeploys.

## What's next (in order)
- **Phase 2:** Add school district (TEA), hospital (DSHS), higher-ed
  (THECB), and economic data layers. These don't have free live APIs at the
  district level, so I'll pre-process them into a data file we refresh
  periodically.
- **Phase 3:** Build the manual policy-impact assignment tool — a simple
  interface where your team picks a bill, assigns an impact level per
  district, and it shows up as map shading + a short narrative in the
  sidebar.
- **Phase 4:** Exportable, TX2036-branded one-pager PDF per district.

## Known limitations right now
- Legislator party and committee assignments aren't in this version yet —
  the state's GIS data only includes name and district number. We'll add
  party/committee as a small dataset we maintain (or another live source).
- Only House and Senate boundaries/demographics are wired up; other layers
  are placeholders.
