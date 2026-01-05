// import dotenv from "dotenv";
// dotenv.config({ path: "./.env" });

import "dotenv/config";

import express from "express";
import fs from "fs";
// use built-in express body parser
import { dirname } from "path";
import { fileURLToPath } from "url";

import * as u from "./public/utilities.js";

import { v2 as cloudinary } from 'cloudinary';

// const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
// const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
// const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dirName = dirname(fileURLToPath(import.meta.url));

const membersDir = __dirname + "/public/members";
const exhibitionDir = __dirname + "/public/exhibitions";
// console.log("membersDir: ", membersDir);
// console.log(exhibitionDir);
const membersList = [];
const exhibitionsList = [];

fs.readdir(membersDir, (err, members) => {
  if (err) {
    console.error('Error reading directory:', err);
    return;
  }
  // Get all members
  members.forEach(member => {
    if (member != '.DS_Store') {
      membersList.push(member);
    }
  });
   console.log('Members in directory:');
  console.log(membersList);
});

fs.readdir(exhibitionDir, (err, exhibitions) => {
  if (err) {
    console.error('Error reading directory:', err);
    return;
  }
  // Get all members
  exhibitions.forEach(exhibition => {
    if (exhibition != '.DS_Store') {
      exhibitionsList.push(exhibition);
    }
  });
   console.log('Exhibitions in directory:');
  console.log(exhibitionsList);
});


//List of all members photos for carousel
const membersPhotos = u.getFiles(membersDir);
let picturesList = u.shuffleArray(membersPhotos);
// console.log("Members Photos: ", membersPhotos);


////////// Express app /////////

const app = express();
const port = process.env.PORT || 3000;
const messageBody = {};

// app.use(express.static("public"));
app.use(express.static(__dirname + "/public"));
app.use(express.urlencoded({ extended: true }));

/////////// configure EJS views ////
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

// make exhibitionsList available to all EJS views
app.use((req, res, next) => {
  res.locals.exhibitionsList = exhibitionsList || [];
  next();
});

///////// Express routing /////////

// app.get("/", (req, res) => {
//   res.render("partials/index.ejs");
// });

app.get(["/","/home"], (req, res) => {
  // console.log('membersPhotos at /home :', membersPhotos);
  picturesList = u.shuffleArray(membersPhotos);
  res.render("partials/index.ejs", {
    membersPhotos: null,
    picturesList: picturesList,
    themeImage: "https://picsum.photos/id/91/3504/2336?random=1",
  });
});

app.get("/about", (req, res) => {
  // res.render("about.ejs");
  res.sendStatus(201);
});

app.get("/contact", (req, res) => {
  // res.render("contact.ejs");
  res.sendStatus(201);
});

app.get("/members", (req, res) => {
   console.log('membersPhotos at /members :', membersPhotos);
  res.render("partials/index.ejs", {
    membersPhotos: membersPhotos,
    picturesList: null,
    themeImage: "https://picsum.photos/id/91/3504/2336?random=1",
  });
});

app.get("/exhibitions", (req, res) => {

  const exhibitionName = req.query.exhibition; // e.g. "2024"
  const currentExhibitionDir = `${exhibitionDir}/${exhibitionName}`;
  // console.log("Current exhibition dir:", currentExhibitionDir);
  const exhibitionPhotos = u.getFiles(currentExhibitionDir);
  // console.log(`Exhibition Photos for ${exhibitionName}:`, exhibitionPhotos);

  if (!exhibitionName) {
    return res.status(400).send("No exhibition selected");
  } else {
    console.log("Exhibition selected:", exhibitionName);
  }
  res.render("partials/index.ejs", {
    membersPhotos: null,
    picturesList: null,
    exhibitionPhotos: exhibitionPhotos,
    themeImage: "https://picsum.photos/id/91/800/200?random=1",
  });
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
