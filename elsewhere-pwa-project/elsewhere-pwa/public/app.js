const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let currentUser = null;
let currentStory = null;
let authMode = "login";

function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function navigate(view) {
  $$(".view").forEach(el => el.classList.toggle("active", el.id === `view-${view}`));
  $$(".nav-link").forEach(el => el.classList.toggle("active", el.dataset.view === view));
  $("#mainNav").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "library") loadLibrary();
}
$$(".nav-link").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.view)));
$$("[data-go]").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.go)));
$("#mobileMenu").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
$$(".universe-card").forEach(card => card.addEventListener("click", () => {
  $("#universeSelect").value = card.dataset.universe;
  navigate("studio");
  $("#premise").focus();
}));
$("#accountBtn").addEventListener("click", () => currentUser ? signOut() : openAuth());
function openAuth() {
  authMode = "login"; updateAuthDialog(); $("#authDialog").showModal();
}
function updateAuthDialog() {
  const signup = authMode === "register";
  $("#authTitle").textContent = signup ? "Join the archive." : "Welcome back.";
  $("#authIntro").textContent = signup ? "Create an account to keep your stories." : "Sign in to preserve your manuscripts.";
  $("#nameField").classList.toggle("hidden", !signup);
  $("#displayName").required = signup;
  $("#password").autocomplete = signup ? "new-password" : "current-password";
  $("#authSubmit").textContent = signup ? "CREATE ACCOUNT" : "SIGN IN";
  $("#toggleAuth").textContent = signup ? "I already have an account" : "Create an account instead";
  $("#authError").textContent = "";
}
$("#toggleAuth").addEventListener("click", () => { authMode = authMode === "login" ? "register" : "login"; updateAuthDialog(); });
$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = { email: $("#email").value.trim(), password: $("#password").value };
  if (authMode === "register") body.displayName = $("#displayName").value.trim();
  try {
    const data = await api(`/api/auth/${authMode}`, { method: "POST", body: JSON.stringify(body) });
    setUser(data.user); $("#authDialog").close(); $("#authForm").reset(); toast("Welcome to ELSEWHERE.");
  } catch (error) { $("#authError").textContent = error.message; }
});
function setUser(user) {
  currentUser = user;
  $("#accountLabel").textContent = user ? user.displayName.toUpperCase() : "GUEST ACCESS";
  $("#accountBtn").textContent = user ? "Sign out" : "Sign in";
}
async function signOut() {
  try { await api("/api/auth/logout", { method: "POST", body: "{}" }); setUser(null); toast("You have signed out."); navigate("studio"); }
  catch (error) { toast(error.message); }
}
async function refreshUser() {
  try { const data = await api("/api/auth/me"); setUser(data.user); } catch { setUser(null); }
}
$("#generateBtn").addEventListener("click", async () => {
  if (!currentUser) { openAuth(); toast("Sign in to create and save stories."); return; }
  const premise = $("#premise").value.trim();
  if (premise.length < 12) { toast("Add a little more detail to your turning point."); $("#premise").focus(); return; }
  $("#emptyState").classList.add("hidden"); $("#storyOutput").classList.add("hidden"); $("#loadingState").classList.remove("hidden");
  $("#storyStatus").textContent = "REWRITING TIMELINE";
  try {
    const data = await api("/api/generate", { method: "POST", body: JSON.stringify({
      universe: $("#universeSelect").value, premise, tone: $("#tone").value, perspective: $("#perspective").value, length: 1300
    })});
    currentStory = { title: data.title, content: data.content, universe: $("#universeSelect").value, prompt: premise };
    $("#storyTitle").textContent = data.title;
    $("#storyUniverse").textContent = currentStory.universe.toUpperCase();
    $("#storyText").textContent = data.content.split("\n").slice(1).join("\n").trim() || data.content;
    $("#storyOutput").classList.remove("hidden"); $("#storyStatus").textContent = "MANUSCRIPT READY";
  } catch (error) {
    $("#emptyState").classList.remove("hidden"); $("#storyStatus").textContent = "GENERATION PAUSED"; toast(error.message);
  } finally { $("#loadingState").classList.add("hidden"); }
});
$("#copyStory").addEventListener("click", async () => {
  if (!currentStory) return;
  try { await navigator.clipboard.writeText(`${currentStory.title}\n\n${currentStory.content}`); toast("Manuscript copied."); }
  catch { toast("Clipboard access is unavailable in this browser."); }
});
$("#saveStory").addEventListener("click", async () => {
  if (!currentStory || !currentUser) return;
  try {
    await api("/api/stories", { method: "POST", body: JSON.stringify(currentStory) });
    toast("Saved to your library."); loadLibrary();
  } catch (error) { toast(error.message); }
});
async function loadLibrary() {
  const list = $("#libraryList");
  if (!currentUser) { list.innerHTML = '<div class="empty-library">Sign in to view your saved manuscripts.</div>'; return; }
  try {
    const { stories } = await api("/api/stories");
    if (!stories.length) { list.innerHTML = '<div class="empty-library">No manuscripts yet. Your next timeline is waiting.</div>'; return; }
    list.replaceChildren(...stories.map(story => {
      const item = document.createElement("article"); item.className = "library-item";
      const info = document.createElement("div"); const title = document.createElement("h3"); title.textContent = story.title;
      const meta = document.createElement("p"); meta.textContent = `${story.universe.toUpperCase()}  /  ${new Date(story.createdAt).toLocaleDateString()}`;
      info.append(title, meta);
      const actions = document.createElement("div"); actions.style.display = "flex"; actions.style.gap = "8px";
      const open = document.createElement("button"); open.className = "outline-btn"; open.textContent = "OPEN"; open.addEventListener("click", () => {
        currentStory = story; $("#storyTitle").textContent = story.title; $("#storyUniverse").textContent = story.universe.toUpperCase();
        $("#storyText").textContent = story.content; $("#storyOutput").classList.remove("hidden"); $("#emptyState").classList.add("hidden"); navigate("studio");
      });
      const del = document.createElement("button"); del.className = "outline-btn"; del.textContent = "DELETE"; del.addEventListener("click", async () => {
        try { await api(`/api/stories/${story.id}`, { method: "DELETE" }); toast("Manuscript removed."); loadLibrary(); }
        catch (error) { toast(error.message); }
      });
      actions.append(open, del); item.append(info, actions); return item;
    }));
  } catch (error) { list.innerHTML = `<div class="empty-library">${escapeHtml(error.message)}</div>`; }
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
refreshUser();
