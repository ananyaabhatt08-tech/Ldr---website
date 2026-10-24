# Between Us

A private shared journal for long distance couples, sold as a one-time purchase per couple.
Static site (no build step) + Supabase (accounts, database, realtime) + SuperProfile (checkout).

```
index.html     landing page, sign-in, space setup and the journal
app.css        journal styles            landing.css   marketing + auth styles
app.js         the journal (home, notes, movies, spin, games, decide, us)
shim.js        connects app.js to Supabase (documents, presence, realtime)
main.js        screens, sign-in, redeeming codes, joining a partner
config.js      your keys and links (edit this)
supabase/schema.sql   database, security rules, seller tools
```

## How buying works

1. Buyer pays on your SuperProfile page and receives a **licence code** (`BU-XXXX-XXXX-XXXX`).
2. They create an account on your site and enter the code. That creates their **space** and shows an **invite code**.
3. Their partner signs up and enters the invite code. The partner never pays. A space holds exactly two people.

Each space is isolated by database row-level security: nobody outside a couple can read or write its journal.

## Setup (about 15 minutes)

### 1. Create the Supabase project
Create a new project at supabase.com (the free plan works to start). Then **SQL Editor > New query**, paste all of `supabase/schema.sql`, and run it. Re-running is safe.

In **Authentication > Providers > Email**, decide whether to require email confirmation. Off is smoothest for buyers; on is safer against fake sign-ups. In **Authentication > URL Configuration**, set the Site URL to your final website address (needed for password reset emails).

### 2. Fill in `config.js`
In Supabase go to **Project Settings > API** and copy the project URL and the publishable (anon) key into `config.js`. This key is meant to be public.

### 3. Deploy the site
It is plain static files. Any static host works. With Vercel: import this GitHub repo as a new project, framework preset **Other**, no build command, output directory `.`. Put your own domain on it if you have one.

### 4. Sell it on SuperProfile
Create a **digital product** on SuperProfile, set your price, and put the product page URL in `config.js` as `BUY_URL` (also set `PRICE_LABEL` and `SUPPORT_EMAIL`). The product has to deliver a licence code to each buyer. SuperProfile cannot generate a unique code per order by itself, so pick one of these:

* **Unique codes, sent by you (safest).** Generate codes in the SQL editor (below) and send one to each buyer from the SuperProfile order, by message or email. Fine for the first sales, tedious at volume.
* **Shared code with a use limit (hands-off).** Create one hard-to-guess code that works for the next N buyers, put it in the product's delivered content, and replace it with a fresh one every N sales. A buyer who shares it uses up your N, so keep N small.
* **Later, full automation.** A payment provider that can call a webhook (Razorpay, Stripe) can create a code automatically per order. Ask for this when you outgrow the manual flow.

### Seller tools (run in the Supabase SQL editor)

```sql
-- 25 unique single-use codes
select * from public.create_licenses(25, 'launch batch');

-- one shared code that works for 10 buyers
select public.create_shared_license('BETWEEN-LAUNCH-7Q4X9K', 10, 'week 1');

-- see what is left
select code, uses, max_uses, note from public.licenses order by created_at desc;
```

## Before you start selling

* Add your own **terms, privacy notice and refund policy** and link them from the footer in `index.html`. The app stores account emails, display names and everything the couple writes.
* Decide how you handle a couple who lose access (a buyer who cannot sign in can use "Forgot your password"). Deleting a user in Supabase also deletes their membership.
* The Supabase free plan pauses idle projects. Upgrade before real customers rely on it.
* Codes can be guessed in principle. The generated `BU-XXXX-XXXX-XXXX` codes have 48 random bits; for a shared code use at least 16 random characters.

## Development notes

The journal was prototyped as a claude.ai artifact (`docs/claude-artifact-prototype.html`). `shim.js` gives `app.js` the same small database, presence and room interface on top of Supabase, so the journal code is unchanged. Documents live in one table `docs(couple_id, path, data)`. Deletes are soft so realtime can filter by couple. Concurrent edits to one document (two people hearting a note at once) merge atomically through the `merge_doc` function.
