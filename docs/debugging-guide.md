# Defense Debugging Cheat Sheet (Taglish Guide)

Para sa buong team sa **live thesis debugging defense** ng **AI-Powered Child Immunization Health Monitoring and Management System with SMS Notification (Barangay Homapon, Legazpi City)**.

> **Golden Rule sa Defense:**
> - **Frontend** (`frontend/src/`) = screen, buttons, forms, charts, at API caller. **Hindi ito direkta kumakausap sa database tables** — lahat dumadaan sa Express API!
> - **Backend** (`backend/src/`) = security guard (`requireAuth`), role checks (`RBAC`), validation, database queries, WHO growth & AI screening, at **iProg SMS** gateway.
> - **Secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `IPROG_API_TOKEN`, `GROQ_API_KEY`) = nasa `backend/.env` lang, **never sa frontend** at **never i-print sa logs/screenshots**.

---

## 1. Paano Gumagalaw ang System (End-to-End Flow)

```text
[Browser / React UI]
   │  1. Staff login via Supabase Auth (JWT token)
   │  2. frontend/src/data/api.ts sends Bearer token -> Express API
   ▼
[Express Backend — backend/src/app.js]
   │  3. backend/src/lib/auth.js verifies JWT + checks staff role in DB (RBAC)
   │  4. backend/src/lib/validate.js validates fields/dates/phones
   │  5. Route handler (backend/src/routes/*.js) queries PostgreSQL via backend/src/db.js
   │  6. Optional integrations:
   │     - AI Review & Screening -> backend/src/lib/immunizationScreening.js + reviewGuidance.js
   │     - WHO Growth Z-Score    -> backend/src/lib/growth.js
   │     - SMS Notification      -> backend/src/lib/sms.js (iProg SMS API)
   ▼
[JSON Response pabalik sa React Store — frontend/src/state/store.tsx]
```

---

## 2. Kapag Nag-Bug o Tinanong ng Panel — Saan Bubuksan?

| Feature / Problema | Frontend Files (UI / Logic) | Backend Files (API / Rules) | Ano ang Titingnan? |
|---|---|---|---|
| **Login, Session, 401/403, Role Check (`Midwife` vs `BHW`)** | `frontend/src/App.tsx`<br>`frontend/src/pages/LoginPage.tsx`<br>`frontend/src/data/supabaseClient.ts`<br>`frontend/src/data/api.ts`<br>`frontend/src/state/store.tsx` | `backend/src/app.js`<br>`backend/src/lib/auth.js` | - `401`: expired/missing Supabase token.<br>- `403`: staff role hindi allowed (hal. BHW trying Midwife-only delete/correction).<br>- Role galing lagi sa `staff` table sa DB, hindi sa client. |
| **Child Registration, Search, Edit & Delete** | `frontend/src/pages/ChildrenPage.tsx`<br>`frontend/src/pages/ChildProfilePage.tsx`<br>`frontend/src/components/ChildForm.tsx`<br>`frontend/src/utils/childDirectory.ts` | `backend/src/routes/children.js`<br>`backend/src/lib/validate.js` | - Required fields: name, birth date, sex, purok, guardian info.<br>- Validation errors return HTTP `400` with exact field message. |
| **Vaccination Dose Recording, Duplicate Guard & Corrections** | `frontend/src/pages/RecordsPage.tsx`<br>`frontend/src/components/DoseEntryForm.tsx`<br>`frontend/src/components/CorrectionForm.tsx`<br>`frontend/src/data/vaccines.ts`<br>`frontend/src/utils/recordDirectory.ts` | `backend/src/routes/doseRecords.js`<br>`backend/src/lib/vaccinationIntervals.js`<br>`backend/src/lib/validate.js` | - Bawal mag-duplicate ng same child + vaccine + dose number.<br>- Correction preserves record identity (hindi basta pinapalitan ang child/vaccine/dose number nang tahimik). |
| **Wednesday Clinic Schedule & Exception Reason** | `frontend/src/pages/SchedulePage.tsx`<br>`frontend/src/components/AppointmentDialog.tsx`<br>`frontend/src/components/FollowUpDialog.tsx`<br>`frontend/src/utils/clinicScheduling.ts`<br>`frontend/src/utils/scheduleDirectory.ts` | `backend/src/routes/appointments.js`<br>`backend/src/lib/validate.js` | - Regular immunization clinic ay **Wednesday**.<br>- Kapag non-Wednesday ang schedule, required ang `exception_reason`. |
| **iProg SMS (Single, Batch, Dry-Run vs Live, Quota & Reservations)** | `frontend/src/pages/SmsPage.tsx`<br>`frontend/src/components/SmsDialog.tsx`<br>`frontend/src/components/BatchSmsDialog.tsx`<br>`frontend/src/utils/sms.ts`<br>`frontend/src/utils/batchSms.ts`<br>`frontend/src/utils/useSmsAvailability.ts` | `backend/src/routes/smsLog.js`<br>`backend/src/lib/sms.js`<br>`backend/src/lib/smsRateLimit.js`<br>`backend/src/lib/smsReservations.js` | - Endpoint: `https://sms.iprogtech.com/api/v1/sms_messages`.<br>- Kapag `SMS_DRY_RUN=true`, **simulation/demo lang** (hindi nagpapadala ng totoong SMS at malinaw na naka-mark na simulated).<br>- Rate limit + reservation prevents double-send at quota abuse. |
| **AI-Assisted Record Review (DOH Screening + Guardrailed Groq Guidance)** | `frontend/src/pages/ReviewWorklistPage.tsx`<br>`frontend/src/components/ReviewTrackingPanel.tsx`<br>`frontend/src/components/ReviewGuidancePanel.tsx`<br>`frontend/src/components/DailyReviewSummaryCard.tsx`<br>`frontend/src/utils/reviewWorklist.ts` | `backend/src/lib/immunizationScreening.js`<br>`backend/src/lib/vaccinationIntervals.js`<br>`backend/src/lib/reviewTracking.js`<br>`backend/src/lib/reviewGuidance.js`<br>`backend/src/lib/dailyReviewSummary.js` | - **Decision support lang** (hindi diagnosis!).<br>- `immunizationScreening.js` + `vaccinationIntervals.js`: deterministic DOH date/interval/duplicate screening + triage priority.<br>- `reviewGuidance.js`: Groq (`openai/gpt-oss-20b`) only picks/orders from **pre-approved DOH catalog** (zero patient data sent to Groq; falls back to static `reference` kapag walang `GROQ_API_KEY` o nag-rate-limit). |
| **WHO Child Growth Monitoring (Z-Scores & Charts)** | `frontend/src/components/GrowthPanel.tsx`<br>`frontend/src/components/GrowthSummary.tsx`<br>`frontend/src/utils/growth.ts`<br>`frontend/src/utils/growthSummary.ts` | `backend/src/routes/growth.js`<br>`backend/src/lib/growth.js` | - Computes 3 WHO LMS indicators: Weight-for-Age, Length/Height-for-Age, Weight-for-Length/Height.<br>- Flagged for review kapag labas sa `[-2, +2]` SD o may plausibility flag. |
| **Dashboard, Reports, CSV Export & Printable ITR** | `frontend/src/pages/DashboardPage.tsx`<br>`frontend/src/pages/ReportsPage.tsx`<br>`frontend/src/components/ImmunizationDocument.tsx`<br>`frontend/src/utils/dashboardOverview.ts`<br>`frontend/src/utils/reportOverview.ts`<br>`frontend/src/utils/csv.ts` | `backend/src/routes/children.js`<br>`backend/src/routes/doseRecords.js`<br>`backend/src/routes/appointments.js` | - CSV formula-injection safe (`csv.ts` escapes leading `=`, `+`, `-`, `@`).<br>- `ImmunizationDocument.tsx` handles printable Individual Treatment / Immunization Record. |

---

## 3. Common Errors sa Defense & Mabilisang Fix

1. **"Records could not be loaded" sa Browser**
   - I-check kung tumatakbo ang backend (`GET http://localhost:4000/api/health` dapat `{ ok: true }`).
   - I-check ang `VITE_API_BASE_URL` sa `frontend/.env` at `CORS_ORIGINS` sa `backend/.env`.
2. **CORS Error sa Browser DevTools (`Network` / `Console`)**
   - Buksan ang `backend/src/app.js` at i-check ang `CORS_ORIGINS` sa `backend/.env` (default: `http://localhost:5173`).
3. **401 Unauthorized / Laging bumabalik sa Login**
   - Expired ang Supabase session token o mali ang `SUPABASE_URL` / `SUPABASE_ANON_KEY`.
   - Buksan ang `backend/src/lib/auth.js` at `frontend/src/data/api.ts`.
4. **403 Forbidden kapag nag-delete o nag-correct**
   - Normal security behavior ito kung `BHW` account ang gamit sa `Midwife`-only action (`requireMidwife` sa `backend/src/lib/auth.js`). Mag-login gamit ang Midwife account para ma-demo.
5. **SMS hindi nagse-send sa totoong phone**
   - I-check ang `SMS_DRY_RUN` sa `backend/.env`: kapag `true`, safe simulation mode ito.
   - I-check din ang `IPROG_API_TOKEN` at `smsRateLimit.js` / `smsReservations.js`.
   - Tandaan: Huwag mag-send ng totoong SMS sa random numbers during demo unless explicitly approved!
6. **AI Guidance lumalabas na `reference` imbes na `ai_assisted`**
   - Safe fallback iyan sa `backend/src/lib/reviewGuidance.js`. Nangyayari iyan kapag walang `GROQ_API_KEY`, nag-hit ng rate limit (`6/min` o `50/day`), o nasa 60-second cooldown after API error.

---

## 4. Mabilisang Commands Pang-Check Bago Humharap sa Panel

Run mula sa root folder (`capstone-system/`):

```powershell
# 1. Backend tests (API, auth, validation, screening, WHO growth, iProg SMS)
npm --prefix backend test

# 2. Frontend lint (oxlint)
npm --prefix frontend run lint

# 3. Frontend unit tests (growth, scheduling, worklist, CSV, batch SMS, etc.)
Push-Location frontend
node --test --test-concurrency=1 "test/*.test.mjs"
Pop-Location

# 4. Frontend production TypeScript + Vite build check
npm --prefix frontend run build
```

---

## 5. Defense Tip para sa Groupmates

Kapag pinag-debug ng panel ang isang bug live:
1. **Basahin muna ang error message** sa Browser DevTools (`Console` + `Network` tab) at sa Backend terminal log.
2. **Alamin kung UI o API ang may sala:**
   - Kung `400` / `401` / `403` / `409` / `500` sa Network tab -> buksan agad ang katapat na route sa `backend/src/routes/` at `backend/src/lib/validate.js`.
   - Kung `200 OK` ang API pero mali ang display sa screen -> buksan ang page sa `frontend/src/pages/` o helper sa `frontend/src/utils/`.
3. **Basahin yung Taglish header comment** sa pinakataas ng file — nakasulat doon kung ano ang hawak ng file at saan madalas nagkaka-bug.
