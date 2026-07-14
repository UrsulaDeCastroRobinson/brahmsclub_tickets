# Brahms Club Tickets

A Next.js site for booking Brahms Club concerts in Limehouse, London.

## Pages

- `/` — Landing page with concert information
- `/schedule` — Event schedule with booking links
- `/booking` — Ticket booking form (integrated with Stripe)
- `/tide` — Thames tide visualisation (see below)

## Thames Tide Visualisation (`/tide`)

A full-screen page that shows the current Thames tide level at Tower Bridge as a rising/falling water fill.

### How it works

1. **Data source** — Tide times and heights are sourced from the BBC Weather tide table for Tower Bridge:  
   `https://www.bbc.co.uk/weather/coast-and-sea/tide-tables/2/113`

2. **Server-side fetch** (`pages/api/tide.js`) — A Next.js API route fetches the BBC page server-side (avoiding browser CORS restrictions), parses the HTML with [cheerio](https://cheerio.js.org/), and returns a JSON array of tide events `{ type, timeISO, heightM }`.  
   Results are cached in memory for 20 minutes so the BBC page is not hammered on every visitor.

3. **Tide-level calculation** — The frontend identifies the two tide events that bracket the current moment:
   - `low → high` interval: tide is **rising**, fill goes `0% → 100%`
   - `high → low` interval: tide is **falling**, fill goes `100% → 0%`
   - Progress within the interval is computed linearly and clamped to `[0, 1]`.

4. **Visual update** — The water fill height animates smoothly every second. Tide data is refreshed from the API every 20 minutes.

5. **Timezone** — All BBC tide times are displayed in UK local time (`Europe/London`) and converted correctly to UTC for comparison, handling both GMT and BST automatically.

6. **Fallback** — If the BBC page is unavailable or parsing fails, a graceful error state is shown. Stale cached data is served if available.

## Development

```bash
npm run dev        # start dev server on port 3001
npm run build      # production build
npm run start      # start production server
```

### Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
- `SMTP_USER` — SMTP username (booking confirmation emails)
- `SMTP_PASS` — SMTP password
