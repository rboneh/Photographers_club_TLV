import e from "express";
import fs from "fs";
// import { promises as fsPromises } from "fs";
import { join } from "path";
import path from "path";


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

/**
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
 */
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
  console.log(dbKeys);
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
 * Generate exhibitionsDB4Carousel - a simplified version of exhibitionsDB with only the info needed for the carousel and exhibition page
 * Each exhibition object in exhibitionsDB4Carousel includes:
 * - exhibitionName: from info.txt (or directory name if no info.txt)
 * - exhibitionAbout: from info.txt (or empty string if no info.txt)
 * - exhibitionPhotosArr: array of photo objects for this exhibition, each with name, about, picture
 * exhibitionsDB4Carousel structure:
 * {
 *   "exhibition1Key": {
 *     exhibitionName: "Exhibition 1",
 *     exhibitionAbout: "About Exhibition 1",
 *     exhibitionPhotosArr: [
 *       {
 *         name: "Member Name",
 *         about: "Member About",
 *         picture: "/path/to/photo.jpg"
 *       },
 *       ...
 *     ]
 *   },
 *   ...
 * }
 * @param {*} exhibistinsDB 
 * @returns 
 */
export function genExhibitsionsDB4Carousel(exhibistinsDB) {
  console.log("\n\nGenerating exhibitionsDB4Carousel...");

  const exhibitionsCarouselDB = {};

  for (const [exhibitionKey, exhibitionObj] of Object.entries(exhibistinsDB)) {
    console.log("exhibitionKey: ", exhibitionKey, "\nexhibitionObj:", Object.keys(exhibitionObj));

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
  console.log("\n\nGenerating exhibitionsDB4Grid...");
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

/**
 * Recursive function to generate exhibition photos DB
 * @param {string} dir - starting directory
 * @param {Array} files - array to accumulate photo objects
 * @returns {Array} files- array of photo objects 
 * Each photo object: { name: string, about: string, picture: string }
 */
export function genMembersPhotosArr(dir, files = []) {

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

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.startsWith("שם:")) memberName = line.replace("שם:", "").trim();
      else if (line.startsWith("אודות:")) memberAbout = line.replace("אודות:", "").trim();
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
