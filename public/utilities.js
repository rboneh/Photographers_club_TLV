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

    const members = [
      ...new Set(
        exhibitionKeys
          .filter((key) => key.startsWith(exhibitionPrefix))
          .map((key) => {
            const relativePath = key.slice(exhibitionPrefix.length);
            const parts = relativePath.split("/");

            return parts.length > 1 ? parts[0] : null;
          })
          .filter(Boolean)
      ),
    ];

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

      const photoKeys = exhibitionKeys.filter((key) => {
        if (!key.startsWith(memberPrefix)) return false;

        const relativePath =
          key.slice(memberPrefix.length);

        // only files directly inside this participant folder
        if (relativePath.includes("/")) return false;

        const lower = relativePath.toLowerCase();

        return (
          lower.endsWith(".jpg") ||
          lower.endsWith(".jpeg")
        );
      });

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

/**
 *  Generate exhibitions DB for carousel view from exhibitionsDB    
 * @param {*} exhibitionsDB 
 * @returns 
 */
export function genExhibitsionsDB4Carousel(exhibitionsDB) {
  const exhibitionsCarouselDB = {};

  for (const [exhibitionKey, exhibitionObj] of Object.entries(exhibitionsDB)) {
    const exhibitionPhotosArr = [];

    for (const member of exhibitionObj.membersDB || []) {
      for (const picture of member.photos || []) {
        exhibitionPhotosArr.push({
          name: member.memberName,
          about: member.memberAbout,
          picture: picture,
        });
      }
    }

    exhibitionsCarouselDB[exhibitionKey] = {
      exhibitionName: exhibitionObj.exhibitionName,
      exhibitionAbout: exhibitionObj.exhibitionAbout,
      shuffle: exhibitionObj.shuffle,
      exhibitionPhotosArr,
    };
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
