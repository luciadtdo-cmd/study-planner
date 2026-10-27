const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SEMESTER_MONTHS = [[8,9,10,11],[0,1,2,3,4,5],[8,9,10,11],[0,1,2,3,4,5],[8,9,10,11],[0,1,2,3,4,5]];
const STORAGE_BUCKET = "task-files";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB per file

let selectedSemester = 0;
let selectedMonth = 8;
let tasks = [];
let subjects = [];
let currentUser = null;
let authMode = "login";
let supabaseClient = null;

const $ = (id) => document.getElementById(id);
const semesterTabs = $("semester-tabs");
const monthTabs = $("month-tabs");
const taskList = $("task-list");
const emptyState = $("empty-state");
const dialog = $("task-dialog");

function monthsForSemester(index) { return SEMESTER_MONTHS[index]; }
function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
}
function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return { day: date.getDate(), month: MONTHS[date.getMonth()].slice(0,3) };
}
function showAuthMessage(message, isError=false) {
  const el=$("auth-message");
  el.textContent=message;
  el.classList.toggle("error", isError);
}
function setAuthMode(mode) {
  authMode=mode;
  $("auth-submit").textContent=mode === "login" ? "Log in" : "Create account";
  $("auth-signup").textContent=mode === "login" ? "Create account" : "Back to log in";
  $("auth-password").autocomplete=mode === "login" ? "current-password" : "new-password";
  showAuthMessage(mode === "login" ? "Log in with your account, or create a new one." : "Use an email address you can access. You may need to confirm your email.");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email=$("auth-email").value.trim();
  const password=$("auth-password").value;
  const submit=$("auth-submit");
  submit.disabled=true;
  showAuthMessage("Please wait…");
  try {
    if (authMode === "login") {
      const {error}=await supabaseClient.auth.signInWithPassword({email,password});
      if (error) throw error;
    } else {
      const {data,error}=await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:window.location.href.split('#')[0]}});
      if (error) throw error;
      if (!data.session) {
        setAuthMode("login");
        showAuthMessage("Account created. Check your email for a confirmation link, then log in here.");
      } else {
        showAuthMessage("Account created. Loading your planner…");
      }
    }
  } catch(error) {
    showAuthMessage(error.message || "Something went wrong. Please try again.", true);
  } finally {
    submit.disabled=false;
  }
}

async function loadCloudTasks() {
  const {data,error}=await supabaseClient
    .from("tasks")
    .select("id,semester,task_date,subject,reading,url,status")
    .eq("user_id",currentUser.id)
    .order("task_date");
  if (error) throw error;

  const {data:attachmentRows,error:attachmentError}=await supabaseClient
    .from("task_attachments")
    .select("id,task_id,file_name,storage_path,mime_type,size_bytes,created_at")
    .eq("user_id",currentUser.id)
    .order("created_at");
  if (attachmentError) throw attachmentError;

  const attachmentsByTask = new Map();
  (attachmentRows || []).forEach(file => {
    if (!attachmentsByTask.has(file.task_id)) attachmentsByTask.set(file.task_id, []);
    attachmentsByTask.get(file.task_id).push(file);
  });

  tasks=(data || []).map(row=>({
    id:row.id,
    semester:row.semester-1,
    date:row.task_date,
    subject:row.subject,
    reading:row.reading,
    url:row.url || "",
    status:row.status,
    attachments:attachmentsByTask.get(row.id) || []
  }));

  await loadCloudSubjects();
  renderAll();
}

async function loadCloudSubjects() {
  const {data,error}=await supabaseClient
    .from("subjects")
    .select("id,semester,name")
    .eq("user_id",currentUser.id)
    .order("name");
  if (error) throw error;
  subjects=data || [];
  renderSubjects();
}

function renderSubjects() {
  const list=$("subject-list");
  const options=$("subject-options");
  if (!list || !options) return;
  const current=subjects.filter(subject=>subject.semester===selectedSemester+1);
  list.innerHTML="";
  options.innerHTML="";
  if (!current.length) {
    const empty=document.createElement("span");
    empty.className="muted small";
    empty.textContent="No subjects added yet. Click + Add subject to create one.";
    list.appendChild(empty);
  } else {
    current.forEach(subject=>{
      const chip=document.createElement("span");
      chip.className="subject-chip";
      chip.textContent=subject.name;
      list.appendChild(chip);
      const option=document.createElement("option");
      option.value=subject.name;
      options.appendChild(option);
    });
  }
}

async function addSubject() {
  const name=prompt(`Add a subject for Semester ${selectedSemester+1}:`);
  if (name===null) return;
  const cleanName=name.trim();
  if (!cleanName) { alert("Please enter a subject name."); return; }
  if (subjects.some(subject=>subject.semester===selectedSemester+1 && subject.name.toLowerCase()===cleanName.toLowerCase())) {
    alert("That subject already exists for this semester.");
    return;
  }
  const {error}=await supabaseClient.from("subjects").insert({
    user_id:currentUser.id,
    semester:selectedSemester+1,
    name:cleanName
  });
  if (error) { alert("Could not save the subject: "+error.message); return; }
  await loadCloudSubjects();
}

function renderSemesters() {
  semesterTabs.innerHTML="";
  for(let i=0;i<6;i++) {
    const months=SEMESTER_MONTHS[i];
    const button=document.createElement("button");
    button.type="button";
    button.className=`semester-tab${i===selectedSemester?" active":""}`;
    button.setAttribute("aria-pressed",String(i===selectedSemester));
    button.innerHTML=`<span class="tab-number">SEMESTER 0${i+1}</span><span class="tab-name">Semester ${i+1}</span><span class="tab-date">${MONTHS[months[0]].slice(0,3)} – ${MONTHS[months[months.length-1]].slice(0,3)}</span>`;
    button.addEventListener("click",()=>{
      selectedSemester=i;
      selectedMonth=monthsForSemester(i)[0];
      renderAll();
      renderSubjects();
    });
    semesterTabs.appendChild(button);
  }
}

function renderMonths() {
  monthTabs.innerHTML="";
  monthsForSemester(selectedSemester).forEach(monthIndex=>{
    const button=document.createElement("button");
    button.type="button";
    button.className=`month-tab${monthIndex===selectedMonth?" active":""}`;
    button.textContent=MONTHS[monthIndex];
    button.setAttribute("aria-pressed",String(monthIndex===selectedMonth));
    button.addEventListener("click",()=>{selectedMonth=monthIndex;renderAll();});
    monthTabs.appendChild(button);
  });
}

function getTasksForMonth() {
  return tasks
    .filter(task=>task.semester===selectedSemester && new Date(`${task.date}T12:00:00`).getMonth()===selectedMonth)
    .sort((a,b)=>a.date.localeCompare(b.date));
}

function renderProgress(monthTasks) {
  const total=monthTasks.length;
  const completed=monthTasks.filter(t=>t.status==="Completed").length;
  const percent=total?Math.round(completed/total*100):0;
  $("progress-month-label").textContent=`${MONTHS[selectedMonth]} progress`;
  $("progress-number").textContent=`${percent}%`;
  $("progress-count").textContent=`${completed} of ${total} completed`;
  $("progress-fill").style.width=`${percent}%`;
  $("progress-track").setAttribute("aria-valuenow",String(percent));
}

function attachmentButtonsMarkup(attachments, includeRemove=false) {
  if (!attachments || !attachments.length) return "";
  return `<div class="attachment-list">${attachments.map(file => `
    <div class="attachment-item">
      <button class="attachment-download" type="button" data-download-id="${safeText(file.id)}" title="Download ${safeText(file.file_name)}">↓ ${safeText(file.file_name)}</button>
      ${includeRemove ? `<button class="attachment-remove" type="button" data-delete-attachment-id="${safeText(file.id)}" title="Remove ${safeText(file.file_name)}">Remove</button>` : ""}
    </div>`).join("")}</div>`;
}

function renderTasks() {
  const monthTasks=getTasksForMonth();
  renderProgress(monthTasks);
  const filter=$("status-filter").value;
  const visibleTasks=monthTasks.filter(task=>filter==="all"||task.status===filter);
  taskList.innerHTML="";
  emptyState.hidden=visibleTasks.length!==0;
  taskList.hidden=visibleTasks.length===0;

  if(monthTasks.length===0) {
    emptyState.querySelector("h3").textContent="A fresh page";
    emptyState.querySelector("p").textContent=`No reading tasks for ${MONTHS[selectedMonth]} yet. Add your first task and make a plan that works for you.`;
  } else if(visibleTasks.length===0) {
    emptyState.querySelector("h3").textContent="No tasks match this filter";
    emptyState.querySelector("p").textContent="Try another status to see your reading tasks.";
  }

  visibleTasks.forEach(task=>{
    const date=formatDate(task.date);
    const card=document.createElement("article");
    card.className="task-card";
    const linkMarkup=task.url?`<a href="${safeText(task.url)}" target="_blank" rel="noopener noreferrer">↗ Open reading link</a>`:"";
    card.innerHTML=`
      <div class="task-date"><span class="day">${date.day}</span><span class="month-short">${date.month}</span></div>
      <div class="task-main">
        <p class="task-subject">${safeText(task.subject)}</p>
        <p class="task-reading">${safeText(task.reading)}</p>
        <div class="task-links">${linkMarkup}</div>
        ${attachmentButtonsMarkup(task.attachments)}
      </div>
      <div class="task-actions">
        <select class="status-select" aria-label="Status for ${safeText(task.subject)}" data-status-id="${safeText(task.id)}">
          <option ${task.status==="Not started"?"selected":""}>Not started</option>
          <option ${task.status==="In progress"?"selected":""}>In progress</option>
          <option ${task.status==="Completed"?"selected":""}>Completed</option>
        </select>
        <div class="card-buttons">
          <button class="text-button" type="button" data-edit-id="${safeText(task.id)}">Edit</button>
          <button class="text-button" type="button" data-delete-id="${safeText(task.id)}">Delete</button>
        </div>
      </div>`;
    taskList.appendChild(card);
  });
}

function renderAll() {
  renderSemesters();
  renderMonths();
  $("semester-kicker").textContent=`SEMESTER 0${selectedSemester+1}`;
  $("semester-title").textContent=`Semester ${selectedSemester+1}`;
  $("semester-dates").textContent=`${MONTHS[SEMESTER_MONTHS[selectedSemester][0]]} – ${MONTHS[SEMESTER_MONTHS[selectedSemester].at(-1)]}`;
  renderSubjects();
  renderTasks();
}

function renderDialogAttachments(task) {
  const area=$("existing-attachments");
  if (!area) return;
  const current=task?.attachments || [];
  area.innerHTML=current.length
    ? `<p class="field-hint">Already attached to this task:</p>${attachmentButtonsMarkup(current, true)}`
    : "";
}

function renderPendingFiles() {
  const area=$("pending-files");
  if (!area) return;
  const files=Array.from($("task-files").files || []);
  area.innerHTML=files.length
    ? `<p class="field-hint">Selected for upload:</p><ul>${files.map(file=>`<li>${safeText(file.name)} (${formatBytes(file.size)})</li>`).join("")}</ul>`
    : "";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}

function openTaskDialog(task=null) {
  $("task-form").reset();
  $("form-error").textContent="";
  $("task-id").value=task?.id||"";
  $("dialog-title").textContent=task?"Edit reading task":"Add reading task";
  $("save-task").textContent=task?"Save changes":"Save task";
  $("task-date").value=task?.date||`${new Date().getFullYear()}-${String(selectedMonth+1).padStart(2,"0")}-01`;
  $("task-subject").value=task?.subject||"";
  $("task-reading").value=task?.reading||"";
  $("task-url").value=task?.url||"";
  $("task-status").value=task?.status||"Not started";
  renderDialogAttachments(task);
  renderPendingFiles();
  dialog.showModal();
}

function safeFileName(name) {
  const cleaned = String(name || "file")
    .normalize("NFKC")
    .replace(/[^\w.\-() ]/g, "_")
    .replace(/\s+/g, "_")
    .slice(-120);
  return cleaned || "file";
}

async function uploadSelectedFiles(taskId, files) {
  for (const file of Array.from(files || [])) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`"${file.name}" is larger than 25 MB. Please choose a smaller file.`);
    }
    const storagePath = `${currentUser.id}/${taskId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const {error:uploadError} = await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });
    if (uploadError) throw new Error(`Could not upload "${file.name}": ${uploadError.message}`);

    const {error:recordError} = await supabaseClient.from("task_attachments").insert({
      task_id: taskId,
      user_id: currentUser.id,
      file_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size
    });

    if (recordError) {
      await supabaseClient.storage.from(STORAGE_BUCKET).remove([storagePath]);
      throw new Error(`The file "${file.name}" uploaded, but its details could not be saved: ${recordError.message}`);
    }
  }
}

async function saveTask(event) {
  event.preventDefault();
  const date=$("task-date").value;
  const dateMonth=new Date(`${date}T12:00:00`).getMonth();
  if(!monthsForSemester(selectedSemester).includes(dateMonth)) {
    $("form-error").textContent="Choose a date within the selected semester's months.";
    return;
  }

  const taskId=$("task-id").value||crypto.randomUUID();
  const selectedFiles=Array.from($("task-files").files || []);
  const row={
    user_id:currentUser.id,
    semester:selectedSemester+1,
    task_date:date,
    subject:$("task-subject").value.trim(),
    reading:$("task-reading").value.trim(),
    url:$("task-url").value.trim()||null,
    status:$("task-status").value
  };

  try {
    $("save-task").disabled=true;
    $("form-error").textContent="Saving task…";
    const query=$("task-id").value
      ? supabaseClient.from("tasks").update(row).eq("id",taskId).eq("user_id",currentUser.id)
      : supabaseClient.from("tasks").insert({...row,id:taskId});
    const {error}=await query;
    if(error) throw error;

    // Keep the task ID in the form if an upload needs to be retried.
    $("task-id").value=taskId;
    if (selectedFiles.length) {
      $("form-error").textContent="Uploading attachments…";
      await uploadSelectedFiles(taskId, selectedFiles);
    }

    await loadCloudTasks();
    selectedMonth=dateMonth;
    $("task-files").value="";
    dialog.close();
    renderAll();
  } catch(error) {
    $("form-error").textContent=error.message||"The task could not be saved. Please try again.";
    try { await loadCloudTasks(); } catch (_) {}
  } finally {
    $("save-task").disabled=false;
  }
}

async function downloadAttachment(attachmentId, clickedButton) {
  const attachment=tasks.flatMap(task=>task.attachments || []).find(file=>file.id===attachmentId);
  if (!attachment) { alert("This attachment could not be found. Refresh the page and try again."); return; }

  // Open the tab immediately in response to the click, then send it to the signed URL.
  const newTab=window.open("about:blank", "_blank");
  if (newTab) newTab.opener=null;

  try {
    const {data,error}=await supabaseClient.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(attachment.storage_path, 60*60);
    if (error) throw error;
    if (newTab) {
      newTab.location.href=data.signedUrl;
    } else {
      alert("Your browser blocked the new tab. Please allow pop-ups for this site and try again.");
    }
  } catch(error) {
    if (newTab) newTab.close();
    alert(`Could not open "${attachment.file_name}": ${error.message}`);
  }
}

async function deleteAttachment(attachmentId) {
  const attachment=tasks.flatMap(task=>task.attachments || []).find(file=>file.id===attachmentId);
  if (!attachment || !confirm(`Remove "${attachment.file_name}" from this reading task?`)) return;

  try {
    const {error:storageError}=await supabaseClient.storage.from(STORAGE_BUCKET).remove([attachment.storage_path]);
    if (storageError) throw storageError;

    const {error:recordError}=await supabaseClient.from("task_attachments")
      .delete().eq("id",attachmentId).eq("user_id",currentUser.id);
    if (recordError) throw recordError;

    await loadCloudTasks();
    const currentTask=tasks.find(task=>task.id===$("task-id").value);
    if (dialog.open) renderDialogAttachments(currentTask);
  } catch(error) {
    alert(`Could not remove the attachment: ${error.message}`);
  }
}

async function changeStatus(id,status) {
  const {error}=await supabaseClient.from("tasks").update({status}).eq("id",id).eq("user_id",currentUser.id);
  if(error){alert("Could not update status: "+error.message);return;}
  await loadCloudTasks();
}

async function deleteTask(id) {
  const task=tasks.find(t=>t.id===id);
  if(!task||!confirm(`Delete "${task.subject}"? This cannot be undone.`))return;
  try {
    const paths=(task.attachments || []).map(file=>file.storage_path);
    if (paths.length) {
      const {error:storageError}=await supabaseClient.storage.from(STORAGE_BUCKET).remove(paths);
      if (storageError) throw storageError;
    }
    const {error}=await supabaseClient.from("tasks").delete().eq("id",id).eq("user_id",currentUser.id);
    if(error) throw error;
    await loadCloudTasks();
  } catch(error) {
    alert("Could not delete the task and its attachments: "+error.message);
  }
}

taskList.addEventListener("change",event=>{
  const id=event.target.dataset.statusId;
  if(id)changeStatus(id,event.target.value);
});
taskList.addEventListener("click",event=>{
  const downloadId=event.target.closest("[data-download-id]")?.dataset.downloadId;
  const deleteAttachmentId=event.target.closest("[data-delete-attachment-id]")?.dataset.deleteAttachmentId;
  const editId=event.target.closest("[data-edit-id]")?.dataset.editId;
  const deleteId=event.target.closest("[data-delete-id]")?.dataset.deleteId;
  if(downloadId)downloadAttachment(downloadId,event.target);
  if(deleteAttachmentId)deleteAttachment(deleteAttachmentId);
  if(editId)openTaskDialog(tasks.find(t=>t.id===editId));
  if(deleteId)deleteTask(deleteId);
});

$("existing-attachments").addEventListener("click",event=>{
  const downloadId=event.target.closest("[data-download-id]")?.dataset.downloadId;
  const deleteId=event.target.closest("[data-delete-attachment-id]")?.dataset.deleteAttachmentId;
  if(downloadId)downloadAttachment(downloadId,event.target);
  if(deleteId)deleteAttachment(deleteId);
});

$("auth-form").addEventListener("submit",handleAuthSubmit);
$("auth-signup").addEventListener("click",()=>setAuthMode(authMode === "login" ? "signup" : "login"));
$("sign-out").addEventListener("click",async()=>{
  const {error}=await supabaseClient.auth.signOut();
  if(error)alert(error.message);
});
$("add-task-top").addEventListener("click",()=>openTaskDialog());
$("add-task-empty").addEventListener("click",()=>openTaskDialog());
$("add-subject-top").addEventListener("click",addSubject);
$("close-dialog").addEventListener("click",()=>dialog.close());
$("cancel-dialog").addEventListener("click",()=>dialog.close());
$("task-form").addEventListener("submit",saveTask);
$("status-filter").addEventListener("change",renderTasks);
$("task-files").addEventListener("change",renderPendingFiles);

async function applySession(session) {
  currentUser=session?.user||null;
  $("auth-panel").hidden=!!currentUser;
  $("planner-content").hidden=!currentUser;
  if(currentUser) {
    $("signed-in-email").textContent=`Logged in as ${currentUser.email||"your account"}`;
    try {
      await loadCloudTasks();
      showAuthMessage("");
    } catch(error) {
      $("planner-content").hidden=true;
      $("auth-panel").hidden=false;
      showAuthMessage(`Could not load tasks: ${error.message}`,true);
    }
  } else {
    tasks=[];
    subjects=[];
    taskList.innerHTML="";
    if($("subject-list"))$("subject-list").innerHTML="";
  }
}

(async function init(){
  if(!window.supabase||!window.SUPABASE_URL||!window.SUPABASE_PUBLISHABLE_KEY||window.SUPABASE_URL.includes("INDSÆT")||window.SUPABASE_PUBLISHABLE_KEY.includes("INDSÆT")) {
    showAuthMessage("Supabase setup is incomplete. Check the values in supabase-config.js.",true);
    return;
  }
  supabaseClient=window.supabase.createClient(window.SUPABASE_URL,window.SUPABASE_PUBLISHABLE_KEY);
  setAuthMode("login");
  const {data,error}=await supabaseClient.auth.getSession();
  if(error){showAuthMessage(error.message,true);return;}
  await applySession(data.session);
  supabaseClient.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>applySession(session),0);});
})();
