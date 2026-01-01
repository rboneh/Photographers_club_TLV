import fs from "fs";
import { format } from "path";
import { promises as fsPromises } from "fs";
import { join } from "path";

// Recursive function to get files
export function getFiles(dir, files = []) {
  // Get an array of all files and directories in the passed directory using fs.readdirSync
  const fileList = fs.readdirSync(dir);
  // Create the full path of the file/directory by concatenating the passed directory and file/directory name
  for (const file of fileList) {
    const name = `${dir}/${file}`;
    // Check if the current file/directory is a directory using fs.statSync
    if (fs.statSync(name).isDirectory()) {
      // If it is a directory, recursively call the getFiles function with the directory path and the files array
      getFiles(name, files);
    } else {
      // If it is a file, push the full path to the files array
      files.push(name);
    }
  }
  return files;
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
