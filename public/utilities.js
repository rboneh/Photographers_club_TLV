import fs from "fs";
import { format } from "path";
import { promises as fsPromises } from "fs";
import { join } from "path";

/**
 * Recursive function to get all files down the folder tree
 * @param {string} dir - starting directory
 * @param {Array} files - array to accumulate file paths
 * @returns {Array} files- array of file paths 
 * 
 * getFiles is synchronous read. Need to be change to async. 
 */
export function getFiles(dir, files = []) {
  const fileList = fs.readdirSync(dir);

  for (const file of fileList) {
    // ⛔ ignore macOS metadata files
    if (file.includes(".DS_Store")) continue;

    const name = `${dir}/${file}`;
    // This is the recursive part. If the file is a directory,
    // we call the same function again
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
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
 *getMembersDB generate db in the form of
 {key: string, memberName: string, memberAbout: stringphotos: Array}
 * @param   {Array} membersKeysArray - array of member keys
 * @param   {string} membersDir - path to members directory
 * @returns {Array} - members database array
 */
export function genMembersDB(membersKeysArray, membersDir) {
  const membersDB = [];

  membersKeysArray.forEach(memberKey => {
    const memberDirPath = join(membersDir, memberKey);
    const memberPhotos = getFiles(memberDirPath);

    const { memberName, memberAbout } = readMemberTxtIfExists(memberDirPath);


    const memberData = {
      key: memberKey,
      photos: memberPhotos,
      memberName,
      memberAbout
    };

    membersDB.push(memberData);
  });

  return membersDB;
}

/**
 *shuffle array in place
 * @param {Array} arr - array to shuffle
 * @returns {Array} - shuffled array 
 */
export function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // pick index 0..i
    [arr[i], arr[j]] = [arr[j], arr[i]];           // swap
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
 * @returns { memberName: string, memberAbout: string  }
 */
function readMemberTxtIfExists(memberDirPath) {
  const filePath = join(memberDirPath, "member.txt");

  if (!fs.existsSync(filePath)) {
    return { memberName: null, memberAbout: null };
  }

  try {
    const text = fs.readFileSync(filePath, "utf8");
    return parseMemberTxt(text);
  } catch {
    return { memberName: null, memberAbout: null };
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();   // removes leading spaces/tabs

    // match: שם : משה גרוס
    const nameMatch = line.match(/^שם\s*[:：]\s*(.*)$/);
    if (nameMatch) {
      memberName = nameMatch[1].trim();
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

  return { memberName, memberAbout };
}