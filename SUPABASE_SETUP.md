# Supabase Setup Guide for Marzipano Tour Builder

## Prerequisites

1. **Supabase Project**: You already have one at `https://qnquicysinpybpnlqtan.supabase.co`
2. **Anon Key**: Already configured in `.env.local`
3. **Node.js**: For running the local builder

## Setup Steps

### 1. Create Database Schema

Go to your Supabase dashboard and run the SQL migration:

1. Navigate to **SQL Editor** in your Supabase project
2. Click **New Query**
3. Copy and paste the contents of `supabase/migrations/001_init_schema.sql`
4. Click **Run**

This creates:
- `tours` table - stores tour metadata
- `scenes` table - stores scene data (panorama, initial view)
- `hotspots` table - stores hotspot links between scenes
- Storage bucket policies for public access

### 2. Create Storage Bucket

In Supabase dashboard:

1. Go to **Storage** → **Buckets**
2. Click **New bucket**
3. Name it `panoramas`
4. Set to **Public** (so images can be accessed via URL)
5. Click **Create bucket**

### 3. Environment Variables

Create or verify `.env.local` with:

```
SUPABASE_URL=https://qnquicysinpybpnlqtan.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Then in Vercel add the same values in Project Settings → Environment Variables. The `SUPABASE_SERVICE_ROLE_KEY` is required for the API routes to write tours and scenes to the database.
## Local Development

### Build the Project

```bash
npm install
npm run build
```

### Start the Local Server

```bash
node scripts/tour-server.js
```

Then open: `http://localhost:8000/3dtour/`

## Usage

### Save a Tour

1. Upload panoramas in the builder
2. Create hotspots between scenes
3. Click **"Save to cloud"** button
4. The tour will be saved to Supabase and you'll get a tour ID

### View a Tour

Access the viewer with: `https://<deployment>/3dtour/viewer?id=<tour-id>`

Replace `<tour-id>` with the ID returned when you saved the tour.

## API Endpoints

### POST `/api/tours`
Save a new tour
- Body: `{ title, description, scenes, isPublic }`
- Returns: `{ tourId }`

### GET `/api/tours/[id]`
Get tour data
- Returns: `{ tour, scenes }`

### POST `/api/upload`
Upload a panorama image
- Body: `{ fileName, fileData (base64), tourId }`
- Returns: `{ success, url, path }`

## Troubleshooting

**Images not loading**: Make sure the storage bucket `panoramas` is public and the RLS policies allow anonymous read access.

**Tour not saving**: Check browser console for errors. Verify `.env.local` has correct Supabase credentials.

**Cannot access viewer**: The viewer page is at `/3dtour/viewer?id=<tour-id>` - make sure you include the `?id=` parameter.
