# Weekly delivery runs and role reports

Owner decisions (2026-10-22): the delivery window is **Tue 18:00 to Thu 23:00, Finnish time (Europe/Helsinki)**, one window per ISO week. A route started once in the window is one **run**. Outcomes are **Completed** (by the rider, or force-ended) and **Not run**. "On time" means delivered inside the window. Run history, GPS pings and complaints are kept for **1 year**. Reports are on screen on kangodrop.com only, with no PDF and no CSV for now. Owners and admins see full detail.

Order: S1 → S2 → S3 → S4 / S5 / S6. S4–S6 can run in parallel once S1 and S3 are done.

---

## S1. Record each weekly delivery run (prerequisite)
**As a** route owner, **I want** each start of a route kept as its own run record, **so that** last week's results are not erased when the route starts again and they can later be used for invoicing.

Today, starting a route clears all stop results and overwrites the route's start and finish times. This story keeps a copy instead.

**Run record holds:** route (id and name copied at start), owner, city, **rider who started it** (id and name copied), ISO week, window start and end, started_at, finished_at, outcome, ended by (who, which role, when), **outside window flag**, **attempt number** (e.g. 2 of 2), and a row per stop (order number, address, type, delivered yes/no, delivered_at (phone time, clamped), received_at (server time), method auto/manual, missed, missed_at, on time yes/no).

- **Given** a rider starts a route on Tue 19:00, **when** the start is saved, **then** a new run is created for that ISO week, with the rider's id and name and the start time.
- **Given** a run is in progress, **when** a stop is delivered (auto within 20 m, or a tap on an apartment stop), **then** the run's copy of that stop records the time and method, and "on time" is true only if the time is between Tue 18:00 and Thu 23:00.
- **Given** the rider taps Complete, **when** it is saved, **then** the run gets outcome Completed, a finish time, and ended by = rider. Its stop results are frozen.
- **Given** an owner or admin force-ends a running route, **when** it is saved, **then** the outcome is Completed and ended by = that owner or admin with a timestamp. Undelivered stops stay undelivered.
- **Given** a route has no run inside a week's window, **when** the window closes (Thu 23:00), **then** reports show that route as **Not run** for that week. This can be worked out at report time and does not need a stored row.
- **Given** a run is finished, **when** anyone tries to change it through the app or the API, **then** the change is refused. Runs are append-only.
- **Given** the rider starts the route again next week, **when** the stops reset, **then** last week's run is unchanged.
- **Paused:** **Given** a rider pauses and resumes, **then** each pause and resume is logged with a time on the run, so that pause time can be shown later.
- **Reassigned mid-delivery:** **Given** the owner reassigns a running route to another rider, **then** the run stays credited to the rider who started it, and the reassignment (who and when) is logged on the run.
- **Refresh or logging in again mid-route:** **Given** the rider reloads the app or logs in again during a run, **then** the same run continues and no second run is created.
- **Offline / delivery time:** **Given** a delivery is made offline and sent later, **when** the server receives it, **then** it stores the phone's delivery time as delivered_at and also stores received_at (server time). Today `backend/database.js:326` sets `delivered_at = now()`, so the phone time is lost.
- **Clamping:** **Given** the phone time is in the future, **then** delivered_at = received_at. **Given** the phone time is before the run started, **then** delivered_at = started_at. In both cases the stop is flagged "time adjusted" for audit.
- **On time** is judged on the stored (clamped) delivered_at.
- **GPS drift:** a stop that was delivered and later marked missed keeps its delivered state, as the app does today. Drift is not a reason to change a run after it is finished.
- **Outside the window:** **Given** a rider starts a route outside Tue 18:00 to Thu 23:00, **then** the start is allowed, the run is saved with the "outside window" flag, and reports show the flag. The run belongs to the ISO week of its start. Its deliveries are not on time.
- **Started more than once in one window:** **Given** a route is started again in the same window, **then** a new attempt is created and numbered (Attempt 2, 3, ...). Only the final attempt is used in reports, labelled "Attempt N of N". Earlier attempts are kept unchanged as "superseded" for audit, are not reported, and are deleted with the 1-year retention.
- **Deletion:** **Given** a route, rider or owner is deleted, **then** their runs are kept, using the copied names, until the 1-year retention ends.
- **Retention:** **Given** a run, ping or complaint is older than 1 year, **when** the daily clean-up runs, **then** it is deleted for good.
- **GDPR:** runs are personal data about the rider (times worked). Update the privacy notice and record the lawful basis (contract with the subcontractor). Pings need to be linked to the run so they can be deleted with it.

## S2. Link complaints to a route and a rider
**As a** route owner, **I want** each complaint tied to a route and a rider, **so that** it shows up in the right week's reports.

- **Given** the owner files a complaint, **when** they pick the route, **then** the rider is filled in from the route's run in the chosen week. The owner can change the rider only to one of their own riders.
- **Given** the owner picks a delivery week, **then** the complaint is linked to that week's run of the route. If the route was Not run that week, the complaint is still saved with the route and week, and the run left empty.
- **Given** the route has stops, **then** the owner can pick the stop or type a free address. The address is still required.
- **Given** a complaint filed before this change, **then** it keeps working, with route "unknown" in reports.
- **Given** the route is reassigned later, **then** the complaint keeps the original rider.
- **Given** the owner deletes a complaint, **then** it is not removed. It gets the status "withdrawn", stays stored for audit (who withdrew it and when), and is left out of complaint counts in reports. The 1-year retention still applies.
- **GDPR:** the complaint address is data about the end customer. 1-year retention applies (see S1).

## S3. kangodrop.com login for all roles, with server-side scoping
**As a** rider, route owner or admin, **I want** to sign in to kangodrop.com with my app account, **so that** I can see the reports I am allowed to see.

- **Given** a valid app email and password for any role, **when** I sign in on kangodrop.com, **then** I get in and see the reports menu for my role. The password is checked by the app backend only. The website stores no passwords.
- **Given** a wrong password, **then** I see a general "invalid credentials" message, and the existing rate limit applies to all roles.
- **Given** I am a rider, **when** I ask for any report, **then** the app backend returns only my own runs and complaints, even if the website request asks for another rider's id.
- **Given** I am a route owner, **then** I see only my own routes and riders. Asking for another owner's rider returns "not found".
- **Given** I am the admin, **then** I see all owners and riders, with region, city and owner filters.
- **Given** I am an owner with the rider role as well (`can_ride`), **when** I sign in, **then** I can switch between the Owner and Rider views, as in the app.
- **Given** the owner deletes my rider account, **when** I next load a page, **then** my website session ends.
- **Given** I signed in more than 12 hours ago (rider or owner) or 8 hours ago (admin), **when** I load a page, **then** I must sign in again. Both limits are settings that can be changed later without a code change.
- **Given** the app backend is offline, **then** website sign-in for owners and riders fails with a clear message. The public website keeps working.
- **Note:** `/api/reports` currently trusts the website's shared API key alone. Each request must also carry the signed-in user's identity, and scoping must be enforced in the app backend.

## S4. Rider: "My week" in the app, plus history and complaints on the website
Depends on S1, S2, S3.

**As a** rider, **I want** to see my week's work in the app and my last year on the website, **so that** I can check my work and any complaints against me.

- **App:** **Given** I am signed in to the app, **when** I open My week, **then** I see each route I ran this week with start, finish, delivered/total, %, the numbers of any missed stops, and the outcome.
- **Given** a route assigned to me was Not run this week, **then** it is listed as Not run after Thu 23:00.
- **Given** I have no signal, **then** My week shows the last loaded data with a note saying when it was loaded.
- **Website:** **Given** I am signed in on kangodrop.com, **when** I open My history, **then** I see one row per run for the last 12 months, newest first: date, week, route, start, finish, delivered/total, on-time %, outcome, outside-window flag, attempt (N of N), and the number of complaints.
- **Given** I open My complaints, **then** I see each complaint with date, route, address, status, and the times it was accepted and resolved.
- **Given** a run is older than 1 year, **then** it no longer shows.
- **Given** a route was reassigned to me mid-week, **then** I see only runs where I was the rider.

## S5. Owner: weekly delivery summary (O1) and missed stops (O2)
Depends on S1, S3, and S2 for the complaint counts.

**As a** route owner, **I want** a weekly summary and a list of missed stops, **so that** I can check every route was covered and follow up.

- **Given** I open the Weekly summary, **then** it defaults to the latest finished week. There is one row per route: route, rider, start, finish (date and time), delivered/total, %, on-time %, missed count, complaints, and outcome (Completed, Completed (force-ended), Not run, or In progress).
- **Given** I filter by week, route or rider, **then** the rows and totals update.
- **Given** a route was force-ended, **then** it counts as Completed, and the row shows who ended it.
- **Given** I open Missed stops for a week, **then** I see every stop that was not delivered or was missed: route, stop number, address, type (mailbox/apartment), missed_at, and whether it was delivered later.
- **Given** this week's window is still open, **then** running routes show In progress, not Not run.
- **Given** a run was started outside the window, or was not the first attempt, **then** the row shows "Outside window" and/or "Attempt N of N".
- **Given** a stop's delivery time was adjusted (clamped), **then** the row shows a "time adjusted" marker.
- **Given** a rider I have since deleted, **then** their past runs still show with their name.

## S6. Admin: weekly network summary (A2)
Depends on S1, S2, S3.

**As an** admin, **I want** one weekly view across all route owners, **so that** I can see coverage and problems across the network.

- **Given** I open the Network summary, **then** it defaults to the latest finished week. There is one row per route owner: region, city, routes, runs Completed, force-ended, Not run, outside window, restarted, stops delivered %, on-time %, missed stops, and complaints (open/resolved).
- **Given** I filter by region, city or owner, **then** the rows update, with a total row at the bottom.
- **Given** I click an owner, **then** I see that owner's weekly summary (S5) with full detail, including rider start and finish times.
- **Given** an owner has no routes, **then** they show with zeros and are not hidden.

---

## Follow-up stories (one-line ACs)
- **O3, owner rider performance:** Given a date range, the owner sees one row per own rider: runs, stops delivered %, on-time %, average run time, complaints.
- **O4, owner complaints log:** Given filters for date range, status and rider, the owner sees each complaint with route, rider, status and hours to resolve.
- **A3, admin riders directory:** The admin sees every rider with owner, city, created date, routes assigned and last week run (exclude phone numbers unless needed).
- **A4, admin rider performance:** Same as O3 across all owners, filterable by owner, region and city.
- **A5, admin complaints overview:** Counts by status and average time to resolve, per owner and per city, for a date range.

All reports are on screen only (no CSV, no PDF for now).

## Decided (2026-10-22)
- Deleting a complaint sets the status "withdrawn" (kept for audit, excluded from counts) instead of a hard delete.
- Earlier (superseded) attempts are stored for audit but never reported.
- No CSV or PDF export for now.
- A start outside the window is allowed and flagged "outside window".
- Several starts in one window: only the final attempt is reported, shown as "Attempt N of N".
- A run stays credited to the rider who started it, even if the route is reassigned.
- Session length: 12 h for riders and owners, 8 h for admins. Both can be changed later.
- The phone's delivery time is stored, clamped (not in the future, not before the start), together with the server receive time.
