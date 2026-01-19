import "dotenv/config";

import express from "express";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { Resend } from "resend";

import * as u from "./public/utilities.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
console.log("__dirname:", __dirname);

const membersDir = path.join(__dirname, "public", "members");
const exhibitionDir = path.join(__dirname, "public", "exhibitions");
const resend = new Resend(process.env.RESEND_API_KEY); // for email sending (if needed)

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ---------- Load data BEFORE routes/server ----------

/**
 * safeReadDirNames - read directory names safely, return empty array on error
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
  const exhibitionsList = await safeReadDirNames(exhibitionDir);

  console.log("membersList:", membersList);
  console.log("exhibitionsList:", exhibitionsList);

  // photos
  const membersPhotos = u.getFiles(membersDir); //getFiles is synchronous read. Need to be change to async. 
  console.log("Members Photos count:", membersPhotos.length);

  // members DB (now membersList is ready)
  const membersDB = u.genMembersDB(membersList, membersDir);
  console.log("membersDB size:", membersDB.length);

  const membersPhotosArr4Carousel = u.genMembersPhotosArr(membersDir);
  console.log("membersPhotosArr4Carousel size:", membersPhotosArr4Carousel.length);

  // exhibitionsDB (now exhibitionsList is ready) for use to create exhibition page
  const exhibitionsDB = u.genExhibitionsDB(exhibitionsList, exhibitionDir);
  console.log("exhibitionsDB size:", Object.keys(exhibitionsDB).length);

  const exhibitionsDB4Carousel = u.genExhibitsionsDB4Carousel(exhibitionsDB);
  console.log("exhibitionsDB4Carousel size:", Object.keys(exhibitionsDB4Carousel).length);  

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
      exhibitionPhotos: null ,
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
