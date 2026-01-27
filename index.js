import "dotenv/config";
console.log("MEDIA_BACKEND =", process.env.MEDIA_BACKEND);

import express from "express"; // express framework
import path, { dirname } from "path"; // path utilities
import { fileURLToPath } from "url"; // to get __dirname in ES module
import fs from "fs/promises"; // promise-based fs
import { Resend } from "resend"; // email sending service
import helmet from "helmet"; // security middleware

import * as u from "./public/utilities_cloudinary.js"; // custom utilities

// __dirname setup for ES modules
const __dirname = dirname(fileURLToPath(import.meta.url));
console.log("__dirname:", __dirname);

const membersDir = path.join(__dirname, "public", "members");
console.log("membersDir:", membersDir);
const exhibitionDir = path.join(__dirname, "public", "exhibitions");
console.log("exhibitionDir:", exhibitionDir);
const resend = new Resend(process.env.RESEND_API_KEY); // for email sending (if needed)

const app = express();
const port = process.env.PORT || 3000;
// ---------- App setup ----------
app.use(helmet()); // security middleware - set various HTTP headers for security
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],

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
        "https://res.cloudinary.com",
        "https://picsum.photos",
        "https://fastly.picsum.photos",
        "data:",
      ],

      connectSrc: [
        "'self'",
        "https://res.cloudinary.com",
      ],
    },
  })
);

app.use(express.static(path.join(__dirname, "public"))); // static files middleware
app.use(express.urlencoded({ extended: true })); // to parse form data

// set EJS as templating engine 
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ---------- Load data BEFORE routes/server ----------

/**
 * safeReadDirNames - read directory names safely, return empty array on error
 * @param {*} dirPath   - path to directory 
 * @returns {Array} - array of directory names .DS_Store excluded
 */
// const safeReadDirNames = async (dirPath) => {
//   try {
//     const items = await fs.readdir(dirPath);
//     return items.filter((x) => x !== ".DS_Store"); // filter out macOS metadata files
//   } catch (err) {
//     console.error(`Error reading directory: ${dirPath}`, err);
//     return [];
//   }
// };

const init = async () => {
  const isCloudinary = process.env.MEDIA_BACKEND === "cloudinary";
  console.log("isCloudinary =", isCloudinary);
  const CLOUD_ROOT = process.env.CLOUDINARY_ROOT || "tlv_club";
  console.log("CLOUD_ROOT =", CLOUD_ROOT);

  const membersDir = isCloudinary
    ? `${CLOUD_ROOT}/members`
    : path.join(__dirname, "public", "members");

  const exhibitionDir = isCloudinary
    ? `${CLOUD_ROOT}/exhibitions`
    : path.join(__dirname, "public", "exhibitions");

  // Read members and exhibitions folders
  const membersList = isCloudinary
    ? await u.listFolders(membersDir)
    : await safeReadDirNames(membersDir);
  console.log("membersList =", membersList);  
  const exhibitionsList = isCloudinary
    ? await u.listFolders(exhibitionDir)
    : await safeReadDirNames(exhibitionDir);
console.log("exhibitionsList =", exhibitionsList);

  // From here on: use membersDir/exhibitionsDir everywhere
  const membersPhotos = await u.getFilesCloudinary(membersDir);
  const membersDB = await u.genMembersDB(membersList, membersDir);
  const membersPhotosArr4Carousel = await u.genMembersPhotosArr(membersDir);

  const exhibitionsDB = await u.genExhibitionsDB(exhibitionsList, exhibitionDir);
  const exhibitionsDB4Carousel = await u.genExhibitsionsDB4Carousel(exhibitionsDB);

  // make membersDB available to all EJS views

  // make exhibitionsList available to all EJS views
  app.use((req, res, next) => {
    res.locals.exhibitionsList = exhibitionsList;
    // res.locals.exhibitionsDB = exhibitionsDB;
    next();
  });




  // ---------- Routes ------------------------------------------------
  app.get(["/", "/home"], (req, res) => {
    const shuffeldPhotoObjArr = u.shuffleArray([...membersPhotosArr4Carousel]); // avoid mutating original
    res.render("pages/index.ejs", {
      membersPhotos: null,
      picturesList: null,
      membersPhotosArr4Carousel: shuffeldPhotoObjArr,
      exhibitionPhotos: null,
      themeImage: "https://picsum.photos/id/91/3504/2336?random=1",
    });
  });

  app.get("/about", (req, res) => {
    const sent = req.query.sent; // "1" או "0" או undefined
    res.render("pages/club-about.ejs", {
      membersPhotos: null,
      picturesDB: null,
      exhibitionPhotos: null,
      themeImage: "https://picsum.photos/id/91/3504/2336?random=1",
      membersDB: membersDB,
      sent: sent,
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
      themeImage: "https://picsum.photos/id/91/3504/2336?random=1",
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

    res.render("pages/member-page.ejs", {
      member: member,
      pageTitle: `${member.memberName} | מועדון הצילום תל אביב`,
      pageDescription: member.memberAbout,
      membersPhotos: null,
      picturesDB: null,
      exhibitionPhotos: null,
      themeImage: "https://picsum.photos/id/91/3504/2336?random=1",
      membersDB: membersDB,
    });
  });

  // exhibitions page route
  app.get("/exhibitions", (req, res) => {
    const exhibitionName = req.query.exhibition; // e.g. "2024 - Spring Exhibition"

    if (!exhibitionName) {
      return res.status(400).send("No exhibition selected");
    }

    // const currentExhibitionDir = path.join(exhibitionDir, exhibitionName);

    const exhibitionObj = exhibitionsDB4Carousel[exhibitionName];
    if (!exhibitionObj) {
      return res.status(404).send("Exhibition not found in DB");
    }

    // (optional) validate selection exists in list
    if (!exhibitionsList.includes(exhibitionName)) {
      return res.status(404).send("Exhibition not found");
    }

    res.render("pages/exhibition-page.ejs", {
      membersPhotos: null,
      picturesList: null,
      exhibitionPhotos: null,
      exhibitionKey: exhibitionName,
      exhibitionObj: exhibitionObj,
      themeImage: "https://picsum.photos/id/91/800/200?random=1",
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





  // ---------- Start server ----------
  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
};

// run init
init();
