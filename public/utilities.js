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

export function makeTableBody(fileList, blogsId) {
  let lines = [];
  let line = "";
  let tableBody = "";

  for (let fn in fileList) {
    if (fileList[fn].includes("blog-")) {
      let fileContent = readFileSynchronously(fileList[fn]);
      lines = fileContent.split("\n");
      line = makeTableLine(lines.slice(0, 1), lines[1], lines[2], blogsId, fn);
      tableBody += line;
    }
  }

  let fullTable = `
    <div class="container p-5 my-5 border">
      <div class="container">
        <div class="row row-cols-2">
          <div class="col-6"><h1>Photography</h1></div>
          <div class="col"> 
            <form id="addButtonForm" action="/blog-form" method="GET"></form>
            <button id="addButton" type="button" class="btn btn-primary">Add</button>
          </div>
        </div>

        <!---------- Table  ------------>
        <table id="dataTable" class="table table-striped">
          <thead class="table-primary">
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Date</th>
              <th scope="col">Author</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            ${tableBody}
          </tbody>
        </table>
      </div>
    </div>

    <script>
      const addButton = document.getElementById('addButton');
    
      addButton.addEventListener('click', () => {
        const addButtonForm = document.getElementById('addButtonForm');
        addButtonForm.submit();
      });
      
    </script>
  `;

  return fullTable;
}

export function makeTableLine(title, date, author, blogsId, n) {
  const lname = blogsId + n;
  const line = `
        <tr>
          <td>
            <form  id="${lname}" action="/get-blog" method="POST">
            <input type="hidden" name="blogsId" value="${blogsId}"/>
            <input type="hidden" name="fileName" value="blog-${title}"/>
            <input type="hidden" name="fileDate" value="${date}"/>
              <input type="submit" value="${title}" />
            </form>
          </td>
          <td>${date}</td>
          <td>${author}</td>
          <td><button type="button" class="btn btn-light btn-delete">Delete</button></td>
        </tr>`;
  // <td><a href=./blogs/${blogsId}/blog_template.txt"></a>${title}</td>

  return line;
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

export function createBlogFile(formData, dirName) {
  // formData.postId;
  // formData.blogTitle;
  // formData.authorEmail;
  // formData.authorName;
  // formData.blogText;

  //replacing <br> back to new lines
  const originalBlogText = formData.blogText.replace(/<br>/g, "\n");

  //preparing date for blog and file name
  const currentDate = new Date();
  const options = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  };
  const formattedDate = currentDate.toLocaleString("en-UK", options);
  const dateForFileName = date4fileName(currentDate);

  const blogFileName =
    "blog-" + formData.blogTitle + "-" + dateForFileName + ".txt";

  const newBlog =
    formData.blogTitle +
    "\n" +
    formattedDate +
    "\n" +
    formData.authorName +
    "\nBlog begin here\n" +
    "<h1>Current Date and Time: <%= new Date() %></h1>\n" +
    originalBlogText;

  // const filePath = `${dirName}/views/blogs/${formData.postId}/${blogFileName}.txt`;
  // const filePath = join(dirName, 'views', 'blogs', formData.postId, `${blogFileName}.txt`);
  const filePath = `views/blogs/${formData.postId}/` + blogFileName;

  return {filePath: filePath, nBlog: newBlog};
  // fs.writeFile(filePath, newBlog, function (err) {
  //   if (err) throw err;
  //   console.log("Saved!");
  // });
}

export function formatBlog(blog) {
  const lines = blog.split("\n");
  const fBlog = `
  <div class="container p-5 my-5 border">
  <h1>${lines.slice(0, 1)}</h1>
  <h4> Author: ${lines[2]} </h4>
  <hr>
  <p> ${lines.slice(5)} </p>
  </div>
  `;
  return fBlog;
}
