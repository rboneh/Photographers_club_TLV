import "dotenv/config";

import express from "express"; // express framework
import path, { dirname } from "path"; // path utilities
import { fileURLToPath } from "url"; // to get __dirname in ES module
import { Resend } from "resend"; // email sending service
import helmet from "helmet"; // security middleware
import * as u from "./public/utilities.js"; // custom utilities


const __dirname = dirname(fileURLToPath(import.meta.url));

const resend = new Resend(process.env.RESEND_API_KEY); // for email sending (if needed)

const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const r2BaseUrl = process.env.R2_BASE_URL;

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
        "https://pub-28a1c01f955542de88b34d656ef6375f.r2.dev", //for cloudflare
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

const init = async () => {
  const aboutPicturesArr4Carousel = await u.genAboutPicturesFromR2(r2BaseUrl);
  const exhibitionKeys = await u.listR2Keys("exhibitions/");
  const memberKeys = await u.listR2Keys("members/");
  const exhibitionsListFromR2 = [
    ...new Set(
      exhibitionKeys
        .map((key) => key.split("/")[1])
        .filter(Boolean)
    )
  ];
  const exhibitionsDBFromR2 =
    await u.genExhibitionsDBFromR2(
      exhibitionsListFromR2,
      exhibitionKeys,
      r2BaseUrl
    );
  const exhibitionsDB = exhibitionsDBFromR2;
  // console.dir(exhibitionsDBFromR2, { depth: null });

  const exhibitionsDB4Carousel = u.genExhibitsionsDB4Carousel(exhibitionsDB);
  const exhibitionsDB4Grid = u.genExhibitsionsDB4Grid(exhibitionsDB4Carousel);

  const membersListFromR2 = [
    ...new Set(
      memberKeys
        .map((key) => key.split("/")[1])
        .filter(Boolean)
    )
  ];

  
  const membersDB =
    await u.genMembersDBFromR2(
      membersListFromR2,
      memberKeys,
      r2BaseUrl
    );

  const membersPhotosArr4Carousel =
    await u.genMembersPhotosArrFromR2(
      membersListFromR2,
      memberKeys,
      r2BaseUrl
    );



  // make exhibitionsListFromR2 available to all EJS views
  app.use((req, res, next) => {
    res.locals.exhibitionsListFromR2 = exhibitionsListFromR2;
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
    for (const exName of exhibitionsListFromR2) {
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


  //==============================================================================================================
  ///////////////// ---------- Routes ------------------------------------------------//////////////////////////
  //==============================================================================================================

  app.get(["/", "/home"], (req, res) => {
    const shuffeldPhotoObjArr = u.shuffleArray([...membersPhotosArr4Carousel]);
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

    // console.log("Member requested:", memberKey);

    const member = membersDB.find(m => m.key === memberKey);

    if (!member) {
      return res.status(404).send("Member not found");
    }

    // console.log(u.youtubeEmbed(member.videoURL));
    res.render("pages/member-page-grid.ejs", {
      member: member,
      pageTitle: `${member.memberName} | מועדון הצילום תל אביב`,
      pageDescription: member.memberAbout,
      membersPhotos: null,
      picturesDB: null,
      exhibitionPhotos: null,
      membersDB: null,
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
    if (!exhibitionsListFromR2.includes(exhibitionName)) {
      return res.status(404).send("Exhibition not found");
    }

    // shuffle members for each exhibition page load, but keep first and last member fixed (e.g. for special placements)
    if (exhibitionObj.shuffle === "מלא") {
      exhibitionObj.membersArr = u.shuffleArray(exhibitionObj.membersArr, 0, exhibitionObj.membersArr.length - 1); // shuffle members for each exhibition page load
    } else if (exhibitionObj.shuffle === "חלקי") {
      exhibitionObj.membersArr = u.shuffleArray(exhibitionObj.membersArr, 1, exhibitionObj.membersArr.length - 2); // shuffle members for each exhibition page load, but keep first member fixed
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
    // console.log("POST /contact hit", req.body);

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

      // console.log("Resend result:", result);
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
