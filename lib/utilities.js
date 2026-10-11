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
  const keys = [];
  let continuationToken;

  do {
    const result = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET,
        Prefix: prefix,
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      })
    );

    for (const object of result.Contents || []) {
      keys.push(object.Key);
    }

    if (result.IsTruncated && !result.NextContinuationToken) {
      throw new Error(`Incomplete R2 listing for prefix: ${prefix}`);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

// R2 folder prefixes include a trailing slash.
function isJpeg(key) {
  return /\.jpe?g$/i.test(key);
}

function isIdPhoto(key) {
  return key.split("/").pop().toLowerCase().startsWith("id_");
}

function getDirectPhotoKeys(keys, prefix, { includeId = false } = {}) {
  return keys.filter((key) =>
    key.startsWith(prefix) &&
    !key.slice(prefix.length).includes("/") &&
    isJpeg(key) &&
    (includeId || !isIdPhoto(key))
  );
}

function getSubfolders(keys, prefix) {
  return [...new Set(keys
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length).split("/"))
    .filter((parts) => parts.length > 1 && parts[0])
    .map((parts) => parts[0]))];
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
    } = parseMemberTxt(memberText);

    const directPhotoKeys = getDirectPhotoKeys(memberKeys, memberPrefix, { includeId: true });
    const idPhotoKey = directPhotoKeys.find(isIdPhoto);
    const photos = directPhotoKeys
      .filter((key) => !isIdPhoto(key))
      .map((key) => `${r2BaseUrl}/${key}`);
    const seriesFolders = getSubfolders(memberKeys, memberPrefix);

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

      const seriesPhotoKeys = getDirectPhotoKeys(memberKeys, seriesPrefix);

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
      series: memberSeries,
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

  const keys = await listR2Keys("about_photo_pool/");

  const memberTxtKey = keys.find((key) =>
    key.toLowerCase().endsWith("/member.txt")
  );

  if (!memberTxtKey) return [];

  const memberText = await readR2Text(memberTxtKey);

  const {
    memberName: photographerName,
    memberAbout: pictureAbout,
  } = parseMemberTxt(memberText);

  const imageKeys = keys.filter((key) => isJpeg(key) && !isIdPhoto(key));

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

/** Build carousel photos from member data already loaded from R2. */
export function genMembersPhotosArr(membersDB) {
  const photos = [];

  for (const member of membersDB) {
    for (const picture of member.photos || []) {
      photos.push({
        name: member.memberName,
        photographerName: member.memberName,
        seriesName: "",
        about: member.memberAbout,
        picture,
      });
    }

    for (const series of Object.values(member.series || {})) {
      for (const picture of series.photos || []) {
        photos.push({
          name: member.memberName,
          photographerName: member.memberName,
          seriesName: series.seriesName,
          about: series.seriesAbout,
          picture,
        });
      }
    }
  }

  return photos;
}

/**
 *  Generate exhibitions database from Cloudflare R2 storage.
 * @param {*} exhibitionsList 
 * @param {*} exhibitionKeys 
 * @param {*} r2BaseUrl 
 * @returns 
 */
export async function genExhibitionsDBFromR2(
  exhibitionsList,
  exhibitionKeys,
  r2BaseUrl,
) {
  const exhibitionsDB = {};

  for (const exhibitionName of exhibitionsList) {
    const exhibitionPrefix = `exhibitions/${exhibitionName}/`;

    const aboutTxtKey = exhibitionKeys.find(
      (key) =>
        key.toLowerCase() ===
        `${exhibitionPrefix}about.txt`.toLowerCase()
    );

    let exhibitionTitle = exhibitionName;
    let exhibitionAbout = "";
    let shuffle = "none";

    if (aboutTxtKey) {
      const aboutText = await readR2Text(aboutTxtKey);

      const parsed = parseMemberTxt(aboutText);

      exhibitionTitle = parsed.memberName || exhibitionName;
      exhibitionAbout = parsed.memberAbout || "";
      shuffle = parsed.shuffle || "none";
    }

    const members = getSubfolders(exhibitionKeys, exhibitionPrefix);

    const membersDB = [];

    for (const memberFolder of members) {
      const memberPrefix =
        `${exhibitionPrefix}${memberFolder}/`;

      const memberTxtKey = exhibitionKeys.find(
        (key) =>
          key.toLowerCase() ===
          `${memberPrefix}member.txt`.toLowerCase()
      );

      let memberName = memberFolder;
      let memberAbout = "";

      if (memberTxtKey) {
        const memberText = await readR2Text(memberTxtKey);

        const parsed = parseMemberTxt(memberText);

        memberName = parsed.memberName || memberFolder;
        memberAbout = parsed.memberAbout || "";
      }

      const photoKeys = getDirectPhotoKeys(exhibitionKeys, memberPrefix, { includeId: false });

      membersDB.push({
        key: memberFolder,
        memberName,
        memberAbout,
        photos: photoKeys.map((key) => `${r2BaseUrl}/${key}`
        ),
      });
    }

    exhibitionsDB[exhibitionName] = {
      exhibitionName: exhibitionTitle,
      exhibitionAbout,
      shuffle,
      members,
      membersDB
    };
  }

  return exhibitionsDB;
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

/** Build exhibition grids directly from member records, preserving folder order. */
export function genExhibitionsDB4Grid(exhibitionsDB) {
  const exhibitionsDB4Grid = {};

  for (const [key, exhibition] of Object.entries(exhibitionsDB)) {
    const membersArr = (exhibition.membersDB || [])
      // Members without photos were also omitted by the previous grouping step.
      .filter((member) => member.photos?.length)
      .map((member) => ({
        name: (member.memberName || "").trim() || "חבר ללא שם",
        about: (member.memberAbout || "").trim(),
        photos: member.photos.map((picture) => ({
          picture: picture || "/pictures/id_avatar_general.jpg",
        })),
      }));

    exhibitionsDB4Grid[key] = {
      exhibitionName: exhibition.exhibitionName,
      exhibitionAbout: exhibition.exhibitionAbout,
      shuffle: exhibition.shuffle,
      membersArr,
    };
  }

  return exhibitionsDB4Grid;
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
