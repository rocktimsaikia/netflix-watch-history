const BTN_ID = "nwh-history-btn";

// Monochrome SVG history icon (clock with rewind arrow); follows text color.
const CLOCK_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1.5px;margin-right:5px"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>';

// Distinct filled pill so it stands out from the stock nav tabs.
function stylePill(a, base, hover, hoverBorder) {
  Object.assign(a.style, {
    color: "#fff",
    background: base,
    borderRadius: "999px",
    padding: "6px 12px",
    fontWeight: "700",
    // Transparent at rest so the hover border doesn't shift layout.
    border: "1px solid transparent",
  });
  a.addEventListener("mouseenter", () => {
    a.style.background = hover;
    a.style.borderColor = hoverBorder;
  });
  a.addEventListener("mouseleave", () => {
    a.style.background = base;
    a.style.borderColor = "transparent";
  });
}

// Both sites are SPAs whose routers ignore cloned React handlers; force a real
// navigation instead of letting the click fall through to a dead listener.
function forceNavigate(a, url) {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.location.assign(url);
  });
}

function injectNetflix() {
  const myList = document.querySelector('a[data-uia="nav-myList"]');
  if (!myList) return;

  // Clone an existing nav item so we inherit Netflix's hashed CSS-in-JS styles.
  const li = myList.closest("li") || myList.parentElement;
  const clone = li.cloneNode(true);
  const a = clone.querySelector("a");
  a.id = BTN_ID;
  a.setAttribute("data-uia", "nav-watch-history");
  // ponytail: /viewingactivity resolves to the active profile's history page
  a.setAttribute("href", "/viewingactivity");
  a.removeAttribute("aria-current");
  clone
    .querySelectorAll('[data-uia="navigation-item-text"], span')
    .forEach((s) => (s.innerHTML = CLOCK_SVG + "History"));
  stylePill(a, "#e50914", "#b0060f", "#ff2c35");
  forceNavigate(a, "https://www.netflix.com/viewingactivity");
  // Keep it as the last item in the navbar.
  (li.parentElement || li.closest("ul")).appendChild(clone);
}

function injectPrime() {
  // Prime's class names are build-hashed; data-testid is the stable hook.
  const nav = document.querySelector('[data-testid="pv-nav-static-nav"]');
  const li = nav && nav.lastElementChild;
  const a = li && li.querySelector("a");
  if (!a) return;

  const clone = li.cloneNode(true);
  const link = clone.querySelector("a");
  link.id = BTN_ID;
  link.setAttribute("data-testid", "pv-nav-watch-history");
  link.setAttribute("aria-label", "History");
  link.setAttribute("href", "/settings/watch-history");
  link.removeAttribute("aria-current");
  // The cloned item carries an active-tab class when the user is on its page.
  // Keep only classes every nav link shares, so no hashed name is hardcoded.
  const sets = [...nav.querySelectorAll("a")].map((x) => new Set(x.classList));
  link.className = [...link.classList]
    .filter((c) => sets.every((s) => s.has(c)))
    .join(" ");
  // Each li carries its position for the nav's staggered reveal animation.
  clone.style.setProperty("--nav-list-child-index", nav.children.length);
  clone
    .querySelectorAll("span")
    .forEach((s) => (s.innerHTML = CLOCK_SVG + "History"));
  stylePill(link, "#00a8e1", "#0089b8", "#4fd0ff");
  forceNavigate(link, "https://www.primevideo.com/settings/watch-history");
  nav.appendChild(clone);
}

function inject() {
  if (document.getElementById(BTN_ID)) return;
  if (location.hostname.endsWith("netflix.com")) injectNetflix();
  else injectPrime();
}

// ---- Viewing-activity thumbnails ----

const THUMB_CACHE_PREFIX = "nwh-thumb-";
let thumbQueue = [];
let thumbActive = 0;

function addThumbStyles() {
  if (document.getElementById("nwh-style")) return;
  const st = document.createElement("style");
  st.id = "nwh-style";
  // The activity table uses table-cell columns; flex keeps them aligned
  // once a 54px-tall thumbnail lands in the title column.
  st.textContent = `
li.retableRow { display: flex !important; align-items: center; }
li.retableRow .col { border-top: 0 !important; }
li.retableRow .col.date { width: 90px; flex-shrink: 0; }
li.retableRow .col.title { flex: 1; display: flex; align-items: center; gap: 12px; min-width: 0; }
li.retableRow .col.report { flex-shrink: 0; white-space: nowrap; margin-right: 16px; width: auto; }
li.retableRow .col.delete { flex-shrink: 0; width: auto; }
.nwh-thumb { width: 96px; height: 54px; object-fit: cover; border-radius: 4px; background: #ddd; flex-shrink: 0; }
.nwh-imdb { flex-shrink: 0; background: #f5c518; color: #000 !important; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px; text-decoration: none; }
.nwh-imdb:hover { background: #e0b100; }
`;
  document.head.appendChild(st);
}

async function fetchThumb(id) {
  const cached = localStorage.getItem(THUMB_CACHE_PREFIX + id);
  if (cached) return cached;
  // Logged-out title page is the SEO version and carries og:image;
  // the logged-in one is an SPA shell without it, hence credentials: "omit".
  // og:image sits in <head> (~90KB in); stream and abort instead of
  // downloading the full ~800KB page.
  const ctrl = new AbortController();
  // Anonymous requests 30x to a region path (/in/title/...); remember the
  // prefix so later fetches skip that redirect round trip.
  const region = localStorage.getItem("nwh-region") || "";
  const res = await fetch(`https://www.netflix.com${region}/title/${id}`, {
    credentials: "omit",
    signal: ctrl.signal,
  });
  const seen = res.url.match(/netflix\.com(\/[a-z-]{2,6})?\/title\//);
  if (seen) localStorage.setItem("nwh-region", seen[1] || "");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let url;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const m = buf.match(
      /<meta[^>]+(?:property|name)="og:image"[^>]+content="([^"]+)"/
    );
    if (m) {
      url = m[1];
      ctrl.abort();
      break;
    }
  }
  if (url) localStorage.setItem(THUMB_CACHE_PREFIX + id, url);
  return url;
}

function pumpThumbs() {
  // ponytail: concurrency 8 — aborted streams are ~90KB each
  while (thumbActive < 8 && thumbQueue.length) {
    const { id, img } = thumbQueue.shift();
    thumbActive++;
    fetchThumb(id)
      .then((url) => {
        if (url) img.src = url;
        else img.remove();
      })
      .catch(() => img.remove())
      .finally(() => {
        thumbActive--;
        pumpThumbs();
      });
  }
}

function addThumbs() {
  if (!location.pathname.startsWith("/viewingactivity")) return;
  addThumbStyles();
  document.querySelectorAll("li.retableRow").forEach((row) => {
    if (row.querySelector(".nwh-thumb")) return;
    const link = row.querySelector('.col.title a[href^="/title/"]');
    const id = link?.getAttribute("href").match(/\/title\/(\d+)/)?.[1];
    if (!id) return;
    const img = document.createElement("img");
    img.className = "nwh-thumb";
    const titleCol = link.closest(".col.title") || link.parentElement;
    titleCol.prepend(img);
    const imdb = document.createElement("a");
    imdb.className = "nwh-imdb";
    imdb.textContent = "IMDb";
    imdb.target = "_blank";
    imdb.rel = "noopener";
    // ponytail: search link, not direct title page — no free Netflix-to-IMDb
    // ID mapping; series episode rows search by show name alone
    const query = link.textContent.split(":")[0].trim();
    imdb.href = `https://www.imdb.com/find/?s=tt&q=${encodeURIComponent(query)}`;
    titleCol.appendChild(imdb);
    thumbQueue.push({ id, img });
  });
  pumpThumbs();
}

// Netflix is an SPA; navbar mounts/remounts and "Show More" adds rows.
// Runs at document_start (body doesn't exist yet), so the observer sits on
// documentElement and injects the same frame the navbar mounts — no late pop-in.
new MutationObserver(() => {
  inject();
  addThumbs();
}).observe(document.documentElement, { childList: true, subtree: true });
inject();
addThumbs();
