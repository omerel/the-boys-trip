import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getFirestore, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig, tripId } from "./firebase-config.js";

const STORAGE_KEY = "juliana-checklist-v1";

const PEOPLE = [
  { id: "omer", name: "עומר" },
  { id: "omri", name: "עמרי" },
  { id: "matan", name: "מתן" },
  { id: "shared", name: "ציוד משותף", shared: true },
];


const CATEGORY_COLORS = ["#2d705e", "#d19145", "#4779a7", "#9a5d7b", "#778b4a", "#7965a8"];

const personalCategories = () => [
  category("מסמכים וכסף", ["דרכון", "ביטוח נסיעות", "כרטיסי טיסה", "כרטיס אשראי", "מעט מזומן באירו"]),
  category("ביגוד להליכה", ["נעלי הליכה", "גרבי הליכה", "מכנסי טיולים", "חולצות מנדפות", "פליז", "מעיל גשם", "כובע"]),
  category("תיק יום", ["תיק יום", "בקבוק מים", "כיסוי גשם לתיק", "משקפי שמש", "קרם הגנה", "חטיף לדרך"]),
  category("ערב ולינה", ["בגדים להחלפה", "נעליים קלות", "תחתונים וגרביים", "בגדי שינה", "שקית לכביסה"]),
  category("רחצה ובריאות", ["מברשת ומשחת שיניים", "תרופות אישיות", "פלסטרים לשלפוחיות", "דאודורנט", "מגבת קטנה"]),
  category("אלקטרוניקה", ["טלפון", "מטען", "סוללה ניידת", "כבל טעינה", "אוזניות"]),
];

function category(name, itemNames, shared = false) {
  return {
    id: uid(),
    name,
    color: CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)],
    items: itemNames.map((itemName) => ({ id: uid(), name: itemName, done: false, ...(shared ? { owner: "" } : {}) })),
  };
}

function createInitialState() {
  return {
    activeList: "omer",
    itinerary: null,
    itineraryNotes: {},
    lists: {
      omer: personalCategories(),
      omri: personalCategories(),
      matan: personalCategories(),
      shared: [
        category("ניווט ובטיחות", ["ערכת עזרה ראשונה", "פנס ראש", "משרוקית", "מפת מסלול מודפסת", "סכין רב־שימושית"], true),
        category("ציוד קבוצתי", ["מטען קיר מרובה יציאות", "מטרייה מתקפלת", "משחק קלפים", "שקיות אטומות למים"], true),
        category("לוגיסטיקה", ["3 תגי מזוודה מודפסים", "עותק מודפס של ה־voucher", "מספרי החירום שמורים בטלפונים"], true),
      ],
    },
  };
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.lists && PEOPLE.every((person) => Array.isArray(saved.lists[person.id]))) {
      saved.itineraryNotes ||= {};
      saved.itinerary ||= null;
      return saved;
    }
  } catch (error) {
    console.warn("Could not load saved checklist", error);
  }
  return createInitialState();
}

let state = loadState();
let toastTimer;
let cloudDocument = null;
let cloudReady = false;
let applyingRemoteState = false;
let saveTimer;
let authInstance = null;
let unsubscribeCloud = null;
let currentView = "checklist";

const els = {
  tabs: document.querySelector("#people-tabs"),
  grid: document.querySelector("#category-grid"),
  listLabel: document.querySelector("#active-list-label"),
  listName: document.querySelector("#active-list-name"),
  overallCount: document.querySelector("#overall-count"),
  overallBar: document.querySelector("#overall-bar"),
  empty: document.querySelector("#empty-state"),
  categoryTemplate: document.querySelector("#category-template"),
  copyDialog: document.querySelector("#copy-dialog"),
  copySource: document.querySelector("#copy-source"),
  copyList: document.querySelector("#copy-list"),
  copyCount: document.querySelector("#copy-selection-count"),
  menuDialog: document.querySelector("#menu-dialog"),
  toast: document.querySelector("#toast"),
  syncPill: document.querySelector("#sync-pill"),
  syncPillText: document.querySelector("#sync-pill-text"),
  storageTitle: document.querySelector("#storage-title"),
  storageDetail: document.querySelector("#storage-detail"),
  authScreen: document.querySelector("#auth-screen"),
  authError: document.querySelector("#auth-error"),
  googleSignIn: document.querySelector("#google-sign-in"),
  accountRow: document.querySelector("#account-row"),
  accountPhoto: document.querySelector("#account-photo"),
  accountName: document.querySelector("#account-name"),
  accountEmail: document.querySelector("#account-email"),
  checklistView: document.querySelector("#checklist-view"),
  scheduleView: document.querySelector("#schedule-view"),
  scheduleGrid: document.querySelector("#schedule-grid"),
  tripContacts: document.querySelector("#trip-contacts"),
  countdownDays: document.querySelector("#countdown-days"),
  countdownHours: document.querySelector("#countdown-hours"),
  countdownMinutes: document.querySelector("#countdown-minutes"),
};

const DEPARTURE_TIME = new Date("2026-10-07T09:00:00+03:00");

function updateFlightCountdown() {
  const remaining = Math.max(0, DEPARTURE_TIME.getTime() - Date.now());
  const totalMinutes = Math.floor(remaining / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  els.countdownDays.textContent = String(days);
  els.countdownHours.textContent = String(hours).padStart(2, "0");
  els.countdownMinutes.textContent = String(minutes).padStart(2, "0");
}

function saveState({ sync = true } = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderProgress();
  if (sync && cloudReady && !applyingRemoteState) scheduleCloudSave();
}

function scheduleCloudSave() {
  clearTimeout(saveTimer);
  setSyncStatus("saving");
  saveTimer = setTimeout(pushStateToCloud, 220);
}

async function pushStateToCloud() {
  if (!cloudDocument || !cloudReady || !authInstance?.currentUser) return;
  try {
    await setDoc(cloudDocument, {
      lists: state.lists,
      itineraryJson: state.itinerary ? JSON.stringify(state.itinerary) : null,
      itineraryNotes: state.itineraryNotes || {},
      updatedAt: new Date().toISOString(),
      schemaVersion: 2,
    });
    setSyncStatus("online");
  } catch (error) {
    console.error("Cloud save failed", error);
    setSyncStatus(navigator.onLine ? "error" : "offline");
  }
}

function setSyncStatus(status) {
  const dot = els.syncPill.querySelector(".status-dot");
  const menuDot = document.querySelector("#storage-note .status-dot");
  dot.className = "status-dot";
  menuDot.className = "status-dot";
  const content = {
    connecting: ["מתחבר…", "מתחבר לענן…", "הרשימות המקומיות זמינות בינתיים.", "is-offline"],
    signedout: ["נדרשת כניסה", "ממתין לכניסה עם Google", "התחברו כדי לפתוח ולסנכרן את הרשימות.", "is-offline"],
    saving: ["שומר…", "שומר את השינויים…", "מיד יופיעו גם בטלפונים האחרים.", "is-offline"],
    online: ["מסונכרן", "מסונכרן בין המכשירים", "כל שינוי נשמר ומתעדכן בזמן אמת.", "is-online"],
    offline: ["לא מקוון", "אין כרגע חיבור", "השינויים נשמרו במכשיר ויסונכרנו כשהחיבור יחזור.", "is-offline"],
    local: ["מצב מקומי", "Firebase עדיין לא הוגדר", "האתר עובד, אך עדיין אינו מסתנכרן בין טלפונים.", "is-offline"],
    error: ["שגיאת סנכרון", "לא ניתן לסנכרן", "בדקו את הגדרת Firebase ואת כללי Firestore.", "is-error"],
  }[status];
  els.syncPillText.textContent = content[0];
  els.storageTitle.textContent = content[1];
  els.storageDetail.textContent = content[2];
  dot.classList.add(content[3]);
  menuDot.classList.add(content[3]);
}

function isFirebaseConfigured() {
  return firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE_") &&
    firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("PASTE_");
}

async function connectCloudSync() {
  if (!isFirebaseConfigured()) {
    setSyncStatus("local");
    return;
  }
  setSyncStatus("connecting");
  try {
    const firebaseApp = initializeApp(firebaseConfig);
    authInstance = getAuth(firebaseApp);
    const db = getFirestore(firebaseApp);
    cloudDocument = doc(db, "trips", tripId);

    onAuthStateChanged(authInstance, (user) => {
      if (user) {
        showSignedInUser(user);
        startCloudListener();
      } else {
        cloudReady = false;
        unsubscribeCloud?.();
        unsubscribeCloud = null;
        els.authScreen.hidden = false;
        els.accountRow.hidden = true;
        setSyncStatus("signedout");
      }
    }, (error) => {
      console.error("Authentication state failed", error);
      showAuthError("לא הצלחנו לבדוק את מצב הכניסה. נסו לרענן את הדף.");
      setSyncStatus("error");
    });
  } catch (error) {
    console.error("Firebase connection failed", error);
    showAuthError("לא ניתן להתחבר ל‑Firebase. בדקו את ההגדרות ונסו שוב.");
    setSyncStatus(navigator.onLine ? "error" : "offline");
  }
}

function startCloudListener() {
  if (unsubscribeCloud) return;
  let firstSnapshot = true;
  unsubscribeCloud = onSnapshot(cloudDocument, async (snapshot) => {
      if (snapshot.exists() && snapshot.data()?.lists) {
        const focusedNote = document.activeElement?.matches?.(".day-note")
          ? { dayId: document.activeElement.dataset.dayId, value: document.activeElement.value }
          : null;
        applyingRemoteState = true;
        state.lists = snapshot.data().lists;
        state.itinerary = parseItinerary(snapshot.data().itineraryJson);
        state.itineraryNotes = snapshot.data().itineraryNotes || {};
        if (focusedNote) state.itineraryNotes[focusedNote.dayId] = focusedNote.value;
        saveState({ sync: false });
        applyingRemoteState = false;
        if (focusedNote) {
          renderTabs();
          renderActiveList();
          renderProgress();
        } else {
          render();
        }
      } else if (firstSnapshot) {
        await setDoc(cloudDocument, {
          lists: state.lists,
          itineraryJson: state.itinerary ? JSON.stringify(state.itinerary) : null,
          itineraryNotes: state.itineraryNotes || {},
          updatedAt: new Date().toISOString(),
          schemaVersion: 2,
        });
      }
      firstSnapshot = false;
      cloudReady = true;
      setSyncStatus("online");
    }, (error) => {
      console.error("Realtime listener failed", error);
      cloudReady = false;
      if (error?.code === "permission-denied") {
        state.itinerary = null;
        state.itineraryNotes = {};
        saveState({ sync: false });
        render();
        els.authScreen.hidden = false;
        els.accountRow.hidden = true;
        showAuthError("חשבון Google הזה אינו מורשה להיכנס לאפליקציה.");
        setSyncStatus("signedout");
        signOut(authInstance).catch(() => {});
        return;
      }
      setSyncStatus(navigator.onLine ? "error" : "offline");
    });
}

function showSignedInUser(user) {
  els.authScreen.hidden = true;
  els.authError.hidden = true;
  els.accountRow.hidden = false;
  els.accountName.textContent = user.displayName || "משתמש Google";
  els.accountEmail.textContent = user.email || "";
  els.accountPhoto.src = user.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
  els.accountPhoto.alt = user.displayName ? `תמונת הפרופיל של ${user.displayName}` : "תמונת פרופיל";
}

function showAuthError(message) {
  els.authError.textContent = message;
  els.authError.hidden = false;
}

async function signInWithGoogle() {
  if (!authInstance) {
    showAuthError("Firebase עדיין לא הוגדר. השלימו תחילה את ההגדרה שבקובץ README.");
    return;
  }
  els.googleSignIn.disabled = true;
  els.authError.hidden = true;
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(authInstance, provider);
  } catch (error) {
    if (error?.code !== "auth/popup-closed-by-user" && error?.code !== "auth/cancelled-popup-request") {
      console.error("Google sign-in failed", error);
      showAuthError("הכניסה עם Google לא הצליחה. ודאו שהדומיין מורשה ב‑Firebase ונסו שוב.");
    }
  } finally {
    els.googleSignIn.disabled = false;
  }
}

async function signOutCurrentUser() {
  if (!authInstance) return;
  els.menuDialog.close();
  await signOut(authInstance);
}

function getStats(listId) {
  const items = state.lists[listId].flatMap((cat) => cat.items);
  return { total: items.length, done: items.filter((item) => item.done).length };
}

function render() {
  renderTabs();
  renderActiveList();
  renderProgress();
  renderView();
}

function renderView() {
  const showingSchedule = currentView === "schedule";
  els.checklistView.hidden = showingSchedule;
  els.scheduleView.hidden = !showingSchedule;
  if (showingSchedule) renderSchedule();
}

function showSchedule() {
  currentView = "schedule";
  els.menuDialog.close();
  renderView();
  window.scrollTo({ top: document.querySelector("main").offsetTop - 18, behavior: "smooth" });
}

function showChecklist() {
  currentView = "checklist";
  renderView();
  window.scrollTo({ top: document.querySelector("main").offsetTop - 18, behavior: "smooth" });
}

function renderSchedule() {
  els.scheduleGrid.replaceChildren();
  els.tripContacts.replaceChildren();
  const itinerary = state.itinerary;
  if (!itinerary?.days?.length) {
    els.scheduleGrid.innerHTML = '<div class="schedule-empty"><strong>הלו״ז עדיין לא זמין</strong><span>ממתינים לסנכרון הנתונים המאובטחים.</span></div>';
    return;
  }
  const contactCards = [
    ["מספר הזמנה", itinerary.reservationNumber],
    [`מרכז ההזמנות · ${itinerary.bookingCenter?.hours || ""}`, itinerary.bookingCenter],
    [`קו חירום להזמנה · ${itinerary.emergency?.hours || ""}`, itinerary.emergency],
  ];
  contactCards.forEach(([title, value]) => {
    const block = document.createElement("div");
    block.innerHTML = `<strong>${escapeHtml(title)}</strong>`;
    if (typeof value === "string") {
      const span = document.createElement("span");
      span.textContent = value;
      block.append(span);
    } else if (value) {
      (value.phones || []).forEach((phone) => {
        const link = document.createElement("a");
        link.href = `tel:${phoneHref(phone)}`;
        link.textContent = phone;
        block.append(link);
      });
      if (value.email) {
        const link = document.createElement("a");
        link.href = `mailto:${value.email}`;
        link.textContent = value.email;
        block.append(link);
      }
    }
    els.tripContacts.append(block);
  });
  itinerary.days.forEach((day) => {
    const card = document.createElement("article");
    card.className = "day-card";
    card.innerHTML = `
      <header class="day-card__header">
        <div><span class="day-card__day">${escapeHtml(day.day)}</span><span class="day-card__date">${escapeHtml(day.date)}</span></div>
        <h3>${escapeHtml(day.title)}</h3>
        <p>${escapeHtml(day.summary)}</p>
        <div class="day-stats">${day.stats.map((stat) => `<span>${escapeHtml(stat)}</span>`).join("")}</div>
      </header>
      <div class="day-card__body">
        <section class="day-info"><h4>איך נערכים</h4><ul>${day.prepare.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section class="day-info"><h4>מה עושים</h4><ul>${day.tasks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        ${day.stay ? `<section class="day-info"><h4>לינה</h4><strong>${escapeHtml(day.stay.name)}</strong><p>${escapeHtml(day.stay.address)}</p><div class="day-links"><a href="tel:${phoneHref(day.stay.phone)}">${escapeHtml(day.stay.phone)}</a><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${day.stay.name}, ${day.stay.address}`)}" target="_blank" rel="noopener">פתיחה במפה</a></div></section>` : ""}
        <section class="day-info"><h4>אנשי קשר</h4>${day.contacts.map((contact) => `<div class="contact-row"><div><strong>${escapeHtml(contact.name)}</strong><small>${escapeHtml(contact.role)}</small></div><a href="tel:${phoneHref(contact.phone)}">${escapeHtml(contact.phone)}</a></div>`).join("")}</section>
        <label class="day-notes"><span>הערות שלנו</span><textarea class="day-note" data-day-id="${day.id}" rows="3" placeholder="מה חשוב לזכור ביום הזה?"></textarea><small>ההערה משותפת ומסתנכרנת בין הטלפונים.</small></label>
      </div>`;
    const textarea = card.querySelector(".day-note");
    textarea.value = state.itineraryNotes?.[day.id] || "";
    textarea.addEventListener("input", () => {
      state.itineraryNotes ||= {};
      state.itineraryNotes[day.id] = textarea.value;
      saveState({ sync: false });
    });
    textarea.addEventListener("change", () => saveState());
    els.scheduleGrid.append(card);
  });
}

function phoneHref(phone) {
  return phone.replace(/[^+\d]/g, "");
}

function parseItinerary(value) {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch (error) {
    console.error("Could not parse itinerary", error);
    return null;
  }
}

function renderTabs() {
  els.tabs.replaceChildren();
  PEOPLE.forEach((person) => {
    const stats = getStats(person.id);
    const button = document.createElement("button");
    button.className = `person-tab${person.id === state.activeList ? " is-active" : ""}`;
    button.type = "button";
    button.innerHTML = `<span>${escapeHtml(person.name)}</span><span class="person-tab__count">${stats.done}/${stats.total}</span>`;
    button.addEventListener("click", () => {
      state.activeList = person.id;
      saveState();
      render();
    });
    els.tabs.append(button);
  });
}

function renderProgress() {
  const allItems = PEOPLE.flatMap((person) => state.lists[person.id].flatMap((cat) => cat.items));
  const done = allItems.filter((item) => item.done).length;
  const total = allItems.length;
  els.overallCount.textContent = `${done} מתוך ${total}`;
  els.overallBar.style.width = `${total ? (done / total) * 100 : 0}%`;
}

function renderActiveList() {
  const person = PEOPLE.find((entry) => entry.id === state.activeList);
  els.listLabel.textContent = person.shared ? "" : "הרשימה של";
  els.listName.textContent = person.name;
  document.querySelector("#copy-items").hidden = person.shared;
  els.grid.replaceChildren();
  const categories = state.lists[state.activeList];
  els.empty.hidden = categories.length > 0;

  categories.forEach((cat, categoryIndex) => {
    const fragment = els.categoryTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".category-card");
    card.style.setProperty("--category-color", cat.color || CATEGORY_COLORS[categoryIndex % CATEGORY_COLORS.length]);
    fragment.querySelector(".category-name").textContent = cat.name;
    const done = cat.items.filter((item) => item.done).length;
    fragment.querySelector(".category-progress").textContent = cat.items.length ? `${done} מתוך ${cat.items.length} נארזו` : "הקטגוריה ריקה";

    fragment.querySelector(".delete-category").addEventListener("click", () => removeCategory(cat.id));
    const itemsContainer = fragment.querySelector(".items");
    cat.items.forEach((item) => itemsContainer.append(createItemRow(cat.id, item, person.shared)));

    fragment.querySelector(".add-item-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.currentTarget.querySelector("input");
      addItem(cat.id, input.value);
      input.value = "";
    });
    els.grid.append(fragment);
  });
}

function createItemRow(categoryId, item, isShared) {
  const row = document.createElement("div");
  row.className = `item${item.done ? " is-done" : ""}`;
  const checkboxId = `item-${item.id}`;
  row.innerHTML = `
    <label for="${checkboxId}">
      <input class="item__checkbox" id="${checkboxId}" type="checkbox" ${item.done ? "checked" : ""} />
      <span class="item__checkmark"></span>
    </label>
    <span class="item__name"></span>
    ${isShared ? ownerSelectMarkup(item.owner) : "<span></span>"}
    <button class="item__edit" type="button" aria-label="עריכת פריט" title="עריכה">✎</button>
    <button class="item__delete" type="button" aria-label="מחיקת פריט">×</button>`;
  row.querySelector(".item__name").textContent = item.name;
  row.querySelector("input").addEventListener("change", (event) => {
    item.done = event.target.checked;
    saveState();
    render();
  });
  row.querySelector(".item__delete").addEventListener("click", () => {
    const cat = state.lists[state.activeList].find((entry) => entry.id === categoryId);
    cat.items = cat.items.filter((entry) => entry.id !== item.id);
    saveState();
    render();
    showToast("הפריט הוסר");
  });
  row.querySelector(".item__edit").addEventListener("click", () => editItem(item));
  const ownerSelect = row.querySelector(".item__owner");
  if (ownerSelect) {
    ownerSelect.addEventListener("change", (event) => {
      item.owner = event.target.value;
      saveState();
    });
  }
  return row;
}

function editItem(item) {
  const editedName = window.prompt("עריכת שם הפריט", item.name);
  const name = editedName?.trim();
  if (!name || name === item.name) return;
  item.name = name;
  saveState();
  render();
  showToast("הפריט עודכן");
}

function ownerSelectMarkup(value = "") {
  const options = [{ id: "", name: "מי מביא?" }, ...PEOPLE.filter((person) => !person.shared)];
  return `<select class="item__owner" aria-label="מי מביא את הפריט">${options.map((option) => `<option value="${option.id}" ${option.id === value ? "selected" : ""}>${option.name}</option>`).join("")}</select>`;
}

function addItem(categoryId, rawName) {
  const name = rawName.trim();
  if (!name) return;
  const cat = state.lists[state.activeList].find((entry) => entry.id === categoryId);
  cat.items.push({ id: uid(), name, done: false, ...(state.activeList === "shared" ? { owner: "" } : {}) });
  saveState();
  render();
  showToast("הפריט נוסף");
}

function addCategory() {
  const name = window.prompt("איך לקרוא לקטגוריה החדשה?");
  if (!name?.trim()) return;
  state.lists[state.activeList].push(category(name.trim(), [], state.activeList === "shared"));
  saveState();
  render();
  requestAnimationFrame(() => document.querySelector(".category-card:last-child input")?.focus());
}

function removeCategory(categoryId) {
  const cat = state.lists[state.activeList].find((entry) => entry.id === categoryId);
  const message = cat.items.length
    ? `למחוק את “${cat.name}” ואת ${cat.items.length} הפריטים שבה?`
    : `למחוק את הקטגוריה “${cat.name}”?`;
  if (!window.confirm(message)) return;
  state.lists[state.activeList] = state.lists[state.activeList].filter((entry) => entry.id !== categoryId);
  saveState();
  render();
}

function openCopyDialog() {
  const sources = PEOPLE.filter((person) => !person.shared && person.id !== state.activeList);
  els.copySource.innerHTML = sources.map((person) => `<option value="${person.id}">${person.name}</option>`).join("");
  renderCopyOptions();
  els.copyDialog.showModal();
}

function renderCopyOptions() {
  els.copyList.replaceChildren();
  state.lists[els.copySource.value].forEach((cat) => {
    const title = document.createElement("div");
    title.className = "copy-group";
    title.textContent = cat.name;
    els.copyList.append(title);
    cat.items.forEach((item) => {
      const label = document.createElement("label");
      label.className = "copy-option";
      label.innerHTML = `<input type="checkbox" data-category="${cat.id}" data-item="${item.id}" /><span></span>`;
      label.querySelector("span").textContent = item.name;
      label.querySelector("input").addEventListener("change", updateCopyCount);
      els.copyList.append(label);
    });
  });
  updateCopyCount();
}

function updateCopyCount() {
  const count = els.copyList.querySelectorAll("input:checked").length;
  els.copyCount.textContent = `${count} פריטים נבחרו`;
}

function copySelectedItems(event) {
  event.preventDefault();
  const selected = [...els.copyList.querySelectorAll("input:checked")];
  if (!selected.length) {
    showToast("צריך לבחור לפחות פריט אחד");
    return;
  }
  const sourceCategories = state.lists[els.copySource.value];
  const targetCategories = state.lists[state.activeList];
  let added = 0;

  selected.forEach((input) => {
    const sourceCat = sourceCategories.find((cat) => cat.id === input.dataset.category);
    const sourceItem = sourceCat.items.find((item) => item.id === input.dataset.item);
    let targetCat = targetCategories.find((cat) => cat.name === sourceCat.name);
    if (!targetCat) {
      targetCat = category(sourceCat.name, []);
      targetCategories.push(targetCat);
    }
    const duplicate = targetCat.items.some((item) => item.name.trim().toLowerCase() === sourceItem.name.trim().toLowerCase());
    if (!duplicate) {
      targetCat.items.push({ id: uid(), name: sourceItem.name, done: false });
      added += 1;
    }
  });
  saveState();
  render();
  els.copyDialog.close();
  showToast(added ? `${added} פריטים הועתקו` : "הפריטים כבר נמצאים ברשימה");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `juliana-checklist-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  els.menuDialog.close();
}

async function importData(file) {
  try {
    const imported = JSON.parse(await file.text());
    if (!imported?.lists || !PEOPLE.every((person) => Array.isArray(imported.lists[person.id]))) throw new Error("Invalid file");
    state = imported;
    saveState();
    render();
    els.menuDialog.close();
    showToast("הגיבוי נטען בהצלחה");
  } catch {
    showToast("הקובץ אינו גיבוי תקין");
  }
}

function resetData() {
  if (!window.confirm("לאפס את כל הרשימות ולמחוק את השינויים שביצעתם?")) return;
  state = createInitialState();
  saveState();
  render();
  els.menuDialog.close();
  showToast("הרשימות אופסו");
}

function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

document.querySelector("#add-category").addEventListener("click", addCategory);
document.querySelector("#empty-add-category").addEventListener("click", addCategory);
document.querySelector("#copy-items").addEventListener("click", openCopyDialog);
document.querySelector("#copy-form").addEventListener("submit", copySelectedItems);
document.querySelectorAll("[data-close-copy]").forEach((button) => {
  button.addEventListener("click", () => els.copyDialog.close());
});
els.copySource.addEventListener("change", renderCopyOptions);
document.querySelector("#toggle-copy-all").addEventListener("click", () => {
  const boxes = [...els.copyList.querySelectorAll("input")];
  const shouldCheck = boxes.some((box) => !box.checked);
  boxes.forEach((box) => { box.checked = shouldCheck; });
  updateCopyCount();
});
document.querySelector("#open-menu").addEventListener("click", () => els.menuDialog.showModal());
document.querySelector("#open-schedule").addEventListener("click", showSchedule);
document.querySelector("#hero-open-schedule").addEventListener("click", showSchedule);
document.querySelector("#back-to-checklist").addEventListener("click", showChecklist);
document.querySelector("#export-data").addEventListener("click", exportData);
document.querySelector("#import-data").addEventListener("change", (event) => {
  if (event.target.files[0]) importData(event.target.files[0]);
  event.target.value = "";
});
document.querySelector("#reset-data").addEventListener("click", resetData);
els.googleSignIn.addEventListener("click", signInWithGoogle);
document.querySelector("#sign-out").addEventListener("click", signOutCurrentUser);
window.addEventListener("offline", () => {
  if (cloudDocument) setSyncStatus("offline");
});
window.addEventListener("online", () => {
  if (cloudDocument && authInstance?.currentUser) {
    cloudReady = true;
    pushStateToCloud();
  }
});

render();
updateFlightCountdown();
setInterval(updateFlightCountdown, 30000);
connectCloudSync();
