import "dotenv/config";

import express from "express";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

import * as u from "./public/utilities.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
console.log("__dirname:", __dirname);

const membersDir = path.join(__dirname, "public", "members");
const exhibitionDir = path.join(__dirname, "public", "exhibitions");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ---------- Load data BEFORE routes/server ----------
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

  // make exhibitionsList available to all EJS views
  app.use((req, res, next) => {
    res.locals.exhibitionsList = exhibitionsList;
    next();
  });

  // ---------- Routes ----------
  app.get(["/", "/home"], (req, res) => {
    const picturesList = u.shuffleArray([...membersPhotos]); // avoid mutating original
    res.render("pages/index.ejs", {
      membersPhotos: null,
      picturesList,
      exhibitionPhotos: null,
      themeImage: "https://picsum.photos/id/91/3504/2336?random=1",
    });
  });

  app.get("/about", (req, res) => {
    res.sendStatus(201);
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
    const exhibitionName = req.query.exhibition; // e.g. "2024"

    if (!exhibitionName) {
      return res.status(400).send("No exhibition selected");
    }

    const currentExhibitionDir = path.join(exhibitionDir, exhibitionName);

    // (optional) validate selection exists in list
    if (!exhibitionsList.includes(exhibitionName)) {
      return res.status(404).send("Exhibition not found");
    }

    const exhibitionPhotos = u.getFiles(currentExhibitionDir);

    res.render("pages/index.ejs", {
      membersPhotos: null,
      picturesList: null,
      exhibitionPhotos,
      themeImage: "https://picsum.photos/id/91/800/200?random=1",
    });
  });

  // ---------- Start server ----------
  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
};

// run init
init();
