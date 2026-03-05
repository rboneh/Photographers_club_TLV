import "dotenv/config";

import express from "express"; // express framework
import path, { dirname } from "path"; // path utilities
import { fileURLToPath } from "url"; // to get __dirname in ES module
import fs from "fs/promises"; // promise-based fs
import { Resend } from "resend"; // email sending service
import helmet from "helmet"; // security middleware

import * as u from "./public/utilities.js"; // custom utilities



// __dirname setup for ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));
console.log("__dirname:", __dirname);

const membersDir = path.join(__dirname, "public", "members");
const photoPoolDir = path.join(__dirname, "public", "photo_pool");
const exhibitionDir = path.join(__dirname, "public", "exhibitions");
const aboutPicturesDirs = path.join(__dirname, "public", "about_photo_pool");

const resend = new Resend(process.env.RESEND_API_KEY); // for email sending (if needed)

const baseUrl =
  process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const app = express();
const port = process.env.PORT || 3000;

// ---------- App setup ----------

/**
 * Helmet configuration - set Content Security Policy (CSP) to allow resources only from trusted sources
 * This helps prevent XSS and other attacks by restricting where resources can be loaded from
 * Adjust the directives as needed based on your actual resource usage (e.g. if you add new CDNs or APIs)
 */
app.use(helmet()); // security middleware - set various HTTP headers for security
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],

      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],

      styleSrc: [
        "'self'",
        "https://fonts.googleapis.com",
        "https://cdn.jsdelivr.net",
        "'unsafe-inline'",   // can remove later
      ],

      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:",
      ],

      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://code.jquery.com",
        "'unsafe-inline'",   // can remove later
      ],

      imgSrc: [
        "'self'",
        "https://picsum.photos",
        "https://fastly.picsum.photos",
        "data:",
      ],
      frameSrc: [
        "'self'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com"
      ],
    },
  })
);


app.use(express.urlencoded({ extended: true })); // to parse form data

// set EJS as templating engine 
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ---------- Load data BEFORE routes/server ----------

/**
 * safeReadDirNames - read directory names safely, return empty array on error
 * Use to read members and exhibitions directories, filter out .DS_Store files
 * @param {*} dirPath   - path to directory 
 * @returns {Array} - array of directory names .DS_Store excluded
 */
const safeReadDirNames = async (dirPath) => {
  try {
    const items = await fs.readdir(dirPath);
    return items.filter((x) => x !== ".DS_Store"); // filter out macOS metadata files
  } catch (err) {
    console.error(`Error reading directory: ${dirPath}`, err);
    return [];
  }
};

const init = async () => {
  // lists
  const membersList = await safeReadDirNames(membersDir);
  const photoPoolList = await safeReadDirNames(photoPoolDir);
  const exhibitionsList = await safeReadDirNames(exhibitionDir);
  const aboutPicturesList = await safeReadDirNames(aboutPicturesDirs);

  console.log("membersList:", membersList);
  console.log("photoPoolList:", photoPoolList);
  console.log("exhibitionsList:", exhibitionsList);
  console.log("aboutPicturesList:", aboutPicturesList);


  // photos
  // const membersPhotos = u.getFiles(membersDir); //getFiles is synchronous read. Need to be change to async. 
  // console.log("Members Photos count:", membersPhotos.length);


  /**
   * members DB (now membersList is ready) - array of member objects with all info needed for member cards and pages
   * Each member object includes:
   * - key: unique identifier derived from directory name (e.g. "member1")
   * - memberName: from info.json (or directory name if no info.json)
   * - memberAbout: from info.json (or empty string if no info.json)
   * - memberPhoto: from info.json or first photo in directory (or placeholder if none)
   * - memberDir: path to member's directory (for linking to member page)
   * - photos: array of photo objects for this member, each with filename and URL
   * membersDB structure:
   * [
   *   {
   *     key: "member1", // derived from directory name, e.g. "member1"
   *     memberName: "John Doe", // from info.json
   *     memberAbout: "Bio text...", // from info.json
   *     memberPhoto: "https://example.com/photo.jpg", // from info.json or first photo in directory
   *     memberDir: "/public/members/member1", // path to member's directory
   *     photo s: [ // array of photo objects for this member
   *       {
   *         filename: "photo1.jpg",
   *         url: "/members/member1/photo1.jpg"
   *       },
   *       ...
   *     ]
   *   },
   *   ...
   * ]
   */
  const membersDB = u.genMembersDB(membersList, membersDir);
  // const photoPoolDB = u.genMembersDB(photoPoolList, photoPoolDir);
  console.log("membersDB size:", membersDB.length);

  /**
   * membersPhotosArr4Carousel - flat array of photo objects for all members, used for homepage carousel
   * Each photo object  includes:
   * - memberKey: to link back to member page
   * - memberName: for alt text and potential captions
   * - filename: original filename of the photo
   * - url: URL to access the photo (e.g. "/members/member1/photo1.jpg")
   * membersPhotosArr4Carousel structure:
   * [
   *   {
   *     memberKey: "member1",
   *     memberName: "John Doe",
   *     filename: "photo1.jpg",
   *     url: "/members/member1/photo1.jpg"
   *   },
   *   ...
   * ]
   */
  const membersPhotosArr4Carousel = u.genMembersPhotosArr(membersDir);
  console.log("membersPhotosArr4Carousel size:", membersPhotosArr4Carousel.length);

  const photoPoolPhotosArr4Carousel = u.genMembersPhotosArr(photoPoolDir);
  console.log("photoPoolPhotosArr4Carousel size:", photoPoolPhotosArr4Carousel.length);

  const aboutPicturesArr4Carousel = u.genMembersPhotosArr(aboutPicturesDirs);
  console.log("aboutPicturesArr4Carousel size:", aboutPicturesArr4Carousel.length);

  // exhibitionsDB (now exhibitionsList is ready) for use to create exhibition page
  const exhibitionsDB = u.genExhibitionsDB(exhibitionsList, exhibitionDir);
  console.log("exhibitionsDB size:", Object.keys(exhibitionsDB).length);

  const exhibitionsDB4Carousel = u.genExhibitsionsDB4Carousel(exhibitionsDB);
  console.log("exhibitionsDB4Carousel size:", Object.keys(exhibitionsDB4Carousel).length);

  const exhibitionsDB4Grid = u.genExhibitsionsDB4Grid(exhibitionsDB4Carousel);
  console.log("exhibitionsDB4Grid size:", Object.keys(exhibitionsDB4Grid).length);

  // make exhibitionsList available to all EJS views
  app.use((req, res, next) => {
    res.locals.exhibitionsList = exhibitionsList;
    // res.locals.exhibitionsDB = exhibitionsDB;
    next();
  });

  app.use((req, res, next) => {
    res.locals.pageTitle = res.locals.pageTitle || "מועדון הצילום תל אביב";
    res.locals.pageDescription = res.locals.pageDescription || "מועדון צילום תל אביב – קהילה של צלמים, תערוכות ותיקי עבודות.";
    next();
  });

  app.use((req, res, next) => {
    res.locals.baseUrl = baseUrl;
    res.locals.canonicalPath = req.path;
    next();
  });


  /** * Sitemap route - dynamically generate sitemap.xml based on current members and exhibitions
   * This helps search engines discover all pages of the site, including member pages and exhibition pages
   * The sitemap includes:
   * - homepage
   * - about page
   * - members listing page
   * - individual member pages (one for each member in membersDB)
   * - exhibition pages (one for each exhibition in exhibitionsList)
   */
  app.get("/sitemap.xml", (req, res) => {

    const origin =
      (process.env.BASE_URL ||
        `${(req.headers["x-forwarded-proto"] || req.protocol)}://${req.get("host")}`)
        .replace(/\/$/, "");

    const urls = [
      `${origin}/`,
      `${origin}/about`,
      `${origin}/members`,
    ];

    // member pages
    for (const m of membersDB) {
      urls.push(`${origin}/member/${encodeURIComponent(m.key)}`);
    }

    // exhibitions pages
    for (const exName of exhibitionsList) {
      urls.push(
        `${origin}/exhibitions?exhibition=${encodeURIComponent(exName)}`
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
        .map((url) => `<url><loc>${url}</loc></url>`)
        .join("\n")}
</urlset>`;

    res.type("application/xml");
    res.send(xml);
  });



  ///////////////// ---------- Routes -------------------------//////////////////////////
  app.get(["/", "/home"], (req, res) => {
    const shuffeldPhotoObjArr = u.shuffleArray([...membersPhotosArr4Carousel]);
    // const shuffeldPhotoObjArr = u.shuffleArray([...photoPoolPhotosArr4Carousel]); // avoid mutating original
    res.render("pages/index.ejs", {
      membersPhotos: null,
      picturesList: null,
      membersPhotosArr4Carousel: shuffeldPhotoObjArr,
      exhibitionPhotos: null,
    });
  });

  app.get("/about", (req, res) => {
    const sent = req.query.sent; // "1" או "0" או undefined
    res.render("pages/club-about.ejs", {
      membersPhotos: null,
      picturesDB: null,
      exhibitionPhotos: null,
      membersDB: null,
      aboutPicturesArray: u.shuffleArray([...aboutPicturesArr4Carousel]),
      sent: sent,
    });
  });

  app.get("/terms", (req, res) => {
    const sent = req.query.sent; // "1" או "0" או undefined
    res.render("pages/terms.ejs", {
      membersPhotos: null,
      picturesDB: null,
      exhibitionPhotos: null,
      membersDB: null,
      aboutPicturesArray: null,
      sent: null
    });
  });
  app.get("/contact", (req, res) => {
    res.sendStatus(201);
  });

  //members cards page
  app.get("/members", (req, res) => {
    res.render("pages/members-cards.ejs", {
      membersPhotos: null,
      picturesDB: null,
      exhibitionPhotos: null,
      membersDB: membersDB,
    });
  });

  // member page route
  app.get("/member/:key", (req, res) => {
    const memberKey = req.params.key;

    console.log("Member requested:", memberKey);

    const member = membersDB.find(m => m.key === memberKey);

    if (!member) {
      return res.status(404).send("Member not found");
    }

    console.log(u.youtubeEmbed(member.videoURL));
    res.render("pages/member-page-grid.ejs", {
      member: member,
      pageTitle: `${member.memberName} | מועדון הצילום תל אביב`,
      pageDescription: member.memberAbout,
      membersPhotos: null,
      picturesDB: null,
      exhibitionPhotos: null,
      membersDB: membersDB,
      videoURL: u.youtubeEmbed(member.videoURL),
    });
  });

  // exhibitions page route
  app.get("/exhibitions", (req, res) => {
    const exhibitionName = req.query.exhibition; // e.g. "2024 - Spring Exhibition"

    if (!exhibitionName) {
      return res.status(400).send("No exhibition selected");
    }

    // const currentExhibitionDir = path.join(exhibitionDir, exhibitionName);

    const exhibitionObj = exhibitionsDB4Grid[exhibitionName];
    if (!exhibitionObj) {
      return res.status(404).send("Exhibition not found in DB");
    }

    // (optional) validate selection exists in list
    if (!exhibitionsList.includes(exhibitionName)) {
      return res.status(404).send("Exhibition not found");
    }
    // res.render("pages/exhibition-page-carousel.ejs", {
    res.render("pages/exhibition-page-grid.ejs", {
      membersPhotos: null,
      picturesList: null,
      exhibitionPhotos: null,
      exhibitionKey: exhibitionName,
      exhibitionObj: exhibitionObj,
    });
  });

  /**
   * Contact form submission - send email using Resend
   */
  app.post("/contact", async (req, res) => {
    const { name, email, message } = req.body;
    console.log("POST /contact hit", req.body);

    const to = process.env.CONTACT_EMAIL;
    if (!to) {
      console.error("Missing CONTACT_EMAIL env var");
      return res.redirect("/about?sent=0");
    }

    try {
      const result = await resend.emails.send({
        from: "Club TLV <onboarding@resend.dev>",
        to: [to],                 // ← מערך, בטוח
        replyTo: email,           // ← זה השם הנכון ב-SDK (לא reply_to)
        subject: `Contact form: ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
      });

      console.log("Resend result:", result);
      return res.redirect("/about?sent=1");
    } catch (err) {
      console.error("Resend error:", err);
      return res.redirect("/about?sent=0");
    }
  });


  // static files middleware - serve CSS, JS, images from public directory
  app.use(express.static(path.join(__dirname, "public"))); // static files middleware

  // ---------- Start server ----------
  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
};

// run init
init();
