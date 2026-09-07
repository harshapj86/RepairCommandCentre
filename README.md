# Customer Device Management & Repair Operations Command Centre

A static, self-updating dashboard for Aptronix Service. It runs entirely in
the browser — no backend, no build step — and is designed to be hosted on
GitHub Pages.

Live logic in one sentence: every time the page loads, it reads the raw
Servify and GSX files listed in `data/manifest.json`, matches them, computes
every TAT/SDR/backlog metric fresh, and renders all ten tabs. There is no
pre-computed cache to go stale — replace the files, reload the page, done.

---

## 1. Where your data lives

```
data/
  manifest.json         <- points at the two files below; you never edit this
  servify_latest.xlsx   <- your Servify export, exactly as you download it
  gsx_latest.xlsx        <- your GSX export, exactly as you download it
```

That's it — two files. Both are loaded fresh every time the page opens.

## 2. How to update daily

1. Export from Servify and from GSX, the same way you did for the initial
   build.
2. Overwrite `data/servify_latest.xlsx` and `data/gsx_latest.xlsx` with the
   new exports — **keep the exact same filenames**, just replace the
   content.
3. Commit and push (or re-upload, if you're not using git directly).
4. Reload the page.

You do not touch `manifest.json`, ever, for a routine update — it just
points at these two fixed filenames, and always will. There's nothing to
add, remove, or rename. If each new export is a full re-export covering
everything from the start (the same shape as your very first upload,
just with more recent rows included), the dashboard handles that
correctly: matching, de-duplication, and every metric recompute from
scratch on each load, so there's no "stale total" to worry about, and no
risk of double-counting a record that appears in both an old and new
export.

Both files can be `.xlsx` or `.csv` — the loader picks the parser by file
extension. `.xlsx` is the better default: it's compressed, so it's roughly
half the size of the same data as `.csv` (this is what dropped your GSX
file from ~20MB to ~9MB). If you ever switch a file's format, update the
one matching line in `manifest.json` to the new extension, and delete the
old-format file from `data/` so there isn't a stale duplicate sitting
around.

If your Servify export is a workbook with multiple sheets (as the original
one was — it also had `Sheet2` and `Questions` sheets, and `Sheet2` in
particular contained a pivot table, which is worth deleting before you
export since Excel caches a full second copy of the data for the pivot
internally — that alone was about a third of the original file's size),
the loader specifically looks for the sheet named **"Servify rawdata
file"** and ignores the others; it only falls back to the first sheet if
that name isn't found. The GSX export doesn't need a specific sheet name —
it just uses whichever sheet is first, since GSX's own export names that
sheet differently each time (yours was literally named after the export
timestamp).

**On the customer data in these files:** the dashboard's code only ever
reads the specific operational columns it needs (centre, dates, repair
type, and so on) — customer name, phone, email, and IMEI columns in your
export are simply never looked at, never displayed, and never written
anywhere. Nothing leaves your browser either way (there's no backend to
send it to), but if you'd rather not have those columns in the file at
all, that's your call to make when you export, not something the
dashboard requires.

## 3. Deploying to GitHub Pages

1. Create a new GitHub repository (or use an existing one).
2. Copy this entire folder's contents into the repository root (so
   `index.html` sits at the repo root, not inside a subfolder).
3. Push to GitHub.
4. In the repo, go to **Settings → Pages**, set **Source** to the branch
   you pushed (usually `main`) and folder `/ (root)`, then save.
5. GitHub gives you a URL like `https://<your-org>.github.io/<repo>/` —
   that's your dashboard.

No build step, no `npm install`, no server. The three vendor libraries
(SheetJS for parsing, Chart.js for charts) load from a public CDN at
runtime — an internet connection is required to view the dashboard, but
nothing needs installing.

## 4. How Servify → GSX matching works

Every Servify record has a `Servify Reference ID`. Every GSX record has a
`Reference` field. The two are matched when these are equal. In the shipped
dataset this matches ~87.8% of Servify records — the rest show up as
**unmatched** in the Data Quality tab and are never silently dropped.

A small number of GSX references have more than one repair record attached
(re-repairs, resubmissions, etc). When that happens:
- The **earliest** GSX-side record (by `Created Date`) is used to measure
  **Repair Creation TAT** — because that's the moment the repair was first
  created against that reference.
- The **latest** GSX-side record is used for repair status/technician
  attribution, on the assumption that it reflects the most current state.
- The duplicate is counted and shown in the Data Quality tab either way —
  nothing is thrown away.

## 5. How deduplication works

- **Servify**: if the same `Servify Reference ID` appears more than once —
  which is exactly what happens when each day's export re-includes
  historical records alongside new ones — the record with the latest
  `Latest Request Status Date` wins, and the duplicate is counted in Data
  Quality.
- **GSX**: grouped by `Reference` as described above; every group with more
  than one row is counted as a duplicate reference in Data Quality.

## 6. How Repair TAT is calculated

**Repair Creation TAT = GSX `Created Date` − Servify `Request Creation
Date`**, as a true timestamp difference (not a calendar-date subtraction).
Buckets: **0–2 hrs, 2–4 hrs, 4–8 hrs** (together these three make up **SDR —
Same Day Repair**), and **>8 hrs**. Records with no GSX match fall into
**Missing / Unmatched** and are excluded from the SDR% denominator — they're
shown separately instead of being folded into "delayed."

A negative value here (GSX record created *before* the Servify request) is
a data quality exception, not a real measurement — it's flagged in the Data
Quality tab and excluded from every average/median/SDR% calculation rather
than being silently corrected.

## 7. How SDR is calculated

**SDR % = (0–2 hrs + 2–4 hrs + 4–8 hrs) ÷ matched repairs with a valid TAT**,
i.e. the share of matched repairs completed within 8 hours of request
creation. Unmatched records and timestamp exceptions are excluded from both
the numerator and denominator.

## 8. How End-to-End TAT is calculated

**End-to-End TAT = Servify `Latest Request Status Date` − Servify `Request
Creation Date`**, calculated only for requests where `Request Type =
Closed`. This is deliberately a *different* measurement from Repair Creation
TAT: a centre can create a GSX repair quickly and still take a long time to
actually close the customer's case, or vice versa. Both views are shown
side by side rather than merged into one number.

## 9. How FTD / WTD / MTD / QTD work

All four are calculated relative to a **reporting date**, which you can set
in the filter bar. It defaults to the latest `Request Creation Date` found
across everything currently loaded (so on a static, historical export it
behaves like "today" without you having to tell it what today is).

- **FTD** — the reporting date itself.
- **WTD** — Monday of that week through the reporting date.
- **MTD** — the 1st of that month through the reporting date.
- **QTD** — the 1st of that calendar quarter through the reporting date.
- **Custom** — any start/end date you choose.

Every KPI, table, and chart in the dashboard responds to this filter, along
with Centre / City / State / Region / Repair Type, all in the sticky filter
bar at the top.

## 10. Customer data

The dashboard's code only reads the specific operational columns it uses —
customer name, phone numbers, email, address, and IMEI columns in your
export are never read, displayed, or exported by anything in this
codebase (see section 2 above for the full explanation). Nothing is
stripped from the files themselves; there was simply never a need to.

## 11. Known simplifications (read before you rely on an edge case)

- **Region** is very sparsely filled in the source data (about 1 in 5
  records), so most centre-level breakdowns lean on **State** and **City**
  as the more reliable geography fields. Region is still available as a
  filter, it just won't distinguish much until it's filled in more
  consistently at source.
- **Engineer Name** and **Request Created By** both contain a literal `"0"`
  in a meaningful share of rows (typically NTF cases with no workshop
  assignment). These are treated as "unassigned," not as a real person, and
  are excluded from the Technician/CCE tables and rankings — they're not
  silently counted as a person named "0."
- Where a centre has very few matched repairs in the selected filter, its
  SDR%/tier badge is shown with a **Low** confidence marker in the Centre
  Performance scorecard — a small sample shouldn't be read the same way as
  a few thousand repairs.

## 12. File structure

```
index.html              Shell + all 10 tab panels
css/style.css           Design system
js/utils.js             Date parsing, formatting, stats (mean/median/percentile)
js/buckets.js           TAT bucket definitions + colour thresholds
js/model.js             Load → normalize → match → dedup → build records
js/filters.js           Global filter state + FTD/WTD/MTD/QTD math
js/aggregate.js         Group-by engine (centre/engineer/CCE/product stats)
js/table.js             Generic sortable/searchable/paginated table + CSV export
js/charts.js            Chart.js wrappers (bar/line/donut/quadrant bubble)
js/insights.js          Dynamic "Management Insights" sentence generator
js/render/*.js          One file per tab (01 Executive Overview … 10 Data Quality)
js/app.js               Boot sequence, filter bar wiring, tab nav, master render
data/manifest.json      Points at the 2 data files below — you never edit this for routine updates
data/servify_latest.xlsx   Your Servify export — overwrite in place to update
data/gsx_latest.xlsx    Your GSX export — overwrite in place to update
data/location_mapping.json  Optional centre name/Area(ARM) reference — see section 13
data/sdr_eligibility.json   Optional product-level SDR eligibility reference — see section 15
```

## 13. Location mapping (optional, but recommended)

`data/location_mapping.json` is an optional reference file, built from a
one-time cross-check against Aptronix's own Location Master File. If it's
present, the dashboard uses it to:

- Add an **Area (ARM)** filter alongside Centre/City/State/Region — this is
  more reliable than the Region field for grouping centres, since Region is
  only filled in for about 1 in 5 raw records.
- Add a **Centre Type** filter (Service Centre / Repair Drop Off Location),
  also sourced from the master file.
- **Merge centre name variants** that are really the same physical location
  recorded under two different strings in the raw export (found by cross-
  checking against the master file's Ship-To IDs and state/ARM data) —
  currently the Guntur, Vizianagaram, and Siddipet pairs. Without this file,
  those show up as separate rows in every centre table.

If the file is missing, the dashboard still works — Area and Centre Type
just show "Unknown" for everything and no centres get merged. To update it
(e.g. a newly opened centre, or a name variant you've spotted), edit the
JSON directly: each entry under `locations` is keyed by the exact Servify
`Origin Service Location` string, and has `canonicalName` (what to display
it as — set this equal to another entry's `servifyLocation` to merge them),
`arm`, `locationType`, `state`, and `status` (`confirmed` /
`needs_confirmation` / `unmapped`). Entries with `status: "unmapped"` mean
no equivalent row was found in the master file — Area and Centre Type will
show "Unknown" for those until you either update the master file or add a
manual entry here.

## 14. Device Group classification (iPhone / Apple Accessory / Other Device)

The **Device Group** filter and the "SDR by Device Group" table on the
Repair TAT tab classify every record from its `Product Model` value:

- **iPhone** — any model starting with "iPhone".
- **Apple Accessory** — matched by keyword against the model name: cables,
  adapters, chargers, AirPods/EarPods, Beats-branded audio (Beats is
  Apple-owned), Apple Pencil, Magic Keyboard/Mouse, phone cases, AirTag,
  and MagSafe items. This is deliberately broader than just "cables,
  adapters, and earphones" — it covers every non-device Apple accessory,
  not only those three examples. Confirmed with the business owner
  (2026-09-07).
- **Other Device** — everything else (Mac, MacBook, iPad, Apple Watch,
  Apple TV, HomePod, iMac, Mac mini/Studio, Studio Display).

To change what counts as an accessory, edit the `ACCESSORY_KEYWORDS` list
near the top of `js/model.js` — it's a simple substring match against the
lower-cased Product Model, same pattern as the Repair Type mapping.

## 15. SVR, SDR, and "true SDR" (SDR-eligible products only)

**SVR (Same Visit Repair)** is the 0–2 hour bucket specifically. **SDR
(Same Day Repair)** is 0–8 hours, so SVR is always a strict subset of SDR.
Both are calculated over the exact same population — matched repairs with
a valid Repair Creation TAT — so SVR% is mathematically guaranteed to
never exceed SDR% anywhere in the dashboard. Both are shown together on
the Executive Overview KPIs and throughout the Repair TAT tab.

`data/sdr_eligibility.json` is a second optional reference file — a
product-level flag confirmed by the business owner (2026-09-07) for
whether a given Product Model can realistically be completed same-day at
all, regardless of centre performance. Mac/iPad/Watch repairs, and
AirPods/Apple Pencil/Beats products needing pairing, board diagnostics, or
certification, are marked not-eligible; iPhones and simple swap items
(cables, adapters, EarPods) are marked eligible. This drives:

- The **SDR Eligibility** filter in the global filter bar (Eligible / Not
  Eligible / Not Classified) — like every other filter, selecting a value
  narrows the *entire* dashboard, not just the SDR number. It does not
  change the SDR/SVR formulas themselves.
- The **"True SDR"** table on the Repair TAT tab, which always shows All
  Repairs vs SDR-Eligible Only vs Not Eligible side by side, regardless of
  what the filter is currently set to — so you can see the gap without
  having to toggle back and forth.

A product not found in this file (a new model released after the file was
built, for instance) shows as **"Not Classified"** rather than being
silently guessed either way — the Data Quality tab reports how many
records that currently affects. To reclassify a product or add a new one,
edit `data/sdr_eligibility.json` directly: it's a flat `{ "Product Model":
{ "assignedGroup": ..., "sdrEligible": true/false } }` map.

## 16. Changing SDR% colour thresholds

Open `js/buckets.js` and edit:

```js
const thresholds = { green: 90, amber: 80 };
```

`green` and `amber` are the SDR% cut-offs (green ≥ 90%, amber 80–89.9%, red
below 80%, by default). This single object drives every colour badge and
the quadrant chart split line across the whole dashboard.
