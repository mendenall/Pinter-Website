(() => {
  const body = document.body;
  if (!body.classList.contains("scrollable")) return;

  // ---------- Bottom dock ----------
  const SHOW_AT_PX = 20;
  const HIDE_AT_PX = 10;

  const distanceFromBottom_window = () => {
    const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
    const viewportH = window.innerHeight ?? 0;
    const docH = Math.max(
      document.documentElement.scrollHeight || 0,
      document.body.scrollHeight || 0
    );
    return docH - (scrollY + viewportH);
  };

  const distanceFromBottom_element = (el) => {
    if (!el) return Number.POSITIVE_INFINITY;
    const scrollTop = el.scrollTop ?? 0;
    const clientH = el.clientHeight ?? 0;
    const scrollH = el.scrollHeight ?? 0;
    if (scrollH <= clientH + 1) return Number.POSITIVE_INFINITY;
    return scrollH - (scrollTop + clientH);
  };

  const getDistanceFromBottom = () => {
    const d1 = distanceFromBottom_window();
    const d2 = distanceFromBottom_element(document.scrollingElement);
    const d3 = distanceFromBottom_element(document.documentElement);
    const d4 = distanceFromBottom_element(document.body);
    return Math.min(d1, d2, d3, d4);
  };

  const updateBottomDock = () => {
    const d = getDistanceFromBottom();
    const isVisible = body.classList.contains("show-bottom");
    if (!isVisible && d <= SHOW_AT_PX) body.classList.add("show-bottom");
    else if (isVisible && d > HIDE_AT_PX) body.classList.remove("show-bottom");
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateBottomDock();
      ticking = false;
    });
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("scroll", onScroll, { passive: true });
  body.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  // ---------- Horizontal scroller chevrons + fades (PHOTOS ONLY) ----------
  const initHScrollHints = () => {
    const wraps = Array.from(document.querySelectorAll(".hscroll[data-hscroll]"));
    if (wraps.length === 0) return;

    const ensureButtons = (wrap) => {
      let left = wrap.querySelector(".hscroll-chev.left");
      let right = wrap.querySelector(".hscroll-chev.right");

      if (!left) {
        left = document.createElement("button");
        left.className = "hscroll-chev left";
        left.type = "button";
        left.setAttribute("aria-label", "Scroll left");
        left.innerHTML = "<span>‹</span>";
        wrap.appendChild(left);
      }

      if (!right) {
        right = document.createElement("button");
        right.className = "hscroll-chev right";
        right.type = "button";
        right.setAttribute("aria-label", "Scroll right");
        right.innerHTML = "<span>›</span>";
        wrap.appendChild(right);
      }

      return { left, right };
    };

    const findScroller = (wrap) => wrap.querySelector(".media-grid");

    const setEdgeClasses = (wrap, scroller) => {
      if (!scroller) return;
      const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const x = scroller.scrollLeft;
      const EDGE = 12;
      wrap.classList.toggle("at-left", x <= EDGE);
      wrap.classList.toggle("at-right", x >= (max - EDGE));
    };

    wraps.forEach((wrap) => {
      const scroller = findScroller(wrap);
      if (!scroller) return;

      const { left, right } = ensureButtons(wrap);
      const scrollByAmount = () => Math.max(240, Math.floor(scroller.clientWidth * 0.85));

      left.addEventListener("click", () => scroller.scrollBy({ left: -scrollByAmount(), behavior: "smooth" }));
      right.addEventListener("click", () => scroller.scrollBy({ left: scrollByAmount(), behavior: "smooth" }));

      const onAny = () => setEdgeClasses(wrap, scroller);

      scroller.addEventListener("scroll", () => requestAnimationFrame(onAny), { passive: true });
      window.addEventListener("resize", onAny);

      onAny();
      window.addEventListener("load", onAny);
      setTimeout(onAny, 250);
      setTimeout(onAny, 900);
    });
  };

  // ---------- Video (player left, list right) + top/bottom chevrons ----------
  const initPw2Video = () => {
    const root = document.querySelector("[data-pw2-video]");
    if (!root) return;

    const iframe = document.getElementById("pw2Player");
    const list = root.querySelector("[data-pw2-list]");
    const vwrap = root.querySelector("[data-pw2-vscroll]");
    const items = Array.from(root.querySelectorAll("[data-pw2-id]"));
    const frame = root.querySelector(".pw2-frame");

    if (!iframe || !list || !vwrap || items.length === 0 || !frame) return;

    const setActive = (id) => {
      items.forEach((btn) => btn.classList.toggle("is-active", btn.dataset.pw2Id === id));
    };

    const setPlayer = (id, { autoplay }) => {
      const base = `https://www.youtube.com/embed/${id}`;
      const params = new URLSearchParams({
        rel: "0",
        autoplay: autoplay ? "1" : "0",
      });
      iframe.src = `${base}?${params.toString()}`;
    };

    // Match playlist height to player height
    const syncListHeight = () => {
      const h = frame.getBoundingClientRect().height;
      list.style.maxHeight = `${Math.max(260, Math.floor(h))}px`;
      updateVEdges();
    };

// Titles via oEmbed (Song on line 1, Artist on line 2+)
const applyTitles = async () => {
  for (const btn of items) {
    const titleEl = btn.querySelector(".pw2-title");
    const id = btn.dataset.pw2Id;
    if (!titleEl || !id) continue;

    try {
      const oembed = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
      const res = await fetch(oembed);
      const data = res.ok ? await res.json() : null;

      const rawTitle = data?.title || "Video";
      const cleaned = rawTitle.replace(" | Pinter Whitnick", "").trim();

      // Split "Song - Artist" into two parts. Keep extra dashes in artist names.
      const parts = cleaned.split(" - ");
      const song = (parts[0] || "Video").trim();
      const artist = parts.length > 1 ? parts.slice(1).join(" - ").trim() : "";

      // Build DOM so we can style song vs artist
      titleEl.textContent = ""; // clear

      const songEl = document.createElement("div");
      songEl.className = "pw2-song";
      songEl.textContent = song || "Video";
      titleEl.appendChild(songEl);

      if (artist) {
        const artistEl = document.createElement("div");
        artistEl.className = "pw2-artist";
        artistEl.textContent = artist;
        titleEl.appendChild(artistEl);
      }
    } catch {
      // fallback
      titleEl.textContent = "";
      const songEl = document.createElement("div");
      songEl.className = "pw2-song";
      songEl.textContent = "Video";
      titleEl.appendChild(songEl);
    }
  }
};


    // Chevrons (match photo chevrons glyph style)
    const ensureVChevrons = () => {
      let up = vwrap.querySelector(".pw2-vchev.up");
      let down = vwrap.querySelector(".pw2-vchev.down");

      if (!up) {
        up = document.createElement("button");
        up.className = "pw2-vchev up";
        up.type = "button";
        up.setAttribute("aria-label", "Scroll up");
        up.innerHTML = "<span>‹</span>";
        vwrap.appendChild(up);
      }

      if (!down) {
        down = document.createElement("button");
        down.className = "pw2-vchev down";
        down.type = "button";
        down.setAttribute("aria-label", "Scroll down");
        down.innerHTML = "<span>›</span>";
        vwrap.appendChild(down);
      }

      // Rotate to become up/down arrows visually
      up.style.transform = "translateX(-50%) rotate(90deg)";
      down.style.transform = "translateX(-50%) rotate(90deg)";

      return { up, down };
    };

    const EDGE = 8;
    const updateVEdges = () => {
      const max = Math.max(0, list.scrollHeight - list.clientHeight);
      const y = list.scrollTop;

      const atTop = y <= EDGE;
      const atBottom = y >= (max - EDGE);

      vwrap.classList.toggle("at-top", atTop);
      vwrap.classList.toggle("at-bottom", atBottom);
    };

    const { up, down } = ensureVChevrons();

    const scrollByAmount = () => Math.max(180, Math.floor(list.clientHeight * 0.75));

    up.addEventListener("click", () => list.scrollBy({ top: -scrollByAmount(), behavior: "smooth" }));
    down.addEventListener("click", () => list.scrollBy({ top: scrollByAmount(), behavior: "smooth" }));

    list.addEventListener("scroll", () => requestAnimationFrame(updateVEdges), { passive: true });
    window.addEventListener("resize", syncListHeight);

    // Init selection
    const initialId =
      items.find((b) => b.classList.contains("is-active"))?.dataset.pw2Id ||
      items[0].dataset.pw2Id;

    setActive(initialId);
    setPlayer(initialId, { autoplay: false });

    items.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.pw2Id;
        if (!id) return;
        setActive(id);
        setPlayer(id, { autoplay: true });
        btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });

    syncListHeight();
    window.addEventListener("load", syncListHeight);
    setTimeout(syncListHeight, 250);
    setTimeout(syncListHeight, 900);

    applyTitles();
  };

// ---------- Photos + Lightbox (swipe + arrows) ----------
const PHOTOS_JSON = "assets/photos/photos.json";
const PHOTO_MAX = 80;

let photoList = [];
let currentPhotoIndex = 0;

const getLightbox = () => {
  let lb = document.querySelector(".lightbox");
  if (lb) return lb;

  lb = document.createElement("div");
  lb.className = "lightbox";
  lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-modal", "true");
  lb.setAttribute("aria-label", "Photo viewer");

  const img = document.createElement("img");
  img.className = "lightbox-img";
  img.alt = "Photo";

  const close = document.createElement("button");
  close.className = "lightbox-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.innerHTML = "✕";

  // Use existing chevron button styling, but position inside lightbox
  const prev = document.createElement("button");
  prev.className = "lightbox-chev left";
  prev.type = "button";
  prev.setAttribute("aria-label", "Previous photo");
  prev.innerHTML = "<span>‹</span>";

  const next = document.createElement("button");
  next.className = "lightbox-chev right";
  next.type = "button";
  next.setAttribute("aria-label", "Next photo");
  next.innerHTML = "<span>›</span>";

  lb.appendChild(img);
  lb.appendChild(close);
  lb.appendChild(prev);
  lb.appendChild(next);
  document.body.appendChild(lb);

  const showIndex = (idx) => {
    if (!photoList.length) return;
    currentPhotoIndex = (idx + photoList.length) % photoList.length;
    img.src = `assets/photos/${photoList[currentPhotoIndex]}`;
    img.style.transition = "none";
    img.style.opacity = "1";
    img.style.transform = "translateX(0)";
  };

  const animateTo = (newIndex, dir) => {
    if (!photoList.length) return;

    const nextIndex = (newIndex + photoList.length) % photoList.length;

    // slide/fade out
    img.style.transition = "transform 160ms ease, opacity 160ms ease";
    img.style.opacity = "0";
    img.style.transform = `translateX(${dir > 0 ? "-18px" : "18px"})`;

    setTimeout(() => {
      currentPhotoIndex = nextIndex;
      img.src = `assets/photos/${photoList[currentPhotoIndex]}`;

      // start slightly opposite, then slide in
      img.style.transition = "none";
      img.style.opacity = "0";
      img.style.transform = `translateX(${dir > 0 ? "18px" : "-18px"})`;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          img.style.transition = "transform 220ms ease, opacity 220ms ease";
          img.style.opacity = "1";
          img.style.transform = "translateX(0)";
        });
      });
    }, 165);
  };

  const closeLightbox = () => {
    lb.classList.remove("is-open");
    img.src = "";
    document.removeEventListener("keydown", onKeyDown);
  };

  const onKeyDown = (e) => {
    if (!lb.classList.contains("is-open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") animateTo(currentPhotoIndex - 1, -1);
    if (e.key === "ArrowRight") animateTo(currentPhotoIndex + 1, +1);
  };

  close.addEventListener("click", closeLightbox);

  // Clicking backdrop closes; clicking image does NOT close (so swipe + arrows are usable)
  lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLightbox();
  });

  prev.addEventListener("click", (e) => {
    e.stopPropagation();
    animateTo(currentPhotoIndex - 1, -1);
  });

  next.addEventListener("click", (e) => {
    e.stopPropagation();
    animateTo(currentPhotoIndex + 1, +1);
  });

  // ----- Swipe support -----
  const SWIPE_MIN_PX = 50;
  const OFFAXIS_RATIO = 0.6;
  const MAX_TIME_MS = 900;

  let sx = 0, sy = 0, st = 0;
  let tracking = false;
  let lastX = 0, lastY = 0;

  const start = (e) => {
    if (!lb.classList.contains("is-open")) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    tracking = true;
    sx = lastX = t.clientX;
    sy = lastY = t.clientY;
    st = Date.now();
  };

  const move = (e) => {
    if (!tracking) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    lastX = t.clientX;
    lastY = t.clientY;

    const dx = lastX - sx;
    const dy = lastY - sy;

    // Prevent the page from scrolling while swiping horizontally
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      e.preventDefault();
    }
  };

  const end = () => {
    if (!tracking) return;
    tracking = false;

    const dt = Date.now() - st;
    if (dt > MAX_TIME_MS) return;

    const dx = lastX - sx;
    const dy = lastY - sy;

    if (Math.abs(dx) < SWIPE_MIN_PX) return;
    if (Math.abs(dy) > Math.abs(dx) * OFFAXIS_RATIO) return;

    if (dx < 0) animateTo(currentPhotoIndex + 1, +1); // swipe left -> next
    else animateTo(currentPhotoIndex - 1, -1);        // swipe right -> prev
  };

  lb.addEventListener("touchstart", start, { passive: true });
  lb.addEventListener("touchmove", move, { passive: false });
  lb.addEventListener("touchend", end, { passive: true });
  lb.addEventListener("touchcancel", end, { passive: true });

  img.addEventListener("touchstart", start, { passive: true });
  img.addEventListener("touchmove", move, { passive: false });
  img.addEventListener("touchend", end, { passive: true });
  img.addEventListener("touchcancel", end, { passive: true });

  lb._openIndex = (index) => {
    showIndex(index);
    lb.classList.add("is-open");
    document.addEventListener("keydown", onKeyDown);
  };

  return lb;
};

const loadPhotoGrid = async () => {
  const grid = document.getElementById("photoGrid");
  if (!grid) return;

  try {
    const res = await fetch(PHOTOS_JSON, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const files = await res.json();
    if (!Array.isArray(files)) throw new Error("photos.json must be an array");

    photoList = files.slice(0, PHOTO_MAX);

    grid.innerHTML = "";
    photoList.forEach((file, i) => {
      const img = document.createElement("img");
      img.src = `assets/photos/${file}`;
      img.alt = "Pinter Whitnick photo";
      img.loading = "lazy";
      img.decoding = "async";
      img.dataset.photoIndex = String(i);
      grid.appendChild(img);
    });

    const lb = getLightbox();
    grid.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof HTMLImageElement)) return;
      const idx = Number(t.dataset.photoIndex);
      if (!Number.isFinite(idx)) return;
      lb._openIndex(idx);
    });
  } catch (e) {
    console.warn("Could not load photos.json", e);
  }
};

  // Init
  initPw2Video();
  loadPhotoGrid();
  initHScrollHints();

  updateBottomDock();
  window.addEventListener("load", updateBottomDock);
})();
