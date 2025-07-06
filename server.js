require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.set("view engine", "ejs");

// MongoDB Models
const AnswerSchema = new mongoose.Schema({
  questionId: String,
  answer: String,
  timestamp: { type: Date, default: Date.now },
});
const Answer = mongoose.model("Answer", AnswerSchema);

const TestSessionSchema = new mongoose.Schema({
  sessionId: String,
  startTime: { type: Date, default: Date.now },
});
const TestSession = mongoose.model("TestSession", TestSessionSchema);

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI, {}).then(() => {
  console.log("MongoDB connected.");
}).catch((err) => {
  console.error("MongoDB connection error:", err);
});

const TIMER_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

// mcq screnshot name -> image.png

const MCQ_COUNT_PER_SUBJECT = 20;
const INTEGER_COUNT_PER_SUBJECT = 5;
const test_folder = path.join(__dirname, "test1");

app.use("/questions", express.static(path.join(test_folder)));

const SUBJECTS = ["p", "c", "m"]; // define if not already

function loadQuestions() {
  const questions = [];

  SUBJECTS.forEach((subject) => {
    const mcqBase = path.join(test_folder, subject, "mcq");
    const intBase = path.join(test_folder, subject, "integer");

    // --- MCQ Questions ---
    for (let i = 1; i <= MCQ_COUNT_PER_SUBJECT; i++) {
      const qFolder = path.join(mcqBase, String(i));
      let found = false;

      for (const option of ["a", "b", "c", "d"]) {
        const optionPath = path.join(qFolder, option, "image.png");
        if (fs.existsSync(optionPath)) {
          const solTxt = path.join(qFolder, "solution", "solution.txt");
          let solutionLink = "";
          if (fs.existsSync(solTxt)) {
            try {
              solutionLink = fs.readFileSync(solTxt, "utf-8").trim();
            } catch (e) {
              console.warn(`Failed to read solution: ${solTxt}`);
            }
          }

          questions.push({
            id: `mcq-${subject}-${i}`,
            subject,
            path: `/questions/${subject}/mcq/${i}/${option}/image.png`,
            answer: option,
            isInteger: false,
            solutionLink,
          });

          found = true;
          break;
        }
      }

      if (!found) {
        console.warn(`No MCQ image found for ${subject} Q${i}`);
      }
    }

    // --- Integer Questions ---
    for (let i = 1; i <= INTEGER_COUNT_PER_SUBJECT; i++) {
      const qPath = path.join(intBase, String(i), "question");

      if (fs.existsSync(qPath)) {
        const files = fs.readdirSync(qPath).filter(f => f.endsWith(".png"));
        if (files.length > 0) {
          const file = files[0];
          const answer = path.parse(file).name;

          const solTxt = path.join(intBase, String(i), "solution", "solution.txt");
          let solutionLink = "";
          if (fs.existsSync(solTxt)) {
            try {
              solutionLink = fs.readFileSync(solTxt, "utf-8").trim();
            } catch (e) {
              console.warn(`Failed to read solution: ${solTxt}`);
            }
          }

          questions.push({
            id: `int-${subject}-${i}`,
            subject,
            path: `/questions/${subject}/integer/${i}/question/${file}`,
            answer,
            isInteger: true,
            solutionLink,
          });
        }
      }
    }
  });

  return questions;
}



app.get("/result", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId) return res.redirect("/start");

  const questions = loadQuestions();
  const answers = await Answer.find({}); // Optional: filter by sessionId

  const answerMap = {};
  answers.forEach((a) => (answerMap[a.questionId] = a.answer));

  let total = 0;
  const results = questions.map((q) => {
    const userAns = answerMap[q.id] || null;
    const correct = q.answer;
    let score = 0;

    if (userAns) {
      if (userAns === correct) score = 4;
      else score = -1;
    }

    total += score;

    return {
      ...q,
      userAnswer: userAns,
      correctAnswer: correct,
      score,
    };
  });

  res.render("result", { results, total });
});

// ROUTES

// 1. Start Page
app.get("/start", (req, res) => {
  res.render("start");
});

app.get("/reset", (req, res) => {
  res.clearCookie("sessionId");
  res.redirect("/start");
});
app.get("/hard-reset", async (req, res) => {
  try {
    await Answer.deleteMany({});
    await TestSession.deleteMany({});
    res.clearCookie("sessionId");
    res.redirect("/start");
  } catch (err) {
    console.error("Hard reset failed:", err);
    res.status(500).send("❌ Failed to reset database.");
  }

});


// 2. Begin Test (Set Cookie & Session)
app.get("/begin-test", async (req, res) => {
  let sessionId = req.cookies.sessionId;

  if (!sessionId) {
    sessionId = uuidv4();
    res.cookie("sessionId", sessionId, { httpOnly: true });
  }

  let existing = await TestSession.findOne({ sessionId });
  if (!existing) {
    await TestSession.create({ sessionId });
  }

  res.redirect("/test");
});

// 3. Test Page
app.get("/test", async (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (!sessionId) return res.redirect("/start");

  const session = await TestSession.findOne({ sessionId });
  if (!session) return res.redirect("/start");

  const elapsed = Date.now() - new Date(session.startTime).getTime();
  const remaining = Math.max(0, TIMER_DURATION_MS - elapsed);

  const questions = loadQuestions();
  const answers = await Answer.find({}); // Optional: Filter by sessionId if multi-user

  const answerMap = {};
  answers.forEach((a) => (answerMap[a.questionId] = a.answer));

  res.render("index", {
    questions,
    duration: remaining,
    savedAnswers: answerMap,
  });
});

// 4. Submit an Answer (AJAX)
app.post("/submit-answer", async (req, res) => {
  const { questionId, answer } = req.body;
  console.log(`Received answer for question ${questionId}: ${answer}`);
  await Answer.findOneAndUpdate(
    { questionId },
    { answer, timestamp: new Date() },
    { upsert: true }
  );
  res.sendStatus(200);
});

// 5. Submit Test 
app.post("/submit", async (req, res) => {
  try {
    const rawIds = req.body.ids || "[]";
    const ids = JSON.parse(rawIds);

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).send("No question IDs provided.");
    }

    const sessionId = req.cookies.sessionId;
    if (!sessionId) {
      return res.status(400).send("Session ID missing.");
    }

    // Set remaining time to 0 (store submission time)
    await TestSession.findOneAndUpdate(
      { sessionId },
      { startTime: new Date(Date.now() - TIMER_DURATION_MS) } // This will make remaining = 0
    );

    res.redirect("/thankyou");
  } catch (err) {
    console.error("Error during submission:", err.message);
    res.status(500).send("Error processing answers.");
  }
});

// 6. Thank You Page
app.get("/thankyou", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Thank You</title>
        <style>
          body {
            text-align: center;
            padding-top: 50px;
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
          }
          h1 {
            color: #333;
          }
          .button-link {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-size: 16px;
            transition: background-color 0.3s;
          }
          .button-link:hover {
            background-color: #45a049;
          }
        </style>
      </head>
      <body>
        <h1>Thank you for submitting the test!</h1>
        <a class="button-link" href="/result">See Your Result</a>
      </body>
    </html>
  `);
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
//https://dashboard.render.com/web/srv-d1klmr3e5dus73eo9og0/deploys/dep-d1km952dbo4c73a1v9r0

