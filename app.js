const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SEMESTER_MONTHS = [
  [8,9,10,11], [0,1,2,3,4,5], [8,9,10,11], [0,1,2,3,4,5], [8,9,10,11], [0,1,2,3,4,5]
];
const DB_NAME = "study-planner-db";
const STORE_NAME = "tasks";
let db;
let selectedSemester = 0;
let selectedMonth = 8; // September
let tasks = [];
let filesToRemove = new Set();

const $ = (id) => document.getElementById(id);
const semesterTabs = $("semester-tabs");
const monthTabs = $("month-tabs");
const taskList = $("task-list");
const emptyState = $("empty-state");
const dialog = $("task-dialog");

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function storeTask(task) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(task);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function deleteStoredTask(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function loadTasks() {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
function monthsForSemester(index) { return SEMESTER_MONTHS[index]; }
function semesterForMonth(month) {
  return SEMESTER_MONTHS[selectedSemester].includes(month);
}
function renderSemesters() {
  semesterTabs.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const months = SEMESTER_MONTHS[i];
    const first = MONTHS[months[0]].slice(0,3);
    const last = MONTHS[months[months.length - 1]].slice(0,3);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `semester-tab${i === selectedSemester ? " active" : ""}`;
    button.setAttribute("aria-pressed", String(i === selectedSemester));
    button.innerHTML = `<span class="tab-number">SEMESTER 0${i+1}</span><span class="tab-name">Semester ${i+1}</span><span class="tab-date">${first} – ${last}</span>`;
    button.addEventListener("click", () => {
      selectedSemester = i;
      selectedMonth = monthsForSemester(i)[0];
      renderAll();
    });
    semesterTabs.appendChild(button);
  }
}
function renderMonths() {
  monthTabs.innerHTML = "";
  monthsForSemester(selectedSemester).forEach(monthIndex => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `month-tab${monthIndex === selectedMonth ? " active" : ""}`;
    button.textContent = MONTHS[monthIndex];
    button.setAttribute("aria-pressed", String(monthIndex === selectedMonth));
    button.addEventListener("click", () => {
      selectedMonth = monthIndex;
      renderAll();
    });
    monthTabs.appendChild(button);
  });
}
function getTasksForMonth() {
  return tasks.filter(task => {
    const date = new Date(`${task.date}T12:00:00`);
    return date.getMonth() === selectedMonth && monthsForSemester(selectedSemester).includes(date.getMonth());
  }).sort((a,b) => a.date.localeCompare(b.date));
}
function renderProgress(monthTasks) {
  const total = monthTasks.length;
  const completed = monthTasks.filter(t => t.status === "Completed").length;
  const percent = total ? Math.round(completed / total * 100) : 0;
  $("progress-month-label").textContent = `${MONTHS[selectedMonth]} progress`;
  $("progress-number").textContent = `${percent}%`;
  $("progress-count").textContent = `${completed} of ${total} completed`;
  $("progress-fill").style.width = `${percent}%`;
  $("progress-track").setAttribute("aria-valuenow", String(percent));
}
function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}
function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return { day: date.getDate(), month: MONTHS[date.getMonth()].slice(0,3) };
}
function renderTasks() {
  const monthTasks = getTasksForMonth();
  renderProgress(monthTasks);
  const filter = $("status-filter").value;
  const visibleTasks = monthTasks.filter(task => filter === "all" || task.status === filter);
  taskList.innerHTML = "";
  emptyState.hidden = visibleTasks.length !== 0;
  taskList.hidden = visibleTasks.length === 0;
  if (monthTasks.length === 0) {
    emptyState.querySelector("h3").textContent = "A fresh page";
    emptyState.querySelector("p").textContent = `No reading tasks for ${MONTHS[selectedMonth]} yet. Add your first task and make a plan that works for you.`;
  } else if (visibleTasks.length === 0) {
    emptyState.querySelector("h3").textContent = "No tasks match this filter";
    emptyState.querySelector("p").textContent = "Try another status to see your reading tasks.";
  }
  visibleTasks.forEach(task => {
    const date = formatDate(task.date);
    const card = document.createElement("article");
    card.className = "task-card";
    const filesMarkup = (task.files || []).map((file, index) =>
      `<span class="task-attachment">↳ ${safeText(file.name)}</span>`).join("");
    const linkMarkup = task.url ? `<a href="${safeText(task.url)}" target="_blank" rel="noopener noreferrer">↗ Open reading link</a>` : "";
    card.innerHTML = `
      <div class="task-date"><span class="day">${date.day}</span><span class="month-short">${date.month}</span></div>
      <div class="task-main">
        <p class="task-subject">${safeText(task.subject)}</p>
        <p class="task-reading">${safeText(task.reading)}</p>
        <div class="task-links">${linkMarkup}${filesMarkup}</div>
      </div>
      <div class="task-actions">
        <select class="status-select" aria-label="Status for ${safeText(task.subject)}" data-status-id="${task.id}">
          <option ${task.status==="Not started"?"selected":""}>Not started</option>
          <option ${task.status==="In progress"?"selected":""}>In progress</option>
          <option ${task.status==="Completed"?"selected":""}>Completed</option>
        </select>
        <div class="card-buttons">
          <button class="text-button" type="button" data-edit-id="${task.id}">Edit</button>
          <button class="text-button" type="button" data-delete-id="${task.id}">Delete</button>
        </div>
      </div>`;
    // Downloadable attachments are created from IndexedDB Blobs, not permanent public URLs.
    const attachmentContainer = card.querySelector(".task-links");
    (task.files || []).forEach(file => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(file.blob);
      link.download = file.name;
      link.textContent = `↓ ${file.name}`;
      link.className = "task-attachment";
      attachmentContainer.appendChild(link);
    });
    taskList.appendChild(card);
  });
}
function renderAll() {
  renderSemesters();
  renderMonths();
  $("semester-kicker").textContent = `SEMESTER 0${selectedSemester+1}`;
  $("semester-title").textContent = `Semester ${selectedSemester+1}`;
  const first = MONTHS[SEMESTER_MONTHS[selectedSemester][0]];
  const last = MONTHS[SEMESTER_MONTHS[selectedSemester].at(-1)];
  $("semester-dates").textContent = `${first} – ${last}`;
  renderTasks();
}
function openTaskDialog(task = null) {
  filesToRemove = new Set();
  $("task-form").reset();
  $("form-error").textContent = "";
  $("existing-files").innerHTML = "";
  $("task-id").value = task?.id || "";
  $("dialog-title").textContent = task ? "Edit reading task" : "Add reading task";
  $("save-task").textContent = task ? "Save changes" : "Save task";
  $("task-date").value = task?.date || `${new Date().getFullYear()}-${String(selectedMonth+1).padStart(2,"0")}-01`;
  $("task-subject").value = task?.subject || "";
  $("task-reading").value = task?.reading || "";
  $("task-url").value = task?.url || "";
  $("task-status").value = task?.status || "Not started";
  if (task?.files?.length) {
    task.files.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "existing-file-row";
      row.innerHTML = `<span>Attached: ${safeText(file.name)}</span><button type="button">Remove</button>`;
      row.querySelector("button").addEventListener("click", () => {
        filesToRemove.add(index);
        row.style.opacity = ".45";
        row.querySelector("button").textContent = "Will remove";
      });
      $("existing-files").appendChild(row);
    });
  }
  dialog.showModal();
}
async function saveTask(event) {
  event.preventDefault();
  const date = $("task-date").value;
  const dateMonth = new Date(`${date}T12:00:00`).getMonth();
  if (!monthsForSemester(selectedSemester).includes(dateMonth)) {
    $("form-error").textContent = "Choose a date within the selected semester's months.";
    return;
  }
  const taskId = $("task-id").value || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const existing = tasks.find(t => t.id === taskId);
  const keptFiles = (existing?.files || []).filter((_, index) => !filesToRemove.has(index));
  const selectedFiles = Array.from($("task-files").files || []);
  const addedFiles = selectedFiles.map(file => ({ name: file.name, type: file.type, size: file.size, blob: file }));
  const task = {
    id: taskId, date, subject: $("task-subject").value.trim(),
    reading: $("task-reading").value.trim(), url: $("task-url").value.trim(),
    status: $("task-status").value, files: [...keptFiles, ...addedFiles]
  };
  try {
    await storeTask(task);
    tasks = await loadTasks();
    selectedMonth = dateMonth;
    dialog.close();
    renderAll();
  } catch (error) {
    $("form-error").textContent = "The task could not be saved. Your browser may be low on storage space.";
  }
}
async function changeStatus(id, status) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.status = status;
  await storeTask(task);
  tasks = await loadTasks();
  renderAll();
}
async function deleteTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task || !confirm(`Delete "${task.subject}"? This cannot be undone.`)) return;
  await deleteStoredTask(id);
  tasks = await loadTasks();
  renderAll();
}
taskList.addEventListener("change", event => {
  const id = event.target.dataset.statusId;
  if (id) changeStatus(id, event.target.value);
});
taskList.addEventListener("click", event => {
  const editId = event.target.dataset.editId;
  const deleteId = event.target.dataset.deleteId;
  if (editId) openTaskDialog(tasks.find(t => t.id === editId));
  if (deleteId) deleteTask(deleteId);
});
$("add-task-top").addEventListener("click", () => openTaskDialog());
$("add-task-empty").addEventListener("click", () => openTaskDialog());
$("close-dialog").addEventListener("click", () => dialog.close());
$("cancel-dialog").addEventListener("click", () => dialog.close());
$("task-form").addEventListener("submit", saveTask);
$("status-filter").addEventListener("change", renderTasks);

(async function init() {
  try {
    db = await openDatabase();
    tasks = await loadTasks();
    renderAll();
  } catch (error) {
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      '<p class="form-error">This browser could not open local storage for the planner. Try opening it through a local web server or another modern browser.</p>');
  }
})();