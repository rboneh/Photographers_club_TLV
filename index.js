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

const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dirName = dirname(fileURLToPath(import.meta.url));

const membersDir = __dirname + "/public/members";
const exhibitionDir = __dirname + "/public/exhibition";
console.log(membersDir);
console.log(exhibitionDir);
var memberList = [];
var exhibitionList = [];

fs.readdir(membersDir, (err, files) => {
  if (err) {
    console.error('Error reading directory:', err);
    return;
  }

  // Get all members
  console.log('Files in directory:');
  files.forEach(file => {
    if (file != '.DS_Store') {
      memberList.push(file);
    }
  });
  console.log(memberList);
});

//Cloudinary configuration
(async function () {

  // Configuration
  cloudinary.config({
    cloud_name: cloudinaryCloudName,
    api_key: cloudinaryApiKey,
    api_secret: cloudinaryApiSecret // Click 'View API Keys' above to copy your API secret
  });

  // Upload an image
  const uploadResult = await cloudinary.uploader
    .upload(
      'https://res.cloudinary.com/demo/image/upload/getting-started/shoes.jpg', {
      public_id: 'shoes',
    }
    )
    .catch((error) => {
      console.log(error);
    });

  console.log(uploadResult);

  // Optimize delivery by resizing and applying auto-format and auto-quality
  const optimizeUrl = cloudinary.url('shoes', {
    fetch_format: 'auto',
    quality: 'auto'
  });

  console.log(optimizeUrl);

  // Transform the image: auto-crop to square aspect_ratio
  const autoCropUrl = cloudinary.url('shoes', {
    crop: 'auto',
    gravity: 'auto',
    width: 500,
    height: 500,
  });

  console.log(autoCropUrl);
})();




//List of all members photos for carousel
var membersPhotos = u.getFiles(membersDir);
//console.log(membersPhotos);

const app = express();
const port = process.env.PORT || 3000;
var messageBody = {};

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

// configure EJS views
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");


//Express routing

app.get("/", (req, res) => {
  res.render("partials/index.ejs");
});

app.get("/home", (req, res) => {
  res.render("index.ejs");
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
  // console.log('manage /photo');
  res.render("partials/index.ejs", {
    member: "any",
    themeImage: "https://picsum.photos/id/91/3504/2336?random=1",
  });
});

app.get("/exhibitions", (req, res) => {
  // console.log('manage /photo');
  const fileList = u.getFiles(__dirname + "/views/blogs/photography");
  const tableBody = u.makeTableBody(fileList, "Photography");
  res.render("partials/index.ejs", {
    tableBody: tableBody,
    themeImage: "https://picsum.photos/id/91/800/200?random=1",
  });
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
