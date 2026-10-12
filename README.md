# TLV Photographers Club

Hebrew photography club website built with Node.js, Express 5, and EJS. The site includes member portfolios, photographic series, exhibitions, a homepage photo carousel, an about page, and a contact form.

Photos and content metadata are stored in **Cloudflare R2** rather than in the application repository. At startup, the server reads the R2 object structure and metadata into memory; no external database is required.

Bootstrap and custom CSS provide the presentation, Helmet configures HTTP security headers, and Resend handles contact emails.

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

   R2_ACCOUNT_ID=replace_with_your_cloudflare_account_id
   R2_ACCESS_KEY_ID=replace_with_your_read_only_access_key_id
   R2_SECRET_ACCESS_KEY=replace_with_your_read_only_secret_access_key
   R2_BUCKET=20-1-photographers-club-tlv-images
   R2_BASE_URL=https://your-public-r2-url.r2.dev

   RESEND_API_KEY=replace_with_your_resend_api_key
   CONTACT_EMAIL=recipient@example.com
   ```

3. Start the server:

   ```sh
   npm start
   ```

4. Open <http://localhost:3000>.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000`. |
| `BASE_URL` | Site origin used for canonical URLs and the sitemap. |
| `R2_ACCOUNT_ID` | Cloudflare account ID used to construct the R2 S3 endpoint. |
| `R2_ACCESS_KEY_ID` | R2 access key used by the application. The production application should use a read-only token. |
| `R2_SECRET_ACCESS_KEY` | Secret key matching `R2_ACCESS_KEY_ID`. |
| `R2_BUCKET` | R2 bucket containing the site's photographs and metadata. |
| `R2_BASE_URL` | Public R2 URL used to construct image URLs returned to the templates. |
| `RESEND_API_KEY` | Resend API key used by the contact form. |
| `CONTACT_EMAIL` | Recipient for contact form submissions. |

The application only needs **read access** to R2. Read/write R2 credentials used for content maintenance should be kept separately, for example in the local `rclone` configuration, and should not be deployed to Fly.io.

`.env` is excluded from Git and should never be committed.

## Project structure

```text
index.js                 Express setup, startup loading, routes, and email handler

lib/
  utilities.js           R2 access, metadata parsing, photo grouping,
                         member loading, and exhibition loading

public/
  styles/
    main.css              Custom styles
  pictures/               Local shared/static UI assets
  robots.txt              Crawler instructions

views/
  pages/                  EJS page templates
  partials/               Shared header and footer

Dockerfile               Container build and startup configuration
fly.toml                 Fly.io deployment configuration
```

The photographic content itself is not stored in `public/`. It resides in Cloudflare R2.

## Cloudflare R2 content structure

The R2 bucket currently uses these top-level prefixes:

```text
about_photo_pool/
exhibitions/
members/
photo_pool/
pictures/
```

R2 folders are object-key prefixes rather than physical directories.

The application scans R2 at startup, builds the member and exhibition databases in memory, and generates public image URLs using `R2_BASE_URL`.

Restart or redeploy the application after changing R2 metadata or directory structure so that the in-memory collections are rebuilt.

## Members

Each member has a prefix under:

```text
members/<member-key>/
```

For example:

```text
members/example_member/
  member.txt
  id_portrait.jpg
  photo01.jpg
  photo02.jpg
  s1/
    member.txt
    photo01.jpg
    photo02.jpg
```

The member folder name becomes the key used by:

```text
/member/:key
```

Example `member.txt`:

```text
שם: שם הצלם
וידאו: https://www.youtube.com/watch?v=VIDEO_ID
אודות: תיאור הצלם
אפשר להוסיף שורות נוספות לתיאור.
```

`וידאו:` is optional.

`אודות:` should remain the final metadata field because the current parser treats all following lines as description text.

Direct `.jpg` and `.jpeg` files are treated as member photographs.

Files beginning with `id_` are reserved for identification/portrait images and are excluded from ordinary member galleries.

### Photo series

A member can contain subfolders representing photographic series:

```text
members/example_member/
  s1/
    member.txt
    photo01.jpg
    photo02.jpg
```

Inside a series:

- `שם:` is the series title.
- `אודות:` is the series description.
- JPEG files become the series photographs.

The homepage carousel is generated from the already-loaded member database and may include both direct member photographs and photographs from series.

## Exhibitions

Each exhibition has a prefix under:

```text
exhibitions/<exhibition-key>/
```

Example:

```text
exhibitions/example_exhibition/
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

Supported shuffle modes:

- `ערבוב: מלא` — shuffle all participant groups.
- `ערבוב: חלקי` — shuffle the middle participant groups while keeping the first and last fixed.
- no `ערבוב:` field — retain the loaded order.

The shuffle field should appear before `אודות:`.

Exhibition participant folders use the same `member.txt` format used elsewhere.

Files beginning with `id_` are excluded from exhibition photo collections.

The exhibition page is selected using:

```text
/exhibitions?exhibition=<exhibition-key>
```

The route makes a copy of the participant array before shuffling so the in-memory exhibition database is not mutated between requests.

## About photo pool

The about page content is loaded from:

```text
about_photo_pool/
```

It uses the same folder and `member.txt` conventions as other photo collections.

## Additional photo pool

The bucket also contains:

```text
photo_pool/
```

This remains available as a separate content pool, although the homepage carousel is currently generated from the member database.

## R2 access

The application uses the AWS S3 client with Cloudflare's R2-compatible S3 API.

The endpoint is constructed from:

```text
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
```

Object listing uses `ListObjectsV2` with continuation tokens, so prefixes containing more than 1,000 objects can be loaded correctly.

The application requires only:

- object listing
- object reading

Production should therefore use a **read-only R2 API token**.

Content maintenance and uploads can use a separate **read/write token**, for example through `rclone`.

## Managing R2 with rclone

The local `rclone` remote is configured separately from the application `.env`.

A typical bucket check is:

```sh
rclone lsf r2:20-1-photographers-club-tlv-images
```

For a token limited to object read/write permissions, the R2 remote should include:

```ini
no_check_bucket = true
```

This prevents `rclone` from attempting bucket-level operations such as `CreateBucket`.

Read/write credentials used by `rclone` should not be copied into Fly.io or into the application's read-only production configuration.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/`, `/home` | Homepage with shuffled member photographs |
| GET | `/about` | Club information, photographs, and contact form |
| GET | `/members` | Member cards |
| GET | `/member/:key` | Individual member portfolio and optional video |
| GET | `/exhibitions?exhibition=<key>` | Selected exhibition |
| GET | `/terms` | Terms of use |
| GET | `/sitemap.xml` | Generated sitemap |
| POST | `/contact` | Submit the contact form through Resend |

Static application assets are served from `public/`.

Photographs stored in R2 are delivered using their public R2 URLs.

## Contact form

Resend handles contact form submissions.

Required variables:

```dotenv
RESEND_API_KEY=...
CONTACT_EMAIL=...
```

The sender is currently configured in the application code. Make sure the configured sender is valid for the associated Resend account before relying on contact-form delivery in production.

## Deployment

The production application runs on Fly.io.

Current Fly application:

```text
20-1-photographers-club-tlv
```

Production URL:

```text
https://20-1-photographers-club-tlv.fly.dev
```

The Fly application runs in the `ams` region and exposes the Node application on port `3000`.

Production secrets include:

```text
BASE_URL
CONTACT_EMAIL
RESEND_API_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_BASE_URL
```

The R2 credentials deployed to Fly should be the **read-only** credentials.

Deploy with:

```sh
fly deploy
```

Inspect deployed secrets with:

```sh
fly secrets list -a 20-1-photographers-club-tlv
```

Inspect application status with:

```sh
fly status -a 20-1-photographers-club-tlv
```

Inspect startup/runtime logs with:

```sh
fly logs -a 20-1-photographers-club-tlv
```

Changing Fly secrets causes the application Machine to restart with the new environment.

## Docker

Build locally:

```sh
docker build -t tlv-photographers-club .
```

Run using the local `.env`:

```sh
docker run --rm \
  -p 3000:3000 \
  --env-file .env \
  tlv-photographers-club
```

The Docker image does not contain the photographic archive. Photographs are loaded from R2 when the application starts.

## Search engines

The site provides:

```text
/robots.txt
/sitemap.xml
```

The sitemap is generated by the application and includes the main site pages, member pages, and exhibitions.

When changing the site's public hostname, review:

- `BASE_URL`
- canonical URLs
- sitemap output
- `public/robots.txt`

## Validation

There are currently no automated test or lint scripts in `package.json`.

Basic JavaScript syntax checks:

```sh
node --check index.js
node --check lib/utilities.js
```

After code or content changes, verify at least:

- homepage
- about page
- member list
- individual member page
- member series
- exhibition
- image loading from R2
- contact form
- sitemap

Because R2 content is loaded into memory during application startup, restart the local server or Fly Machine after structural or metadata changes that need to be reflected immediately.

## Current architecture

```text
Cloudflare R2
      |
      |  S3-compatible API
      v
Node / Express
      |
      |  loads metadata and object lists at startup
      v
In-memory member / exhibition data
      |
      v
EJS templates
      |
      v
Browser
      |
      +---- photographs loaded directly from public R2 URLs
```

There is currently no database and no Cloudinary dependency.