import "dotenv/config";

import express from "express"; // express framework
import path, { dirname } from "path"; // path utilities
import { fileURLToPath } from "url"; // to get __dirname in ES module
import { Resend } from "resend"; // email sending service
import helmet from "helmet"; // security middleware
import * as u from "./lib/utilities.js"; // custom utilities

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const resend = new Resend(process.env.RESEND_API_KEY);
  const [aboutPicturesArr4Carousel, exhibitionKeys, memberKeys] = await Promise.all([
    u.genAboutPicturesFromR2(r2BaseUrl),
    u.listR2Keys("exhibitions/"),
    u.listR2Keys("members/"),
  ]);
  const exhibitionsListFromR2 = [
    ...new Set(
      exhibitionKeys
        .map((key) => key.split("/")[1])
        .filter(Boolean)
    )
  ];
  const membersListFromR2 = [
    ...new Set(
      memberKeys
        .map((key) => key.split("/")[1])
        .filter(Boolean)
    )
  ];

  const [exhibitionsDB, membersDB] = await Promise.all([
    u.genExhibitionsDBFromR2(
      exhibitionsListFromR2,
      exhibitionKeys,
      r2BaseUrl
    ),
    u.genMembersDBFromR2(
      membersListFromR2,
      memberKeys,
      r2BaseUrl
    ),
  ]);

  const exhibitionsDB4Grid = u.genExhibitionsDB4Grid(exhibitionsDB);

  const membersByKey = new Map(
    membersDB.map(member => [member.key, member])
  );

  const membersPhotosArr4Carousel = u.genMembersPhotosArr(membersDB);

  // make exhibitionsListFromR2 available to all EJS views
  app.use((req, res, next) => {
    res.locals.exhibitionsListFromR2 = exhibitionsListFromR2;
    res.locals.pageTitle = res.locals.pageTitle || "מועדון הצילום תל אביב";
    res.locals.pageDescription = res.locals.pageDescription || "מועדון צילום תל אביב – קהילה של צלמים, תערוכות ותיקי עבודות.";
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
      membersPhotosArr4Carousel: shuffeldPhotoObjArr,
    });
  });

  app.get("/about", (req, res) => {
    const sent = req.query.sent; // "1" או "0" או undefined
    res.render("pages/club-about.ejs", {
      aboutPicturesArray: u.shuffleArray([...aboutPicturesArr4Carousel]),
      sent: sent,
    });
  });

  app.get("/terms", (req, res) => {
    res.render("pages/terms.ejs");
  });
  app.get("/contact", (req, res) => {
    res.sendStatus(201);
  });

  //members cards page
  app.get("/members", (req, res) => {
    res.render("pages/members-cards.ejs", {
      membersDB: membersDB,
    });
  });

  // member page route
  app.get("/member/:key", (req, res) => {
    const member = membersByKey.get(req.params.key);

    if (!member) {
      return res.status(404).send("Member not found");
    }

    res.render("pages/member-page-grid.ejs", {
      member: member,
      pageTitle: `${member.memberName} | מועדון הצילום תל אביב`,
      pageDescription: member.memberAbout,
      videoURL: u.youtubeEmbed(member.videoURL),
    });
  });

  // exhibitions page route
  app.get("/exhibitions", (req, res) => {
    const exhibitionName = req.query.exhibition; // e.g. "2024 - Spring Exhibition"

    if (!exhibitionName) {
      return res.status(400).send("No exhibition selected");
    }

    const exhibitionObj = exhibitionsDB4Grid[exhibitionName];
    if (!exhibitionObj) {
      return res.status(404).send("Exhibition not found in DB");
    }

    // (optional) validate selection exists in list
    if (!exhibitionsListFromR2.includes(exhibitionName)) {
      return res.status(404).send("Exhibition not found");
    }

    const membersArr = [...exhibitionObj.membersArr];
    if (exhibitionObj.shuffle === "מלא") {
      u.shuffleArray(membersArr);
    } else if (exhibitionObj.shuffle === "חלקי") {
      // Keep the original first and last members in place.
      u.shuffleArray(membersArr, 1, membersArr.length - 2);
    }
    res.render("pages/exhibition-page-grid.ejs", {
      exhibitionKey: exhibitionName,
      exhibitionObj: { ...exhibitionObj, membersArr },
    });
  });

  /**
   * Contact form submission - send email using Resend
   */
  app.post("/contact", async (req, res) => {
    const { name, email, message } = req.body;

    const to = process.env.CONTACT_EMAIL;
    if (!to) {
      console.error("Missing CONTACT_EMAIL env var");
      return res.redirect("/about?sent=0");
    }

    try {
      const { error } = await resend.emails.send({
        from: "Club TLV <onboarding@resend.dev>",
        to: [to],                 // ← מערך, בטוח
        replyTo: email,           // ← זה השם הנכון ב-SDK (לא reply_to)
        subject: `Contact form: ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
      });

      if (error) {
        console.error("Resend error:", error);
        return res.redirect("/about?sent=0");
      }

      return res.redirect("/about?sent=1");
    } catch (err) {
      console.error("Resend error:", err);
      return res.redirect("/about?sent=0");
    }
  });

  // static files middleware - serve CSS, JS, images from public directory
  app.use(express.static(path.join(__dirname, "public"))); // static files middleware

  // ---------- Start server ----------
  await new Promise((resolve, reject) => {
    const server = app.listen(port, resolve);
    server.once("error", reject);
  });
  console.log(`Listening on port ${port}`);
};

// run init
init().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
