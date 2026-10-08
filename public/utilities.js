import e from "express";
import fs from "fs";
// import { promises as fsPromises } from "fs";
import { join } from "path";
import path from "path";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";


/*******************************************************************************************
 * Initialize Cloudflare R2 client using AWS SDK v3
 * The R2 client is configured with the account ID, access key, and secret key from environment variables.
 * The endpoint is constructed using the R2 account ID.
 * This client can be used to interact with Cloudflare R2 storage, such as listing objects, getting objects, etc.
 * 
 * Note: Ensure that the following environment variables are set:
 * - R2_ACCOUNT_ID
 * - R2_ACCESS_KEY_ID
 * - R2_SECRET_ACCESS_KEY   
 */
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});


/**********************************************************************
 *  List all keys in a Cloudflare R2 bucket with a given prefix.
 * @param {*} prefix 
 * @returns 
 ***********************************************************************/
export async function listR2Keys(prefix) {
  const result = await r2Client.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: prefix,
    })
  );

  return result.Contents?.map((obj) => obj.Key) || [];
}

/**
 * Recursive function to get jpg all files down the folder tree
 * @param {string} dir - starting directory
 * @param {Array} files - array to accumulate file paths
 * @returns {Array} files- array of file paths 
 * 
 * getFiles is synchronous read. Need to be change to async. 
 */
export function getJpgFilesRec(dir, files = []) {
  const fileList = fs.readdirSync(dir);

  for (const file of fileList) {
    // ⛔ ignore macOS metadata files
    if (file.includes(".DS_Store")) continue;

    // ⛔ ignore id_ files files
    if (file.startsWith("id_")) continue;

    const name = `${dir}/${file}`;
    // This is the recursive part. If the file is a directory,
    // we call the same function again
    if (fs.statSync(name).isDirectory()) {
      getJpgFilesRec(name, files);
    } else {
      // only keep .jpg / .JPG / .jpeg (optional)
      const lower = file.toLowerCase();
      if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) continue;

      // convert to web path
      const normalized = name.replace(/\\/g, "/"); // for Windows compatibility
      const webPath = normalized.split("/public")[1];
      files.push(webPath);
    }
  }

  return files;
}


/**
 * Get names of all directories within a given path
 * @param {string} dirPath - Path to the directory
 * @returns {Array} - Array of directory names  
 */
export function getDirNames(dirPath) {
  try {
    const dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });

    return dirEntries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
  } catch (err) {
    console.error(`Error reading directory: ${dirPath}`, err);
    return [];
  }
}

/**
 *genMembersDB generate db in the form of
 {key: string, memberName: string, memberAbout: stringphotos: Array}
 * @param   {Array} membersKeysArray - array of member keys
 * @param   {string} membersDir - path to members directory
 * @returns {Array} - members database array
 */
export function genMembersDB(membersKeysArray, membersDir) {
  const membersDB = [];

  membersKeysArray.forEach(memberKey => {
    const memberDirPath = join(membersDir, memberKey);

    // תמונות רגילות (id_ מסונן כבר ב-getFiles)
    const memberPhotos = getJpgFilesRec(memberDirPath);

    /* 
    /* if there are series subfolders, we will add them to the memberData as an object of arrays of photos, 
    /* each array for a series. The key of each array will be the name of the series 
    /* (the name of the subfolder).
    */
    const seriesDirs = getDirNames(memberDirPath);
    const memberSeries = {};
    if (seriesDirs.length > 0) {
      seriesDirs.forEach(seriesDir => {
        const seriesDirPath = join(memberDirPath, seriesDir);
        const seriesPhotos = getJpgFilesRec(seriesDirPath);


        const { memberName: seriesName, memberAbout: seriesAbout } = readMemberTxtIfExists(seriesDirPath);

        const seriesData = {
          key: memberKey,
          photos: seriesPhotos,
          seriesName: seriesName,
          seriesAbout: seriesAbout,
        };
        memberSeries[seriesDir] = seriesData;
      });
    }

    // חיפוש id_*.jpg ישירות בתיקייה
    let idPhoto = null;
    const allFiles = fs.readdirSync(memberDirPath);

    const idFile = allFiles.find(file =>
      file.toLowerCase().startsWith("id_") &&
      file.toLowerCase().endsWith(".jpg")
    );

    if (idFile) {
      // בניית נתיב מלא מה־/members/...
      const fullPath = join(memberDirPath, idFile)
        .replace(/\\/g, "/")           // תאימות Windows
        .split("/public")[1];          // חיתוך עד /members

      idPhoto = fullPath;
    }

    //{memberName: string, memberAbout: string,  videoURL: string, shuffle: string, series: string}
    const { memberName: memberName, memberAbout: memberAbout, videoURL: videoURL, series: series } = readMemberTxtIfExists(memberDirPath);

    const memberData = {
      key: memberKey,
      idPhoto: idPhoto,        // 👈 הנתיב המלא של תמונת ה-ID
      photos: memberPhotos,
      memberName: memberName,
      memberAbout: memberAbout,
      videoURL: videoURL,
      series: memberSeries || null,   // אם יש תיקיות משנה, נוסיף את המידע שלהן
    };

    membersDB.push(memberData);
  });

  return membersDB;
}

/**************************************************************************************************
 *  Generate members database from Cloudflare R2 storage.
 * @param {*} membersList 
 * @param {*} memberKeys 
 * @param {*} r2BaseUrl 
 * @returns 
 **************************************************************************/
export async function genMembersDBFromR2(
  membersList,
  memberKeys,
  r2BaseUrl
) {
  const membersDB = [];

  for (const memberFolder of membersList) {
    const memberPrefix = `members/${memberFolder}/`;

    const memberTxtKey = memberKeys.find(
      (key) =>
        key.startsWith(memberPrefix) &&
        key.toLowerCase() === `${memberPrefix}member.txt`.toLowerCase()
    );

    if (!memberTxtKey) continue;

    const memberText = await readR2Text(memberTxtKey);

    const {
      memberName,
      memberAbout,
      videoURL,
      series,
    } = parseMemberTxt(memberText);

    const idPhotoKey = memberKeys.find((key) => {
      if (!key.startsWith(memberPrefix)) return false;

      const relativePath = key.slice(memberPrefix.length);

      // only files directly inside the member folder
      if (relativePath.includes("/")) return false;

      const lower = relativePath.toLowerCase();

      return lower.startsWith("id_") &&
        (lower.endsWith(".jpg") || lower.endsWith(".jpeg"));
    });

    //managing photos directly inside the member folder (not in series subfolders)
    const memberPhotoKeys = memberKeys.filter((key) => {
      if (!key.startsWith(memberPrefix)) return false;

      const relativePath = key.slice(memberPrefix.length);

      // only photos directly inside the member folder
      if (relativePath.includes("/")) return false;

      const lower = relativePath.toLowerCase();

      return (
        (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) &&
        !lower.startsWith("id_")
      );
    });

    const photos = memberPhotoKeys.map(
      (key) => `${r2BaseUrl}/${key}`
    );

    // managing series subfolders
    const seriesFolders = [
      ...new Set(
        memberKeys
          .filter((key) => key.startsWith(memberPrefix))
          .map((key) => key.slice(memberPrefix.length).split("/")[0])
          .filter((part) => part && !part.includes("."))
      )
    ];

    
    const memberSeries = {};

    // iterate over series folders
    for (const seriesFolder of seriesFolders) {
      const seriesPrefix = `${memberPrefix}${seriesFolder}/`;

      const seriesMemberTxtKey = memberKeys.find(
        (key) =>
          key.toLowerCase() ===
          `${seriesPrefix}member.txt`.toLowerCase()
      );

      if (!seriesMemberTxtKey) continue;

      const seriesText = await readR2Text(seriesMemberTxtKey);

      const {
        memberName: seriesName,
        memberAbout: seriesAbout,
      } = parseMemberTxt(seriesText);

      const seriesPhotoKeys = memberKeys.filter((key) => {
        if (!key.startsWith(seriesPrefix)) return false;

        const relativePath = key.slice(seriesPrefix.length);

        if (relativePath.includes("/")) return false;

        const lower = relativePath.toLowerCase();

        return (
          (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) &&
          !lower.startsWith("id_")
        );
      });

      memberSeries[seriesFolder] = {
        key: memberFolder,
        photos: seriesPhotoKeys.map(
          (key) => `${r2BaseUrl}/${key}`
        ),
        seriesName,
        seriesAbout,
      };
    }

    membersDB.push({
      key: memberFolder,
      idPhoto: idPhotoKey
        ? `${r2BaseUrl}/${idPhotoKey}`
        : null,
      photos: photos,
      memberName,
      memberAbout,
      videoURL,
      series: memberSeries || null,
    });

  }

  return membersDB;
}



/*******************************************************************************************
 * Generates an array of about pictures from R2
 * @param {*} r2BaseUrl 
 * @returns 
 ********************************************************************************************/
export async function genAboutPicturesFromR2(r2BaseUrl) {

  const result = await r2Client.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: "about_photo_pool/",
    })
  );

  const keys = result.Contents?.map((obj) => obj.Key) || [];

  const memberTxtKey = keys.find((key) =>
    key.toLowerCase().endsWith("/member.txt")
  );

  if (!memberTxtKey) return [];

  const memberText = await readR2Text(memberTxtKey);

  let photographerName = "";
  let pictureAbout = "";

  for (const rawLine of memberText.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.startsWith("שם:")) {
      photographerName = line.replace("שם:", "").trim();
    } else if (line.startsWith("אודות:")) {
      pictureAbout = line.replace("אודות:", "").trim();
    }
  }

  const imageKeys = keys.filter((key) => {
    const lower = key.toLowerCase();

    return (
      (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) &&
      !lower.split("/").pop().startsWith("id_")
    );
  });

  return imageKeys.map((key) => ({
    name: photographerName,
    photographerName: photographerName,
    seriesName: "",
    about: pictureAbout,
    picture: `${r2BaseUrl}/${key}`,
  }));
}

/*********************************************************************************************
 * Helper to read text files from R2
 * @param {*} key 
 * @returns 
 ********************************************************************************************/
export async function readR2Text(key) {
  const result = await r2Client.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
    })
  );

  return await result.Body.transformToString();
}

/**
 *  Generate photo pool from R2 
 * @param {*} r2BaseUrl 
 * @returns 
 */
export async function genPhotoPoolFromR2(r2BaseUrl) {
  const result = await r2Client.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: "photo_pool/",
    })
  );

  const keys = result.Contents?.map((obj) => obj.Key) || [];
  const photos = [];

  const memberTxtKeys = keys.filter((key) =>
    key.toLowerCase().endsWith("/member.txt")
  );

  for (const memberTxtKey of memberTxtKeys) {
    const memberText = await readR2Text(memberTxtKey);

    const {
      memberName,
      memberAbout,
    } = parseMemberTxt(memberText);

    const folderPrefix =
      memberTxtKey.substring(0, memberTxtKey.lastIndexOf("/") + 1);

    const imageKeys = keys.filter((key) => {
      if (!key.startsWith(folderPrefix)) return false;

      const fileName = key.split("/").pop();
      const lower = fileName.toLowerCase();

      return (
        (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) &&
        !lower.startsWith("id_")
      );
    });

    for (const key of imageKeys) {
      photos.push({
        name: memberName,
        photographerName: memberName,
        seriesName: "",
        about: memberAbout,
        picture: `${r2BaseUrl}/${key}`,
      });
    }
  }

  return photos;
}

/***********************************************************************************************
 *  Generate members photos array from R2 storage.  
 * 
 * @param {*} membersList 
 * @param {*} memberKeys 
 * @param {*} r2BaseUrl 
 * @returns 
 ***********************************************************************************************/
export async function genMembersPhotosArrFromR2(
  membersList,
  memberKeys,
  r2BaseUrl
) {
  const photos = [];

  for (const memberFolder of membersList) {
    const memberPrefix = `members/${memberFolder}/`;

    const memberTxtKey = memberKeys.find(
      (key) =>
        key.toLowerCase() ===
        `${memberPrefix}member.txt`.toLowerCase()
    );

    if (!memberTxtKey) continue;

    const memberText = await readR2Text(memberTxtKey);

    const {
      memberName,
      memberAbout,
    } = parseMemberTxt(memberText);

    const directImageKeys = memberKeys.filter((key) => {
      if (!key.startsWith(memberPrefix)) return false;

      const relativePath = key.slice(memberPrefix.length);

      if (relativePath.includes("/")) return false;

      const lower = relativePath.toLowerCase();

      return (
        (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) &&
        !lower.startsWith("id_")
      );
    });

    for (const key of directImageKeys) {
      photos.push({
        name: memberName,
        photographerName: memberName,
        seriesName: "",
        about: memberAbout,
        picture: `${r2BaseUrl}/${key}`,
      });
    }

    const seriesFolders = [
      ...new Set(
        memberKeys
          .filter((key) => key.startsWith(memberPrefix))
          .map((key) => {
            const relativePath = key.slice(memberPrefix.length);
            const parts = relativePath.split("/");

            return parts.length > 1 ? parts[0] : null;
          })
          .filter(Boolean)
      ),
    ];

    for (const seriesFolder of seriesFolders) {
      const seriesPrefix = `${memberPrefix}${seriesFolder}/`;

      const seriesMemberTxtKey = memberKeys.find(
        (key) =>
          key.toLowerCase() ===
          `${seriesPrefix}member.txt`.toLowerCase()
      );

      if (!seriesMemberTxtKey) continue;

      const seriesText = await readR2Text(seriesMemberTxtKey);

      const {
        memberName: seriesName,
        memberAbout: seriesAbout,
      } = parseMemberTxt(seriesText);

      const seriesImageKeys = memberKeys.filter((key) => {
        if (!key.startsWith(seriesPrefix)) return false;

        const relativePath = key.slice(seriesPrefix.length);

        if (relativePath.includes("/")) return false;

        const lower = relativePath.toLowerCase();

        return (
          (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) &&
          !lower.startsWith("id_")
        );
      });

      for (const key of seriesImageKeys) {
        photos.push({
          name: memberName,
          photographerName: memberName,
          seriesName,
          about: seriesAbout,
          picture: `${r2BaseUrl}/${key}`,
        });
      }
    }
  }

  return photos;
}

/*************************************************************************************
 * genExhibitionsDB(exhibitionsListArr, exhibitionDir)

 * @param {Array} exhibitionsListArr - array of exhibition names      
 * @param {string} exhibitionDir - path to exhibitions directory  
 * @param {Object} exhibitionsDB - exhibitions database object
 * @returns 
 * generate exhibitions DB in the form of
 *
 * {
 *  "exhibition1Key" : {
 *   exhibitionURL: "/path/to/exhibition",
 *   exhibitionName: " exhibitionName",
 *   exhibitionAbout: " exhibitionAbout",
 *   members: [
 *     "memberName1",
 *     "memberName2",
 *     "memberName3",...
 *   ],
 *   membersDB: [
 *     {
 *       key: "member1Key",
 *       idPhoto: null,
 *       photos: [
 *         "photo1URL.jpg",
 *         "photo2URL.jpg",
 *         "photo3URL.jpg",...
 *       ],
 *       memberName: "member1Name",
 *       memberAbout: "member1About",
 *     },
 *     {
 *       key: "member2Key",
 *       idPhoto: null,
 *       photos: [
 *         "photo1URL.jpg",
 *         "photo2URL.jpg",
 *         "photo3URL.jpg",...
 *       ],
 *       memberName: "member2Name",
 *       memberAbout: "member2About",
 *     },
 *     {
 *       key: "member3Key",
 *       idPhoto: null,
 *       photos: [
 *         "photo1URL.jpg",
 *         "photo2URL.jpg",
 *         "photo3URL.jpg",...
 *       ],
 *       memberName: "member3Name",
 *       memberAbout: "member3About",
 *     },    { ... }
 *   ]
 *  },
 *  "exhibition2Key" : { ...  
 *
 *   } 
 *  ,  
 * }
 **************************************************************************************/
export function genExhibitionsDB(exhibitionsListArr, exhibitionDir) {
  const exhibitiosDB = {};

  // iterate over exhibitions
  for (const exhibition of exhibitionsListArr) {
    const currentExhbitionDB = {};

    const exhibitionDirPath = join(exhibitionDir, exhibition);

    const foldersList = fs.readdirSync(exhibitionDirPath);
    const membersList = foldersList.filter((name) => {
      if (name === ".DS_Store") return false;
      const stats = fs.statSync(join(exhibitionDirPath, name));
      return stats.isDirectory();
    });


    const { memberName: exhibitionName, memberAbout: exhibitionAbout, shuffle: shuffle } = readMemberTxtIfExists(exhibitionDirPath, "about.txt");

    currentExhbitionDB.exhibitionURL = exhibitionDirPath;
    currentExhbitionDB.exhibitionName = exhibitionName;
    currentExhbitionDB.exhibitionAbout = exhibitionAbout;
    currentExhbitionDB.shuffle = shuffle;
    const exhibitionMembersDb = genMembersDB(membersList, exhibitionDirPath);
    currentExhbitionDB.members = membersList;
    currentExhbitionDB.membersDB = exhibitionMembersDb;

    exhibitiosDB[exhibition] = currentExhbitionDB;
  }
  const dbKeys = Object.keys(exhibitiosDB);
  // console.log(dbKeys);
  return exhibitiosDB;
}



/**
 *shuffle array in place
 * @param {Array} arr - array to shuffle
 * @returns {Array} - shuffled array  
 * @param {number} start - starting index for shuffle (default: 0)
 * @param {number} end - ending index for shuffle (default: arr.length - 1) 
 * Fisher-Yates algorithm implementation.
 *  
 */
export function shuffleArray(arr, start = 0, end = arr.length - 1) {
  for (let i = end; i > start; i--) {
    const j = start + Math.floor(Math.random() * (i - start + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 *read file synchronously
 * @param {string} filePath - path to the file
 */
export function readFileSynchronously(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    // console.log(fileContent);
    return fileContent;
  } catch (error) {
    console.error(error);
  }
}


/**
 * Generate date string for file name
 * @param {Date} currentDate - date object  
 * @param {string} filePath - path to the file  
 */
export function date4fileName(currentDate) {
  const options = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  };
  const formattedDate = currentDate.toLocaleString("en-UK", options);
  let dateForFileName = formattedDate.replace(",", "-");
  dateForFileName = dateForFileName.replaceAll(":", "");
  dateForFileName = dateForFileName.replaceAll(" ", "");
  dateForFileName = dateForFileName.replaceAll("/", "-");

  return dateForFileName;
}

/**
 * 
 * @param {*} memberDirPath 
 * @returns { memberName: string, memberAbout: string,  videoURL: string, shuffle: string, series: string}
 */
function readMemberTxtIfExists(memberDirPath, fileName = "member.txt") {
  const filePath = join(memberDirPath, fileName);

  if (!fs.existsSync(filePath)) {
    return { memberName: null, memberAbout: null };
  }

  try {
    const text = fs.readFileSync(filePath, "utf8");
    return parseMemberTxt(text);
  } catch (error) {
    console.error("Error reading member.txt:", error);
    return { memberName: null, memberAbout: null, videoURL: null, shuffle: null, series: null };
  }
}

/**
 * Parse member txt file to extract name and about
 * @param {string} text - content of the member txt file
 * @returns {Object} - { memberName: string, memberAbout: string } 
 */
function parseMemberTxt(text) {
  const lines = text.split(/\r?\n/); //split the text into lines

  let memberName = "";
  let memberAbout = "";
  let videoURL = "";
  let shuffle = "none";
  let series = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();   // removes leading spaces/tabs

    // match: שם : משה גרוס
    const nameMatch = line.match(/^שם\s*[:：]\s*(.*)$/);
    if (nameMatch) {
      memberName = nameMatch[1].trim();
      continue;
    }

    // match: סידרה : S1
    const seriesMatch = line.match(/^סידרה\s*[:：]\s*(.*)$/);
    if (seriesMatch) {
      series = seriesMatch[1].trim();
      continue;
    }

    // match: וידאו : לינק
    const videoURLmatch = line.match(/^וידאו\s*[:：]\s*(.*)$/);
    if (videoURLmatch) {
      videoURL = videoURLmatch[1].trim();
      continue;
    }

    // match: וידאו : לינק
    const shuffleMatch = line.match(/^ערבוב\s*[:：]\s*(.*)$/);
    if (shuffleMatch) {
      shuffle = shuffleMatch[1].trim();
      continue;
    }

    // match: אודות : לורם איפסום
    const aboutMatch = line.match(/^אודות\s*[:：]\s*(.*)$/);
    if (aboutMatch) {
      const firstLine = aboutMatch[1].trim();
      const rest = lines.slice(i + 1).join("\n").trim();

      memberAbout = [firstLine, rest].filter(Boolean).join("\n").trim();
      break;
    }
  }

  return { memberName, memberAbout, videoURL, shuffle, series };
}


/**
 *  Generate exhibitions DB for carousel view     
 *  * @param {*} exhibistinsDB 
 * @returns 
 */
export function genExhibitsionsDB4Carousel(exhibistinsDB) {
  // console.log("\n\nGenerating exhibitionsDB4Carousel...");

  const exhibitionsCarouselDB = {};

  for (const [exhibitionKey, exhibitionObj] of Object.entries(exhibistinsDB)) {
    // console.log("exhibitionKey: ", exhibitionKey, "\nexhibitionObj:", Object.keys(exhibitionObj));

    const exhibitionDB = {};
    exhibitionDB.exhibitionName = exhibitionObj.exhibitionName;
    exhibitionDB.exhibitionAbout = exhibitionObj.exhibitionAbout;
    exhibitionDB.shuffle = exhibitionObj.shuffle;
    exhibitionDB.series = exhibitionObj.series;
    const exhibitionPhotosArr = genExhibitionPhotosArr(exhibitionObj.exhibitionURL);
    exhibitionDB.exhibitionPhotosArr = exhibitionPhotosArr;

    exhibitionsCarouselDB[exhibitionKey] = exhibitionDB;

  }
  return exhibitionsCarouselDB;
}


export function genExhibitsionsDB4Grid(exhibitionsDB4Carousel) {
  // console.log("\n\nGenerating exhibitionsDB4Grid...");
  const exhibitionsDB4Grid = exhibitionsDB4Carousel; // No copy.. Just for readability. We will add membersArr to each exhibition object in place.


  for (let key in exhibitionsDB4Grid) {
    const exhibition = exhibitionsDB4Grid[key];
    const photosArr = exhibition.exhibitionPhotosArr;
    const membersArr = buildMembers(photosArr);
    exhibition.membersArr = membersArr;
  }

  return exhibitionsDB4Grid;
}

/**
 * Build members array from exhibition photos array grid version
 * Each member object includes:
 * - name: member name from exhibition photos array
 * - about: member about from exhibition photos array
 * - photos: array of photo objects for this member, each with picture URL
 * members array structure:
 * [
 *   {
 *     name: "Member Name",
 *     about: "Member About",
 *     photos: [
 *       {
 *         picture: "/path/to/photo.jpg"
 *       },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 * @param {Array} exhibitionPhotosArr - array of exhibition photo objects
 * @returns {Array} members - array of member objects
 */
export function buildMembers(exhibitionPhotosArr = []) {
  const map = new Map();

  for (const p of exhibitionPhotosArr) {
    const name = (p.name || "").trim() || "חבר ללא שם";
    const about = (p.about || "").trim();

    if (!map.has(name)) {
      map.set(name, { name, about, photos: [] });
    } else {
      // אם כבר יש about ריק ונכנס חדש לא ריק — נשמור אותו
      const m = map.get(name);
      if (!m.about && about) m.about = about;
    }

    map.get(name).photos.push({
      picture: p.picture || "/pictures/id_avatar_general.jpg",
      // אפשר להוסיף meta בעתיד: title, year, camera, etc
    });
  }

  return Array.from(map.values());
}


/**
 * Recursive function to generate exhibition photos DB
 * @param {string} dir - starting directory
 * @param {Array} files - array to accumulate photo objects
 * @returns {Array} files- array of photo objects 
 * Each photo object: { name: string, about: string, picture: string }
 */
export function genExhibitionPhotosArr(dir, files = []) {

  const fileList = fs.readdirSync(dir);

  // ---- leaf detection ----

  const hasSubDirs = fileList.some((file) => {
    if (file.includes(".DS_Store")) return false;
    const fullPath = path.join(dir, file);
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  });

  // =======================
  // LEAF FOLDER: read member.txt + collect pictures
  // =======================
  if (!hasSubDirs) {
    // find member.txt (must exist in leaf)
    const memberTxtName = fileList.find((f) => f.toLowerCase() === "member.txt");
    if (!memberTxtName) return files;

    const memberTxtPath = path.join(dir, memberTxtName);
    const content = fs.readFileSync(memberTxtPath, "utf8");

    let memberName = "";
    let memberAbout = "";
    let collectingAbout = false;

    for (const rawLine of content.split(/\r?\n/)) {

      if (rawLine.startsWith("שם:")) {
        memberName = rawLine.replace("שם:", "").trim();
        collectingAbout = false;
        continue;
      }

      if (rawLine.startsWith("אודות:")) {
        memberAbout = rawLine.replace("אודות:", "").trim();
        collectingAbout = true;
        continue;
      }

      if (collectingAbout) {
        memberAbout += "\n" + rawLine.trim();
      }
    }


    // collect jpg/jpeg in this leaf
    for (const file of fileList) {
      if (file.includes(".DS_Store")) continue;
      if (file.startsWith("id_")) continue;
      if (file.toLowerCase() === "member.txt") continue;

      const lower = file.toLowerCase();
      if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) continue;

      const fullPath = path.join(dir, file);

      // convert to web path like you did
      const normalized = fullPath.replace(/\\/g, "/");
      const webPath = normalized.split("/public")[1];

      files.push({
        name: memberName,
        about: memberAbout,
        picture: webPath,
      });
    }

    return files;
  }

  // =======================
  // NOT LEAF: recurse into subfolders
  // =======================
  for (const file of fileList) {
    if (file.includes(".DS_Store")) continue;
    if (file.startsWith("id_")) continue;

    const name = path.join(dir, file);

    if (fs.statSync(name).isDirectory()) {
      genMembersPhotosArr(name, files);
    }
  }

  return files;
}

/****************************************************************************************************
 * Recursively collect member photos, preserving photographer and series names.
 * The initial call only needs dir; recursive calls also pass files and photographerName.
 * @param {string} dir - starting directory
 * @param {Array} [files=[]] - shared array to accumulate photo objects during recursion
 * @param {string|null} [photographerName=null] - photographer name inherited from a parent folder
 * @returns {Array} Photo objects with name, photographerName, seriesName, about, and picture
 ******************************************************************************************************/
//export function genMembersPhotosArr(dir, files = [], photographerName = null) {

export function genMembersPhotosArr(dir, files = [], photographerName = null, imageBaseUrl = "") {

  const fileList = fs.readdirSync(dir);

  // ---------------------------------------------------------
  // Read member.txt in the CURRENT folder, if it exists.
  //
  // At member level:
  //   שם = photographer name
  //
  // At series level:
  //   שם = series name
  // ---------------------------------------------------------
  const memberTxtFilename = fileList.find(
    (f) => f.toLowerCase() === "member.txt"
  );

  let currentName = "";
  let currentAbout = "";

  if (memberTxtFilename) {
    const memberTxtPath = path.join(dir, memberTxtFilename);
    const content = fs.readFileSync(memberTxtPath, "utf8");

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (line.startsWith("שם:")) {
        currentName = line.replace("שם:", "").trim();
      } else if (line.startsWith("אודות:")) {
        currentAbout = line.replace("אודות:", "").trim();
      }
    }
  }

  /*
   * If we don't yet have a photographer name, and this folder
   * has a member.txt, then this is the photographer's folder.
   *
   * If photographerName already exists, currentName belongs
   * to a series folder.
   */
  const effectivePhotographerName =
    photographerName || currentName || "";

  // ---------------------------------------------------------
  // Check whether this folder contains subdirectories
  // ---------------------------------------------------------
  const hasSubDirs = fileList.some((file) => {
    if (file.includes(".DS_Store")) return false;

    const fullPath = path.join(dir, file);

    return (
      fs.existsSync(fullPath) &&
      fs.statSync(fullPath).isDirectory()
    );
  });


  // =========================================================
  // LEAF FOLDER
  // =========================================================
  if (!hasSubDirs) {

    /*
     * If photographerName was already supplied by the parent,
     * this leaf is a series folder and currentName is the
     * series name.
     *
     * Otherwise this is a normal member folder with no series.
     */
    const seriesName =
      photographerName && currentName
        ? currentName
        : "";

    // Collect jpg/jpeg files in this leaf
    for (const file of fileList) {

      if (file.includes(".DS_Store")) continue;
      if (file.startsWith("id_")) continue;
      if (file.toLowerCase() === "member.txt") continue;

      const lower = file.toLowerCase();

      if (
        !lower.endsWith(".jpg") &&
        !lower.endsWith(".jpeg")
      ) continue;

      const fullPath = path.join(dir, file);

      // Convert filesystem path to web path
      const normalized = fullPath.replace(/\\/g, "/");
      const localWebPath = normalized.split("/public")[1];

      // If Cloudflare base URL exists, use it
      const webPath = imageBaseUrl
        ? `${imageBaseUrl}${localWebPath}`
        : localWebPath;

      files.push({
        // Keep "name" for compatibility with current EJS
        name: effectivePhotographerName,

        // Explicit fields for future use
        photographerName: effectivePhotographerName,
        seriesName: seriesName,

        about: currentAbout,
        picture: webPath,
      });
    }

    return files;
  }


  // =========================================================
  // NOT LEAF — recurse into subfolders
  // =========================================================
  for (const file of fileList) {

    if (file.includes(".DS_Store")) continue;
    if (file.startsWith("id_")) continue;

    const name = path.join(dir, file);

    if (fs.statSync(name).isDirectory()) {
      genMembersPhotosArr(
        name,
        files,
        effectivePhotographerName || photographerName,
        imageBaseUrl
      );
    }
  }

  return files;
}

/**
 * Convert YouTube URL to embed URL
 * @param {string} url - original YouTube URL
 * @returns {string|null} - embed URL or null if invalid
 */
export function youtubeEmbed(url) {
  if (!url) return null;

  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([^?&]+)/
  );

  if (!match) return null;

  return `https://www.youtube.com/embed/${match[1]}`;
}
