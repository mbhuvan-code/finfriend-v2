# Finfriend V2: Round 2 research prototype

A mobile-first budgeting prototype for college students. It opens with onboarding and builds a dashboard only from numbers the participant enters or confirms. There is no mock financial data anywhere in the app.

## Live link

https://mbhuvan-code.github.io/finfriend-v2/

Every push to `main` rebuilds and redeploys it through GitHub Actions (`.github/workflows/deploy.yml`). On a computer the app shows inside a phone frame. On a phone it fills the screen. Each person's data stays in their own browser.

The first screenshot or recording someone reads downloads the on-device text reader (about 7 MB), so it can take 30 to 60 seconds on slow Wi-Fi. After that it's cached.

## Run it

```bash
npm install
npm run dev
```

`npm install` also copies the OCR engine into `public/ocr` (about 53 MB, git-ignored). Run tests with `npm test`.

## What's in it

- **Onboarding (8 steps):** Welcome, how money comes in (schedule and next date), how much comes in (typed or found in a deposits screenshot, with a suggested schedule the user can tap), bank balance plus pending spending, upcoming bills, debit or credit (card details for credit users) plus transactions, savings and buffer, then a review. Each step has its own upload option. Rows found in any onboarding upload carry forward to the transactions step. Back works on every step, and answers persist if the page reloads.
- **Ways in:** screenshots (PNG, JPG, HEIC) on the income, balance, and transactions steps; a screen recording (MP4, MOV, WEBM) or CSV on the transactions step; or typing everything in.
- **Demo mode:** "See a demo with sample data" on the welcome screen loads a made-up example (`src/lib/sample.ts`, dated relative to today). A dark "Sample data" banner stays on every tab, and "Use my own info" clears it. This is the only place fictional numbers exist, and only when someone taps it.
- **Dashboard (Option 3 order):** the spending donut first, then safe to spend today, a status (Comfortable, Tight, Needs attention, or "on hold" when info is missing), Today / Week / 2 Weeks / Month with exact dates, a category donut, spending pace, bill notes, and recent purchases.
- **Can I afford something?** opens a sheet. Checking a price never changes records. "I bought it" records the purchase.
- **Hide/Reveal** hides only today's safe-to-spend amount (and the daily amount, which would give it away). Week totals, the chart, purchases, and bills stay visible. Reveal sits beside the amount so the card doesn't shift. A setting can hide it every time the app opens.
- **Activity, Bills, Goals** tabs: filter, add, edit, and delete transactions; edit bills and mark them paid; edit savings, buffer, and income.
- **Privacy and data:** an explanation of where data lives, plus Clear all data.

## How the numbers work (`src/lib/calc.ts`)

```
cash now        = balance − pending not yet in balance
                  + income recorded after the balance − spending recorded after the balance
spending money  = cash now − unpaid bills due by next income − card set-aside − protected savings − buffer
card set-aside  = card balance owed (pays in full) or the planned next payment (pays part)
daily amount    = (spending money + today's spending) ÷ days until the day before next income
safe today      = daily amount − today's spending   (never shown below $0)
left in period  = daily amount × planned days in the period from today − today's spending
pace            = average daily spending over completed days in the period vs. the daily amount
```

- Expected income is never counted until the user records it.
- Credit card users get a card section on the balance step. Available credit and credit limits are never counted as money, and the screenshot reader skips those lines. Card debt above the planned payment is shown but not counted as spending money. Bank and card balances are updated together because they share one "as of" date.
- Irregular income without a date uses a "plan until" date the user picks.
- A bill with an unknown amount is left out of the math, and the status shows as "on hold" until it's filled in.
- Days after the next income are labeled as not planned.
- Pace only appears with at least one full day of history in the period.
- "Comfortable" requires all bills, savings, and buffer covered, known bill amounts, nothing overdue, today within its amount, and weekly pace not above plan.

## Import pipeline

- `src/lib/ocr.ts`: Tesseract.js runs in the browser from `/ocr`, so there are no CDN or server calls. Images are scaled, converted to grayscale, and inverted for dark mode. Words are regrouped into visual rows so right-aligned amounts join their merchant.
- `src/lib/parse.ts`: finds amounts, signs, dates (headers, Today/Yesterday, "Oct 26", "10/26"), balances, pending sections, and bank category subtitles. Uncertain rows are flagged and start unchecked.
- `src/lib/video.ts` and `src/lib/merge.ts`: samples a frame every 0.4 s, skips unchanged frames, reads each frame, then merges frames one to one in order. Scroll overlap is removed, real repeated purchases are kept, and amounts read differently between frames are flagged. A frame with no overlap triggers a "rows may be missing" warning.
- Imports made after onboarding flag rows that match transactions already saved.

## Privacy, stated accurately

- Confirmed data is stored in this browser's `localStorage` (key `finfriend.v2`). It is **not encrypted**.
- Screenshots and recordings are processed in memory and never saved.
- There is no bank connection and no login, and the app never asks for credentials.

## Known limits

- HEIC: Safari decodes it natively. Other browsers convert it on-device with `heic2any`, which has not been tested with a real iPhone photo.
- iPhone HEVC `.mov` recordings may not decode outside Safari or Chrome on macOS. The app says so and offers screenshots or CSV instead.
- OCR was tested on synthetic, clean bank-style images and an H.264 recording, not on real banking apps. Expect more flagged rows on real screens.
- The official gradient "f" logo and mascot files weren't provided, so neither is drawn. See the comment in `Onboarding.tsx` for where they go.
