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
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
}).then(() => {
  console.log("MongoDB connected.");
}).catch((err) => {
  console.error("MongoDB connection error:", err);
});

// Config
const SUBJECTS = ["p", "c", "m"];
const TIMER_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours
// const TIMER_DURATION_MS = 3 * 1000 * 60; // 3 hours

app.use("/questions", express.static(path.join(__dirname, "questions")));
const MCQ_COUNT_PER_SUBJECT = 20; // example value
const INTEGER_COUNT_PER_SUBJECT = 5;   // adjustable

function loadQuestions() {
  const questions = [];

  SUBJECTS.forEach((subj) => {
    // Paths to each type
    const mcqPath = path.join(__dirname, "questions", "mcq");
    const intPath = path.join(__dirname, "questions", "integer");

    // Filter & select MCQs
    const allMcq = fs.readdirSync(mcqPath).filter((f) => f.startsWith(subj + "_"));
    const selectedMcq = allMcq.slice(0, MCQ_COUNT_PER_SUBJECT);
    
    selectedMcq.forEach((file) => {
      const [subject, chapter, number, answerWithExt] = file.split("_");
      const answer = answerWithExt.split(".")[0];
      questions.push({
        id: file,
        subject,
        path: "/questions/mcq/" + file,
        answer,
        isInteger: false,
      });
    });

    // Filter & select Integer questions
    const allInt = fs.readdirSync(intPath).filter((f) => f.startsWith(subj + "_"));
    const selectedInt = allInt.slice(0, INTEGER_COUNT_PER_SUBJECT);
    selectedInt.forEach((file) => {
      const [subject, chapter, number, answerWithExt] = file.split("_");
      const answer = path.parse(answerWithExt).name;

      questions.push({
        id: file,
        subject,
        path: "/questions/integer/" + file,
        answer,
        isInteger: true,
      });
    });
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
  await Answer.findOneAndUpdate(
    { questionId },
    { answer, timestamp: new Date() },
    { upsert: true }
  );
  res.sendStatus(200);
});

// 5. Submit Test + Generate CSV
app.post("/submit", async (req, res) => {
  try {
    const rawIds = req.body.ids || "[]";
    const ids = JSON.parse(rawIds);

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).send("No question IDs provided.");
    }

    const answers = await Answer.find({ questionId: { $in: ids } });

    const csv = ["Question,Answer"];
    answers.forEach((a) => csv.push(`${a.questionId},${a.answer}`));
    const filePath = path.join(__dirname, "public", "answers.csv");
    fs.writeFileSync(filePath, csv.join("\n"));

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
      <head><title>Thank You</title></head>
      <body style="text-align:center; padding-top:50px;">
        <h1>Thank you for submitting the test!</h1>
        <a href="/answers.csv" download>Download Your Answers</a>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
