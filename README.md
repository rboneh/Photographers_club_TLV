# TLV Photographers Club

Hebrew photography club website built with Node.js, Express 5, and EJS. It features member portfolios, photo series, exhibitions, a homepage photo carousel, and an about page with a contact form.

Photos and metadata live in the `public/` directory. The server reads them into memory at startup; no external database is required. Bootstrap and custom CSS provide the presentation, Helmet configures HTTP security headers, and Resend handles contact emails.

## Run locally

The Dockerfile uses Node.js 22.14.0. Use Node.js 22 and npm for a matching local environment.

1. Install dependencies from the project root:

   ```sh
   npm ci
   ```

2. Create a `.env` file in the project root:

   ```dotenv
   PORT=3000
   BASE_URL=http://localhost:3000
   RESEND_API_KEY=replace_with_your_resend_api_key
   CONTACT_EMAIL=recipient@example.com
   ```

3. Start the server:

   ```sh
   npm start
   ```

4. Open <http://localhost:3000>.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000`. |
| `BASE_URL` | Site origin for canonical URLs and the sitemap. Defaults to localhost with the configured port. Set this to the public origin in production. |
| `RESEND_API_KEY` | Required to construct the Resend client at startup. Use a valid key for email delivery. |
| `CONTACT_EMAIL` | Recipient for contact form submissions. If missing, the handler redirects to `/about?sent=0`. |

The contact sender is currently hardcoded in `index.js` as `Club TLV <onboarding@resend.dev>`. Configure the sender and recipient for your Resend account before using the form in production. `.env` is excluded from Git and Docker build context.

## Project structure

```text
index.js                 Express setup, startup data loading, routes, and email handler
public/
  utilities.js           Filesystem loaders, metadata parsing, and photo grouping
  styles/main.css        Custom styles
  members/               Member profiles, portraits, photos, and series
  exhibitions/           Exhibition metadata and participant photos
  photo_pool/            Additional photo pool loaded at startup
  about_photo_pool/      Photos for the about page
  pictures/              Shared image assets
  robots.txt             Crawler instructions
views/
  pages/                 EJS page templates
  partials/              Shared header and footer
Dockerfile               Container build and startup configuration
fly.toml                 Local Fly.io deployment configuration
```

## Manage photos and metadata

Keep `public/members`, `public/exhibitions`, `public/photo_pool`, and `public/about_photo_pool` present: startup scans all four directories. Keep member and exhibition entries as folders, since the loaders treat their names as content keys.

### Members and series

Create a folder under `public/members/` for each member. Its exact name becomes the key used by `/member/:key`.

```text
public/members/example_member/
  member.txt
  id_portrait.jpg
  photo01.jpg
  photo02.jpg
```

Example `member.txt`:

```text
שם: שם הצלם
וידאו: https://www.youtube.com/watch?v=VIDEO_ID
אודות: תיאור הצלם
אפשר להוסיף שורות נוספות לתיאור.
```

The video field is optional. Put `אודות:` last: the member metadata parser treats all following lines as biography text. Use the exact `שם:` and `אודות:` labels shown above so the carousel parser also recognizes them.

For photo series, create subfolders such as `s1/` and `s2/`, each containing photos and its own `member.txt`. In a series folder, `שם:` is the series title and `אודות:` describes the series. Keep the photographer's metadata and portrait in the parent folder.

Gallery and carousel loaders accept `.jpg` and `.jpeg`, ignoring extension capitalization. Files starting with lowercase `id_` are excluded from regular photo collections; an `id_*.jpg` file directly inside the member folder provides the portrait.

The homepage uses member photos. Its recursive carousel loader collects images only from leaf folders (folders without subdirectories), so place gallery photos inside the series folders when using series. It carries the photographer's name down from the parent folder.

### Exhibitions

```text
public/exhibitions/example_exhibition/
  about.txt
  example_member/
    member.txt
    photo01.jpg
```

Example `about.txt`:

```text
שם: שם התערוכה
ערבוב: מלא
אודות: תיאור התערוכה
```

`ערבוב: מלא` shuffles all participant groups on each request. `ערבוב: חלקי` shuffles the middle groups while keeping the first and last fixed. Omit the field to retain the loaded order. Put it before `אודות:`.

Use the same member metadata format inside each participant folder. The exhibition directory name is the value of the `exhibition` query parameter.

### Other photo pools

`public/about_photo_pool/` supplies the about page carousel, using the same folder and `member.txt` conventions. `public/photo_pool/` is loaded at startup, but the current homepage uses `public/members/` instead.

Restart the server after changing photos, metadata, or content folders to rebuild the in-memory collections.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/`, `/home` | Homepage with shuffled member photos |
| GET | `/about` | Club information, photos, and contact form |
| GET | `/members` | Member cards |
| GET | `/member/:key` | Individual portfolio and optional video |
| GET | `/exhibitions?exhibition=<folder-name>` | Selected exhibition; URL-encode the folder name |
| GET | `/terms` | Terms of use |
| GET | `/sitemap.xml` | Generated sitemap for home, about, members, and exhibitions |
| POST | `/contact` | Submit the contact form through Resend |
| GET | `/contact` | Placeholder returning HTTP `201` |

Static assets are served directly from `public/`, so `public/members/...` is accessible at `/members/...`.

## Deployment

Build and run the included Docker image from the project root:

```sh
docker build -t tlv-photographers-club .
docker run --rm -p 3000:3000 --env-file .env tlv-photographers-club
```

Use `PORT=3000` with this port mapping. The image includes the local content folders and runs `npm run start`.

The local `fly.toml` targets `20-1-photographers-club-tlv` in the `ams` region, routes traffic to port `3000`, enables HTTPS, and sets the production `BASE_URL`. It is currently ignored by Git; a fresh checkout may need its own Fly.io configuration. Supply `RESEND_API_KEY` and `CONTACT_EMAIL` through the deployment environment. Check `public/robots.txt` when changing the public domain because its sitemap URL is static.

## Validation

There are no automated test or lint scripts in `package.json`. Basic JavaScript syntax checks:

```sh
node --check index.js
node --check public/utilities.js
```

After changes, start the app and check the homepage, member list, a member portfolio, an exhibition, and the about page. Test email delivery separately with configured Resend credentials.

## Planned work

- Move image storage to Cloudflare. Images are currently served from local files; Cloudflare storage is not integrated yet.
