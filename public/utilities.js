import fs from "fs";
import { format } from "path";
import { promises as fsPromises } from "fs";
import { join } from "path";

// Recursive function to get files
export function getFiles(dir, files = []) {
  const fileList = fs.readdirSync(dir);

  for (const file of fileList) {
    // ⛔ ignore macOS metadata files
    if (file.includes(".DS_Store")) continue;

    const name = `${dir}/${file}`;

    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else {
      // convert to web path
      const normalized = name.replace(/\\/g, "/"); // for Windows compatibility
      const webPath = normalized.split("/public")[1];
      files.push(webPath);
    }
  }

  return files;
}


export function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1)); // pick index 0..i
    [arr[i], arr[j]] = [arr[j], arr[i]];           // swap
  }
  return arr;
}

export function readFileSynchronously(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    // console.log(fileContent);
    return fileContent;
  } catch (error) {
    console.error(error);
  }
}



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
