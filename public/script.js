document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("submit-form");

  // Answer checkbox handling
  document.querySelectorAll(".answer-checkbox").forEach(cb => {
    cb.addEventListener("change", async (e) => {
      const qid = e.target.dataset.qid;
      const index = e.target.dataset.index;
      const value = e.target.value;

      // Uncheck others in the group
      document.querySelectorAll(`input[name="q${index}"]`).forEach(el => {
        if (el !== e.target) el.checked = false;
      });

      await saveAnswer(qid, value);
      markButtonAnswered(index, true);
    });
  });

  // Integer answer handling
  document.querySelectorAll(".integer-input").forEach(input => {
    input.addEventListener("change", async (e) => {
      const qid = e.target.dataset.qid;
      const index = e.target.dataset.index;
      const value = e.target.value.trim();
      if (value) {
        await saveAnswer(qid, value);
        markButtonAnswered(index, true);
      } else {
        await saveAnswer(qid, ""); // Clear answer
        markButtonAnswered(index, false);
      }
    });
  });

  // Populate question IDs before submit
  form.addEventListener("submit", () => {
    document.getElementById("question-ids").value = JSON.stringify(QUESTION_IDS);
  });

  // Start the timer
  startTimer(TIMER_DURATION_MS);
});

// Save answer to server
async function saveAnswer(questionId, answer) {
  try {
    await fetch("/submit-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, answer }),
    });
  } catch (err) {
    console.error("Failed to save answer:", err);
  }
}

// Highlight nav button when answered
function markButtonAnswered(index, answered) {
  const btn = document.getElementById(`nav-btn-${index}`);
  if (btn) {
    if (answered) {
      btn.classList.add("answered");
    } else {
      btn.classList.remove("answered");
    }
  }
}

// Scroll to question
function scrollToQuestion(index) {
  const q = document.getElementById(`question-${index}`);
  if (q) q.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Timer function
function startTimer(durationMs) {
  let remaining = durationMs;

  const timerEl = document.getElementById("timer");

  const interval = setInterval(() => {
    const hrs = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);

    timerEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (remaining <= 0) {
      clearInterval(interval);
      alert("Time is up! Submitting your test...");

      document.getElementById("question-ids").value = JSON.stringify(QUESTION_IDS);

      document.getElementById("submit-form").submit();
    }


    remaining -= 1000;
  }, 1000);
}

document.querySelectorAll(".clear-button").forEach(btn => {
  btn.addEventListener("click", async () => {
    const qid = btn.dataset.qid;
    const index = btn.dataset.index;

    // Uncheck checkboxes
    document.querySelectorAll(`[data-qid='${qid}'].answer-checkbox`).forEach(cb => cb.checked = false);

    // Clear input
    const input = document.querySelector(`[data-qid='${qid}'].integer-input`);
    if (input) input.value = "";

    // Send blank answer
    await fetch("/submit-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: qid, answer: "" })
    });

    // Update nav button
    const navBtn = document.getElementById(`nav-btn-${index}`);
    if (navBtn) navBtn.classList.remove("answered");
  });
});
