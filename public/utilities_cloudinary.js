import { promises as fsp } from "fs";
import fs from "fs"; // only for existsSync (small + safe)
import path from "path";
import { join } from "path";

import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * getFiles - unified API
 * - Local: returns "/members/..../file.jpg" (web path after /public)
 * - Cloudinary: returns "https://res.cloudinary.com/.../image/upload/....jpg" (secure_url)
 */
export async function getFiles(dirOrPrefix, files = []) {
  const isCloudinary = process.env.MEDIA_BACKEND === "cloudinary";
  return isCloudinary
    ? getFilesCloudinary(dirOrPrefix, files)
    : getFilesLocal(dirOrPrefix, files);
}

/* ---------------- LOCAL VERSION ---------------- */

async function getFilesLocal(dir, files = []) {
  let fileList;
  try {
    fileList = await fsp.readdir(dir);
  } catch {
    return files;
  }

  for (const file of fileList) {
    if (file.includes(".DS_Store")) continue;
    if (file.startsWith("id_")) continue;

    const full = join(dir, file);

    let stat;
    try {
      stat = await fsp.stat(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      await getFilesLocal(full, files);
    } else {
      const lower = file.toLowerCase();
      if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) continue;

      const normalized = full.replace(/\\/g, "/");
      const parts = normalized.split("/public");
      if (parts.length < 2) continue;

      files.push(parts[1]); // "/members/..."
    }
  }

  return files;
}

/* ---------------- CLOUDINARY VERSION ---------------- */

export async function getFilesCloudinary(prefix, files = []) {
  const members = await listFolders("tlv_club/members");
  const test = await cloudinary.api.resources_by_asset_folder(
  "tlv_club/members/Moshe Gros",
  { resource_type: "image", max_results: 10 }
);

console.log("test resources: ", test.resources.map(r => r.public_id));
  for (const member of members) {
    const memberPrefix = `${prefix}/${member}`;
    try {
      const res = await cloudinary.api.resources({
        type: "upload",
        prefix: memberPrefix,
        max_results: 500,
      });

      for (const resource of res.resources) {
        const publicId = resource.public_id; // e.g., "tlv_club/members/Member1/photo1"
        const url = cloudinary.url(publicId, { secure: true });
        files.push(url);
      }
    } catch (e) {
      console.error("Cloudinary getFilesCloudinary failed:", e);
    }
  }

  return files;
}


/**
 * listFolders - list subfolder names under given Cloudinary prefix
 * @param {string} prefix - Cloudinary folder prefix
 * @returns {Array} - array of folder names
 */
export async function listFolders(prefix) {
  try {
    const res = await cloudinary.api.sub_folders(prefix);
    return (res.folders || []).map((f) => f.name);
  } catch (e) {
    console.error("Cloudinary listFolders failed:", e);
    return [];
  }
}
/**
 * genMembersDB
 * returns: [{ key, idPhoto, photos, memberName, memberAbout }, ...]
 */
export async function genMembersDB(membersKeysArray, membersDir) {
  const membersDB = [];

  for (const memberKey of membersKeysArray) {
    const memberDirPath = join(membersDir, memberKey);

    const memberPhotos = await getFiles(memberDirPath);

    // find id_*.jpg only in this folder (not recursive)
    let idPhoto = null;
    try {
      const allFiles = await fsp.readdir(memberDirPath);
      const idFile = allFiles.find(
        (f) => f.toLowerCase().startsWith("id_") && f.toLowerCase().endsWith(".jpg")
      );

      if (idFile) {
        const fullPath = join(memberDirPath, idFile).replace(/\\/g, "/");
        const parts = fullPath.split("/public");
        if (parts.length >= 2) idPhoto = parts[1];
      }
    } catch {
      // ignore
    }

    const { memberName, memberAbout } = await readMemberTxtIfExists(memberDirPath);

    membersDB.push({
      key: memberKey,
      idPhoto,
      photos: memberPhotos,
      memberName,
      memberAbout,
    });
  }

  return membersDB;
}

/**
 * genExhibitionsDB(exhibitionsListArr, exhibitionDir)
 * returns object keyed by exhibition folder name
 */
export async function genExhibitionsDB(exhibitionsListArr, exhibitionDir) {
  const exhibitionsDB = {};

  for (const exhibition of exhibitionsListArr) {
    const exhibitionDirPath = join(exhibitionDir, exhibition);

    // list member folders inside exhibition folder
    let foldersList = [];
    try {
      foldersList = await fsp.readdir(exhibitionDirPath);
    } catch {
      continue;
    }

    const membersList = [];
    for (const name of foldersList) {
      if (name === ".DS_Store") continue;
      const full = join(exhibitionDirPath, name);
      try {
        const st = await fsp.stat(full);
        if (st.isDirectory()) membersList.push(name);
      } catch {
        // ignore
      }
    }

    const { memberName: exhibitionName, memberAbout: exhibitionAbout } =
      await readMemberTxtIfExists(exhibitionDirPath, "about.txt");

    const exhibitionMembersDb = await genMembersDB(membersList, exhibitionDirPath);

    exhibitionsDB[exhibition] = {
      exhibitionURL: exhibitionDirPath,
      exhibitionName,
      exhibitionAbout,
      members: membersList,
      membersDB: exhibitionMembersDb,
    };
  }

  return exhibitionsDB;
}

/**
 * shuffle array in place (same as you had)
 */
export function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * (kept) sync reader (if you still want it)
 */
export function readFileSynchronously(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(error);
    return null;
  }
}

/**
 * (kept) date string helper
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
  let s = formattedDate.replace(",", "-");
  s = s.replaceAll(":", "");
  s = s.replaceAll(" ", "");
  s = s.replaceAll("/", "-");
  return s;
}

/**
 * Build a smaller DB for your exhibition carousel pages
 */
export async function genExhibitsionsDB4Carousel(exhibistinsDB) {
  const exhibitionsCarouselDB = {};

  for (const [exhibitionKey, exhibitionObj] of Object.entries(exhibistinsDB)) {
    const exhibitionPhotosArr = await genExhibitionPhotosArr(exhibitionObj.exhibitionURL);

    exhibitionsCarouselDB[exhibitionKey] = {
      exhibitionName: exhibitionObj.exhibitionName,
      exhibitionAbout: exhibitionObj.exhibitionAbout,
      exhibitionPhotosArr,
    };
  }

  return exhibitionsCarouselDB;
}

/**
 * Exhibition photos array:
 * Each entry: { name, about, picture }
 */
export async function genExhibitionPhotosArr(dir, files = []) {
  let fileList;
  try {
    fileList = await fsp.readdir(dir);
  } catch {
    return files;
  }

  // detect subdirs
  let hasSubDirs = false;
  for (const file of fileList) {
    if (file.includes(".DS_Store")) continue;
    const fullPath = path.join(dir, file);
    try {
      const st = await fsp.stat(fullPath);
      if (st.isDirectory()) {
        hasSubDirs = true;
        break;
      }
    } catch {
      // ignore
    }
  }

  // LEAF: read member.txt + collect jpgs
  if (!hasSubDirs) {
    const memberTxtName = fileList.find((f) => f.toLowerCase() === "member.txt");
    if (!memberTxtName) return files;

    const memberTxtPath = path.join(dir, memberTxtName);

    let content = "";
    try {
      content = await fsp.readFile(memberTxtPath, "utf8");
    } catch {
      return files;
    }

    const { memberName, memberAbout } = parseMemberTxt(content);

    for (const file of fileList) {
      if (file.includes(".DS_Store")) continue;
      if (file.startsWith("id_")) continue;
      if (file.toLowerCase() === "member.txt") continue;

      const lower = file.toLowerCase();
      if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) continue;

      const fullPath = path.join(dir, file).replace(/\\/g, "/");
      const parts = fullPath.split("/public");
      if (parts.length < 2) continue;

      files.push({
        name: memberName,
        about: memberAbout,
        picture: parts[1],
      });
    }

    return files;
  }

  // NOT LEAF: recurse
  for (const file of fileList) {
    if (file.includes(".DS_Store")) continue;
    if (file.startsWith("id_")) continue;

    const next = path.join(dir, file);
    try {
      const st = await fsp.stat(next);
      if (st.isDirectory()) {
        await genExhibitionPhotosArr(next, files);
      }
    } catch {
      // ignore
    }
  }

  return files;
}

/**
 * Members photos array for main carousel:
 * Each entry: { name, about, picture }
 */
export async function genMembersPhotosArr(dir, files = []) {
  let fileList;
  try {
    fileList = await fsp.readdir(dir);
  } catch {
    return files;
  }

  // detect subdirs
  let hasSubDirs = false;
  for (const file of fileList) {
    if (file.includes(".DS_Store")) continue;
    const fullPath = path.join(dir, file);
    try {
      const st = await fsp.stat(fullPath);
      if (st.isDirectory()) {
        hasSubDirs = true;
        break;
      }
    } catch {
      // ignore
    }
  }

  // LEAF
  if (!hasSubDirs) {
    const memberTxtName = fileList.find((f) => f.toLowerCase() === "member.txt");
    if (!memberTxtName) return files;

    const memberTxtPath = path.join(dir, memberTxtName);

    let content = "";
    try {
      content = await fsp.readFile(memberTxtPath, "utf8");
    } catch {
      return files;
    }

    const { memberName, memberAbout } = parseMemberTxt(content);

    for (const file of fileList) {
      if (file.includes(".DS_Store")) continue;
      if (file.startsWith("id_")) continue;
      if (file.toLowerCase() === "member.txt") continue;

      const lower = file.toLowerCase();
      if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg")) continue;

      const fullPath = path.join(dir, file).replace(/\\/g, "/");
      const parts = fullPath.split("/public");
      if (parts.length < 2) continue;

      files.push({
        name: memberName,
        about: memberAbout,
        picture: parts[1],
      });
    }

    return files;
  }

  // NOT LEAF: recurse into *itself* (bugfix vs your current code)
  for (const file of fileList) {
    if (file.includes(".DS_Store")) continue;
    if (file.startsWith("id_")) continue;

    const next = path.join(dir, file);
    try {
      const st = await fsp.stat(next);
      if (st.isDirectory()) {
        await genMembersPhotosArr(next, files);
      }
    } catch {
      // ignore
    }
  }

  return files;
}

// ----------------- internal helpers -----------------

async function readMemberTxtIfExists(memberDirPath, fileName = "member.txt") {
  const filePath = join(memberDirPath, fileName);

  if (!fs.existsSync(filePath)) {
    return { memberName: null, memberAbout: null };
  }

  try {
    const text = await fsp.readFile(filePath, "utf8");
    return parseMemberTxt(text);
  } catch {
    return { memberName: null, memberAbout: null };
  }
}

function parseMemberTxt(text) {
  const lines = text.split(/\r?\n/);

  let memberName = "";
  let memberAbout = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const nameMatch = line.match(/^שם\s*[:：]\s*(.*)$/);
    if (nameMatch) {
      memberName = nameMatch[1].trim();
      continue;
    }

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
