const fs = require("fs");
const path = require("path");

const SUBJECTS = ["p", "c", "m"];
const BASE_PATH = path.join(__dirname, "test1");

const MCQ_FOLDERS = ["a", "b", "c", "d", "solution"];
const INTEGER_FOLDERS = ["question", "solution"];

const TOTAL_MCQ_SETS = 20;
const TOTAL_INTEGER_SETS = 5;

// Helper to create folder and (optionally) write solution.txt
function createFolder(folderPath, addLinkFile = false) {
  fs.mkdirSync(folderPath, { recursive: true });
  if (addLinkFile) {
    const linkFile = path.join(folderPath, "solution.txt");
    fs.writeFileSync(linkFile, "", "utf8");
  }
}

SUBJECTS.forEach((subject) => {
  const subjectPath = path.join(BASE_PATH, subject);

  // MCQ
  const mcqBase = path.join(subjectPath, "mcq");
  for (let i = 1; i <= TOTAL_MCQ_SETS; i++) {
    const setPath = path.join(mcqBase, String(i));
    MCQ_FOLDERS.forEach((folder) => {
      const fullPath = path.join(setPath, folder);
      const isSolution = folder === "solution";
      createFolder(fullPath, isSolution);
    });
  }

  // Integer
  const intBase = path.join(subjectPath, "integer");
  for (let i = 1; i <= TOTAL_INTEGER_SETS; i++) {
    const setPath = path.join(intBase, String(i));
    INTEGER_FOLDERS.forEach((folder) => {
      const fullPath = path.join(setPath, folder);
      const isSolution = folder === "solution";
      createFolder(fullPath, isSolution);
    });
  }

  console.log(`✅ Setup complete for subject: ${subject}`);
});

console.log("🎉 All folders + solution.txt files created!");
