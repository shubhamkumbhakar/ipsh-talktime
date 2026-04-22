# ipsh-talktime

A romantic weekly talktime wallet app built with React + Vite + Supabase.

## Features

- Weekly reset every Sunday with a fresh 21-hour wallet.
- Log each call duration and auto-deduct from the weekly balance.
- Pull and display weekly logs from Supabase table `talktime_logs`.
- Cute alert when balance is exhausted.

## Supabase Setup

Create a `.env` file:

```bash
VITE_SUPABASE_URL=https://gowlsoqlupqzqasxzued.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_emmI4yVDcErqLSC2fx0tSA_k5rB8nj0
```

Expected columns in `talktime_logs`:

- `id` (uuid, primary key)
- `created_at` (timestamp, default now)
- `updated_at` (timestamp, optional trigger)
- `day` (varchar/text)
- `hours` (float4)

## Run locally

```bash
npm install
npm run dev
```
